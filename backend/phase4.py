"""Supabase boundary adapters for the existing message/booking UI.

Anonymous identities are traveler_profiles with user_id NULL, never auth users.
No schema changes or model inference are performed here.
"""
from datetime import date, datetime, time, timezone
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError


STATUS = {"pending": "pending", "confirmed": "confirmed", "declined": "rejected",
          "rejected": "rejected", "cancelled": "cancelled", "completed": "completed"}


def uuid(value):
    try:
        return str(UUID(str(value)))
    except ValueError:
        raise HTTPException(400, "Invalid UUID.") from None


def token(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 80:
        raise HTTPException(400, "Supply a nonempty identifier of at most 80 characters.")
    return value


def stable_id(kind, value):
    value = token(value)
    try:
        return str(UUID(value))
    except ValueError:
        return str(uuid5(NAMESPACE_URL, "yolowisata:" + kind + ":" + value))


def anonymous_id(key):
    # Unlike record IDs, a device token that happens to be a UUID is still anonymous.
    return str(uuid5(NAMESPACE_URL, "yolowisata:anonymous-travelers:" + key))


def timestamp(rec):
    if "ts" not in rec:
        return None
    value = rec["ts"]
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise HTTPException(400, "ts must be a Unix timestamp in milliseconds.")
    try:
        return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat()
    except (ValueError, OverflowError, OSError):
        raise HTTPException(400, "Invalid timestamp.") from None


def one(db, table, value, missing=400):
    rows = db.table(table).select("*").eq("id", value).limit(1).execute().data
    if not rows:
        raise HTTPException(missing, "No such " + table.rstrip("s") + ".")
    return rows[0]


def insert_once(db, table, row):
    rows = db.table(table).upsert(row, on_conflict="id", ignore_duplicates=True).execute().data
    return rows[0] if rows else one(db, table, row["id"])


def validate(model, row):
    try:
        return model.model_validate(row).model_dump(mode="json", exclude_none=True)
    except ValidationError:
        raise HTTPException(400, "Invalid fields, UUIDs, dates, times or numeric values.") from None


def business_id(db, rec, resolve, thread_business=None):
    values = [resolve(rec[k]) for k in ("business_id", "biz") if rec.get(k) is not None]
    if thread_business:
        values.append(resolve(thread_business))
    if len(set(values)) > 1:
        raise HTTPException(400, "Business references disagree.")
    if values:
        one(db, "businesses", values[0])
        return values[0]
    return None


def traveler_plan(db, rec, key=None, country=None):
    if rec.get("traveler_id") is not None:
        return one(db, "traveler_profiles", uuid(rec["traveler_id"]))["id"], None
    if key is None:
        raise HTTPException(400, "Supply traveler_id or an anonymous device/thread identifier.")
    row = {"id": anonymous_id(key), "user_id": None}
    if country:
        row["country_code"] = country
    return row["id"], row


def ensure_traveler(db, plan):
    if plan:
        saved = insert_once(db, "traveler_profiles", plan)
        if saved.get("user_id") is not None:
            raise HTTPException(400, "Anonymous identity conflicts with a registered traveler.")
        if plan.get("country_code") and not saved.get("country_code"):
            db.table("traveler_profiles").update({"country_code": plan["country_code"]}).eq("id", plan["id"]).execute()


class MessageInput(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID | None = None
    sender_type: Literal["traveler", "business", "system"]
    message_type: Literal["text", "voice", "system"] = "text"
    original_text: str = Field(min_length=1)
    original_language: str | None = None
    translated_text: str | None = None
    translated_language: str | None = None
    audio_path: str | None = None
    detected_intent: str | None = None
    intent_confidence: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    created_at: datetime | None = None
    synced_at: datetime | None = None


def write_message(db, rec, resolve, flag_country):
    stamp = timestamp(rec)
    row = dict(rec)
    row["id"] = stable_id("messages", rec.get("id", rec.get("mid")))
    if "original_text" not in row:
        row["original_text"] = rec.get("t")
    if "sender_type" not in row:
        sender = rec.get("from")
        row["sender_type"] = {"g": "traveler", "b": "business", "sys": "system"}.get(sender) if isinstance(sender, str) else None
    row.setdefault("original_language", rec.get("l") or "und")
    if "translated_text" not in row and rec.get("en"):
        row["translated_text"], row["translated_language"] = rec["en"], "en"
    if stamp:
        row.setdefault("created_at", stamp)
    thread_business, thread_key = None, None
    if "thread" in rec:
        parts = token(rec["thread"]).split(":")
        if len(parts) != 2 or not all(parts):
            raise HTTPException(400, "thread must be business:traveler-token.")
        thread_business, thread_key = parts
    bid = business_id(db, rec, resolve, thread_business)
    conversation, traveler = None, None
    if rec.get("conversation_id") is not None:
        cid = uuid(rec["conversation_id"])
        existing = db.table("conversations").select("*").eq("id", cid).execute().data
        if existing:
            conversation = existing[0]
            if bid and bid != conversation["business_id"]:
                raise HTTPException(400, "Conversation belongs to another business.")
            if rec.get("traveler_id") and uuid(rec["traveler_id"]) != conversation["traveler_id"]:
                raise HTTPException(400, "Conversation belongs to another traveler.")
    else:
        cid = None
    if conversation is None:
        if not bid:
            raise HTTPException(400, "Supply a business for the conversation.")
        key = None
        if thread_key:
            key = "device:" + thread_key[1:] if thread_key.startswith("g") and len(thread_key) > 1 else "thread:" + bid + ":" + thread_key
        tid, traveler = traveler_plan(db, rec, key, flag_country(rec.get("f")))
        # Native callers without a conversation ID reuse the unique existing pair.
        matches = db.table("conversations").select("*").eq("business_id", bid).eq("traveler_id", tid).execute().data
        if not cid and len(matches) > 1:
            raise HTTPException(400, "Multiple conversations; supply conversation_id.")
        if not cid and matches:
            conversation = matches[0]
        else:
            cid = cid or str(uuid5(NAMESPACE_URL, "yolowisata:conversations:" + bid + ":" + tid))
            conversation = {"id": cid, "business_id": bid, "traveler_id": tid, "status": "open"}
    row["conversation_id"] = conversation["id"]
    row = validate(MessageInput, row)
    if not row["original_text"].strip():
        raise HTTPException(400, "Message text must not be blank.")
    if row.get("sender_id"):
        one(db, "profiles", row["sender_id"])
    # Validate everything before creating any supporting records.
    ensure_traveler(db, traveler)
    saved = insert_once(db, "conversations", conversation)
    if any(saved[k] != conversation[k] for k in ("business_id", "traveler_id")):
        raise HTTPException(400, "Conversation relationships disagree.")
    saved = insert_once(db, "messages", row)
    for key in ("conversation_id", "sender_type", "original_text"):
        if saved[key] != row[key]:
            raise HTTPException(409, "Message identifier already belongs to different content.")
    return saved


class BookingInput(BaseModel):
    id: UUID
    experience_id: UUID
    traveler_id: UUID
    visit_date: date
    visit_time: time | None = None
    party_size: int = Field(gt=0, strict=True)
    status: str = "pending"
    notes: str | None = None
    created_at: datetime | None = None


def status(value):
    if not isinstance(value, str) or value not in STATUS:
        raise HTTPException(400, "Invalid booking status.")
    return STATUS[value]


def change_status(db, saved, requested):
    # Optimistic revision guard prevents updating a concurrent version blindly.
    for _ in range(3):
        if saved["status"] == requested:
            return saved
        if requested == "pending" and saved["status"] != "pending":
            return saved  # Retried guest requests must not undo an owner's decision.
        revision = saved.get("revision", 1)
        rows = (db.table("bookings").update({"status": requested, "revision": revision + 1})
                .eq("id", saved["id"]).eq("revision", revision).execute().data)
        if rows:
            return rows[0]
        saved = one(db, "bookings", saved["id"], 404)
    raise HTTPException(409, "Booking changed concurrently; retry.")


def write_booking(db, rec, resolve, stale=False):
    stamp = timestamp(rec)
    row = dict(rec)
    row["id"] = stable_id("bookings", rec.get("id"))
    row["status"] = status(rec.get("status", "pending"))
    bid = business_id(db, rec, resolve)
    eid = rec.get("experience_id")
    if eid is None:
        if not bid:
            raise HTTPException(400, "Supply experience_id or a business.")
        experiences = db.table("experiences").select("id").eq("business_id", bid).eq("is_active", True).execute().data
        if len(experiences) != 1:
            raise HTTPException(400, "Exactly one active experience is required; supply experience_id.")
        eid = experiences[0]["id"]
    experience = one(db, "experiences", uuid(eid))
    if not experience["is_active"] or (bid and experience["business_id"] != bid):
        raise HTTPException(400, "Experience is inactive or belongs to another business.")
    row["experience_id"] = experience["id"]
    key = "device:" + token(rec["gid"]) if rec.get("gid") is not None else None
    row["traveler_id"], traveler = traveler_plan(db, rec, key)
    row.setdefault("visit_date", rec.get("date"))
    # Locale display strings have no year. Do not guess a date from submission time.
    try:
        date.fromisoformat(row["visit_date"])
    except (ValueError, TypeError):
        raise HTTPException(400, "Supply visit_date as YYYY-MM-DD; a display date has no reliable year.") from None
    row.setdefault("visit_time", rec.get("time"))
    row.setdefault("party_size", rec.get("people"))
    if stamp:
        row.setdefault("created_at", stamp)
    row = validate(BookingInput, row)
    ensure_traveler(db, traveler)
    saved = insert_once(db, "bookings", row)
    for key in ("experience_id", "traveler_id", "visit_date", "visit_time", "party_size", "notes"):
        if saved.get(key) != row.get(key):
            raise HTTPException(409, "Booking identifier already belongs to different details.")
    return saved if stale else change_status(db, saved, row["status"])


def write_status(db, rec, stale=False):
    timestamp(rec)
    requested = status(rec.get("status"))
    bid = stable_id("bookings", rec.get("id"))
    saved = one(db, "bookings", bid, 404)
    return saved if stale else change_status(db, saved, requested)
