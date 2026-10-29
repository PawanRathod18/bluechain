"""Project registration, boundaries, submission and the evidence record."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_owned_project, require_verifier
from ..models import Project, ProjectStatus, Role, User
from ..schemas import (BoundaryUpdate, EventOut, ProjectCreate, ProjectOut,
                       ProjectUpdate)
from ..serializers import latest_analysis, log_event, serialize_project, set_status
from ..services.geo import BoundaryError, boundary_summary
from ..services.provenance import evidence_record

router = APIRouter(prefix="/api", tags=["projects"])


class GeometryIn(BaseModel):
    boundary: dict


@router.post("/geometry/measure")
def measure_geometry(payload: GeometryIn, user: User = Depends(get_current_user)):
    """Geodesic area and centroid of a boundary, on the WGS 84 ellipsoid.

    The map uses this so the number on screen is exactly what will be stored.
    """
    try:
        summary = boundary_summary(payload.boundary)
    except BoundaryError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "area_ha": summary["area_ha"],
        "centroid_lat": summary["centroid_lat"],
        "centroid_lon": summary["centroid_lon"],
        "bounds": summary["bounds"],
        "geojson": summary["geojson"],
    }


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: str | None = Query(None),
    mine: bool = Query(False, description="Only projects owned by the caller"),
):
    q = db.query(Project)
    if user.role == Role.developer or mine:
        q = q.filter(Project.owner_id == user.id)
    if status:
        try:
            q = q.filter(Project.status == ProjectStatus(status.upper()))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown status '{status}'")
    projects = q.order_by(Project.created_at.desc()).all()
    return [serialize_project(p) for p in projects]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    try:
        summary = boundary_summary(payload.boundary)
    except BoundaryError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    project = Project(
        name=payload.name.strip(),
        description=payload.description,
        ecosystem=payload.ecosystem,
        region=payload.region,
        owner_id=user.id,
        boundary_geojson=summary["geojson"],
        area_ha=summary["area_ha"],
        centroid_lat=summary["centroid_lat"],
        centroid_lon=summary["centroid_lon"],
        status=ProjectStatus.draft,
    )
    db.add(project)
    db.flush()
    log_event(db, project, "project_registered", {
        "area_ha": summary["area_ha"],
        "centroid": [summary["centroid_lat"], summary["centroid_lon"]],
        "bounds": summary["bounds"],
    }, user.id)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return serialize_project(get_owned_project(project_id, db, user))


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    if project.owner_id != user.id and user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Only the owner can edit a project")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.put("/projects/{project_id}/boundary", response_model=ProjectOut)
def update_boundary(project_id: int, payload: BoundaryUpdate, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    if project.owner_id != user.id and user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Only the owner can edit the boundary")
    try:
        summary = boundary_summary(payload.boundary)
    except BoundaryError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    project.boundary_geojson = summary["geojson"]
    project.area_ha = summary["area_ha"]
    project.centroid_lat = summary["centroid_lat"]
    project.centroid_lon = summary["centroid_lon"]
    log_event(db, project, "boundary_updated", {
        "area_ha": summary["area_ha"], "bounds": summary["bounds"]}, user.id)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.post("/projects/{project_id}/submit", response_model=ProjectOut)
def submit_for_verification(project_id: int, db: Session = Depends(get_db),
                            user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    if not latest_analysis(project):
        raise HTTPException(status_code=409, detail="Run a carbon analysis before submitting")
    if project.status not in (ProjectStatus.draft, ProjectStatus.modeled, ProjectStatus.rejected):
        raise HTTPException(status_code=409, detail=f"Project is already {project.status.value}")
    from datetime import datetime, timezone
    project.submitted_at = datetime.now(timezone.utc)
    set_status(db, project, ProjectStatus.qc, user.id, "Submitted for verifier review")
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    if project.owner_id != user.id and user.role != Role.admin:
        raise HTTPException(status_code=403, detail="Only the owner can delete a project")
    if project.assets:
        raise HTTPException(status_code=409, detail="Cannot delete a project with issued assets")
    db.delete(project)
    db.commit()


@router.get("/projects/{project_id}/provenance")
def provenance(project_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    analysis = latest_analysis(project)
    baseline = max(project.baselines, key=lambda b: b.id) if project.baselines else None
    record = evidence_record(project, analysis, baseline, project.assets)
    record["events"] = [
        {"kind": e.kind, "detail": e.detail, "digest": e.digest,
         "created_at": e.created_at.isoformat() if e.created_at else None}
        for e in sorted(project.events, key=lambda e: e.id)
    ]
    return record


@router.get("/projects/{project_id}/events", response_model=list[EventOut])
def events(project_id: int, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    return sorted(project.events, key=lambda e: e.id)
