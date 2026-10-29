"""Administrator-only user management: issuing verifier accounts."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_roles
from ..models import Role, User
from ..schemas import AdminUserCreate, UserOut
from ..security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

require_admin = require_roles(Role.admin)


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return db.query(User).order_by(User.id).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db),
                user: User = Depends(require_admin)):
    """Create a developer, verifier or admin account.

    This is the only path that can mint a verifier, so review rights are granted
    deliberately rather than claimed by whoever fills in the signup form.
    """
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    created = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=Role(payload.role),
    )
    db.add(created)
    db.commit()
    db.refresh(created)
    return created
