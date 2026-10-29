"""ORM models for the BlueChain MRV provenance layer."""
import enum
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, Column, DateTime, Enum, Float, ForeignKey,
                        Integer, String, Text)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    developer = "developer"
    verifier = "verifier"
    admin = "admin"


class ProjectStatus(str, enum.Enum):
    """Proposed lifecycle: MODELED -> QC -> VERIFIED -> ISSUED -> TRANSFERRED -> RETIRED."""
    draft = "DRAFT"
    modeled = "MODELED"
    qc = "QC"
    verified = "VERIFIED"
    rejected = "REJECTED"
    issued = "ISSUED"
    transferred = "TRANSFERRED"
    retired = "RETIRED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False, default="")
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(Role), nullable=False, default=Role.developer)
    wallet_address = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    projects = relationship("Project", back_populates="owner", foreign_keys="Project.owner_id")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    ecosystem = Column(String(64), default="Mangrove")
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    status = Column(Enum(ProjectStatus), default=ProjectStatus.draft, nullable=False)
    boundary_geojson = Column(JSON, nullable=True)
    area_ha = Column(Float, nullable=True)
    centroid_lat = Column(Float, nullable=True)
    centroid_lon = Column(Float, nullable=True)
    region = Column(String(255), default="Sundarbans, West Bengal, India")

    review_note = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner = relationship("User", back_populates="projects", foreign_keys=[owner_id])
    analyses = relationship("Analysis", back_populates="project", cascade="all, delete-orphan")
    baselines = relationship("InvestBaseline", back_populates="project", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="project", cascade="all, delete-orphan")
    events = relationship("ProvenanceEvent", back_populates="project", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    params = Column(JSON, nullable=False, default=dict)
    stats = Column(JSON, nullable=False, default=dict)
    footprint = Column(JSON, nullable=False, default=dict)
    rasters = Column(JSON, nullable=False, default=dict)   # {"agc": path, "ndvi": path, ...}
    input_hashes = Column(JSON, nullable=False, default=dict)
    output_hashes = Column(JSON, nullable=False, default=dict)
    gedi_support = Column(JSON, nullable=False, default=dict)

    project = relationship("Project", back_populates="analyses")


class InvestBaseline(Base):
    __tablename__ = "invest_baselines"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    total_tc = Column(Float, nullable=False, default=0.0)
    pools = Column(JSON, nullable=False, default=dict)
    classes = Column(JSON, nullable=False, default=list)
    params = Column(JSON, nullable=False, default=dict)
    input_hashes = Column(JSON, nullable=False, default=dict)

    project = relationship("Project", back_populates="baselines")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    token_id = Column(Integer, nullable=False)
    tx_hash = Column(String(80), nullable=False)
    contract_address = Column(String(64), nullable=False)
    chain_id = Column(Integer, nullable=False, default=31337)
    tonnes = Column(Float, nullable=False, default=0.0)
    listing_price_eth = Column(Float, nullable=True)
    metadata_uri = Column(String(512), nullable=True)
    status = Column(String(32), default="ISSUED")  # ISSUED / TRANSFERRED / RETIRED
    created_at = Column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="assets")


class ProvenanceEvent(Base):
    __tablename__ = "provenance_events"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    kind = Column(String(48), nullable=False)
    detail = Column(JSON, nullable=False, default=dict)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    digest = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="events")
