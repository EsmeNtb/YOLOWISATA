"""Phase 2 API contract checks; all database writes use an in-memory fake."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend import main

BIZ, OTHER, EXP, OLD_EXP = (str(uuid4()) for _ in range(4))
CONV, TRAVELER = str(uuid4()), str(uuid4())


class Database:
    def __init__(self):
        self.rows = {
            "businesses": [{"id": BIZ, "name": "Noor Coffee Farm", "owner_id": None}],
            "experiences": [
                {"id": EXP, "business_id": BIZ, "is_active": True},
                {"id": OLD_EXP, "business_id": BIZ, "is_active": False},
            ],
            "postcards": [], "conversations": [], "messages": [],
            "traveler_profiles": [], "profiles": [],
        }

    def table(self, name):
        return Query(self, name)


class Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters, self.maximum, self.row = [], None, None
        self.ignore_duplicates = False

    def select(self, _):
        return self

    def eq(self, key, value):
        self.filters.append(lambda r: r.get(key) == value)
        return self

    def in_(self, key, values):
        self.filters.append(lambda r: r.get(key) in values)
        return self

    def limit(self, maximum):
        self.maximum = maximum
        return self

    def order(self, *args, **kwargs):
        return self

    def insert(self, row):
        self.row = copy.deepcopy(row)
        return self

    def upsert(self, row, on_conflict, ignore_duplicates):
        self.ignore_duplicates = ignore_duplicates
        return self.insert(row)

    def execute(self):
        rows = self.db.rows[self.name]
        if self.row is not None:
            self.row.setdefault("id", str(uuid4()))
            if self.ignore_duplicates and any(r["id"] == self.row["id"] for r in rows):
                return SimpleNamespace(data=[])
            rows.append(self.row)
            return SimpleNamespace(data=[copy.deepcopy(self.row)])
        result = [r for r in rows if all(f(r) for f in self.filters)]
        return SimpleNamespace(data=copy.deepcopy(result[:self.maximum]))


class Phase2Tests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = Path(self.directory.name) / "store.json"
        self.addCleanup(patch.stopall)
        patch.object(main, "supabase", self.db).start()
        patch.object(main, "STORE", self.store).start()
        self.client = TestClient(main.app)

    def legacy(self, **changes):
        return dict({
            "id": "mphase2", "gid": "guest-device", "ts": 1791000000000,
            "biz": "noor", "n": "Demo traveler", "f": "🇮🇩",
            "l": "Original language", "t": "I loved roasting coffee with Noor.",
            "bg": "sun", "s": "☕🌱", "prompt": "I will remember...",
            "voice": True, "photo": "data:image/jpeg;base64,AA==", "loc": 1,
            "status": "sent",
        }, **changes)

    def test_current_frontend_payload_and_retry(self):
        payload = self.legacy()
        response = self.client.post("/api/postcards", json=payload)
        self.assertEqual(response.status_code, 200)
        row = response.json()["postcard"]
        for column, expected in {
            "experience_id": EXP, "display_name": payload["n"], "country_code": "ID",
            "message": payload["t"], "language": "und", "photo_path": payload["photo"],
            "background_style": "sun", "stickers": ["☕🌱"],
            "consent_for_analysis": False, "consent_for_public": False,
        }.items():
            self.assertEqual(row[column], expected)
        self.assertNotEqual(row["id"], payload["id"])
        self.assertNotIn("traveler_id", row)
        self.assertNotIn("audio_path", row)
        self.assertEqual(self.client.post("/api/postcards", json=payload).json()["postcard"]["id"], row["id"])
        self.assertEqual(len(self.db.rows["postcards"]), 1)
        self.assertEqual(self.client.get("/api/sync").json()["postcards"][payload["id"]], payload)

    def test_native_payload_and_explicit_fields_take_precedence(self):
        payload = {"experience_id": EXP, "message": "Coffee roasting!",
                   "consent_for_analysis": True, "stickers": ["coffee"], "country_code": "MX"}
        response = self.client.post("/api/postcards", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["postcard"]["consent_for_analysis"])
        self.assertEqual(len(self.client.get("/api/postcards").json()["postcards"]), 1)
        self.assertFalse(self.store.exists())
        response = self.client.post("/api/postcards", json=self.legacy(message="Native wins"))
        self.assertEqual(response.json()["postcard"]["message"], "Native wins")

    def test_experience_selection_requires_exactly_one(self):
        self.db.rows["experiences"][0]["is_active"] = False
        self.assertEqual(self.client.post("/api/postcards", json=self.legacy()).status_code, 400)
        self.db.rows["experiences"][0]["is_active"] = True
        self.db.rows["experiences"].append({"id": str(uuid4()), "business_id": BIZ, "is_active": True})
        self.assertEqual(self.client.post("/api/postcards", json=self.legacy()).status_code, 400)
        self.assertEqual(self.client.post("/api/postcards", json=self.legacy(experience_id=EXP)).status_code, 200)

    def test_business_and_experience_validation(self):
        for changes in ({"biz": "darto"}, {"experience_id": OLD_EXP},
                        {"experience_id": str(uuid4())}, {"experience_id": "bad"},
                        {"biz": OTHER, "experience_id": EXP},
                        {"business_id": OTHER, "experience_id": EXP}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post("/api/postcards", json=self.legacy(**changes)).status_code, 400)
        self.assertEqual(self.db.rows["postcards"], [])

    def test_invalid_input_never_writes(self):
        for payload in ([], {}, {"experience_id": EXP, "message": " "},
                        self.legacy(consent_for_analysis="true"), self.legacy(ts="yesterday"),
                        self.legacy(s=["coffee"]), self.legacy(traveler_id="guest-device")):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/api/postcards", json=payload).status_code, 400)
        self.assertEqual(self.client.post("/api/postcards", content="{").status_code, 400)
        self.assertEqual(self.client.post("/api/postcards", content=b"x" * (main.MAX_BYTES + 1)).status_code, 413)
        self.assertEqual(self.db.rows["postcards"], [])
        self.assertFalse(self.store.exists())

    def test_insights_consent_isolation_historical_feedback_and_messages(self):
        self.db.rows["postcards"] = [
            {"experience_id": EXP, "message": "roasting coffee", "consent_for_analysis": True},
            {"experience_id": OLD_EXP, "message": "roasting coffee", "consent_for_analysis": True},
            {"experience_id": EXP, "message": "PRIVATE", "consent_for_analysis": False},
            {"experience_id": str(uuid4()), "message": "OTHER BUSINESS", "consent_for_analysis": True},
        ]
        self.db.rows["conversations"] = [{"id": CONV, "business_id": BIZ, "traveler_id": TRAVELER}]
        self.db.rows["traveler_profiles"] = [{"id": TRAVELER, "country_code": "ID"}]
        self.db.rows["messages"] = [
            {"conversation_id": CONV, "sender_type": "traveler", "original_text": "Can I buy beans?"},
            {"conversation_id": CONV, "sender_type": "business", "original_text": "OWNER"},
            {"conversation_id": CONV, "sender_type": "traveler", "original_text": None},
            {"conversation_id": str(uuid4()), "sender_type": "traveler", "original_text": "OTHER"},
        ]
        with patch.object(main, "load", side_effect=AssertionError("Insights read legacy store")):
            response = self.client.get(f"/api/businesses/{BIZ}/insights")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual((result["postcards"], result["questions"]), (2, 1))
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("OTHER", json.dumps(result))
        self.assertNotIn("host", result["loved"])
        self.assertTrue(result["segments"]["local"])
        self.assertEqual(result["segments"]["international"], {})

    def test_empty_and_missing_business_insights(self):
        self.assertEqual(self.client.get(f"/api/businesses/{BIZ}/insights").json()["postcards"], 0)
        self.assertEqual(self.client.get(f"/api/businesses/{OTHER}/insights").status_code, 404)

    def test_database_failures_are_safe_and_do_not_mirror(self):
        with patch.object(self.db, "table", side_effect=RuntimeError("sensitive connection details")):
            for response in (self.client.post("/api/postcards", json=self.legacy()),
                             self.client.get(f"/api/businesses/{BIZ}/insights")):
                self.assertEqual(response.status_code, 500)
                self.assertNotIn("sensitive", response.text)
        self.assertFalse(self.store.exists())

    def test_legacy_routes_static_files_and_registration_order(self):
        for kind, record in (
            ("messages", {"id": "m1", "thread": "noor:g1", "t": "Hello", "from": "g"}),
            ("bookings", {"id": "k1", "biz": "noor", "date": "2026-10-03", "people": 1}),
        ):
            self.assertEqual(self.client.post("/api/" + kind, json=record).status_code, 200)
            self.assertEqual(self.client.get("/api/sync").json()[kind][record["id"]], record)
        for path in ("/", "/app.js", "/app.css", "/config.js", "/api/content", "/data/content.json"):
            self.assertEqual(self.client.get(path).status_code, 200, path)
        self.assertEqual(main.app.routes[-1].name, "site")
        routes = [r.path for r in main.app.routes if "POST" in getattr(r, "methods", set())]
        self.assertLess(routes.index("/api/postcards"), routes.index("/api/{kind}"))


if __name__ == "__main__":
    unittest.main()
