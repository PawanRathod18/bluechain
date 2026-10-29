"""Shared FastAPI dependencies: current user, role guards."""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Project, Role, User
from .security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    creds_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise creds_error
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise creds_error
    user = db.query(User).filter(User.email == payload["sub"]).first()
    if not user or not user.is_active:
        raise creds_error
    return user


def require_roles(*roles: Role):
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and user.role != Role.admin:
            raise HTTPException(status_code=403, detail="Insufficient permissions for this action")
        return user

    return guard


require_verifier = require_roles(Role.verifier)


def get_owned_project(project_id: int, db: Session, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != user.id and user.role not in (Role.admin, Role.verifier):
        raise HTTPException(status_code=403, detail="You do not have access to this project")
    return project


def user_from_token_value(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return None
    return db.query(User).filter(User.email == payload["sub"]).first()


def get_user_flexible(request: Request, db: Session = Depends(get_db)) -> User:
    """Accept the JWT from the Authorization header or a ?token= query parameter.

    The query parameter exists so <img> tags and downloads can authenticate.
    """
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else None
    if not token:
        token = request.query_params.get("token")
    user = user_from_token_value(token, db)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
