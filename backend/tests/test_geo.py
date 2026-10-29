import pytest

from app.services.geo import BoundaryError, area_hectares, boundary_summary, geometry_from_geojson


def square(lat, lon, side_deg):
    return {"type": "Polygon", "coordinates": [[
        [lon, lat], [lon + side_deg, lat], [lon + side_deg, lat + side_deg],
        [lon, lat + side_deg], [lon, lat]]]}


def test_area_of_one_degree_square():
    # 1 deg x 1 deg near the equator is ~12,308 km2 = ~1,230,800 ha
    geom = geometry_from_geojson(square(0.0, 0.0, 1.0))
    area = area_hectares(geom)
    assert 1_220_000 < area < 1_240_000


def test_boundary_summary_shape():
    summary = boundary_summary(square(21.74, 88.95, 0.01))
    assert summary["area_ha"] > 0
    assert 21.7 < summary["centroid_lat"] < 21.8
    assert 88.9 < summary["centroid_lon"] < 89.0
    assert summary["geojson"]["type"] == "Polygon"


def test_feature_collection_accepted():
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {},
         "geometry": square(21.74, 88.95, 0.01)}]}
    assert boundary_summary(fc)["area_ha"] > 0


def test_rejects_non_polygon():
    with pytest.raises(BoundaryError):
        boundary_summary({"type": "Point", "coordinates": [88.9, 21.7]})


def test_rejects_degenerate():
    degenerate = {"type": "Polygon", "coordinates": [[
        [88.95, 21.74], [88.95, 21.74], [88.95, 21.74], [88.95, 21.74]]]}
    with pytest.raises(BoundaryError):
        boundary_summary(degenerate)
