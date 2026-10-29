"""Aggregate dashboard statistics."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Analysis, Asset, Project, ProjectStatus, Role, User

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pq = db.query(Project)
    aq = db.query(Analysis).join(Project, Analysis.project_id == Project.id)
    if user.role == Role.developer:
        pq = pq.filter(Project.owner_id == user.id)
        aq = aq.filter(Project.owner_id == user.id)

    projects = pq.all()
    analyses = aq.all()
    assets = db.query(Asset).all()
    if user.role == Role.developer:
        owned = {p.id for p in projects}
        assets = [a for a in assets if a.project_id in owned]

    return {
        "total_projects": len(projects),
        "pending_verification": sum(1 for p in projects if p.status == ProjectStatus.qc),
        "verified_projects": sum(1 for p in projects if p.status == ProjectStatus.verified),
        "rejected_projects": sum(1 for p in projects if p.status == ProjectStatus.rejected),
        "issued_projects": sum(1 for p in projects
                               if p.status in (ProjectStatus.issued, ProjectStatus.transferred,
                                               ProjectStatus.retired)),
        "total_modelled_tc": round(sum((a.stats or {}).get("total_agc_tc", 0.0) for a in analyses), 2),
        "total_mapped_ha": round(sum((a.stats or {}).get("mapped_area_ha", 0.0) for a in analyses), 2),
        "total_issued_tonnes": round(sum(a.tonnes for a in assets), 2),
    }
