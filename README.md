# BlueChain

**A digital MRV and provenance platform for verified quantification and transparent trading of blue carbon assets.**

BlueChain is the working implementation of the **PELAGIX** framework described in:

> S. Jaiswal, S. Patel, S. Nimje, P. Jain, S. Karandikar, S. Barshe,
> *"PELAGIX: An Intelligent Decentralized Framework for Verified Quantification and Transparent
> Trading of Blue Carbon Assets"*, IJRASET, vol. 14, issue X, October 2026,
> doi:10.22214/ijraset.2026.85316

It turns the paper's prototype screens into a real, runnable system: a spatial carbon pipeline that
computes above-ground carbon from Sentinel-2 and GEDI rasters, a verifier workflow, a hash-based
evidence record, and ERC-721 carbon-credit tokens on a local Ethereum chain.

---

## What is actually implemented

| Layer | What it does |
| --- | --- |
| **Boundary registration** | Draw a polygon on a Leaflet map or upload GeoJSON. Area is computed geodesically on the WGS 84 ellipsoid (pyproj), with centroid and bounds. |
| **Carbon pipeline** | Reads real GeoTIFFs with rasterio: NDVI from B4/B8, NDVI > threshold mask, GEDI rh100/100, gap fill `H = 15 × NDVI`, `AGB = H × NDVI × 10.5`, `AGC = 0.47 × AGB`. Writes AGC / NDVI / mask / height GeoTIFFs and pseudocolour PNG previews. |
| **Statistics** | Cell counts, mangrove proportion, mapped area, mean / median / SD / min / max density, total AGC and AGB, observed vs gap-filled GEDI support. |
| **Sensitivity** | Full 3 × 3 grid over the AGB coefficient (8.5 / 10.5 / 12.5) and carbon fraction (0.45 / 0.47 / 0.49), reproducing the paper's Table 4 exactly. |
| **InVEST-style baseline** | Separate LULC + biophysical-table carbon storage calculation, kept explicitly non-equivalent to the GEE-derived AGC. |
| **Provenance** | SHA-256 hashes of every input and output, a versioned evidence record with a record digest, and an append-only event log. |
| **Verification** | Verifier role, review queue, three outcomes (approve, request changes, reject) with a note stored in the evidence record. A verifier cannot review a project they own. |
| **Digital assets** | Solidity ERC-721 (`CarbonCreditNFT`) with minter roles, listing price, and soulbound retirement. The backend records token id, tx hash and chain id. |
| **Auth** | JWT bearer tokens, bcrypt password hashing, three roles (developer / verifier / admin). |

Everything is labelled honestly: the app distinguishes **modelled**, **verified** and **issued**
quantities at every step, and never claims field validation or certified credits.

---

## Architecture

```
bluechain/
├── backend/            FastAPI + SQLAlchemy + rasterio (Python 3.12)
│   ├── app/
│   │   ├── main.py             app factory, CORS, optional SPA hosting
│   │   ├── models.py           User, Project, Analysis, InvestBaseline, Asset, ProvenanceEvent
│   │   ├── routers/            auth, projects, analysis, verification, assets, stats
│   │   ├── services/
│   │   │   ├── carbon.py       the NDVI -> AGB -> AGC pipeline
│   │   │   ├── invest.py       LULC carbon-storage baseline
│   │   │   ├── sensitivity.py  parameter sensitivity
│   │   │   ├── geo.py          geodesic area, boundary validation
│   │   │   ├── provenance.py   hashing + evidence record
│   │   │   └── demo_data.py    synthetic demo rasters
│   │   └── seed.py             demo accounts + 14 submission records
│   └── tests/          16 tests (geo, carbon maths, sensitivity, full API lifecycle)
├── frontend/           React 18 + Vite + Leaflet + ethers v6
│   └── src/pages/      Dashboard, NewProject, ProjectDetail, Verifier, ReviewProject, Assets, Research
├── contracts/          Hardhat + OpenZeppelin ERC-721
│   ├── contracts/CarbonCreditNFT.sol
│   ├── scripts/deploy.js
│   └── test/           9 contract tests
├── static-client/      drop-in JS client for existing static pages
│   ├── bluechain-api.js    no build step, no dependencies
│   ├── demo.html           working example, served on :5500
│   └── INTEGRATION.md      which call replaces which hardcoded value
├── docker-compose.yml  Postgres + API + nginx-served SPA
└── docs/DEPLOYMENT.md  step-by-step hosting guide
```

