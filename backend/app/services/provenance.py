"""Content hashing and evidence-record assembly for the provenance layer."""
import hashlib
import json
from pathlib import Path


def sha256_file(path: str | Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return "0x" + h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return "0x" + hashlib.sha256(data).hexdigest()


def digest_of(obj) -> str:
    """Stable digest of a JSON-serialisable structure."""
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return sha256_bytes(payload)


def evidence_record(project, analysis=None, baseline=None, assets=None) -> dict:
    """The evidence record described in the paper's digital-MRV architecture.

    Links boundary, footprint, CRS, period, datasets, processing version,
    equations, parameters, quality masks, units, sensitivity and validation
    status to content hashes.
    """
    record = {
        "schema": "bluechain.evidence/1.0",
        "project": {
            "id": project.id,
            "name": project.name,
            "ecosystem": project.ecosystem,
            "region": project.region,
            "status": project.status.value if hasattr(project.status, "value") else str(project.status),
            "area_ha": project.area_ha,
            "centroid": [project.centroid_lat, project.centroid_lon],
            "boundary_digest": digest_of(project.boundary_geojson) if project.boundary_geojson else None,
        },
        "validation_status": "NOT_INDEPENDENTLY_VALIDATED",
        "disclaimer": (
            "Modelled above-ground carbon. Not a field-validated quantity, not total ecosystem "
            "carbon, and not a certified or issued carbon credit."
        ),
    }

    if analysis:
        record["analysis"] = {
            "id": analysis.id,
            "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
            "parameters": analysis.params,
            "footprint": analysis.footprint,
            "statistics": analysis.stats,
            "gedi_support": analysis.gedi_support,
            "inputs": analysis.input_hashes,
            "outputs": analysis.output_hashes,
        }

    if baseline:
        record["invest_baseline"] = {
            "id": baseline.id,
            "total_tc": baseline.total_tc,
            "pools": baseline.pools,
            "inputs": baseline.input_hashes,
            "note": "Complementary LULC-based baseline; not equivalent to the GEE-derived AGC.",
        }

    if assets:
        record["assets"] = [
            {
                "token_id": a.token_id,
                "tx_hash": a.tx_hash,
                "contract": a.contract_address,
                "chain_id": a.chain_id,
                "tonnes": a.tonnes,
                "status": a.status,
            }
            for a in assets
        ]

    record["record_digest"] = digest_of(record)
    return record
