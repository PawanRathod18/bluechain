"""Registration, login and profile."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Role, User
from ..schemas import Token, UserCreate, UserOut, WalletUpdate
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if payload.role != "developer":
        raise HTTPException(
            status_code=403,
            detail=("Verifier accounts are issued by the platform administrator, not created "
                    "by self-registration. Sign up as a project developer, or ask the "
                    "administrator for verifier access."),
        )
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=Role(payload.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(user.email, user.role.value), user=user)


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(user.email, user.role.value), user=user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me/wallet", response_model=UserOut)
def set_wallet(payload: WalletUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.wallet_address = payload.wallet_address
    db.commit()
    db.refresh(user)
    return user