**Data flow**

```
Sentinel-2 B4/B8 ─┐
                  ├─► NDVI ─► mask (NDVI > 0.4) ─┐
GEDI rh100 ───────┘                              ├─► AGB ─► AGC ─► GeoTIFF + PNG + statistics
                                                 │                    │
LULC + biophysical table ──► InVEST-style baseline (separate)          ├─► evidence record (hashes)
                                                                       └─► verifier decision ─► ERC-721 token
```

---

## Just run it

**Windows** — double-click **`start.bat`**
**macOS / Linux** — `./start.sh`
**Any platform** — `python run.py`

That is the whole procedure. The launcher:

1. creates a private Python environment in `backend/.venv` (first run only),
2. installs the dependencies (first run only, 1 to 3 minutes, needs internet),
3. starts the API and the already-built web app on one port,
4. opens <http://127.0.0.1:8000> in your browser.

Sign in with `pawan@bluechain.dev` / `BlueChain@123`. Press Ctrl+C in the window to stop.

The frontend is pre-built in `frontend/dist`, so **you do not need Node.js** for this path.
You only need **Python 3.10+** (3.12 recommended) installed with "Add python.exe to PATH" ticked.

If port 8000 is busy the launcher picks the next free port and prints the URL it chose.

---

## Quickstart (developer setup)

Use this if you want hot reload, to change the frontend, or to run the tests.

### Option A — Docker (everything, one command)

```bash
cp .env.example .env          # set SECRET_KEY at minimum
docker compose up --build
```

- App: <http://localhost:8080>
- API docs (Swagger): <http://localhost:8000/docs>

### Option B — Local development

```bash
# 1. backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. frontend (new terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api to :8000
```

### Option C — Single service (API + built SPA)

```bash
cd frontend && npm install && npm run build
cd ../backend && uvicorn app.main:app --port 8000
# open http://localhost:8000
```

The backend automatically serves `frontend/dist` when it exists, so one process can host both.

### Access model

The landing page is public — visitors can read the home page and the research page without an
account. Anything that touches data (projects, registration, verifier queue, assets) sends them to
the login screen and returns them to the page they were trying to reach once they are signed in.
New accounts are created from **Create an account**, which is reachable from the header and from the
login screen — it is never the first thing a visitor sees. Signup asks for the role explicitly, as two
visible cards: **project developer** (registers projects) or **verifier** (reviews them). Verifiers are
taken to the review queue after signing up, developers to their project list.

### Verifier accounts are issued, not self-registered

Review rights are the one thing a signup form must not grant. Self-registration always creates a
**project developer**; asking for `role: "verifier"` returns `403`. Verifier and admin accounts are
created by an administrator:

```bash
# as admin@bluechain.dev
curl -X POST http://127.0.0.1:8000/api/admin/users \
  -H "Authorization: Bearer <admin token>" -H "Content-Type: application/json" \
  -d '{"email":"auditor@example.org","full_name":"External Auditor","password":"...","role":"verifier"}'
```

The seeded verifier account exists so the workflow can be demonstrated out of the box.

### Demo accounts

| Email | Password | Role |
| --- | --- | --- |
| `pawan@bluechain.dev` | `BlueChain@123` | developer |
| `verifier@bluechain.dev` | `BlueChain@123` | verifier |
| `admin@bluechain.dev` | `BlueChain@123` | admin |

Seeded with 14 project records matching the paper's dashboard (6 pending, 6 verified, 2 rejected).

---

## Using an existing static front end

If your pages are plain HTML served by Live Server, you do not need the React app. Copy
`static-client/bluechain-api.js` next to your HTML, add one script tag, and call the API:

