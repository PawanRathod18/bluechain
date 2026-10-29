"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import ProjectStatus, Role


# ---------------------------------------------------------------- auth
class UserCreate(BaseModel):
    """Self-registration. Always creates a project developer.

    Verifier and admin accounts carry review rights, so they are issued by an
    administrator through /api/admin/users rather than chosen at signup.
    """
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["developer", "verifier"] = "developer"


class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["developer", "verifier", "admin"] = "verifier"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: Role
    wallet_address: Optional[str] = None

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class WalletUpdate(BaseModel):
    wallet_address: str = Field(min_length=4, max_length=64)


# ------------------------------------------------------------ projects
class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str = ""
    ecosystem: str = "Mangrove"
    region: str = "Sundarbans, West Bengal, India"
    boundary: dict[str, Any]

    @field_validator("boundary")
    @classmethod
    def _boundary_type(cls, v):
        if not isinstance(v, dict) or "type" not in v:
            raise ValueError("boundary must be a GeoJSON object")
        return v


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    ecosystem: Optional[str] = None
    region: Optional[str] = None


class BoundaryUpdate(BaseModel):
    boundary: dict[str, Any]


class AnalysisSummary(BaseModel):
    id: int
    created_at: datetime
    total_agc_tc: float
    mapped_area_ha: float
    mean_agc_density: float

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    ecosystem: str
    region: str
    status: ProjectStatus
    area_ha: Optional[float]
    centroid_lat: Optional[float]
    centroid_lon: Optional[float]
    boundary: Optional[dict] = None
    owner_email: Optional[str] = None
    owner_name: Optional[str] = None
    review_note: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    latest_analysis: Optional[AnalysisSummary] = None
    total_tonnes_issued: float = 0.0


# ------------------------------------------------------------ analysis
class AnalysisOut(BaseModel):
    id: int
    project_id: int
    created_at: datetime
    params: dict
    stats: dict
    footprint: dict
    gedi_support: dict
    input_hashes: dict
    output_hashes: dict
    previews: dict[str, str] = {}


class SensitivityOut(BaseModel):
    baseline: dict
    lower: dict
    upper: dict
    range: list[float]
    grid: list[dict]
    coefficients: list[float]
    fractions: list[float]
    note: str


class InvestOut(BaseModel):
    id: int
    project_id: int
    created_at: datetime
    total_tc: float
    pools: dict
    classes: list
    params: dict
    footprint: dict = {}
    input_hashes: dict = {}


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject", "request_info"]
    note: str = ""


# -------------------------------------------------------------- assets
class AssetCreate(BaseModel):
    token_id: int = Field(ge=0)
    tx_hash: str = Field(min_length=10, max_length=80)
    contract_address: str = Field(min_length=4, max_length=64)
    chain_id: int = 31337
    tonnes: float = Field(ge=0)
    listing_price_eth: Optional[float] = None
    metadata_uri: Optional[str] = None


class AssetOut(BaseModel):
    id: int
    project_id: int
    project_name: Optional[str] = None
    token_id: int
    tx_hash: str
    contract_address: str
    chain_id: int
    tonnes: float
    listing_price_eth: Optional[float]
    metadata_uri: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EventOut(BaseModel):
    id: int
    kind: str
    detail: dict
    actor_id: Optional[int]
    digest: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class StatsOut(BaseModel):
    total_projects: int
    pending_verification: int
    verified_projects: int
    rejected_projects: int
    issued_projects: int
    total_modelled_tc: float
    total_issued_tonnes: float
    total_mapped_ha: float
