"""Digital-asset registration (ERC-721 carbon credits) and token metadata."""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_owned_project
from ..models import Asset, Project, ProjectStatus, Role, User
from pydantic import BaseModel, Field

from ..schemas import AssetCreate, AssetOut
from ..serializers import log_event, serialize_project, set_status

router = APIRouter(prefix="/api", tags=["assets"])


def _serialize(asset: Asset) -> dict:
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "project_name": asset.project.name if asset.project else None,
        "token_id": asset.token_id,
        "tx_hash": asset.tx_hash,
        "contract_address": asset.contract_address,
        "chain_id": asset.chain_id,
        "tonnes": asset.tonnes,
        "listing_price_eth": asset.listing_price_eth,
        "metadata_uri": asset.metadata_uri,
        "status": asset.status,
        "created_at": asset.created_at,
    }


@router.post("/projects/{project_id}/assets", response_model=AssetOut, status_code=201)
def record_asset(project_id: int, payload: AssetCreate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    if project.status not in (ProjectStatus.verified, ProjectStatus.issued):
        raise HTTPException(
            status_code=409,
            detail="Only a verified project can issue carbon-credit tokens",
        )
    if db.query(Asset).filter(Asset.tx_hash == payload.tx_hash).first():
        raise HTTPException(status_code=409, detail="That transaction hash is already recorded")
    if db.query(Asset).filter(Asset.contract_address == payload.contract_address,
                              Asset.chain_id == payload.chain_id,
                              Asset.token_id == payload.token_id).first():
        raise HTTPException(status_code=409, detail="That token id is already recorded")

    asset = Asset(project_id=project.id, **payload.model_dump())
    db.add(asset)
    db.flush()
    set_status(db, project, ProjectStatus.issued, user.id,
               f"Token #{payload.token_id} issued for {payload.tonnes} t C")
    log_event(db, project, "asset_issued", {
        "token_id": payload.token_id, "tx_hash": payload.tx_hash,
        "contract": payload.contract_address, "tonnes": payload.tonnes,
        "chain_id": payload.chain_id,
    }, user.id)
    db.commit()
    db.refresh(asset)
    return _serialize(asset)


@router.get("/projects/{project_id}/assets", response_model=list[AssetOut])
def list_project_assets(project_id: int, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    project = get_owned_project(project_id, db, user)
    return [_serialize(a) for a in sorted(project.assets, key=lambda a: a.id, reverse=True)]


@router.get("/assets", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Asset)
    if user.role == Role.developer:
        q = q.join(Project, Asset.project_id == Project.id).filter(Project.owner_id == user.id)
    return [_serialize(a) for a in q.order_by(Asset.created_at.desc()).all()]


@router.get("/assets/{asset_id}/metadata")
def token_metadata(asset_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    project = asset.project
    analysis = max(project.analyses, key=lambda a: a.id) if project.analyses else None
    return {
        "name": f"BlueChain Carbon Credit #{asset.token_id}",
        "description": (
            f"{asset.tonnes} t C of modelled above-ground mangrove carbon from "
            f"'{project.name}' ({project.region}). Modelled quantity; not an independently "
            f"verified or certified carbon credit."
        ),
        "image": "ipfs://bafkreibluechainplaceholder",
        "external_url": f"/projects/{project.id}",
        "attributes": [
            {"trait_type": "Project", "value": project.name},
            {"trait_type": "Ecosystem", "value": project.ecosystem},
            {"trait_type": "Region", "value": project.region},
            {"trait_type": "Tonnes C", "value": asset.tonnes},
            {"trait_type": "Mapped area (ha)", "value": project.area_ha},
            {"trait_type": "Modelled AGC (t C)",
             "value": (analysis.stats or {}).get("total_agc_tc") if analysis else None},
            {"trait_type": "Validation", "value": "Not independently field-validated"},
            {"trait_type": "Chain ID", "value": asset.chain_id},
        ],
        "provenance": {
            "contract": asset.contract_address,
            "token_id": asset.token_id,
            "tx_hash": asset.tx_hash,
            "analysis_id": analysis.id if analysis else None,
            "output_hashes": analysis.output_hashes if analysis else {},
        },
    }


class SimulateIn(BaseModel):
    tonnes: float = Field(gt=0)
    listing_price_eth: float | None = None


@router.post("/projects/{project_id}/assets/simulate", response_model=AssetOut, status_code=201)
def simulate_asset(project_id: int, payload: SimulateIn, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Record a demonstration issuance when no wallet is available.

    Nothing is written to a chain. The asset is stored with status SIMULATED and a
    placeholder hash so it can never be mistaken for a real transaction.
    """
    project = get_owned_project(project_id, db, user)
    if project.status not in (ProjectStatus.verified, ProjectStatus.issued):
        raise HTTPException(status_code=409,
                            detail="Only a verified project can issue carbon-credit tokens")

    used = {a.token_id for a in project.assets}
    token_id = 1
    while token_id in used:
        token_id += 1

    asset = Asset(
        project_id=project.id,
        token_id=token_id,
        tx_hash="0xSIMULATED" + secrets.token_hex(26),
        contract_address="simulated-no-chain",
        chain_id=0,
        tonnes=payload.tonnes,
        listing_price_eth=payload.listing_price_eth,
        metadata_uri=f"bluechain://project/{project.id}/metadata",
        status="SIMULATED",
    )
    db.add(asset)
    db.flush()
    log_event(db, project, "asset_simulated", {
        "token_id": token_id,
        "tonnes": payload.tonnes,
        "note": "Demonstration only - no on-chain transaction was made",
    }, user.id)
    db.commit()
    db.refresh(asset)
    return _serialize(asset)
