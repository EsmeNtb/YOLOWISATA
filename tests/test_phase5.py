"""Explicit UUID retries through the existing Phase 2 adapter; no live writes."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from backend import main
from test_phase2 import Database


class Phase5ContractTests(unittest.TestCase):
    def test_offline_uuid_is_preserved_on_retry_and_in_sync_mirror(self):
        db = Database()
        postcard_id = str(uuid4())
        payload = {
            "id": postcard_id, "biz": "noor", "business_id": "noor",
            "gid": "offline-device", "ts": 1791000000000,
            "n": "Offline traveler", "t": "I loved roasting coffee.",
            "f": "🇮🇩", "l": "Original language", "s": "☕",
            "bg": "sun", "photo": "", "status": "pending",
            "sync_status": "pending", "consent_for_analysis": False,
            "created_at": "2026-10-03T00:00:00+00:00",
        }
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(main, "supabase", db), patch.object(main, "STORE", Path(directory) / "store.json"):
                client = TestClient(main.app)
                for _ in range(3):
                    response = client.post("/api/postcards", json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()["postcard"]["id"], postcard_id)
                self.assertEqual(len(db.rows["postcards"]), 1)
                self.assertEqual(client.get("/api/sync").json()["postcards"], {postcard_id: payload})
                self.assertFalse(db.rows["postcards"][0]["consent_for_analysis"])


if __name__ == "__main__":
    unittest.main()
