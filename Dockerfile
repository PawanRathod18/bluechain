# Single-service image: FastAPI serves the API and the built React app on one port.
# Build:  docker build -t bluechain .
# Run:    docker run -p 8000:8000 -v bluechain-data:/data bluechain

# ---------- stage 1: build the web app ----------
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=""
ARG VITE_CONTRACT_ADDRESS=""
ARG VITE_CHAIN_ID="31337"
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS \
    VITE_CHAIN_ID=$VITE_CHAIN_ID
RUN npm run build

# ---------- stage 2: python runtime ----------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# main.py resolves the SPA at parents[2]/frontend/dist, which is /frontend/dist here
COPY --from=web /web/dist /frontend/dist

RUN useradd -m -u 10001 app \
 && mkdir -p /data/storage \
 && chown -R app /data /app
USER app

ENV STORAGE_DIR=/data/storage \
    DATABASE_URL=sqlite:////data/bluechain.db \
    ENVIRONMENT=production \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
