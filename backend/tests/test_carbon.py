import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds

from app.services.carbon import AnalysisError, run_carbon_analysis
from app.services.demo_data import generate_demo_dataset
from app.services.sensitivity import sensitivity_matrix


def write_raster(path, data, bounds=(88.95, 21.73, 88.96, 21.74), nodata=None, dtype="int16"):
    data = np.asarray(data)
    with rasterio.open(path, "w", driver="GTiff", height=data.shape[0], width=data.shape[1],
                       count=1, dtype=dtype, crs="EPSG:4326",
                       transform=from_bounds(*bounds, data.shape[1], data.shape[0]),
                       nodata=nodata) as dst:
        dst.write(data.astype(dtype), 1)
    return path


def test_paper_equations_on_hand_computed_case(tmp_path):
    """NDVI 0.6, H 2 m -> AGB = 12.6, AGC = 5.922 t C/ha on every cell."""
    red = write_raster(tmp_path / "red.tif", np.full((2, 2), 1000))
    nir = write_raster(tmp_path / "nir.tif", np.full((2, 2), 4000))
    gedi = write_raster(tmp_path / "gedi.tif", np.full((2, 2), 200), nodata=0)

    out = run_carbon_analysis(red, nir, gedi, tmp_path / "out",
                              agb_coefficient=10.5, carbon_fraction=0.47,
                              ndvi_threshold=0.4, nominal_cell_ha=0.01)

    stats = out["stats"]
    assert stats["cells_total"] == 4
    assert stats["cells_mangrove"] == 4
    assert stats["mean_agc_density"] == pytest.approx(5.922, abs=1e-3)
    assert stats["std_agc_density"] == pytest.approx(0.0, abs=1e-6)
    # total = density x cells x cell area
    assert stats["total_agc_tc"] == pytest.approx(5.922 * 4 * 0.01, abs=1e-4)
    assert stats["total_agb_t"] == pytest.approx(stats["total_agc_tc"] / 0.47, abs=1e-3)
    assert stats["mapped_area_ha"] == pytest.approx(0.04)


def test_gap_fill_when_gedi_missing(tmp_path):
    red = write_raster(tmp_path / "red.tif", np.full((2, 2), 1000))
    nir = write_raster(tmp_path / "nir.tif", np.full((2, 2), 4000))
    out = run_carbon_analysis(red, nir, None, tmp_path / "out")
    # H_gap = 15 x NDVI = 9 m -> AGB = 9 x 0.6 x 10.5 = 56.7 -> AGC = 26.649
    assert out["stats"]["mean_agc_density"] == pytest.approx(26.649, abs=1e-2)
    assert out["gedi_support"]["observed_cells"] == 0
    assert out["gedi_support"]["gapfilled_cells"] == 4


def test_threshold_excludes_low_ndvi(tmp_path):
    # one bright (vegetated) cell, three dark ones
    red = write_raster(tmp_path / "red.tif", np.array([[1000, 3000], [3000, 3000]]))
    nir = write_raster(tmp_path / "nir.tif", np.array([[4000, 3200], [3200, 3200]]))
    out = run_carbon_analysis(red, nir, None, tmp_path / "out")
    assert out["stats"]["cells_mangrove"] == 1
    assert out["stats"]["cells_total"] == 4
    with pytest.raises(AnalysisError):
        run_carbon_analysis(red, nir, None, tmp_path / "out2", ndvi_threshold=0.9)


def test_demo_dataset_end_to_end(tmp_path):
    demo = generate_demo_dataset(tmp_path / "demo")
    out = run_carbon_analysis(demo["red"], demo["nir"], demo["gedi"], tmp_path / "out")
    stats = out["stats"]
    assert stats["cells_total"] == 320 * 320
    assert stats["cells_mangrove"] > 1000
    # internal consistency
    assert stats["total_agc_tc"] == pytest.approx(
        stats["mean_agc_density"] * stats["mapped_area_ha"], rel=1e-3)
    support = out["gedi_support"]
    assert support["observed_cells"] + support["gapfilled_cells"] == stats["cells_mangrove"]
    assert out["rasters"]["agc_tif"].endswith("agc.tif")
    assert out["footprint"]["crs"] == "EPSG:4326"


def test_sensitivity_reproduces_paper_table_4():
    """Table 4: 343,486.54 / 443,164.99 / 550,027.47 t C."""
    result = sensitivity_matrix(443_164.99, 10.5, 0.47, [8.5, 10.5, 12.5], [0.45, 0.47, 0.49])
    assert result["lower"]["total_tc"] == pytest.approx(343_486.54, abs=0.5)
    assert result["baseline"]["total_tc"] == pytest.approx(443_164.99, abs=0.01)
    assert result["upper"]["total_tc"] == pytest.approx(550_027.47, abs=0.5)
    assert result["lower"]["delta_pct"] == pytest.approx(-22.49, abs=0.02)
    assert result["upper"]["delta_pct"] == pytest.approx(24.11, abs=0.02)
    assert len(result["grid"]) == 9
