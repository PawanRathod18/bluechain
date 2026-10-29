"""Carbon analysis, InVEST baseline, sensitivity and raster delivery."""
from __future__ import annotations

import math
from pathlib import Path

from fastapi import (APIRouter, Depends, File, Form, HTTPException, UploadFile)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_owned_project, get_user_flexible
from ..models import Analysis, InvestBaseline, Project, ProjectStatus, Role, User
from ..schemas import AnalysisOut, InvestOut, SensitivityOut
from ..serializers import latest_analysis, log_event, serialize_project, set_status
from .. import storage as store
from ..services.carbon import AnalysisError, run_carbon_analysis
from ..services.demo_data import DEMO_SIZE, generate_demo_dataset
from ..services.geo import geometry_from_geojson
from ..services.invest import BaselineError, run_invest_baseline
from ..services.sensitivity import sensitivity_matrix

router = APIRouter(prefix="/api", tags=["analysis"])

PREVIEW_KINDS = {"agc": "agc_png", "ndvi": "ndvi_png", "mask": "mask_png"}
DOWNLOAD_KINDS = {"agc": "agc_tif", "ndvi": "ndvi_tif", "mask": "mask_tif", "height": "height_tif"}


def _previews(analysis: Analysis) -> dict[str, str]:
    out = {}
    for kind, key in PREVIEW_KINDS.items():
        if (analysis.rasters or {}).get(key):
            out[kind] = f"/api/projects/{analysis.project_id}/analysis/{analysis.id}/preview/{kind}"
    return out


def _serialize_analysis(a: Analysis) -> dict:
    return {
        "id": a.id,
        "project_id": a.project_id,
        "created_at": a.created_at,
        "params": a.params or {},
        "stats": a.stats or {},
        "footprint": a.footprint or {},
        "gedi_support": a.gedi_support or {},
        "input_hashes": a.input_hashes or {},
        "output_hashes": a.output_hashes or {},
        "previews": _previews(a),
    }


def _run_and_store(db: Session, project: Project, red: Path, nir: Path,
                   gedi: Path | None, params: dict, actor: User) -> Analysis:
    out_dir = store.new_analysis_dir(project.id)
    try:
        result = run_carbon_analysis(red, nir, gedi, out_dir, **params)
    except AnalysisError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    rasters = {k: (store.rel(v) if k.endswith("_tif") or k.endswith("_png") else v)
               for k, v in result["rasters"].items()}

    analysis = Analysis(
        project_id=project.id,
        params=result["params"],
        stats=result["stats"],
        footprint=result["footprint"],
        rasters=rasters,
        input_hashes=result["input_hashes"],
        output_hashes=result["output_hashes"],
        gedi_support=result["gedi_support"],
    )
    db.add(analysis)
    db.flush()

    if project.status in (ProjectStatus.draft, ProjectStatus.rejected):
        set_status(db, project, ProjectStatus.modeled, actor.id, "Carbon analysis completed")
    log_event(db, project, "analysis_completed", {
        "analysis_id": analysis.id,
        "total_agc_tc": result["stats"]["total_agc_tc"],
        "mapped_area_ha": result["stats"]["mapped_area_ha"],
        "inputs": result["input_hashes"],
        "outputs": result["output_hashes"],
    }, actor.id)
    db.commit()
    db.refresh(analysis)
    return analysis


def _default(name: str, value, cast=float):
    return value if value is not None else getattr(settings, name)


