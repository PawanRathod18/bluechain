# Deploying to a Hugging Face Space

> **This now costs money.** Docker Spaces on `cpu-basic` require a paid plan — PRO for personal
> accounts, Team or Enterprise for organisations. Static Spaces are free but cannot run Python, so
> they cannot host this API. Keep this file only if you decide to pay for PRO.

A Space gives you 2 vCPU and **16 GB of RAM** free, with no card. That is far more headroom than
Render's 512 MB, which matters because rasterio and numpy are heavy.

1. Create an account at huggingface.co, then **New → Space**.
2. Name it `bluechain`, choose **Docker** as the SDK, and **Blank** as the template. Set it Public.
3. In the Space's **Settings → Variables and secrets**, add:
   - `SECRET_KEY` (secret) — any long random string
   - `PORT` (variable) = `7860`
4. Push this repository to the Space:

   ```bash
   git remote add space https://huggingface.co/spaces/<your-username>/bluechain
   git push space main
   ```

   Or upload the files through the web UI, keeping `Dockerfile` at the repository root.
5. The Space builds the image and serves on port 7860. Open the **App** tab.

The frontend is built inside the image and served by FastAPI, so there is only one URL and no CORS
configuration.

**Limits to be honest about:** storage is ephemeral, so the SQLite database and uploaded rasters are
lost whenever the Space rebuilds or restarts. The seeded demo accounts and projects come back on the
next boot, which is enough for a demo, but do not treat it as a place to keep real work.
