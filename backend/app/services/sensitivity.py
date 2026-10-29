"""Parameter sensitivity for the project-specific AGB coefficient and carbon fraction.

    C(B, f) = C0 * (B / 10.5) * (f / 0.47)                       (4)

This is parameter sensitivity: not a confidence interval, prediction interval or
a complete uncertainty assessment.
"""
from __future__ import annotations


def sensitivity_matrix(baseline_total: float, base_coefficient: float, base_fraction: float,
                       coefficients: list[float], fractions: list[float]) -> dict:
    grid = []
    for coef in coefficients:
        for frac in fractions:
            total = baseline_total * (coef / base_coefficient) * (frac / base_fraction)
            grid.append({
                "coefficient": coef,
                "fraction": frac,
                "total_tc": round(total, 2),
                "delta_pct": round(100.0 * (total - baseline_total) / baseline_total, 2) if baseline_total else 0.0,
            })

    totals = [g["total_tc"] for g in grid]
    lower = min(grid, key=lambda g: g["total_tc"])
    upper = max(grid, key=lambda g: g["total_tc"])
    baseline = {
        "coefficient": base_coefficient,
        "fraction": base_fraction,
        "total_tc": round(baseline_total, 2),
        "delta_pct": 0.0,
    }
    return {
        "baseline": baseline,
        "lower": lower,
        "upper": upper,
        "range": [min(totals), max(totals)],
        "grid": grid,
        "coefficients": coefficients,
        "fractions": fractions,
        "note": ("Parameter sensitivity over two inputs. It does not cover classification, "
                 "structural-data support, gap filling, model form or spatial-processing "
                 "uncertainty, and is not a statistical interval."),
    }
