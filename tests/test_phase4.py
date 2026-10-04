"""Phase 4 adapters against an in-memory database; never writes live Supabase."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from backend import main, phase4
from test_phase2 import BIZ, EXP, OLD_EXP, Database, Query


class Phase4Database(Database):
    def __init__(self):
        super().__init__()
        self.writes = []
        self.fail_table = None

    def table(self, name):
        return Phase4Query(self, name)


class Phase4Query(Query):
    changes = None

    def update(self, changes):
        self.changes = copy.deepcopy(changes)
        return self

    def execute(self):
        if self.row is not None or self.changes is not None:
            if self.db.fail_table == self.name:
                raise RuntimeError("sensitive connection credentials")
            self.db.writes.append(self.name)
        if self.changes is not None:
            result = []
            for row in self.db.rows[self.name]:
                if all(f(row) for f in self.filters):
                    row.update(self.changes)
                    result.append(copy.deepcopy(row))
            return SimpleNamespace(data=result)
        if self.row is not None and self.name in ("bookings", "messages"):
            self.row.setdefault("revision", 1)
        return super().execute()


class Phase4Tests(unittest.TestCase):
    def setUp(self):
        self.db = Phase4Database()
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.store = Path(directory.name) / "store.json"
        for name, value in (("supabase", self.db), ("STORE", self.store)):
            patcher = patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(main.app)

    def message(self, **changes):
        return dict({"sync": "sent", "mid": "mphase4", "id": "mphase4", "ts": 1791000000000,
                     "own": "device4", "who": "Visitor", "f": "🇮🇩", "from": "g",
                     "t": "Boleh cicip kopi lagi?", "thread": "noor:gdevice4"}, **changes)

    def booking(self, **changes):
        return dict({"id": "kphase4", "gid": "device4", "ts": 1791000000000, "biz": "noor",
                     "who": "Visitor 🇮🇩", "date": "Sat 10 Oct", "visit_date": "2026-10-10",
                     "time": "09:00", "people": 2, "status": "pending", "sync": "sent"}, **changes)

    def post(self, kind, rec, expected=200):
        response = self.client.post("/api/" + kind, json=rec)
        self.assertEqual(response.status_code, expected, response.text)
        return response.json()

    def mirror(self):
        return self.client.get("/api/sync").json()

    def test_current_frontend_message_and_insights(self):
        payload = self.message()
        row = self.post("messages", payload)["message"]
        self.assertEqual(row["original_text"], payload["t"])
        self.assertEqual(row["original_language"], "und")
        self.assertEqual(row["sender_type"], "traveler")
        self.assertNotIn("sender_id", row)
        self.assertEqual(self.mirror()["messages"][payload["id"]], payload)
        traveler = self.db.rows["traveler_profiles"][0]
        self.assertIsNone(traveler["user_id"])
        self.assertEqual(traveler["country_code"], "ID")
        self.assertEqual(self.db.rows["conversations"][0]["business_id"], BIZ)
        insights = self.client.get(f"/api/businesses/{BIZ}/insights").json()
        self.assertIn(payload["t"], insights["asks"]["tasting"]["quotes"])
        self.assertEqual(insights["segments"]["local"]["tasting"], 1)

    def test_message_metadata_and_business_reply_share_conversation(self):
        first = self.post("messages", self.message())["message"]
        row = self.post("messages", self.message(id="reply", mid="reply", own="owner-device", **{
            "from": "b", "t": "Bisa", "en": "Yes", "original_language": "id",
            "detected_intent": "availability", "intent_confidence": .9,
        }))["message"]
        self.assertEqual(row["conversation_id"], first["conversation_id"])
        self.assertEqual(row["sender_type"], "business")
        self.assertEqual(row["translated_text"], "Yes")
        self.assertEqual(row["translated_language"], "en")
        self.assertEqual(row["original_language"], "id")
        self.assertEqual(row["intent_confidence"], .9)
        self.assertEqual(row["detected_intent"], "availability")
        self.assertTrue(row["created_at"].startswith("2026-10-"))
        self.assertEqual(len(self.db.rows["conversations"]), 1)
        self.assertEqual(self.client.get(f"/api/businesses/{BIZ}/insights").json()["questions"], 1)

    def test_booking_values_and_shared_anonymous_traveler(self):
        self.post("messages", self.message())
        payload = self.booking(notes="Two adults")
        row = self.post("bookings", payload)["booking"]
        for key, value in {"experience_id": EXP, "visit_date": "2026-10-10", "visit_time": "09:00:00",
                           "party_size": 2, "status": "pending", "notes": "Two adults"}.items():
            self.assertEqual(row[key], value)
        self.assertEqual(row["traveler_id"], self.db.rows["conversations"][0]["traveler_id"])
        self.assertEqual(len(self.db.rows["traveler_profiles"]), 1)
        self.assertEqual(self.mirror()["bookings"][payload["id"]], payload)

    def test_retries_do_not_duplicate_messages_bookings_or_conversations(self):
        for _ in range(3):
            self.post("messages", self.message())
            self.post("bookings", self.booking())
        for table in ("messages", "bookings", "conversations", "traveler_profiles"):
            self.assertEqual(len(self.db.rows[table]), 1, table)
        self.post("messages", self.message(id="another", mid="another", thread=BIZ + ":gdevice4"))
        self.assertEqual(len(self.db.rows["conversations"]), 1)

    def test_booking_status_updates_exactly_one_and_mirrors(self):
        row = self.post("bookings", self.booking())["booking"]
        other = self.post("bookings", self.booking(id="kother"))["booking"]
        for _ in range(2):
            result = self.post("bookingstatus", {"id": "kphase4", "status": "declined", "ts": 1791000001000})
            self.assertEqual(result["booking"]["status"], "rejected")
        self.assertEqual(phase4.one(self.db, "bookings", other["id"])["status"], "pending")
        self.assertEqual(phase4.one(self.db, "bookings", row["id"])["revision"], 2)
        self.assertEqual(self.mirror()["bookings"]["kphase4"]["status"], "declined")
        self.assertEqual(self.mirror()["bookingstatus"]["kphase4"]["status"], "declined")

    def test_frontend_full_booking_owner_decision_and_stale_retry(self):
        self.post("bookings", self.booking())
        self.post("bookings", self.booking(status="confirmed", ts=1791000002000))
        self.post("bookings", self.booking())
        self.post("bookingstatus", {"id": "kphase4", "status": "declined", "ts": 1791000001000})
        self.assertEqual(self.db.rows["bookings"][0]["status"], "confirmed")
        self.assertEqual(self.mirror()["bookings"]["kphase4"]["status"], "confirmed")

    def test_native_ids_and_fields_take_precedence(self):
        tid, cid, mid, kid = (str(uuid4()) for _ in range(4))
        self.db.rows["traveler_profiles"].append({"id": tid, "user_id": None})
        row = self.post("messages", self.message(id=mid, conversation_id=cid, traveler_id=tid,
                        original_text="Native text", original_language="en", translated_text="Teks asli", translated_language="id"))["message"]
        self.assertEqual((row["id"], row["conversation_id"], row["original_text"]), (mid, cid, "Native text"))
        booking = self.booking(id=kid, traveler_id=tid, experience_id=EXP, party_size=3)
        for _ in range(2):
            result = self.post("bookings", booking)["booking"]
            self.assertEqual((result["id"], result["traveler_id"], result["party_size"]), (kid, tid, 3))
        self.assertEqual(len(self.db.rows["bookings"]), 1)

    def test_native_message_existing_conversation_without_legacy_relationships(self):
        first = self.post("messages", self.message())["message"]
        payload = {"id": str(uuid4()), "conversation_id": first["conversation_id"],
                   "sender_type": "traveler", "original_text": "More tasting?", "original_language": "en"}
        for _ in range(2):
            self.post("messages", payload)
        self.assertNotIn(payload["id"], self.mirror()["messages"])
        self.assertEqual(len(self.db.rows["messages"]), 2)

    def test_native_uuid_status_updates_legacy_copy(self):
        row = self.post("bookings", self.booking())["booking"]
        self.post("bookingstatus", {"id": row["id"], "status": "confirmed"})
        self.assertEqual(self.mirror()["bookings"]["kphase4"]["status"], "confirmed")

    def test_zero_and_multiple_active_experiences_rejected_without_writes(self):
        self.db.rows["experiences"][0]["is_active"] = False
        self.post("bookings", self.booking(), 400)
        self.db.rows["experiences"][0]["is_active"] = True
        self.db.rows["experiences"].append({"id": str(uuid4()), "business_id": BIZ, "is_active": True})
        self.post("bookings", self.booking(), 400)
        self.assertEqual(self.db.writes, [])
        self.assertFalse(self.store.exists())
        self.post("bookings", self.booking(experience_id=EXP))

    def test_invalid_relationships_dates_and_fields_never_write(self):
        bookings = [self.booking(visit_date="Sat 10 Oct"), self.booking(time="25:00"),
                    self.booking(people=0), self.booking(people=True), self.booking(experience_id=OLD_EXP),
                    self.booking(experience_id=str(uuid4())), self.booking(traveler_id=str(uuid4())),
                    {k: v for k, v in self.booking().items() if k != "gid"}]
        for payload in bookings:
            self.post("bookings", payload, 400)
        for payload in [self.message(thread="broken"), self.message(thread="missing:g1"), self.message(t=" "),
                        self.message(intent_confidence=2), self.message(sender_id=str(uuid4())),
                        self.message(ts="yesterday"), self.message(**{"from": "unknown"}), self.message(**{"from": []})]:
            self.post("messages", payload, 400)
        self.assertEqual(self.db.writes, [])
        self.assertFalse(self.store.exists())

    def test_invalid_booking_identifier_status_and_unknown_booking(self):
        for value in (None, "", [], {}, 123):
            self.post("bookingstatus", {"id": value, "status": "confirmed"}, 400)
        for value in (None, "invented", [], "CONFIRMED"):
            self.post("bookingstatus", {"id": "kphase4", "status": value}, 400)
        for value in (str(uuid4()), "kmissing", "noor-b1"):
            self.post("bookingstatus", {"id": value, "status": "confirmed"}, 404)
        self.assertFalse(self.store.exists())

    def test_db_failure_has_no_legacy_mirror_and_safe_retry(self):
        for table, kind, payload in [("messages", "messages", self.message()), ("bookings", "bookings", self.booking())]:
            self.db.fail_table = table
            error = self.post(kind, payload, 500)
            self.assertNotIn("sensitive", json.dumps(error))
            self.assertNotIn(payload["id"], self.mirror()[kind])
            self.db.fail_table = None
            self.post(kind, payload)
        self.assertEqual(len(self.db.rows["conversations"]), 1)
        before = copy.deepcopy(self.mirror())
        self.db.fail_table = "bookings"
        self.post("bookingstatus", {"id": "kphase4", "status": "confirmed"}, 500)
        self.assertEqual(self.mirror(), before)

    def test_database_unavailable_and_failed_conversation_do_not_mirror(self):
        with patch.object(self.db, "table", side_effect=RuntimeError("private secret")):
            for kind, payload in (("messages", self.message()), ("bookings", self.booking()),
                                  ("bookingstatus", {"id": "kphase4", "status": "confirmed"})):
                self.assertNotIn("secret", json.dumps(self.post(kind, payload, 500)))
        self.db.fail_table = "conversations"
        self.post("messages", self.message(), 500)
        self.assertFalse(self.store.exists())

    def test_changed_content_cannot_reuse_message_or_booking_id(self):
        self.post("messages", self.message())
        self.post("bookings", self.booking())
        before = copy.deepcopy(self.mirror())
        self.post("messages", self.message(t="different"), 409)
        self.post("bookings", self.booking(people=5), 409)
        self.assertEqual(self.mirror(), before)

    def test_malformed_json_and_body_size(self):
        for kind in ("messages", "bookings", "bookingstatus"):
            for body in ("{", "[]", "null"):
                self.assertEqual(self.client.post("/api/" + kind, content=body).status_code, 400)
            self.assertEqual(self.client.post("/api/" + kind, content=b"x" * (main.MAX_BYTES + 1)).status_code, 413)

    def test_explicit_routes_precede_generic_and_mount_is_last(self):
        paths = [r.path for r in main.app.routes if "POST" in getattr(r, "methods", set())]
        for kind in ("messages", "bookings", "bookingstatus", "listings"):
            self.assertLess(paths.index("/api/" + kind), paths.index("/api/{kind}"))
        self.assertEqual(main.app.routes[-1].name, "site")
        self.post("listings", {"id": "noor", "L": {"name": "presentation-only legacy listing"}}, 400)
        self.post("businesses", {"id": "clocal", "name": "Local", "host": "Host", "sector": "Farm"})
        self.assertIn("clocal", self.mirror()["businesses"])


if __name__ == "__main__":
    unittest.main()
