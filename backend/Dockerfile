FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# rasterio wheels bundle GDAL; libexpat/geos are needed at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd -m -u 10001 bluechain && mkdir -p /data/storage && chown -R bluechain /data /app
USER bluechain

ENV STORAGE_DIR=/data/storage \
    DATABASE_URL=sqlite:////data/bluechain.db

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
