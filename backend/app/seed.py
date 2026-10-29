"""Demo seed data: accounts plus the submission records used in the paper's dashboard."""
from __future__ import annotations

import math

from sqlalchemy.orm import Session

from .models import Project, ProjectStatus, Role, User
from .security import hash_password

DEMO_PASSWORD = "BlueChain@123"

USERS = [
    ("pawan@bluechain.dev", "Pawan Rathod", Role.developer),
    ("verifier@bluechain.dev", "Verification Desk", Role.verifier),
    ("admin@bluechain.dev", "Platform Admin", Role.admin),
]

# name, owner_email, ecosystem, area_ha, status, lat, lon, description
DEMO_PROJECTS = [
    ("Blockchain Test 7", "pawan@bluechain.dev", "Mangrove", 10.245, ProjectStatus.qc,
     21.843542570077457, 79.07664900763309, "Test 7"),
    ("blockchain test 6", "pawan@bluechain.dev", "Mangrove", 27.637, ProjectStatus.verified,
     21.923411728054118, 88.80429113704922, "Test 6"),
    ("Blockchain Test 8", "pawan@bluechain.dev", "Mangrove", 2.148, ProjectStatus.verified,
     21.704418300114752, 88.99011880239166, "Test 8"),
    ("Blockchain Test 2", "pawan@bluechain.dev", "Mangrove", 5.287, ProjectStatus.verified,
     21.782091044016337, 88.87103942007814, "Test 2"),
    ("Blockchain Test 5", "pawan@bluechain.dev", "Mangrove", 458.658, ProjectStatus.verified,
     21.634490013856221, 88.74220119834007, "Test 5"),
    ("Blockchain Test 4", "pawan@bluechain.dev", "Mangrove", 12.402, ProjectStatus.verified,
     21.860154110092364, 88.93600241775028, "Test 4"),
    ("Blockchain Test 3", "pawan@bluechain.dev", "Mangrove", 88.115, ProjectStatus.verified,
     21.702348119047611, 88.62137492874155, "Test 3"),
    ("Blockchain Test 9", "pawan@bluechain.dev", "Mangrove", 3.905, ProjectStatus.qc,
     21.914500278119043, 88.70211944320188, "Test 9"),
    ("Blockchain Test 10", "pawan@bluechain.dev", "Mangrove", 16.774, ProjectStatus.qc,
     21.608112300441627, 89.01448921187302, "Test 10"),
    ("Blockchain Test 11", "pawan@bluechain.dev", "Seagrass", 7.552, ProjectStatus.qc,
     21.556102884122734, 88.90127441220873, "Test 11"),
    ("Blockchain Test 12", "pawan@bluechain.dev", "Mangrove", 21.318, ProjectStatus.qc,
     21.812004399112087, 88.68833220049175, "Test 12"),
    ("Blockchain Test 13", "pawan@bluechain.dev", "Mangrove", 4.001, ProjectStatus.qc,
     21.744110228760031, 88.95611874400021, "Test 13"),
    ("Blockchain Test 1", "pawan@bluechain.dev", "Mangrove", 0.842, ProjectStatus.rejected,
     21.690034112200394, 88.55112839904111, "Boundary overlaps an existing tenure"),
    ("Blockchain Test 0", "pawan@bluechain.dev", "Salt marsh", 1.206, ProjectStatus.rejected,
     21.665201177400283, 88.99011227740155, "Insufficient evidence record"),
]


def square_boundary(lat: float, lon: float, area_ha: float) -> dict:
    side = math.sqrt(max(area_ha, 0.01) * 10_000)
    dlat = (side / 2) / 111_320.0
    dlon = (side / 2) / (111_320.0 * math.cos(math.radians(lat)))
    return {
        "type": "Polygon",
        "coordinates": [[
            [round(lon - dlon, 8), round(lat - dlat, 8)],
            [round(lon + dlon, 8), round(lat - dlat, 8)],
            [round(lon + dlon, 8), round(lat + dlat, 8)],
            [round(lon - dlon, 8), round(lat + dlat, 8)],
            [round(lon - dlon, 8), round(lat - dlat, 8)],
        ]],
    }


def seed_if_empty(db: Session) -> None:
    if db.query(User).count() > 0:
        return

    users: dict[str, User] = {}
    for email, name, role in USERS:
        user = User(email=email, full_name=name, role=role,
                    hashed_password=hash_password(DEMO_PASSWORD))
        db.add(user)
        users[email] = user
    db.flush()

    for name, owner, eco, area, status, lat, lon, desc in DEMO_PROJECTS:
        boundary = square_boundary(lat, lon, area)
        db.add(Project(
            name=name, description=desc, ecosystem=eco, region="Sundarbans, West Bengal, India",
            owner_id=users[owner].id, status=status, boundary_geojson=boundary,
            area_ha=area, centroid_lat=lat, centroid_lon=lon,
        ))
    db.commit()
    print(f"[seed] created {len(USERS)} users and {len(DEMO_PROJECTS)} demo projects")
