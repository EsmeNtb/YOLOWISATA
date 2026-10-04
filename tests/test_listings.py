"""Confirmed listing persistence; mocked Supabase and a temporary mirror only."""
import copy
import json
import tempfile
import unittest
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend import main
from test_phase4 import Phase4Database, Phase4Query


BIZ = "5bfa2070-2285-48c8-8844-5f25e105532a"
EXP = "a56f1f69-63e3-448f-8c72-6af222acd95c"


class ListingQuery(Phase4Query):
    def execute(self):
        for values in (self.row, self.changes):
            if values is not None and self.name == "experiences" and "price" in values:
                values["price"] = float(Decimal(str(values["price"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        if self.row is not None and self.name == "experiences":
            self.row.setdefault("currency", "USD")  # Existing database default.
        return super().execute()


class ListingDatabase(Phase4Database):
    def table(self, name):
        return ListingQuery(self, name)


class ListingTests(unittest.TestCase):
    def setUp(self):
        self.db = ListingDatabase()
        self.db.rows["businesses"] = [{"id": BIZ, "name": "Noor Coffee Farm"}]
        self.original = {
            "id": EXP, "business_id": BIZ, "title": "Coffee Farm & Roasting Walk",
            "description": "Walk through Noor's coffee farm.", "price": "150000.00",
            "currency": "IDR", "duration_minutes": 90, "capacity": 8,
            "availability": {"days": list(main.LISTING_DAYS[:6]), "start_times": ["09:00", "14:00"], "notes": "Keep"},
            "activities": ["farm_walk", "coffee_roasting", "local_story"],
            "experience_dna": {"nature": .8}, "is_active": True, "revision": 1,
            "another_column": "Preserve me",
        }
        self.db.rows["experiences"] = [copy.deepcopy(self.original)]
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.store = Path(directory.name) / "store.json"
        for name, value in (("supabase", self.db), ("STORE", self.store)):
            patcher = patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(main.app)

    def record(self, **changes):
        fields = dict(business_name="Noor", experience_title="Confirmed roasting workshop",
                      description="Confirmed description", price=175000, currency="IDR",
                      duration_minutes=120, activities=["coffee_roasting"], availability=["monday", "friday"])
        fields.update(changes)
        return {"id": "noor", "ts": 1791000000000, "L": {
            "name": "Ignore presentation", "price": "garbage", "duration": "garbage",
            "activities": "garbage", "availability": "garbage", "structured": fields,
            "transcript": "Original", "language": "en", "confirmed_at": "2026-10-03T00:00:00Z"}}

    def post(self, rec, status=200):
        response = self.client.post("/api/listings", json=rec)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def test_noor_updates_only_owned_columns_and_mirrors_original(self):
        rec = self.record()
        result = self.post(rec)
        self.assertEqual(result["action"], "updated")
        row = result["experience"]
        for key in ("id", "business_id", "capacity", "experience_dna", "is_active", "another_column"):
            self.assertEqual(row[key], self.original[key], key)
        self.assertEqual(row["availability"], {"days": ["monday", "friday"], "start_times": ["09:00", "14:00"], "notes": "Keep"})
        self.assertEqual(row["activities"], ["coffee_roasting"])
        self.assertEqual(row["title"], rec["L"]["structured"]["experience_title"])
        self.assertEqual(row["price"], 175000)
        self.assertEqual(row["revision"], 2)
        self.assertEqual(self.client.get("/api/sync").json()["listings"]["noor"], rec)
        self.assertNotIn("_listing_receipts", self.client.get("/api/sync").json())

    def test_retry_once_newer_revision_and_stale_retry(self):
        first = self.record()
        self.post(first)
        self.assertEqual(self.post(first)["action"], "unchanged")
        second = self.record(experience_title="New title")
        second["ts"] += 1
        self.assertEqual(self.post(second)["experience"]["revision"], 3)
        self.assertEqual(self.post(first)["experience"]["revision"], 3)
        self.assertEqual(self.db.writes.count("experiences"), 2)
        self.assertEqual(main.load()["listings"]["noor"], second)

    def test_real_uuid_and_alias_share_retry_receipt(self):
        rec = self.record()
        self.post(rec)
        rec["id"] = BIZ
        self.assertEqual(self.post(rec)["experience"]["revision"], 2)
        self.assertEqual(self.db.writes.count("experiences"), 1)

    def test_timestamp_collision_is_safe_conflict(self):
        self.post(self.record())
        self.post(self.record(experience_title="Different operation"), 409)
        self.assertEqual(self.db.writes.count("experiences"), 1)

    def test_null_and_omitted_values_preserve_database_information(self):
        rec = self.record(description=None, price=None, currency=None, duration_minutes=None, activities=[], availability=[])
        row = self.post(rec)["experience"]
        for key in ("description", "price", "currency", "duration_minutes", "activities", "availability"):
            self.assertEqual(row[key], self.original[key])
        rec["ts"] += 1
        rec["L"]["structured"] = {"experience_title": "Only title"}
        row = self.post(rec)["experience"]
        self.assertEqual(row["availability"], self.original["availability"])
        self.assertEqual(row["price"], self.original["price"])

    def test_deliberately_confirmed_empty_arrays_clear_only_owned_fields(self):
        rec = self.record(activities=[], availability=[])
        rec["L"]["confirmed_empty_fields"] = ["activities", "availability"]
        row = self.post(rec)["experience"]
        self.assertEqual(row["activities"], [])
        self.assertEqual(row["availability"]["days"], [])
        self.assertEqual(row["availability"]["start_times"], ["09:00", "14:00"])

    def test_zero_price_and_explicit_empty_description_are_values(self):
        row = self.post(self.record(price=0, description=""))["experience"]
        self.assertEqual(row["price"], 0)
        self.assertEqual(row["description"], "")

    def test_every_day_expands_and_mixing_days_is_rejected(self):
        row = self.post(self.record(availability=["every_day"]))["experience"]
        self.assertEqual(row["availability"]["days"], list(main.LISTING_DAYS))
        self.post(self.record(availability=["every_day", "monday"]), 400)

    def test_zero_active_creates_with_defaults_then_retry_is_unchanged(self):
        self.db.rows["experiences"][0]["is_active"] = False
        rec = self.record(description=None, price=None, currency=None, duration_minutes=None, activities=[], availability=[])
        result = self.post(rec)
        self.assertEqual(result["action"], "created")
        row = result["experience"]
        self.assertEqual(row["business_id"], BIZ)
        self.assertEqual(row["revision"], 1)
        self.assertTrue(row["is_active"])
        self.assertEqual(row["currency"], "USD")
        self.assertEqual(row["availability"], {"days": [], "start_times": []})
        self.assertEqual(row["activities"], [])
        for key in ("capacity", "description", "price", "duration_minutes", "experience_dna"):
            self.assertNotIn(key, row)
        self.assertEqual(self.post(rec)["experience"]["id"], row["id"])
        self.assertEqual(len(self.db.rows["experiences"]), 2)

    def test_multiple_active_experiences_never_guess(self):
        self.db.rows["experiences"].append({**self.original, "id": "other"})
        self.post(self.record(), 409)
        self.assertEqual(self.db.writes, [])
        self.assertFalse(self.store.exists())

    def test_custom_alias_is_not_a_supabase_business(self):
        rec = self.record()
        rec["id"] = "clocal123"
        self.post(rec, 400)
        self.assertEqual(self.db.writes, [])
        self.assertFalse(self.store.exists())

    def test_legacy_mirror_does_not_falsely_prove_supabase_success(self):
        rec = self.record()
        main.save({"listings": {"noor": rec}})
        self.assertEqual(self.post(rec)["action"], "updated")

    def test_mirror_failure_does_not_fail_database_save_or_repeat_revision(self):
        rec = self.record(price=150000)
        with patch.object(main, "save", side_effect=OSError("SECRET")), self.assertLogs(main.__name__, level="WARNING") as logs:
            self.assertEqual(self.post(rec)["experience"]["revision"], 2)
        self.assertNotIn("SECRET", " ".join(logs.output))
        self.assertEqual(self.post(rec)["action"], "unchanged")
        self.assertEqual(self.db.writes.count("experiences"), 1)
        self.assertEqual(main.load()["listings"]["noor"], rec)

    def test_database_failure_never_updates_mirror(self):
        self.db.fail_table = "experiences"
        result = self.post(self.record(), 500)
        self.assertNotIn("credentials", json.dumps(result))
        self.assertFalse(self.store.exists())

    def test_decimal_price_retry_after_mirror_failure_is_not_a_new_revision(self):
        rec = self.record(price=12.345)
        with patch.object(main, "save", side_effect=OSError("unavailable")), self.assertLogs(main.__name__):
            self.assertEqual(self.post(rec)["experience"]["price"], 12.35)
        result = self.post(rec)
        self.assertEqual(result["action"], "unchanged")
        self.assertEqual(result["experience"]["revision"], 2)
        self.assertEqual(self.db.writes.count("experiences"), 1)

    def test_database_errors_are_safe_and_classified(self):
        for code, status in (("23503", 400), ("23514", 400), ("23502", 400), ("22003", 400), ("23505", 409), ("unknown", 500)):
            with self.subTest(code=code):
                error = RuntimeError("SECRET SUPABASE CREDENTIALS")
                error.code = code
                with patch.object(self.db, "table", side_effect=error):
                    result = self.post(self.record(), status)
                self.assertNotIn("SECRET", json.dumps(result))

    def test_invalid_structured_data_is_rejected_before_database_writes(self):
        for key, value in (("experience_title", " "), ("experience_title", 123), ("price", -1),
                           ("price", True), ("price", "5"), ("price", 10**400), ("currency", "idr"), ("currency", "EU"),
                           ("duration_minutes", 0), ("duration_minutes", 1.5), ("duration_minutes", True),
                           ("description", {}), ("activities", "coffee"), ("activities", [2]),
                           ("availability", None), ("availability", ["tomorrow"])):
            with self.subTest(key=key, value=value):
                self.post(self.record(**{key: value}), 400)
        rec = self.record()
        del rec["L"]["structured"]
        self.post(rec, 400)
        for ts in (None, True, -1, "123", 1.5):
            rec = self.record()
            rec["ts"] = ts
            self.post(rec, 400)
        self.assertEqual(self.db.writes, [])

    def test_invalid_empty_confirmation_metadata_is_rejected(self):
        for fields in ("activities", ["capacity"], ["activities"]):
            rec = self.record()
            rec["L"]["confirmed_empty_fields"] = fields
            self.post(rec, 400)

    def test_specific_route_and_generic_compatibility_remain(self):
        paths = [route.path for route in main.app.routes]
        self.assertLess(paths.index("/api/listings"), paths.index("/api/{kind}"))
        self.assertEqual(self.client.post("/api/businesses", json={"id": "clocal", "name": "Local", "host": "Host", "sector": "Farm"}).status_code, 200)
        self.assertEqual(self.client.post("/api/listings", content="{").status_code, 400)
        self.assertEqual(self.client.post("/api/listings", content=b"x" * (main.MAX_BYTES + 1)).status_code, 413)


if __name__ == "__main__":
    unittest.main()
