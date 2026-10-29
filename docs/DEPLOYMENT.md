# Deployment guide

Three shapes of deployment are supported. Pick the one that matches the accounts you have.

| Shape | Best for | Services needed |
| --- | --- | --- |
| A. Single service (API serves the SPA) | fastest, cheapest, one URL | 1 web service + 1 database |
| B. Split services (static SPA + API) | free tiers, CDN | 1 static host + 1 web service + 1 database |
| C. Docker Compose on a VPS | full control, own domain | 1 server |

Before anything else, generate a real secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Set it as `SECRET_KEY`. Never ship the default.

---

## A. Single service on Render (recommended)

Render runs the FastAPI app and can serve the built React bundle from the same process.

1. **Build the frontend into the image.** In `backend/Dockerfile`, the app already serves
   `../frontend/dist` if present. Create a combined Dockerfile at the repository root:

   ```dockerfile
   FROM node:20-alpine AS web
   WORKDIR /web
   COPY frontend/package*.json ./
   RUN npm ci
   COPY frontend/ ./
   ARG VITE_CONTRACT_ADDRESS=""
   ENV VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS
   RUN npm run build

   FROM python:3.12-slim
   ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
   RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 curl \
       && rm -rf /var/lib/apt/lists/*
   WORKDIR /app
   COPY backend/requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY backend/app ./app
   COPY --from=web /web/dist /frontend/dist
   RUN useradd -m -u 10001 app && mkdir -p /data/storage && chown -R app /data /app
   USER app
   ENV STORAGE_DIR=/data/storage
   EXPOSE 8000
   CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```

   Save it as `Dockerfile` in the repository root.

2. **Create a PostgreSQL instance** (Render Postgres, Neon, Supabase or Railway). Copy the
   connection string and rewrite the scheme to `postgresql+psycopg2://`.

3. **Create a Web Service** on Render:
   - Environment: Docker, root directory: repository root
   - Environment variables:

     ```
     DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname
     SECRET_KEY=<generated>
     STORAGE_DIR=/data/storage
     ENVIRONMENT=production
     BLUECHAIN_SEED=true
     CORS_ORIGINS=https://your-app.onrender.com
     CONTRACT_ADDRESS=<deployed address, optional>
     CHAIN_ID=31337
     ```

   - Add a **persistent disk** mounted at `/data` (1 GB is plenty). Without it, uploaded rasters and
     generated GeoTIFFs disappear on redeploy.

4. Deploy. Tables are created on first boot and the demo seed runs once
   (`BLUECHAIN_SEED=true`; set it to `false` afterwards).

5. Open `https://your-app.onrender.com`. Swagger is at `/docs`, health at `/api/health`.

---

## B. Split services

### Frontend on Vercel or Netlify

- Root directory: `frontend`
- Build command: `npm run build`, output directory `dist`
- Environment variables:
  - `VITE_API_URL=https://your-api.onrender.com`
  - `VITE_CONTRACT_ADDRESS=0x...`
  - `VITE_CHAIN_ID=31337`
- Add a rewrite so client-side routes resolve to `index.html`:
  - Vercel: `frontend/vercel.json` → `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`
  - Netlify: `frontend/public/_redirects` → `/*  /index.html  200`

Because `VITE_API_URL` is baked in at build time, rebuild after changing it.

### Backend on Render / Railway / Fly.io

Use `backend/Dockerfile` directly. Required variables:

```
DATABASE_URL=postgresql+psycopg2://...
SECRET_KEY=<generated>
STORAGE_DIR=/data/storage        # mount a persistent volume here
CORS_ORIGINS=https://your-frontend.vercel.app
ENVIRONMENT=production
```

The API allows credentials and all methods from the origins listed in `CORS_ORIGINS`.

### Database

Any PostgreSQL 14+ works. On a free tier, note that Neon and Supabase suspend idle databases; the
first request after a pause can take a few seconds.

---

## C. VPS with Docker Compose

```bash
git clone <your-repo> bluechain && cd bluechain
cp .env.example .env
nano .env                     # set SECRET_KEY, POSTGRES_PASSWORD, CORS_ORIGINS
docker compose up -d --build
docker compose logs -f backend
```

The stack listens on:

- `:8080` → nginx serving the SPA, proxying `/api` to the backend
- `:8000` → the API directly (you can close this port to the internet)

**HTTPS with Caddy** (simplest). Add a `Caddyfile` next to `docker-compose.yml`:

```
yourdomain.com {
    reverse_proxy localhost:8080
}
```

and run Caddy (`docker run -d -p 80:80 -p 443:443 -v caddy:/data caddy`), or use nginx + certbot.

**Backups:** two things matter, the Postgres volume (`pgdata`) and the storage volume (`storage`).

```bash
docker compose exec db pg_dump -U bluechain bluechain | gzip > backup-$(date +%F).sql.gz
docker run --rm -v bluechain_storage:/data -v $PWD:/out alpine tar czf /out/storage-$(date +%F).tar.gz -C /data .
```

---

## Deploying the contract to a public testnet

For a demo that anyone can verify, deploy to Sepolia.

```bash
cd contracts
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<your-key>"   # or Alchemy
export PRIVATE_KEY="0x<funded test wallet private key>"
npx hardhat run scripts/deploy.js --network sepolia
```

The script writes `contracts/deployments/sepolia.json` and prints the address. Then:

- set `VITE_CONTRACT_ADDRESS` (frontend) and `CONTRACT_ADDRESS` (backend) to that address
- set `CHAIN_ID=11155111`
- rebuild the frontend

In MetaMask, switch to Sepolia and import the wallet that minted. Only accounts added with
`setMinter` can mint; the deployer is a minter automatically.

Get free Sepolia ETH from a faucet (for example `sepoliafaucet.com` or the Alchemy faucet).

---

## Production checklist

- [ ] `SECRET_KEY` replaced with a long random value
- [ ] `BLUECHAIN_SEED=false` once you have real accounts
- [ ] `CORS_ORIGINS` restricted to your real frontend origin
- [ ] Persistent volume mounted for `STORAGE_DIR`
- [ ] PostgreSQL backed up on a schedule
- [ ] HTTPS terminating in front of the API
- [ ] Verifier accounts created deliberately (self-registration currently allows the verifier role;
      restrict `UserCreate.role` in `backend/app/schemas.py` if that is not what you want)
- [ ] Upload size limit reviewed (`MAX_UPLOAD_MB`, default 200)

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `422` on upload | Raster grids differ; reproject both bands to the same extent first. |
| `No cells exceed the NDVI threshold` | Band order or scaling is wrong. B4 must be red, B8 NIR; DN is auto-scaled only above 2.0. |
| Map is blank | The basemap tiles come from Esri; check the network or the browser's tile blocking. |
| Mint reverts with `NotMinter` | The connected MetaMask account is not a minter on the deployed contract. |
| `Cannot allocate Wasm memory` during `npm run build` | The shell has a low virtual-memory limit; run `ulimit -v unlimited` first. |
| Hardhat cannot download solc | Use `node scripts/compile-offline.js` then `npx hardhat test --no-compile`. |
| Images 403 in the UI | The JWT expired; sign in again. |