```js
const bc = BlueChain.createClient('http://127.0.0.1:8000');
await bc.login('pawan@bluechain.dev', 'BlueChain@123');
const analysis = await bc.runDemoAnalysis(projectId);
document.querySelector('#totalCarbon').textContent = analysis.stats.total_agc_tc.toFixed(2);
```

`static-client/INTEGRATION.md` maps every hardcoded value in the demo screens to the field that
replaces it. `static-client/demo.html` is a complete working example; serve the folder on
`http://127.0.0.1:5500` and open it. Port 5500 is already allowed in `CORS_ORIGINS`.

## Running the carbon pipeline

1. Register a project (draw the boundary, or use **Load demo boundary**).
2. Open the project → **Carbon analysis**:
   - **Run demo analysis** uses a generated 320 × 320 scene covering your project's bounding box.
   - **Upload real rasters**: Sentinel-2 B4 (red), B8 (NIR), and optionally GEDI rh100. Adjust the
     NDVI threshold, AGB coefficient and carbon fraction if you need to.
3. The pipeline writes GeoTIFFs and previews, and computes the full statistics set.
4. **Submit for review** → a verifier approves or rejects in the Verifier dashboard.
5. Once verified, **Asset / NFT** lets you mint the credit on-chain.

Notes on the inputs:

- Reflectance is auto-scaled: any raster whose maximum exceeds 2.0 is treated as DN and divided by 10 000.
- GEDI is expected in centimetres (rh100); it is divided by 100.
- A GEDI raster with a different grid is reprojected onto the Sentinel-2 grid automatically.
- Rasters larger than 25 M pixels are decimated for the statistics run and flagged with `decimated: true`.

---

## Blockchain setup

```bash
# terminal 1 - local chain
cd contracts && npm install
npx hardhat node                       # http://127.0.0.1:8545, chain 31337

# terminal 2 - deploy
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```

The deploy script prints the address and writes `contracts/deployments/localhost.json`. Put it in
`frontend/.env` as `VITE_CONTRACT_ADDRESS=...`, then restart the dev server.

**No wallet?** The Asset tab detects the absence of MetaMask and offers **Record demo issuance**
instead, which stores the asset with status `SIMULATED` and a placeholder hash. Nothing is written to
a chain, and the project stays at VERIFIED rather than ISSUED, so the record never overstates what
happened.

In MetaMask:

1. Add network **Localhost 8545** (RPC `http://127.0.0.1:8545`, chain id `31337`).
2. Import a Hardhat test account (the deployer private key is printed by `npx hardhat node`).
3. Mint from the project page. The UI calls `mint(to, projectId, tonnes, uri)`, waits for the
   receipt, parses the `CreditIssued` event, then records the asset in the backend.

> If `npx hardhat compile` cannot reach `binaries.soliditylang.org`, run
> `node scripts/compile-offline.js` and then `npx hardhat test --no-compile`.
> This compiles with the npm `solc` package instead.

---

## Tests

```bash
cd backend && python -m pytest -q      # 16 passed
cd contracts && npx hardhat test       # 9 passing
```

The backend suite covers:

- geodesic area on a known 1° square, boundary validation and rejection of degenerate geometry;
- the paper's equations on a hand-computed 2 × 2 case (NDVI 0.6, H 2 m → AGC 5.922 t C/ha);
- gap filling when GEDI is absent (15 × 0.6 × 10.5 × 0.47);
- threshold exclusion;
- **Table 4 reproduction**: 343,486.54 / 443,164.99 / 550,027.47 t C and −22.49 % / +24.11 %;
- the full lifecycle over HTTP: register → analyse → InVEST → sensitivity → provenance →
  submit → verify → issue → token metadata, plus access-control and duplicate guards.

The contract suite covers minting, minter roles, invalid amounts, transfers, retirement making a
token soulbound, listing prices and unknown-token guards.

---

