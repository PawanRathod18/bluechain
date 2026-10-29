"""Filesystem helpers. Paths are stored relative to the storage root so the
whole storage directory can be moved or mounted as a volume."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from .config import settings

ROOT = Path(settings.storage_dir).resolve()


def ensure_root() -> Path:
    ROOT.mkdir(parents=True, exist_ok=True)
    return ROOT


def project_dir(project_id: int) -> Path:
    p = ensure_root() / "projects" / str(project_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def new_analysis_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "analyses" / uuid.uuid4().hex[:12]
    p.mkdir(parents=True, exist_ok=True)
    return p


def uploads_dir(project_id: int) -> Path:
    p = project_dir(project_id) / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p


def rel(path: str | Path) -> str:
    return str(Path(path).resolve().relative_to(ROOT))


def abs(rel_path: str) -> Path:
    p = (ROOT / rel_path).resolve()
    if ROOT not in p.parents and p != ROOT:
        raise ValueError("Path escapes the storage root")
    return p


def save_upload(file_obj, dest_dir: Path, filename: str, max_mb: int) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe = Path(filename or "upload.bin").name.replace(" ", "_")
    dest = dest_dir / f"{uuid.uuid4().hex[:8]}_{safe}"
    limit = max_mb * 1024 * 1024
    written = 0
    file_obj.seek(0)
    with open(dest, "wb") as out:
        while True:
            chunk = file_obj.read(1 << 20)
            if not chunk:
                break
            written += len(chunk)
            if written > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise ValueError(f"Upload exceeds the {max_mb} MB limit")
            out.write(chunk)
    return dest


def copy_into(src: str | Path, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / Path(src).name
    shutil.copyfile(src, dest)
    return dest
