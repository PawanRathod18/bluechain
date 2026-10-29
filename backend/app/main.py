"""BlueChain API — FastAPI application entry point."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import admin, analysis, assets, auth, projects, stats, verification
from .storage import ensure_root


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_root()
    if os.getenv("BLUECHAIN_SEED", "true").lower() == "true" and settings.environment != "test":
        from .seed import seed_if_empty
        with SessionLocal() as db:
            seed_if_empty(db)
    yield


app = FastAPI(
    title="BlueChain API",
    description=(
        "Digital MRV and provenance layer for verified quantification and transparent "
        "trading of blue carbon assets (PELAGIX framework). Modelled quantities are not "
        "certified carbon credits."
    ),
    version=settings.api_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, projects.router, analysis.router,
               verification.router, assets.router, stats.router, admin.router):
    app.include_router(router)


@app.get("/api/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.api_version,
        "environment": settings.environment,
        "chain": {"chain_id": settings.chain_id, "contract": settings.contract_address or None},
        "model": {
            "agb_coefficient": settings.agb_coefficient,
            "carbon_fraction": settings.carbon_fraction,
            "ndvi_threshold": settings.ndvi_threshold,
            "gapfill_multiplier": settings.gapfill_multiplier,
            "nominal_cell_ha": settings.nominal_cell_ha,
        },
    }


# --------------------------------------------------------------------------
# Optional: serve the built React app from the same service.
# Build the frontend (`npm run build`) and it is picked up automatically.
# --------------------------------------------------------------------------
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    if (DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (DIST / full_path).resolve()
        if full_path and candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
