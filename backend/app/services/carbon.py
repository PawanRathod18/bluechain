"""Above-ground carbon pipeline.

Implements the paper's workflow exactly as specified:

    NDVI  = (B8 - B4) / (B8 + B4)                     (1)
    M     = 1 where NDVI > threshold, else 0
    H     = rh100 / 100          (GEDI, quality-screened)
    H_gap = 15 x NDVI            (unobserved structural cells)
    AGB   = H_est x NDVI x 10.5                       (2)
    AGC   = 0.47 x AGB                                (3)

One deliberate improvement over the paper's supplied products: the observed and
gap-filled GEDI contributions *are* retained and reported separately, because the
paper identifies their absence as a limitation.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

from .provenance import sha256_file

MAX_PIXELS = 25_000_000      # above this we decimate and flag the statistics
PREVIEW_MAX_DIM = 1600
NODATA = -9999.0

# green -> yellow -> red, matching the application's density legend
RAMP_STOPS = np.array([
    [11, 61, 46], [28, 122, 78], [55, 168, 96], [141, 191, 63],
    [232, 197, 60], [240, 146, 47], [226, 84, 58],
], dtype="float32")

WATER_RGB = np.array([6, 18, 26], dtype="float32")
MANGROVE_RGB = np.array([34, 197, 94], dtype="float32")


class AnalysisError(ValueError):
    """Raised when the inputs cannot produce a valid analysis."""


def _ramp(t: np.ndarray) -> np.ndarray:
    """Map a 0..1 array to RGB using the density ramp."""
    n = len(RAMP_STOPS) - 1
    pos = np.clip(t, 0, 1) * n
    lo = np.floor(pos).astype(int)
    hi = np.minimum(lo + 1, n)
    frac = (pos - lo)[..., None]
    return RAMP_STOPS[lo] * (1 - frac) + RAMP_STOPS[hi] * frac


def _read_band(path: str | Path, band: int = 1, reflectance: bool = False) -> tuple[np.ndarray, dict]:
    """Read one band as float32 with nodata -> NaN, decimating very large rasters."""
    with rasterio.open(path) as src:
        if band < 1 or band > src.count:
            raise AnalysisError(f"Band {band} does not exist in {Path(path).name} (has {src.count})")
        meta = {
            "width": src.width,
            "height": src.height,
            "crs": src.crs.to_string() if src.crs else None,
            "transform": src.transform,
            "nodata": src.nodata,
            "count": src.count,
            "bounds": list(src.bounds),
            "resolution": [abs(src.transform.a), abs(src.transform.e)],
        }
        total = src.width * src.height
        if total > MAX_PIXELS:
            factor = (MAX_PIXELS / total) ** 0.5
            out_shape = (max(1, int(src.height * factor)), max(1, int(src.width * factor)))
            arr = src.read(band, out_shape=out_shape, resampling=Resampling.average).astype("float32")
            meta["decimated"] = True
        else:
            arr = src.read(band).astype("float32")
            meta["decimated"] = False

    if meta["nodata"] is not None:
        arr[arr == meta["nodata"]] = np.nan
    arr[~np.isfinite(arr)] = np.nan
    if reflectance and np.nanmax(arr, initial=0) > 2.0:
        arr = arr / 10_000.0          # Sentinel-2 surface reflectance scaling
    return arr, meta


def _align(path: str | Path, band: int, shape, transform, crs) -> np.ndarray:
    """Reproject an auxiliary raster (e.g. GEDI) onto the reference grid."""
    with rasterio.open(path) as src:
        dst = np.full(shape, np.nan, dtype="float32")
        reproject(
            source=rasterio.band(src, band),
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=src.nodata,
            dst_transform=transform,
            dst_crs=crs,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
    return dst


def _write_raster(path: Path, arr: np.ndarray, transform, crs) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.where(np.isfinite(arr), arr, NODATA).astype("float32")
    with rasterio.open(
        path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
        dtype="float32", crs=crs, transform=transform, nodata=NODATA,
        compress="deflate", predictor=2,
    ) as dst:
        dst.write(data, 1)


def _write_png(path: Path, rgb: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(rgb, 0, 255).astype("uint8")).save(path, optimize=True)


def _pct(arr: np.ndarray, q: float) -> float:
    finite = arr[np.isfinite(arr)]
    return float(np.percentile(finite, q)) if finite.size else 0.0


def run_carbon_analysis(
    red_path: str | Path,
    nir_path: str | Path,
    gedi_path: str | Path | None,
    out_dir: str | Path,
    *,
    ndvi_threshold: float = 0.4,
    agb_coefficient: float = 10.5,
    carbon_fraction: float = 0.47,
    gapfill_multiplier: float = 15.0,
    nominal_cell_ha: float = 0.01,
    red_band: int = 1,
    nir_band: int = 1,
    gedi_band: int = 1,
) -> dict:
    """Run the full pipeline and return statistics, footprint and output paths."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    red, meta = _read_band(red_path, red_band, reflectance=True)
    nir, nir_meta = _read_band(nir_path, nir_band, reflectance=True)
    if red.shape != nir.shape:
        raise AnalysisError(
            f"Red and NIR bands must share a grid (got {red.shape} and {nir.shape}). "
            "Reproject/clip both to the same extent first."
        )

    # ---- (1) NDVI ----------------------------------------------------
    denom = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = np.where(np.abs(denom) > 1e-6, (nir - red) / denom, np.nan)
    ndvi = np.clip(ndvi, -1.0, 1.0)

    # ---- operational mangrove mask -----------------------------------
    mask = np.isfinite(ndvi) & (ndvi > ndvi_threshold)
    cells_total = int(ndvi.size)
    cells_mangrove = int(mask.sum())
    if cells_mangrove == 0:
        raise AnalysisError(
            f"No cells exceed the NDVI threshold of {ndvi_threshold}. "
            "Check the band order (B4 = red, B8 = NIR) and the reflectance scaling."
        )

    # ---- GEDI canopy height ------------------------------------------
    observed = np.zeros_like(mask)
    if gedi_path:
        try:
            h_raw = _align(gedi_path, gedi_band, ndvi.shape, meta["transform"], meta["crs"])
        except Exception as exc:  # pragma: no cover - defensive
            raise AnalysisError(f"Could not read the GEDI raster: {exc}") from exc
        h_metres = h_raw / 100.0                 # original project transformation rh100/100
        observed = np.isfinite(h_metres) & (h_metres > 0)
    else:
        h_metres = np.full_like(ndvi, np.nan)

    # ---- gap filling: H_gap = 15 x NDVI -------------------------------
    h_gap = gapfill_multiplier * ndvi
    h_est = np.where(observed, h_metres, h_gap)

    # ---- (2) AGB and (3) AGC -----------------------------------------
    agb = h_est * ndvi * agb_coefficient
    agc = carbon_fraction * agb
    agb_m = np.where(mask & np.isfinite(agb), agb, 0.0).astype("float32")
    agc_m = np.where(mask & np.isfinite(agc), agc, 0.0).astype("float32")

    values = agc_m[mask & np.isfinite(agc_m)]
    area_ha = cells_mangrove * nominal_cell_ha
    total_agc = float(np.sum(agc_m, dtype="float64") * nominal_cell_ha)
    total_agb = float(np.sum(agb_m, dtype="float64") * nominal_cell_ha)

    observed_cells = int((observed & mask).sum())
    gap_cells = cells_mangrove - observed_cells

    stats = {
        "cells_total": cells_total,
        "cells_mangrove": cells_mangrove,
        "cells_non_mangrove": cells_total - cells_mangrove,
        "mangrove_proportion": round(100.0 * cells_mangrove / cells_total, 4),
        "mapped_area_ha": round(area_ha, 4),
        "mapped_area_km2": round(area_ha / 100.0, 4),
        "mean_agc_density": round(float(np.mean(values)), 4),
        "median_agc_density": round(float(np.median(values)), 4),
        "std_agc_density": round(float(np.std(values)), 4),
        "min_agc_density": round(float(np.min(values)), 4),
        "max_agc_density": round(float(np.max(values)), 4),
        "total_agc_tc": round(total_agc, 4),
        "total_agb_t": round(total_agb, 4),
        "mean_agb_density": round(total_agb / area_ha, 4) if area_ha else 0.0,
        "cell_area_ha": nominal_cell_ha,
        "decimated": bool(meta.get("decimated")),
        "units": {"agc": "t C", "density": "t C ha-1", "area": "ha"},
    }

    # ---- footprint ----------------------------------------------------
    west, south, east, north = meta["bounds"]
    transform = from_bounds(west, south, east, north, ndvi.shape[1], ndvi.shape[0])
    footprint = {
        "bounds": [round(west, 8), round(south, 8), round(east, 8), round(north, 8)],
        "crs": meta["crs"] or "EPSG:4326",
        "shape": [int(ndvi.shape[0]), int(ndvi.shape[1])],
        "resolution": [round(float(meta["resolution"][0]), 10), round(float(meta["resolution"][1]), 10)],
        "decimated": bool(meta.get("decimated")),
    }

    # ---- outputs ------------------------------------------------------
    rasters = {}
    agc_tif = out_dir / "agc.tif"
    ndvi_tif = out_dir / "ndvi.tif"
    mask_tif = out_dir / "mangrove_mask.tif"
    h_tif = out_dir / "height_estimated.tif"
    _write_raster(agc_tif, agc_m, transform, meta["crs"])
    _write_raster(ndvi_tif, ndvi, transform, meta["crs"])
    _write_raster(mask_tif, mask.astype("float32"), transform, meta["crs"])
    _write_raster(h_tif, h_est.astype("float32"), transform, meta["crs"])
    rasters.update({"agc_tif": str(agc_tif), "ndvi_tif": str(ndvi_tif),
                    "mask_tif": str(mask_tif), "height_tif": str(h_tif)})

    # previews
    vmin, vmax = _pct(agc_m[mask], 2), _pct(agc_m[mask], 98)
    span = max(vmax - vmin, 1e-6)
    t = np.clip((agc_m - vmin) / span, 0, 1)
    rgb = _ramp(t)
    rgb[~mask] = WATER_RGB
    agc_png = out_dir / "agc_density.png"
    _write_png(agc_png, rgb)
    rasters["agc_png"] = str(agc_png)
    rasters["agc_png_range"] = [round(vmin, 4), round(vmax, 4)]

    nd_t = np.clip((np.nan_to_num(ndvi, nan=0.0) + 1) / 2, 0, 1)
    nd_rgb = np.stack([nd_t * 60, nd_t * 200, nd_t * 120], axis=-1)
    nd_rgb[~np.isfinite(ndvi)] = WATER_RGB
    ndvi_png = out_dir / "ndvi.png"
    _write_png(ndvi_png, nd_rgb)
    rasters["ndvi_png"] = str(ndvi_png)

    m_rgb = np.where(mask[..., None], MANGROVE_RGB, WATER_RGB)
    mask_png = out_dir / "mangrove_mask.png"
    _write_png(mask_png, m_rgb)
    rasters["mask_png"] = str(mask_png)

    input_hashes = {"red": sha256_file(red_path), "nir": sha256_file(nir_path)}
    if gedi_path:
        input_hashes["gedi"] = sha256_file(gedi_path)
    output_hashes = {Path(p).name: sha256_file(p) for p in
                     [agc_tif, ndvi_tif, mask_tif, h_tif, agc_png, ndvi_png, mask_png]}

    params = {
        "ndvi_threshold": ndvi_threshold,
        "agb_coefficient": agb_coefficient,
        "carbon_fraction": carbon_fraction,
        "gapfill_multiplier": gapfill_multiplier,
        "nominal_cell_ha": nominal_cell_ha,
        "red_band": red_band,
        "nir_band": nir_band,
        "gedi_band": gedi_band,
        "equations": {
            "ndvi": "(B8 - B4) / (B8 + B4)",
            "height": "rh100 / 100",
            "gap_fill": "H_gap = 15 x NDVI",
            "agb": "AGB = H_est x NDVI x 10.5",
            "agc": "AGC = 0.47 x AGB",
        },
    }

    gedi_support = {
        "observed_cells": observed_cells,
        "gapfilled_cells": gap_cells,
        "observed_fraction": round(observed_cells / cells_mangrove, 4) if cells_mangrove else 0.0,
        "gapfill_applied": bool(gedi_path) or True,
    }

    return {
        "stats": stats,
        "footprint": footprint,
        "rasters": rasters,
        "input_hashes": input_hashes,
        "output_hashes": output_hashes,
        "params": params,
        "gedi_support": gedi_support,
    }
