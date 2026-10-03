"""Opt-in synthetic acceptance with exact-ID cleanup, including partial failures.

python tests/check_phase4_live.py --write --windows-trust
Does not modify postcards, real legacy storage, auth, or schema.
"""
import argparse
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid4, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", required=True)
    parser.add_argument("--windows-trust", action="store_true")
    args = parser.parse_args()
    if args.windows_trust:
        from pip._vendor import truststore
        truststore.inject_into_ssl()
    from fastapi.testclient import TestClient
    from backend import main, phase4

    db, client = main.supabase, TestClient(main.app)

    def get(route):
        response = client.get(route)
        assert response.status_code == 200, "GET failed: " + route
        return response.json()

    def post(kind, payload):
        response = client.post("/api/" + kind, json=payload)
        assert response.status_code == 200, "POST failed: " + kind + " HTTP " + str(response.status_code)
        return response.json()

    assert get("/api/health")["database"]["connected"], "Supabase unavailable"
    noor = [b for b in get("/api/businesses")["businesses"] if b["name"] == "Noor Coffee Farm"]
    assert len(noor) == 1, "No unique Noor business"
    bid = noor[0]["id"]
    experiences = get("/api/experiences?business_id=" + bid)["experiences"]
    assert len(experiences) == 1, "Live acceptance requires exactly one active Noor experience"
    postcards = db.table("postcards").select("*").execute().data
    snapshot = json.dumps(sorted(postcards, key=lambda r: r["id"]), sort_keys=True)
    # Verify actual column availability before writing any rows.
    for table, columns in {
        "traveler_profiles": "id,user_id,country_code",
        "conversations": "id,business_id,traveler_id,status",
        "messages": "id,conversation_id,sender_id,sender_type,original_text,original_language,translated_text,translated_language,detected_intent,intent_confidence,created_at",
        "bookings": "id,experience_id,traveler_id,visit_date,visit_time,party_size,status,notes,revision,created_at",
    }.items():
        db.table(table).select(columns).limit(1).execute()
    print("PASS: live schema reads; Noor UUID:", bid, "; postcards before:", len(postcards))
    suffix = uuid4().hex
    device = "phase4-" + suffix
    traveler = phase4.anonymous_id("device:" + device)
    conversation = str(uuid5(NAMESPACE_URL, "yolowisata:conversations:" + bid + ":" + traveler))
    message_ids = ["mphase4en" + suffix, "mphase4id" + suffix]
    booking_id = "kphase4" + suffix
    cleanup = [
        ("messages", [phase4.stable_id("messages", value) for value in message_ids]),
        ("bookings", [phase4.stable_id("bookings", booking_id)]),
        ("conversations", [conversation]), ("traveler_profiles", [traveler]),
    ]
    # Never delete a row that existed before this uniquely identified test run.
    for table, ids in cleanup:
        assert not db.table(table).select("id").in_("id", ids).execute().data, "Test ID collision"
    stamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    try:
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "STORE", Path(directory) / "store.json"):
            texts = ["Synthetic Phase 4 " + suffix + ": could we have more tasting?",
                     "Uji sintetis Phase 4 " + suffix + ": boleh cicip kopi lagi?"]
            for ident, text, language in zip(message_ids, texts, ("en", "id")):
                payload = {"id": ident, "mid": ident, "thread": "noor:g" + device,
                           "own": device, "from": "g", "t": text, "f": "🇮🇩", "who": "Phase 4 synthetic",
                           "ts": stamp, "sync": "sent", "original_language": language}
                row = post("messages", payload)["message"]
                assert post("messages", payload)["message"]["id"] == row["id"]
                assert get("/api/sync")["messages"][ident]["t"] == text
            insights = get("/api/businesses/" + bid + "/insights")
            assert all(text in insights["asks"]["tasting"]["quotes"] for text in texts)
            payload = {"id": booking_id, "gid": device, "biz": "noor", "date": "Sat 2 Jan",
                       "visit_date": "2027-01-02", "time": "09:00", "people": 2,
                       "status": "pending", "who": "Phase 4 synthetic", "ts": stamp, "sync": "sent",
                       "notes": "Temporary synthetic Phase 4 acceptance " + suffix}
            booking = post("bookings", payload)["booking"]
            assert post("bookings", payload)["booking"]["id"] == booking["id"]
            status = {"id": booking_id, "status": "declined", "ts": stamp + 1}
            for _ in range(2):
                assert post("bookingstatus", status)["booking"]["status"] == "rejected"
            assert post("bookings", payload)["booking"]["status"] == "rejected"
            assert get("/api/sync")["bookings"][booking_id]["status"] == "declined"
            for table, ids in cleanup:
                assert len(db.table(table).select("id").in_("id", ids).execute().data) == len(ids), "Duplicate/missing rows: " + table
            assert phase4.one(db, "traveler_profiles", traveler)["user_id"] is None
            print("PASS: messages, bilingual insights, bookings, status, retries, compatibility sync")
    finally:
        # Delete known IDs even if a response failed after a successful DB write.
        failures = []
        for table, ids in cleanup:
            for attempt in range(3):
                try:
                    db.table(table).delete().in_("id", ids).execute()
                    assert not db.table(table).select("id").in_("id", ids).execute().data
                    break
                except Exception:
                    if attempt == 2:
                        failures.append((table, ids))
        if failures:
            print("CLEANUP REQUIRED (exact synthetic IDs):", failures)
            raise AssertionError("Live cleanup incomplete")
        print("CLEANUP VERIFIED:", cleanup)
        after = db.table("postcards").select("*").execute().data
        assert json.dumps(sorted(after, key=lambda r: r["id"]), sort_keys=True) == snapshot, "Postcard snapshot changed"
        print("PASS: all", len(postcards), "existing postcards unchanged; no temporary rows remain")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        # Never print database exceptions, which may contain connection details.
        print("FAIL:", str(exc) if isinstance(exc, AssertionError) else type(exc).__name__)
        sys.exit(1)
