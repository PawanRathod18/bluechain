"""Synthetic-but-realistic demo rasters so the pipeline can be demonstrated without
supplying Sentinel-2 or GEDI products.

The values are generated, not observed. Everything derived from them is labelled
as demonstration output by the application.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds

DEMO_BOUNDS = (88.9520, 21.7360, 88.9620, 21.7450)   # west, south, east, north
DEMO_SIZE = (320, 320)


def _smooth(shape, seed, scale=8):
    """Low-frequency random field in 0..1 (bilinear upsample of a coarse grid)."""
    rng = np.random.default_rng(seed)
    coarse = rng.random((scale, scale)).astype("float32")
    img = Image.fromarray((coarse * 255).astype("uint8")).resize((shape[1], shape[0]), Image.BICUBIC)
    return np.asarray(img, dtype="float32") / 255.0


def generate_demo_dataset(out_dir: str | Path, bounds: tuple | None = None) -> dict:
    """Generate a synthetic scene. Pass `bounds` (west, south, east, north) to cover a
    specific project instead of the default Sundarbans demo window."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    h, w = DEMO_SIZE
    transform = from_bounds(*(bounds or DEMO_BOUNDS), w, h)
    crs = "EPSG:4326"

    # NDVI-like field: mangrove interior high, channels low
    base = _smooth((h, w), 11, 7)
    channels = _smooth((h, w), 27, 14)
    ndvi = 0.18 + 0.62 * base
    ndvi = np.where(np.abs(channels - 0.5) < 0.045, ndvi - 0.45, ndvi)
    ndvi = np.clip(ndvi, 0.02, 0.92)

    # Sentinel-2 surface reflectance in DN (reflectance x 10000)
    red = np.clip(0.10 + 0.05 * (1 - ndvi), 0.01, 0.6) * 10_000
    nir = np.clip(0.10 + 0.52 * ndvi, 0.02, 0.95) * 10_000
    red = (red + np.random.default_rng(3).normal(0, 40, (h, w))).astype("int16")
    nir = (nir + np.random.default_rng(4).normal(0, 55, (h, w))).astype("int16")

    # GEDI rh100 in centimetres, with ~35% missing (exercises the gap fill)
    rh100 = (ndvi * 2.2 + 0.4 + np.random.default_rng(5).normal(0, 0.15, (h, w))) * 100
    rh100 = np.clip(rh100, 20, 4500)
    missing = np.random.default_rng(6).random((h, w)) < 0.35
    rh100 = np.where(missing, 0, rh100).astype("int16")

    # simple LULC for the InVEST baseline: 1 = mangrove, 2 = water, 3 = mudflat
    lulc = np.where(ndvi > 0.4, 1, np.where(ndvi < 0.15, 2, 3)).astype("int16")

    def write(name, arr, dtype, nodata=None):
        path = out_dir / name
        with rasterio.open(path, "w", driver="GTiff", height=h, width=w, count=1,
                           dtype=dtype, crs=crs, transform=transform, nodata=nodata,
                           compress="deflate") as dst:
            dst.write(arr, 1)
        return str(path)

    paths = {
        "red": write("demo_s2_b4_red.tif", red, "int16"),
        "nir": write("demo_s2_b8_nir.tif", nir, "int16"),
        "gedi": write("demo_gedi_rh100.tif", rh100, "int16", nodata=0),
        "lulc": write("demo_lulc.tif", lulc, "int16"),
    }

    bio = out_dir / "demo_biophysical_table.csv"
    bio.write_text(
        "lucode,LULC_name,C_above,C_below,C_soil,C_dead\n"
        "1,Mangrove,180.0,0.0,0.0,0.0\n"
        "2,Water,0.0,0.0,0.0,0.0\n"
        "3,Mudflat,12.0,0.0,0.0,0.0\n",
        encoding="utf-8",
    )
    paths["biophysical"] = str(bio)
    return paths
