"""Opt-in acceptance check: inserts TWO labeled synthetic Supabase postcards.

Run from the repo root: python tests/check_phase2_live.py --write
Use --windows-trust only where the Python CA bundle lacks the system's trusted CA.
The real legacy store is never changed by this check.
"""
import argparse
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", required=True)
    parser.add_argument("--windows-trust", action="store_true")
    args = parser.parse_args()
    if args.windows_trust:
        # Test-process-only: use Windows' trust store without disabling TLS checks.
        from pip._vendor import truststore
        truststore.inject_into_ssl()

    from fastapi.testclient import TestClient
    from backend import main

    client = TestClient(main.app)

    def get(path):
        response = client.get(path)
        assert response.status_code == 200, f"GET {path}: {response.status_code}"
        return response.json()

    assert get("/api/health")["database"]["connected"] is True
    print("GET /api/health: database.connected = true")
    businesses = get("/api/businesses")["businesses"]
    noor = next(b for b in businesses if b["name"] == "Noor Coffee Farm")
    print("Noor Coffee Farm:", noor["id"])
    experiences = get("/api/experiences?business_id=" + noor["id"])["experiences"]
    experience = next(e for e in experiences if e["title"] == "Coffee Farm & Roasting Walk")
    before = get("/api/postcards")["postcards"]
    insights_path = "/api/businesses/" + noor["id"] + "/insights"
    insights_before = get(insights_path)
    print("Before write: postcards =", len(before), "; analyzed =", insights_before["postcards"])
    stamp = uuid4().hex[:12]
    native = {
        "experience_id": experience["id"], "display_name": "Phase 2 synthetic acceptance",
        "message": "Synthetic Phase 2 check " + stamp + ": I loved roasting coffee with Noor.",
        "language": "en", "country_code": "MX", "consent_for_analysis": True,
        "consent_for_public": False,
    }
    legacy = {
        "id": "mphase2" + stamp, "gid": "phase2-demo", "ts": int(datetime.now(timezone.utc).timestamp() * 1000),
        "biz": "noor", "n": "Phase 2 synthetic legacy", "f": "🇮🇩", "l": "Original language",
        "t": "Synthetic legacy Phase 2 check " + stamp + ": coffee roasting.",
        "bg": "sun", "s": "☕", "prompt": "I will remember...", "voice": False,
        "photo": "", "loc": 1, "status": "sent",
    }
    ids = []
    with tempfile.TemporaryDirectory() as directory, patch.object(main, "STORE", Path(directory) / "store.json"):
        for payload in (native, legacy):
            response = client.post("/api/postcards", json=payload)
            assert response.status_code == 200, f"POST /api/postcards: {response.status_code}"
            ids.append(response.json()["postcard"]["id"])
        retry = client.post("/api/postcards", json=legacy)
        assert retry.status_code == 200 and retry.json()["postcard"]["id"] == ids[1]
        assert get("/api/sync")["postcards"][legacy["id"]]["t"] == legacy["t"]
        for kind, payload in (
            # Messages/bookings now have their own Phase 4 acceptance check and cleanup.
            # Exercise the remaining generic route using only the temporary store.
            ("listings", {"id": "phase2-listing", "L": {"name": "Synthetic check"}}),
            ("businesses", {"id": "phase2-business", "name": "Synthetic check", "host": "Demo", "sector": "Other"}),
        ):
            assert client.post("/api/" + kind, json=payload).status_code == 200
            assert payload["id"] in get("/api/sync")[kind]
    after = get("/api/postcards")["postcards"]
    assert set(ids).issubset({p["id"] for p in after})
    assert len(after) == len(before) + 2
    assert get(insights_path)["postcards"] == insights_before["postcards"] + 1
    print("After write: postcards =", len(after), "; analyzed =", insights_before["postcards"] + 1)
    print("Created synthetic postcard UUIDs:", ", ".join(ids))
    for path in ("/", "/app.js", "/app.css", "/config.js", "/api/content", "/data/content.json"):
        assert client.get(path).status_code == 200, path
    assert main.app.routes[-1].name == "site"
    print("PASS: native/legacy insert, retry, consent filtering, legacy routes, frontend assets, mount ordering")


if __name__ == "__main__":
    run()
