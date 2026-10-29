# Wiring a static page to the real BlueChain API

This is the pattern for replacing hardcoded demo values with real ones. It works from any
page served on an allowed origin (`http://127.0.0.1:5500`, `http://localhost:5500`,
`http://localhost:5173`) with **no build step and no dependencies**.

## 1. Start the backend

```
cd bluechain
start.bat            (Windows)   or   ./start.sh
```

It serves on `http://127.0.0.1:8000`. Confirm with `http://127.0.0.1:8000/api/health`.

## 2. Add the client to each page

```html
<script src="bluechain-api.js"></script>
```

Put `bluechain-api.js` next to your HTML files. That is the only file you need to copy.

## 3. Sign in once, keep the token

```js
const bc = BlueChain.createClient('http://127.0.0.1:8000');
await bc.login('pawan@bluechain.dev', 'BlueChain@123');
```

The JWT is stored in `localStorage` under `bluechain.token` and attached to every later
call automatically. It is also appended to image URLs, so `<img>` tags work.

---

## Which call replaces which hardcoded value

### Verifier Dashboard

| On screen | Call | Field |
| --- | --- | --- |
| Total Projects | `bc.verifierStats()` | `total_projects` |
| Pending Verification | `bc.verifierStats()` | `pending_verification` |
| Verified Projects | `bc.verifierStats()` | `verified_projects` |
| Rejected Projects | `bc.verifierStats()` | `rejected_projects` |
| Submitted Projects table | `bc.verifierQueue()` | array of projects |
| Project name | | `name` |
| Owner | | `owner_email` |
| Ecosystem | | `ecosystem` |
| Area | | `area_ha` |
| Status | | `status` (`QC`, `VERIFIED`, `REJECTED`, `ISSUED`) |

```js
const stats = await bc.verifierStats();
document.querySelector('#totalProjects').textContent = stats.total_projects;

const rows = await bc.verifierQueue();
rows.forEach((p) => {
  addRow(p.name, p.owner_email, p.ecosystem, p.area_ha.toFixed(3) + ' ha', p.status);
});
```

### Draw Your Project Area

| On screen | Call | Field |
| --- | --- | --- |
| Calculated Area | `bc.measureGeometry(geojson)` | `area_ha` |
| Latitude | | `centroid_lat` |
| Longitude | | `centroid_lon` |

```js
const m = await bc.measureGeometry(polygonGeoJSON);
areaEl.textContent = m.area_ha.toFixed(2) + ' ha';
```

This is the same geodesic calculation the server uses when you save the boundary, so the
number does not change after you press Save. (A browser-side spherical formula is about
0.5 % different — that is the bug this call exists to avoid.)

### Run Carbon Analysis

```js
const analysis = await bc.runAnalysis(projectId, {
  red:  redFileInput.files[0],
  nir:  nirFileInput.files[0],
  gedi: gediFileInput.files[0]     // optional
}, {
  ndvi_threshold: 0.4,
  agb_coefficient: 10.5,
  carbon_fraction: 0.47
});
```

Or, without any uploads, run the bundled demo scene:

```js
const analysis = await bc.runDemoAnalysis(projectId);
```

### Carbon Analysis Results cards

All from the returned `analysis.stats`:

| Card | Field |
| --- | --- |
| Total Carbon | `total_agc_tc` |
| Net Carbon Change | not produced by the model — see the note below |
| Mangrove Area | `mapped_area_ha` |
| Project Area | the project's `area_ha`, not the analysis |
| Mean density | `mean_agc_density` |
| Median density | `median_agc_density` |
| Standard deviation | `std_agc_density` |
| Min / Max | `min_agc_density`, `max_agc_density` |
| Total AGB | `total_agb_t` |
| Mangrove cells | `cells_mangrove` |
| Mangrove proportion | `mangrove_proportion` |

> **"Net Carbon Change" has no backing in the model.** The paper explicitly states that no
> 2019–2023 change or sequestration rate is established. Keep the card only if you label it
> as demonstration data, or replace it with "GEDI observed fraction"
> (`analysis.gedi_support.observed_fraction`), which is a real number the pipeline produces.

### Carbon Density Visualization

```js
img.src = bc.previewUrl(projectId, analysis.id, 'agc');   // 'ndvi' or 'mask' also work
```

GeoTIFF downloads: `bc.downloadUrl(projectId, analysis.id, 'agc')`.

### Project Verification page

| On screen | Call | Field |
| --- | --- | --- |
| Project header | `bc.getProject(id)` | `name`, `centroid_lat`, `centroid_lon`, `status` |
| Project Details: Location | | `region` |
| Project Details: Status | | `status` |
| Total Carbon Stock | `bc.latestAnalysis(id)` | `stats.total_agc_tc` |
| Confidence Score | | `analysis.gedi_support.observed_fraction` |
| Potential Credits | | your own rule — the API does not invent one |
| Approve / Reject | `bc.decide(id, 'approve' \| 'reject', note)` | returns the updated project |

```js
await bc.decide(projectId, 'approve', 'Evidence record complete; no field validation.');
```

### InVEST Results

```js
const baseline = await bc.runInvest(projectId, {
  lulc: lulcInput.files[0],
  biophysical: csvInput.files[0]
});
baseline.total_tc; baseline.pools; baseline.classes;
```

### Documents / Provenance

```js
const record = await bc.provenance(projectId);
// record.analysis.inputs, record.analysis.outputs, record.record_digest, record.events
```

### Blockchain Carbon Credit

```js
const meta = await bc.assetMetadata(assetId);   // ERC-721 JSON
// or record a real mint after the wallet returns:
await bc.recordAsset(projectId, { token_id, tx_hash, contract_address, chain_id, tonnes });
// or, with no wallet:
await bc.simulateAsset(projectId, { tonnes, listing_price_eth });
```

---

## The three values that must not be faked

Your current pages show these as if they were results:

1. **"Analysis Pending"** on a Verified project. If the project is verified, the analysis
   exists — read it with `bc.latestAnalysis(id)`.
2. **"1,235.62 tonnes C"** on the analysis page. That is the demo constant. Real output comes
   from `runAnalysis` or `runDemoAnalysis`, and it will differ every time the boundary or the
   rasters change.
3. **"Potential Credits 1,025"**. There is no defensible formula in the paper for turning
   tonnes of modelled carbon into credits. Either compute it as
   `total_agc_tc * (44/12) / 1000` and label it "indicative tCO2e", or drop the card.

---

## Errors you will actually see

| Message | Cause |
| --- | --- |
| `Cannot reach the BlueChain API at …` | backend not running, or wrong base URL |
| `Failed to fetch` in the console | origin not in `CORS_ORIGINS` |
| `Not authenticated` | token expired — call `bc.login()` again |
| `Only a verified project can issue…` | approve the project first |
| `No cells exceed the NDVI threshold` | band order or scaling wrong; B4 must be red, B8 NIR |

## Working example

`demo.html` in this folder is a complete, working page that does all of the above.
Serve the folder and open it:

```
cd bluechain/static-client
python -m http.server 5500
```

then `http://127.0.0.1:5500/demo.html`. It is the reference to copy from.