## API reference

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account, returns a JWT |
| `POST` | `/api/auth/login` | OAuth2 password login |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/projects` | List projects (own, or all for verifiers) |
| `POST` | `/api/projects` | Register a project with a GeoJSON boundary |
| `GET` | `/api/projects/{id}` | Project detail + latest analysis summary |
| `PUT` | `/api/projects/{id}/boundary` | Replace the boundary |
| `POST` | `/api/geometry/measure` | Geodesic area + centroid of a boundary (used by the map) |
| `POST` | `/api/projects/{id}/submit` | Submit for verification |
| `GET` | `/api/projects/{id}/provenance` | Evidence record + event log |
| `POST` | `/api/projects/{id}/analysis` | Upload rasters and run the pipeline |
| `POST` | `/api/projects/{id}/analysis/demo` | Run the pipeline on the demo scene |
| `GET` | `/api/projects/{id}/analysis/latest` | Latest analysis |
| `GET` | `/api/projects/{id}/analysis/{aid}/preview/{kind}` | PNG preview (`agc`, `ndvi`, `mask`) |
| `GET` | `/api/projects/{id}/analysis/{aid}/download/{kind}` | GeoTIFF (`agc`, `ndvi`, `mask`, `height`) |
| `GET` | `/api/projects/{id}/sensitivity` | 3 × 3 parameter sensitivity |
| `POST` | `/api/projects/{id}/invest` | LULC + biophysical baseline |
| `GET` | `/api/verifier/queue` | Review queue (verifier only) |
| `POST` | `/api/projects/{id}/decision` | Approve / reject / request changes (verifier only) |
| `POST` | `/api/projects/{id}/assets` | Record a minted token |
| `GET` | `/api/assets/{id}/metadata` | ERC-721 metadata JSON |
| `GET` | `/api/stats` | Dashboard aggregates |
| `GET` | `/api/health` | Service + model configuration |

Full interactive documentation is served at `/docs`.

---

## How this maps to the paper

| Paper element | Implementation |
| --- | --- |
| NDVI mask, `NDVI > 0.4` | `services/carbon.py`, threshold configurable |
| `H = rh100/100`, `H_gap = 15 × NDVI` | same, with observed / gap-filled counts retained |
| `AGB = H × NDVI × 10.5`, `AGC = 0.47 × AGB` | same, coefficients configurable |
| Table 2 statistics | `stats` payload of every analysis |
| Table 4 sensitivity | `services/sensitivity.py`, verified against the published numbers |
| InVEST baseline (409,383 t C) | `services/invest.py` |
| Digital MRV evidence record | `services/provenance.py` + `/provenance` endpoint |
| Lifecycle MODELED → QC → VERIFIED → ISSUED → TRANSFERRED → RETIRED | `ProjectStatus`, verifier decisions, token minting |
| Prototype screens (Figure 6) | React pages: registration, analysis, verifier dashboard, verification, wallet/mint |

**One deliberate improvement:** the paper notes that the supplied products retain no separate GEDI
support mask, so observed and gap-filled contributions cannot be separated. This implementation keeps
them apart (`gedi_support.observed_cells` / `gapfilled_cells`) and reports the observed fraction.

---

## Honest limitations

- No independent field validation, RMSE, MAE, R² or classification accuracy is produced, because no
  reference data exists for these projects.
- `10.5` and `0.47` are project-specific parameters, not universal constants. Sensitivity is a
  two-parameter sweep, not a statistical confidence interval.
- The demo dataset is synthetic and clearly labelled; only uploaded real rasters carry real signal.
- Approval in the app is an internal QC decision. It is not third-party verification, and a minted
  token is not a certified carbon credit, a market transaction or proof of legal ownership.
- The blockchain records provenance and lifecycle state. It cannot establish ecological validity,
  additionality, permanence or eligibility.

---

## Deployment

**Free hosting:** **[docs/FREE-DEPLOY.md](docs/FREE-DEPLOY.md)** compares the three options that
actually work for a Python + rasterio backend (Hugging Face Space, Render free, Oracle Always Free),
with the caveats each one carries.

**Full guide:** **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** covers Render, a VPS with Docker Compose,
split frontend/backend, and Sepolia contract deployment.

The whole stack also builds as a single container:

```bash
docker build -t bluechain .
docker run -p 8000:8000 -v bluechain-data:/data bluechain
# http://localhost:8000
```

---

## License

MIT. The paper's text and figures belong to the original authors.
