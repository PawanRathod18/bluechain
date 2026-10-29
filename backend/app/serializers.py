"""ORM -> response dict helpers."""
from .models import Project, ProjectStatus
from .services.provenance import digest_of


def latest_analysis(project: Project):
    return max(project.analyses, key=lambda a: a.id) if project.analyses else None


def serialize_project(p: Project, include_boundary: bool = True) -> dict:
    analysis = latest_analysis(p)
    issued = sum(a.tonnes for a in p.assets)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description or "",
        "ecosystem": p.ecosystem,
        "region": p.region,
        "status": p.status.value if hasattr(p.status, "value") else str(p.status),
        "area_ha": p.area_ha,
        "centroid_lat": p.centroid_lat,
        "centroid_lon": p.centroid_lon,
        "boundary": p.boundary_geojson if include_boundary else None,
        "owner_email": p.owner.email if p.owner else None,
        "owner_name": p.owner.full_name if p.owner else None,
        "review_note": p.review_note,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "latest_analysis": (
            {
                "id": analysis.id,
                "created_at": analysis.created_at,
                "total_agc_tc": (analysis.stats or {}).get("total_agc_tc", 0.0),
                "mapped_area_ha": (analysis.stats or {}).get("mapped_area_ha", 0.0),
                "mean_agc_density": (analysis.stats or {}).get("mean_agc_density", 0.0),
            }
            if analysis else None
        ),
        "total_tonnes_issued": round(issued, 2),
    }


def log_event(db, project: Project, kind: str, detail: dict, actor_id: int | None = None):
    from .models import ProvenanceEvent

    event = ProvenanceEvent(
        project_id=project.id, kind=kind, detail=detail, actor_id=actor_id,
        digest=digest_of({"kind": kind, "detail": detail, "project": project.id}),
    )
    db.add(event)
    return event


def set_status(db, project: Project, status: ProjectStatus, actor_id: int | None = None, note: str = ""):
    previous = project.status.value if hasattr(project.status, "value") else str(project.status)
    project.status = status
    log_event(db, project, "status_changed",
              {"from": previous, "to": status.value, "note": note}, actor_id)
    return project
