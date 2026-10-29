# Deploying BlueChain for free

A reality check first, because it decides everything: this app has a **Python backend** that imports
rasterio, numpy, shapely and pyproj, and it **writes files** (uploaded rasters and generated
GeoTIFFs). That rules out static hosts for the API, and it makes 512 MB containers tight.

> **Hugging Face is no longer a free option for this app.** Docker Spaces on `cpu-basic` now require
> a paid plan (PRO for personal accounts, Team or Enterprise for organisations). Static Spaces remain
> free, but a static Space cannot run Python. See `deploy/huggingface-space.md` if you decide to pay.

That leaves three genuinely free paths.

---

## Option 1 — Render free web service (no credit card)

512 MB RAM, sleeps after 15 minutes idle, no persistent disk, 750 free instance hours per month.
Docker builds are supported on the free plan.

1. Sign up at render.com with your GitHub account. **No card is required.**
2. Push this repository to GitHub (public or private, both work).
3. Render Dashboard → **New → Web Service** → connect the repository.
4. Settings:
   - Language: **Docker**
   - Dockerfile path: `./Dockerfile`
   - Instance type: **Free**
   - Health check path: `/api/health`
5. Environment variables:
   - `SECRET_KEY` — a long random string (see the bottom of this file)
   - `ENVIRONMENT` = `production`
   - `BLUECHAIN_SEED` = `true`
6. **Create Web Service**. The first build takes several minutes.
7. Open `https://<name>.onrender.com`.

Alternatively use the blueprint: Dashboard → **New → Blueprint** → pick the repo. Render reads
`deploy/render.yaml` and generates `SECRET_KEY` for you.

**Caveats:** the first request after a quiet period takes about a minute (Render shows a loading
page). The filesystem is ephemeral, so the SQLite database and uploaded rasters reset on every
restart or deploy — the seed puts the demo accounts and 14 projects back automatically.

**If rasterio gets OOM-killed at 512 MB:** the bundled sample rasters (300 x 300) are fine; large
Sentinel-2 scenes are not. Move to Option 2.

---

## Option 2 — Oracle Cloud Always Free VM (the only one that keeps data)

4 ARM cores and 24 GB RAM, free indefinitely. Asks for a card at signup for identity verification,
and takes about 30 minutes to set up.

```bash
# on the VM (Ubuntu)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
git clone <your-repo> bluechain && cd bluechain
cp .env.example .env && nano .env          # set SECRET_KEY and POSTGRES_PASSWORD
docker compose up -d --build
```

Then Caddy in front for HTTPS:

```
yourdomain.com {
    reverse_proxy localhost:8080
}
```

Details in [`DEPLOYMENT.md`](DEPLOYMENT.md), section C.

---

## Option 3 — Demo from your own laptop with a public URL

Free, full RAM, real data persistence, and no hosting account. The catch is that your machine has to
stay on during the demo.

```bash
# terminal 1
cd bluechain && ./start.sh          # or start.bat on Windows

# terminal 2 — Cloudflare quick tunnel (free, no account)
cloudflared tunnel --url http://127.0.0.1:8000
```

`cloudflared` prints a `https://something.trycloudflare.com` URL that works from anywhere. Install it
from Cloudflare's downloads page. The URL changes every time you restart the tunnel, so start it
shortly before your review.

This is the most reliable option for a viva: no cold starts, no memory limit, no data loss.

---

## What not to use for the API

| Host | Why not |
| --- | --- |
| Vercel / Netlify functions | rasterio bundles GDAL; far over the function size limit |
| GitHub Pages | static only, cannot run Python |
| Railway | trial credit, not a standing free tier |
| Fly.io | now requires a card; free allowance is limited |

## Frontend-only, if you just want a link that always loads

`frontend/dist` can go on Vercel, Netlify or GitHub Pages for free. Set `VITE_API_URL` to your API's
URL at build time, and add an SPA rewrite so deep links work:

- Vercel: `frontend/vercel.json` → `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`
- Netlify: `frontend/public/_redirects` → `/*  /index.html  200`

The API still has to live somewhere, and CORS must list the frontend origin.

---

## Checklist before you share the link

- [ ] `SECRET_KEY` is a real random value, not the default
- [ ] `BLUECHAIN_SEED=true` for a demo, `false` for a clean instance
- [ ] Demo passwords changed, or the seeded verifier deleted and reissued through `/api/admin/users`
- [ ] `CONTRACT_ADDRESS` set only if you actually deployed the contract
- [ ] You know the data resets on restart (Options 1 and 2)
- [ ] You have opened the URL once to warm it up before demoing

## Generating a secret

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
