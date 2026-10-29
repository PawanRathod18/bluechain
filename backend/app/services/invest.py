"""InVEST-style LULC carbon-storage baseline.

A separate, class-based accounting stream (as in InVEST Carbon Storage and
Sequestration): each LULC class is assigned carbon-pool densities and the total
is area-weighted. It is complementary to, and not equivalent with, the
continuous GEE-derived AGC model.
"""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import rasterio

from .provenance import sha256_file

POOL_KEYS = ("C_above", "C_below", "C_soil", "C_dead")
POOL_LABELS = {"C_above": "above_ground", "C_below": "below_ground",
               "C_soil": "soil", "C_dead": "dead_organic_matter"}


class BaselineError(ValueError):
    pass


def _read_biophysical(path: str | Path) -> dict[int, dict]:
    table: dict[int, dict] = {}
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise BaselineError("Biophysical table is empty")
        fields = {f.strip().lower(): f for f in reader.fieldnames}
        if "lucode" not in fields:
            raise BaselineError("Biophysical table must contain a 'lucode' column")
        for row in reader:
            try:
                code = int(float(row[fields["lucode"]]))
            except (TypeError, ValueError):
                continue
            entry = {"name": (row.get(fields.get("lulc_name", ""), "") or str(code)).strip()}
            for key in POOL_KEYS:
                raw = row.get(fields.get(key.lower()), 0) or 0
                try:
                    entry[key] = float(raw)
                except (TypeError, ValueError):
                    entry[key] = 0.0
            table[code] = entry
    if not table:
        raise BaselineError("No usable rows found in the biophysical table")
    return table


def run_invest_baseline(lulc_path: str | Path, biophysical_path: str | Path,
                        cell_ha: float = 0.01) -> dict:
    table = _read_biophysical(biophysical_path)

    with rasterio.open(lulc_path) as src:
        lulc = src.read(1)
        meta = {
            "crs": src.crs.to_string() if src.crs else None,
            "shape": [int(src.height), int(src.width)],
            "bounds": [round(float(b), 8) for b in src.bounds],
            "nodata": src.nodata,
        }

    lulc = lulc.astype("int64")
    if meta["nodata"] is not None:
        lulc = np.where(lulc == int(meta["nodata"]), -1, lulc)

    codes, counts = np.unique(lulc, return_counts=True)
    classes, pools = [], {POOL_LABELS[k]: 0.0 for k in POOL_KEYS}
    total = 0.0
    unmapped_cells = 0

    for code, count in zip(codes.tolist(), counts.tolist()):
        if code < 0:
            continue
        area_ha = count * cell_ha
        entry = table.get(code)
        if not entry:
            unmapped_cells += count
            classes.append({
                "lucode": code, "name": f"Unmapped class {code}", "cells": count,
                "area_ha": round(area_ha, 4), "density": 0.0, "total_tc": 0.0,
                "in_biophysical_table": False,
            })
            continue
        density = sum(entry.get(k, 0.0) for k in POOL_KEYS)
        class_total = density * area_ha
        total += class_total
        for key in POOL_KEYS:
            pools[POOL_LABELS[key]] += entry.get(key, 0.0) * area_ha
        classes.append({
            "lucode": code,
            "name": entry["name"],
            "cells": count,
            "area_ha": round(area_ha, 4),
            "density": round(density, 4),
            "total_tc": round(class_total, 2),
            "pools": {POOL_LABELS[k]: round(entry.get(k, 0.0), 4) for k in POOL_KEYS},
            "in_biophysical_table": True,
        })

    classes.sort(key=lambda c: c["total_tc"], reverse=True)
    return {
        "total_tc": round(total, 2),
        "pools": {k: round(v, 2) for k, v in pools.items()},
        "classes": classes,
        "params": {"cell_area_ha": cell_ha, "classes_in_table": len(table),
                   "unmapped_cells": unmapped_cells},
        "footprint": meta,
        "input_hashes": {
            "lulc": sha256_file(lulc_path),
            "biophysical_table": sha256_file(biophysical_path),
        },
    }
