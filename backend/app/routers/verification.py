"""Verifier workspace: review queue, decisions and aggregate counts."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_verifier
from ..models import Project, ProjectStatus, Role, User, utcnow
from ..schemas import DecisionIn, ProjectOut
from ..serializers import latest_analysis, log_event, serialize_project, set_status

router = APIRouter(prefix="/api", tags=["verification"])

OPEN_STATES = (ProjectStatus.qc, ProjectStatus.verified, ProjectStatus.rejected,
               ProjectStatus.issued, ProjectStatus.transferred, ProjectStatus.retired)


@router.get("/verifier/queue", response_model=list[ProjectOut])
def review_queue(db: Session = Depends(get_db), user: User = Depends(require_verifier)):
    projects = (db.query(Project)
                .filter(Project.status.in_(OPEN_STATES))
                .order_by(Project.submitted_at.desc().nullslast(), Project.created_at.desc())
                .all())
    return [serialize_project(p) for p in projects]


@router.get("/verifier/stats")
def verifier_stats(db: Session = Depends(get_db), user: User = Depends(require_verifier)):
    def count(*states):
        return db.query(Project).filter(Project.status.in_(states)).count()

    return {
        "total_projects": db.query(Project).count(),
        "pending_verification": count(ProjectStatus.qc),
        "verified_projects": count(ProjectStatus.verified),
        "rejected_projects": count(ProjectStatus.rejected),
        "issued_projects": count(ProjectStatus.issued, ProjectStatus.transferred, ProjectStatus.retired),
    }


@router.post("/projects/{project_id}/decision", response_model=ProjectOut)
def decide(project_id: int, payload: DecisionIn, db: Session = Depends(get_db),
           user: User = Depends(require_verifier)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status not in (ProjectStatus.qc, ProjectStatus.modeled, ProjectStatus.rejected):
        raise HTTPException(
            status_code=409,
            detail=f"Project is {project.status.value}; only submitted projects can be reviewed",
        )
    if not latest_analysis(project):
        raise HTTPException(status_code=409, detail="Project has no carbon analysis to review")
    if project.owner_id == user.id and user.role != Role.admin:
        raise HTTPException(
            status_code=403,
            detail="You cannot review a project you own. Ask another verifier to look at it.",
        )

    project.reviewed_by = user.id
    project.reviewed_at = utcnow()
    project.review_note = payload.note
    target = {
        "approve": ProjectStatus.verified,
        "reject": ProjectStatus.rejected,
        "request_info": ProjectStatus.modeled,
    }[payload.decision]
    summary = {
        "approve": "approved by verifier",
        "reject": "rejected by verifier",
        "request_info": "changes requested by verifier",
    }[payload.decision]
    set_status(db, project, target, user.id, payload.note or summary)
    log_event(db, project, "verification_decision",
              {"decision": payload.decision, "note": payload.note, "reviewer": user.email}, user.id)
    db.commit()
    db.refresh(project)
    return serialize_project(project)
