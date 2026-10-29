"""End-to-end API flow: register -> project -> analysis -> submit -> verify -> issue."""
import io

from tests.conftest import auth_header, register

BOUNDARY = {
    "type": "Polygon",
    "coordinates": [[
        [88.9520, 21.7360], [88.9620, 21.7360], [88.9620, 21.7450],
        [88.9520, 21.7450], [88.9520, 21.7360]]],
}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["model"]["agb_coefficient"] == 10.5


def test_full_lifecycle(client, make_verifier):
    dev = register(client, "lifecycle-dev@example.com", "developer", "Lifecycle Dev")
    dh = auth_header(dev["access_token"])

    # --- register a project -------------------------------------------
    r = client.post("/api/projects", json={
        "name": "Sundarbans Block A", "description": "Major project demo",
        "ecosystem": "Mangrove", "boundary": BOUNDARY}, headers=dh)
    assert r.status_code == 201, r.text
    project = r.json()
    pid = project["id"]
    assert project["status"] == "DRAFT"
    assert 60 < project["area_ha"] < 120          # ~0.01 deg square near 21.7 N
    assert project["centroid_lat"] == round(project["centroid_lat"], 8)

    # --- run the demo carbon analysis ----------------------------------
    r = client.post(f"/api/projects/{pid}/analysis/demo", headers=dh)
    assert r.status_code == 200, r.text
    analysis = r.json()
    assert analysis["stats"]["cells_mangrove"] > 0
    assert analysis["stats"]["total_agc_tc"] > 0
    assert "agc" in analysis["previews"]
    # the demo grid covers the registered boundary, so mapped area <= project area
    assert analysis["stats"]["mapped_area_ha"] <= project["area_ha"] * 1.01
    assert analysis["stats"]["cells_total"] == 320 * 320

    # previews are served
    r = client.get(analysis["previews"]["agc"], headers=dh)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"

    # GeoTIFF download
    r = client.get(f"/api/projects/{pid}/analysis/{analysis['id']}/download/agc", headers=dh)
    assert r.status_code == 200 and r.headers["content-type"] == "image/tiff"

    # project moved to MODELED
    r = client.get(f"/api/projects/{pid}", headers=dh)
    assert r.json()["status"] == "MODELED"
    assert r.json()["latest_analysis"]["total_agc_tc"] == analysis["stats"]["total_agc_tc"]

    # --- InVEST baseline ------------------------------------------------
    r = client.post(f"/api/projects/{pid}/invest/demo", headers=dh)
    assert r.status_code == 200, r.text
    assert r.json()["total_tc"] > 0

    # --- sensitivity ----------------------------------------------------
    r = client.get(f"/api/projects/{pid}/sensitivity", headers=dh)
    assert r.status_code == 200
    sens = r.json()
    assert sens["lower"]["total_tc"] < sens["baseline"]["total_tc"] < sens["upper"]["total_tc"]

    # --- provenance record ----------------------------------------------
    r = client.get(f"/api/projects/{pid}/provenance", headers=dh)
    assert r.status_code == 200
    record = r.json()
    assert record["schema"] == "bluechain.evidence/1.0"
    assert record["analysis"]["inputs"]["red"].startswith("0x")
    assert record["validation_status"] == "NOT_INDEPENDENTLY_VALIDATED"
    assert record["record_digest"].startswith("0x")

    # --- cannot issue before verification -------------------------------
    r = client.post(f"/api/projects/{pid}/assets", json={
        "token_id": 1, "tx_hash": "0x" + "a" * 64,
        "contract_address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        "tonnes": 100.0}, headers=dh)
    assert r.status_code == 409

    # --- submit for verification ----------------------------------------
    r = client.post(f"/api/projects/{pid}/submit", headers=dh)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "QC"

    # developer cannot see the verifier queue
    r = client.get("/api/verifier/queue", headers=dh)
    assert r.status_code == 403

    # --- verifier reviews -----------------------------------------------
    verifier = make_verifier("lifecycle-verifier@example.com", "Verifier One")
    vh = auth_header(verifier["access_token"])

    r = client.get("/api/verifier/queue", headers=vh)
    assert r.status_code == 200
    assert any(p["id"] == pid for p in r.json())

    r = client.post(f"/api/projects/{pid}/decision",
                    json={"decision": "approve", "note": "Evidence record complete"}, headers=vh)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "VERIFIED"

    # --- issue the digital asset -----------------------------------------
    r = client.post(f"/api/projects/{pid}/assets", json={
        "token_id": 1, "tx_hash": "0x" + "b" * 64,
        "contract_address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        "chain_id": 31337, "tonnes": 1235.62, "listing_price_eth": 1.0,
        "metadata_uri": "ipfs://bafkreitest"}, headers=dh)
    assert r.status_code == 201, r.text
    asset = r.json()
    assert asset["status"] == "ISSUED"

    r = client.get(f"/api/projects/{pid}", headers=dh)
    assert r.json()["status"] == "ISSUED"
    assert r.json()["total_tonnes_issued"] == 1235.62

    # duplicate token rejected
    r = client.post(f"/api/projects/{pid}/assets", json={
        "token_id": 1, "tx_hash": "0x" + "c" * 64,
        "contract_address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        "tonnes": 1.0}, headers=dh)
    assert r.status_code == 409

    # simulated issuance is labelled and never claims a chain transaction
    r = client.post(f"/api/projects/{pid}/assets/simulate",
                    json={"tonnes": 50.0, "listing_price_eth": 0.5}, headers=dh)
    assert r.status_code == 201, r.text
    sim = r.json()
    assert sim["status"] == "SIMULATED"
    assert sim["tx_hash"].startswith("0xSIMULATED")
    assert sim["contract_address"] == "simulated-no-chain"
    assert sim["token_id"] == 2

    # token metadata
    r = client.get(f"/api/assets/{asset['id']}/metadata", headers=dh)
    assert r.status_code == 200
    meta = r.json()
    assert meta["name"] == "BlueChain Carbon Credit #1"
    assert meta["provenance"]["token_id"] == 1

    # --- dashboard stats --------------------------------------------------
    r = client.get("/api/stats", headers=dh)
    assert r.status_code == 200
    s = r.json()
    assert s["total_projects"] >= 1
    assert s["total_issued_tonnes"] >= 1235.62


def test_verifier_cannot_review_own_project(client, make_verifier):
    """A verifier must not be able to approve a project they own."""
    import uuid
    email = f"selfreview-{uuid.uuid4().hex[:8]}@example.com"
    acc = make_verifier(email, "Self Reviewer")
    hdr = auth_header(acc["access_token"])
    pid = client.post("/api/projects", json={"name": "Own Block", "boundary": BOUNDARY},
                      headers=hdr).json()["id"]
    client.post(f"/api/projects/{pid}/analysis/demo", headers=hdr)
    client.post(f"/api/projects/{pid}/submit", headers=hdr)
    r = client.post(f"/api/projects/{pid}/decision",
                    json={"decision": "approve", "note": "self"}, headers=hdr)
    assert r.status_code == 403
    assert "cannot review a project you own" in r.json()["detail"]


def test_request_info_sends_project_back(client, make_verifier):
    """request_info returns the project to MODELED so the owner can fix and resubmit."""
    import uuid
    dev = register(client, f"reqinfo-dev-{uuid.uuid4().hex[:8]}@example.com")
    ver = make_verifier(f"reqinfo-ver-{uuid.uuid4().hex[:8]}@example.com")
    dh, vh = auth_header(dev["access_token"]), auth_header(ver["access_token"])

    pid = client.post("/api/projects", json={"name": "Needs Work", "boundary": BOUNDARY},
                      headers=dh).json()["id"]
    client.post(f"/api/projects/{pid}/analysis/demo", headers=dh)
    client.post(f"/api/projects/{pid}/submit", headers=dh)

    r = client.post(f"/api/projects/{pid}/decision",
                    json={"decision": "request_info", "note": "Add a GEDI support mask"}, headers=vh)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "MODELED"
    assert r.json()["review_note"] == "Add a GEDI support mask"

    # the owner can resubmit after fixing
    r = client.post(f"/api/projects/{pid}/submit", headers=dh)
    assert r.status_code == 200
    assert r.json()["status"] == "QC"


def test_signup_cannot_claim_verifier(client):
    """The whole point: review rights cannot be self-assigned."""
    r = client.post("/api/auth/register", json={
        "email": "wannabe-verifier@example.com", "full_name": "Wannabe",
        "password": "Password123", "role": "verifier"})
    assert r.status_code == 403
    assert "administrator" in r.json()["detail"]

    # a plain signup still works and is always a developer
    r = client.post("/api/auth/register", json={
        "email": "plain-dev@example.com", "full_name": "Plain Dev", "password": "Password123"})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "developer"


def test_auth_guards(client):
    assert client.get("/api/projects").status_code == 401
    r = client.post("/api/auth/login", data={"username": "nobody@example.com", "password": "x"})
    assert r.status_code == 401


def test_duplicate_registration(client):
    register(client, "dupe@example.com")
    r = client.post("/api/auth/register", json={
        "email": "dupe@example.com", "full_name": "D", "password": "Password123"})
    assert r.status_code == 409


def test_project_access_control(client):
    owner = register(client, "owner-a@example.com")
    other = register(client, "owner-b@example.com")
    r = client.post("/api/projects", json={"name": "Private Block", "boundary": BOUNDARY},
                    headers=auth_header(owner["access_token"]))
    pid = r.json()["id"]
    r = client.get(f"/api/projects/{pid}", headers=auth_header(other["access_token"]))
    assert r.status_code == 403


def test_rejects_invalid_boundary(client):
    dev = register(client, "bad-boundary@example.com")
    r = client.post("/api/projects", json={"name": "Bad", "boundary": {"type": "Point",
                    "coordinates": [1, 2]}}, headers=auth_header(dev["access_token"]))
    assert r.status_code == 422