@router.post("/projects/{project_id}/analysis", response_model=AnalysisOut)
def create_analysis(
    project_id: int,
    red: UploadFile = File(..., description="Sentinel-2 B4 (red) GeoTIFF"),
    nir: UploadFile = File(..., description="Sentinel-2 B8 (NIR) GeoTIFF"),
    gedi: UploadFile | None = File(None, description="GEDI rh100 GeoTIFF (optional)"),
    ndvi_threshold: float | None = Form(None),
    agb_coefficient: float | None = Form(None),
    carbon_fraction: float | None = Form(None),
    gapfill_multiplier: float | None = Form(None),
    nominal_cell_ha: float | None = Form(None),
    red_band: int = Form(1),
    nir_band: int = Form(1),
    gedi_band: int = Form(1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, user)
    updir = store.uploads_dir(project.id)
    try:
        red_path = store.save_upload(red.file, updir, red.filename, settings.max_upload_mb)
        nir_path = store.save_upload(nir.file, updir, nir.filename, settings.max_upload_mb)
        gedi_path = (store.save_upload(gedi.file, updir, gedi.filename, settings.max_upload_mb)
                     if gedi is not None else None)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    params = {
        "ndvi_threshold": _default("ndvi_threshold", ndvi_threshold),
        "agb_coefficient": _default("agb_coefficient", agb_coefficient),
        "carbon_fraction": _default("carbon_fraction", carbon_fraction),
        "gapfill_multiplier": _default("gapfill_multiplier", gapfill_multiplier),
        "nominal_cell_ha": _default("nominal_cell_ha", nominal_cell_ha),
        "red_band": red_band, "nir_band": nir_band, "gedi_band": gedi_band,
    }
    analysis = _run_and_store(db, project, red_path, nir_path, gedi_path, params, user)
    return _serialize_analysis(analysis)


def _project_grid(project: Project) -> tuple[tuple | None, float]:
    """Bounding box of the registered boundary, plus the cell area that makes the
    demo grid cover the registered area (so mapped area <= project area)."""
    cells = DEMO_SIZE[0] * DEMO_SIZE[1]
    if project.boundary_geojson:
        try:
            geom = geometry_from_geojson(project.boundary_geojson)
            bounds = tuple(geom.bounds)
        except Exception:
            bounds = None
    else:
        bounds = None
    cell_ha = (project.area_ha / cells) if project.area_ha else settings.nominal_cell_ha
    return bounds, round(cell_ha, 10)


@router.post("/projects/{project_id}/analysis/demo", response_model=AnalysisOut)
def create_demo_analysis(project_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    """Run the pipeline on the bundled synthetic dataset (demonstration data)."""
    project = get_owned_project(project_id, db, user)
    bounds, cell_ha = _project_grid(project)
    demo = generate_demo_dataset(store.ensure_root() / "demo" / f"p{project.id}", bounds)
    params = {
        "ndvi_threshold": settings.ndvi_threshold,
        "agb_coefficient": settings.agb_coefficient,
        "carbon_fraction": settings.carbon_fraction,
        "gapfill_multiplier": settings.gapfill_multiplier,
        "nominal_cell_ha": cell_ha,
        "red_band": 1, "nir_band": 1, "gedi_band": 1,
    }
    analysis = _run_and_store(db, project, Path(demo["red"]), Path(demo["nir"]),
                              Path(demo["gedi"]), params, user)
    return _serialize_analysis(analysis)


@router.get("/projects/{project_id}/analysis", response_model=list[AnalysisOut])
def list_analyses(project_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    return [_serialize_analysis(a) for a in sorted(project.analyses, key=lambda a: a.id, reverse=True)]


@router.get("/projects/{project_id}/analysis/latest", response_model=AnalysisOut)
def get_latest(project_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    analysis = latest_analysis(project)
    if not analysis:
        raise HTTPException(status_code=404, detail="No analysis has been run for this project")
    return _serialize_analysis(analysis)


@router.get("/projects/{project_id}/analysis/{analysis_id}", response_model=AnalysisOut)
def get_analysis(project_id: int, analysis_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    get_owned_project(project_id, db, user)
    analysis = db.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _serialize_analysis(analysis)


@router.get("/projects/{project_id}/analysis/{analysis_id}/preview/{kind}")
def get_preview(project_id: int, analysis_id: int, kind: str, db: Session = Depends(get_db),
                user: User = Depends(get_user_flexible)):
    get_owned_project(project_id, db, user)
    analysis = db.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    key = PREVIEW_KINDS.get(kind)
    if not key:
        raise HTTPException(status_code=404, detail=f"Unknown preview '{kind}'")
    rel_path = (analysis.rasters or {}).get(key)
    if not rel_path:
        raise HTTPException(status_code=404, detail="Preview not available")
    path = store.abs(rel_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Preview file missing from storage")
    return FileResponse(path, media_type="image/png",
                        headers={"Cache-Control": "private, max-age=3600"})


@router.get("/projects/{project_id}/analysis/{analysis_id}/download/{kind}")
def download_raster(project_id: int, analysis_id: int, kind: str, db: Session = Depends(get_db),
                    user: User = Depends(get_user_flexible)):
    get_owned_project(project_id, db, user)
    analysis = db.get(Analysis, analysis_id)
    if not analysis or analysis.project_id != project_id:
        raise HTTPException(status_code=404, detail="Analysis not found")
    key = DOWNLOAD_KINDS.get(kind)
    rel_path = (analysis.rasters or {}).get(key) if key else None
    if not rel_path:
        raise HTTPException(status_code=404, detail="Raster not available")
    path = store.abs(rel_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Raster file missing from storage")
    return FileResponse(path, media_type="image/tiff", filename=f"{kind}_{analysis.id}.tif")


@router.get("/projects/{project_id}/sensitivity", response_model=SensitivityOut)
def get_sensitivity(project_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    analysis = latest_analysis(project)
    if not analysis:
        raise HTTPException(status_code=404, detail="Run a carbon analysis first")
    params = analysis.params or {}
    coefficients = [float(v) for v in settings.sensitivity_coefficients.split(",")]
    fractions = [float(v) for v in settings.sensitivity_fractions.split(",")]
    return sensitivity_matrix(
        float(analysis.stats.get("total_agc_tc", 0.0)),
        float(params.get("agb_coefficient", settings.agb_coefficient)),
        float(params.get("carbon_fraction", settings.carbon_fraction)),
        coefficients, fractions,
    )


def _store_baseline(db: Session, project: Project, result: dict, actor: User) -> InvestBaseline:
    baseline = InvestBaseline(
        project_id=project.id,
        total_tc=result["total_tc"],
        pools=result["pools"],
        classes=result["classes"],
        params=result["params"],
        input_hashes=result["input_hashes"],
    )
    db.add(baseline)
    db.flush()
    log_event(db, project, "invest_baseline_recorded",
              {"total_tc": result["total_tc"], "inputs": result["input_hashes"]}, actor.id)
    db.commit()
    db.refresh(baseline)
    return baseline


def _serialize_baseline(b: InvestBaseline) -> dict:
    return {
        "id": b.id, "project_id": b.project_id, "created_at": b.created_at,
        "total_tc": b.total_tc, "pools": b.pools or {}, "classes": b.classes or [],
        "params": b.params or {}, "input_hashes": b.input_hashes or {},
    }


@router.post("/projects/{project_id}/invest", response_model=InvestOut)
def create_baseline(project_id: int,
                    lulc: UploadFile = File(..., description="LULC GeoTIFF"),
                    biophysical: UploadFile = File(..., description="Biophysical CSV"),
                    cell_area_ha: float | None = Form(None),
                    db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    updir = store.uploads_dir(project.id)
    try:
        lulc_path = store.save_upload(lulc.file, updir, lulc.filename, settings.max_upload_mb)
        bio_path = store.save_upload(biophysical.file, updir, biophysical.filename, settings.max_upload_mb)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    try:
        result = run_invest_baseline(lulc_path, bio_path,
                                     cell_area_ha or settings.nominal_cell_ha)
    except BaselineError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return _serialize_baseline(_store_baseline(db, project, result, user))


@router.post("/projects/{project_id}/invest/demo", response_model=InvestOut)
def create_demo_baseline(project_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    bounds, cell_ha = _project_grid(project)
    demo = generate_demo_dataset(store.ensure_root() / "demo" / f"p{project.id}", bounds)
    result = run_invest_baseline(Path(demo["lulc"]), Path(demo["biophysical"]), cell_ha)
    return _serialize_baseline(_store_baseline(db, project, result, user))


@router.get("/projects/{project_id}/invest", response_model=list[InvestOut])
def list_baselines(project_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    return [_serialize_baseline(b) for b in sorted(project.baselines, key=lambda b: b.id, reverse=True)]
