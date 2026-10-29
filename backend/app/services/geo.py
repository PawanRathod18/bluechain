"""Boundary handling: GeoJSON parsing, geodesic area, centroid."""
import math

from pyproj import Geod
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import transform

GEOD = Geod(ellps="WGS84")
WGS84 = "EPSG:4326"


class BoundaryError(ValueError):
    pass


def geometry_from_geojson(gj: dict) -> Polygon:
    """Extract the first polygon from a GeoJSON geometry/feature/collection."""
    if not isinstance(gj, dict):
        raise BoundaryError("Boundary must be a GeoJSON object")

    node = gj
    if node.get("type") == "FeatureCollection":
        feats = node.get("features") or []
        if not feats:
            raise BoundaryError("FeatureCollection contains no features")
        node = feats[0]
    if node.get("type") == "Feature":
        node = node.get("geometry") or {}
    if node.get("type") not in ("Polygon", "MultiPolygon"):
        raise BoundaryError("Boundary geometry must be a Polygon or MultiPolygon")

    geom = shape(node)
    if not geom.is_valid:
        geom = geom.buffer(0)
    if isinstance(geom, MultiPolygon):
        geom = max(geom.geoms, key=lambda g: g.area)
    if geom.is_empty or not isinstance(geom, Polygon):
        raise BoundaryError("Boundary geometry is empty after repair")
    return geom


def area_hectares(geom: Polygon) -> float:
    """Geodesic area in hectares on the WGS84 ellipsoid."""
    area_m2, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area_m2) / 10_000.0


def centroid_lonlat(geom: Polygon) -> tuple[float, float]:
    c = geom.centroid
    return (c.x, c.y)


def bounds_of(geom: Polygon) -> list[float]:
    return [round(v, 8) for v in geom.bounds]  # [minx, miny, maxx, maxy]


def boundary_summary(gj: dict) -> dict:
    geom = geometry_from_geojson(gj)
    area = area_hectares(geom)
    if area <= 0:
        raise BoundaryError("Boundary has zero area")
    if area > 5_000_000:
        raise BoundaryError("Boundary exceeds 5 million hectares; check the coordinate order")
    lon, lat = centroid_lonlat(geom)
    return {
        "geometry": geom,
        "area_ha": round(area, 4),
        "centroid_lat": round(lat, 8),
        "centroid_lon": round(lon, 8),
        "bounds": bounds_of(geom),
        "geojson": {"type": "Polygon", "coordinates": [list(map(list, geom.exterior.coords))]},
    }


def web_mercator_area_km2(geom: Polygon) -> float:
    """Planar area in EPSG:3857 — used only for quick sanity checks."""
    from pyproj import Transformer

    tr = Transformer.from_crs(WGS84, "EPSG:3857", always_xy=True)
    projected = transform(tr.transform, geom)
    return projected.area / 1e6
