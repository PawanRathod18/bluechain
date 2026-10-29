"""Test configuration: isolated SQLite database and storage directory."""
import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="bluechain-test-"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_TMP}/test.db",
    "STORAGE_DIR": str(_TMP / "storage"),
    "SECRET_KEY": "test-secret-key",
    "ENVIRONMENT": "test",
    "BLUECHAIN_SEED": "false",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def tmp_root():
    return _TMP


def register(client, email, role="developer", name="Test User", password="Password123"):
    r = client.post("/api/auth/register", json={
        "email": email, "full_name": name, "password": password, "role": role})
    assert r.status_code == 201, r.text
    return r.json()


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def make_verifier(client):
    """Create a verifier the way production does: out of band, not via signup."""
    from app.database import SessionLocal
    from app.models import Role, User
    from app.security import hash_password

    def _make(email, name="Verifier"):
        with SessionLocal() as db:
            user = User(email=email, full_name=name, role=Role.verifier,
                        hashed_password=hash_password("Password123"))
            db.add(user)
            db.commit()
        r = client.post("/api/auth/login", data={"username": email, "password": "Password123"})
        assert r.status_code == 200, r.text
        return r.json()

    return _make
