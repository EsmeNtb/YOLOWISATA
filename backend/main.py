"""YoloWisata backend: a small FastAPI server.

It does three things:
  1. shares postcards, messages, bookings, listings and new businesses between phones,
  2. runs the small AI (voice note -> listing, visitor insights),
  3. serves the website itself so one command runs everything locally.

Current migration state:
  - Supabase backs read endpoints, visitor insights and postcard writes.
  - data/store.json is temporarily preserved for legacy frontend sync/write compatibility.

Run from the project root:

    uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
"""

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, Field, StrictBool, ValidationError

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.database import supabase


try:
    from . import ai
except ImportError:
    # Allows running from inside backend/ if needed.
    import ai


# ============================================================
# PATHS / CONFIG
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

CONTENT = ROOT / "data" / "content.json"

STORE = Path(
    os.environ.get(
        "YOLO_STORE",
        ROOT / "data" / "store.json",
    )
)

KINDS = {
    "postcards",
    "messages",
    "bookings",
    "bookingstatus",
    "listings",
    "businesses",
}

REQUIRED = {
    "postcards": ("biz", "t"),
    "messages": ("thread", "t", "from"),
    "bookings": ("biz", "date", "people"),
    "bookingstatus": ("status",),
    "listings": ("L",),
    "businesses": ("name", "host", "sector"),
}

# Per record.
# Postcard photos are shrunk by the website before sending.
MAX_BYTES = 200_000


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="YoloWisata API",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get(
        "YOLO_ORIGINS",
        "*",
    ).split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()


# ============================================================
# LEGACY CONTENT / STORE HELPERS
# ============================================================

def content() -> dict:
    """Load the static destination/product content."""
    return json.loads(
        CONTENT.read_text(
            encoding="utf-8",
        )
    )


def load() -> dict:
    """Load the temporary JSON shared-data store."""

    if STORE.exists():
        try:
            return json.loads(
                STORE.read_text(
                    encoding="utf-8",
                )
            )

        except json.JSONDecodeError:
            pass

    return {
        kind: {}
        for kind in KINDS
    }


def save(store: dict) -> None:
    """Atomically save the temporary JSON shared-data store."""

    tmp = STORE.with_suffix(".tmp")

    tmp.write_text(
        json.dumps(
            store,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    tmp.replace(STORE)


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():
    """Check backend, Supabase and optional speech-model status."""

    database_connected = False
    database_error = None

    try:
        (
            supabase
            .table("destinations")
            .select("id")
            .limit(1)
            .execute()
        )

        database_connected = True

    except Exception as exc:
        database_error = str(exc)

    return {
        "ok": True,
        "database": {
            "connected": database_connected,
            "provider": "supabase",
            "error": database_error,
        },
        "speech_model": bool(
            os.environ.get(
                "YOLO_WHISPER_MODEL",
                "",
            ).strip()
        ),
    }


# ============================================================
# STATIC PRODUCT CONTENT
# ============================================================

@app.get("/api/content")
def get_content():
    """Return static destination/product content."""

    return content()


# ============================================================
# LEGACY SYNC
#
# Temporary compatibility endpoint.
# The existing frontend still polls this endpoint.
# ============================================================

@app.get("/api/sync")
def sync():
    """Return everything currently stored in the legacy JSON store."""

    store = load()

    return {
        kind: store.get(
            kind,
            {},
        )
        for kind in KINDS
    }


# ============================================================
# SUPABASE READ ENDPOINTS
# ============================================================


# ------------------------------------------------------------
# BUSINESSES
# ------------------------------------------------------------

@app.get("/api/businesses")
def get_businesses():
    """Return active businesses from Supabase."""

    try:
        result = (
            supabase
            .table("businesses")
            .select("*")
            .eq(
                "is_active",
                True,
            )
            .execute()
        )

        return {
            "ok": True,
            "businesses": result.data,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch businesses: {exc}",
        )


@app.get("/api/businesses/{biz_id}")
def get_business(biz_id: str):
    """Return one business from Supabase."""

    try:
        result = (
            supabase
            .table("businesses")
            .select("*")
            .eq(
                "id",
                biz_id,
            )
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="Business not found.",
            )

        return {
            "ok": True,
            "business": result.data[0],
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch business: {exc}",
        )


# ------------------------------------------------------------
# EXPERIENCES
# ------------------------------------------------------------

@app.get("/api/experiences")
def get_experiences(
    business_id: str | None = None,
):
    """Return active experiences.

    Optional:
        ?business_id=<uuid>
    """

    try:
        query = (
            supabase
            .table("experiences")
            .select("*")
            .eq(
                "is_active",
                True,
            )
        )

        if business_id:
            query = query.eq(
                "business_id",
                business_id,
            )

        result = query.execute()

        return {
            "ok": True,
            "experiences": result.data,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch experiences: {exc}",
        )


# ------------------------------------------------------------
# POSTCARDS
# ------------------------------------------------------------

@app.get("/api/postcards")
def get_postcards(
    experience_id: str | None = None,
):
    """Return postcards from Supabase.

    Optional:
        ?experience_id=<uuid>
    """

    try:
        query = (
            supabase
            .table("postcards")
            .select("*")
        )

        if experience_id:
            query = query.eq(
                "experience_id",
                experience_id,
            )

        result = (
            query
            .order(
                "created_at",
                desc=True,
            )
            .execute()
        )

        return {
            "ok": True,
            "postcards": result.data,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch postcards: {exc}",
        )


# ============================================================
# SUPABASE POSTCARD WRITE / LEGACY PAYLOAD ADAPTER
# ============================================================


class PostcardInput(BaseModel):
    """Only actual postcard columns may cross the database write boundary."""

    id: UUID | None = None
    experience_id: UUID
    traveler_id: UUID | None = None
    display_name: str = "Traveler"
    country_code: str | None = None
    message: str = Field(min_length=1)
    language: str = "en"
    photo_path: str | None = None
    audio_path: str | None = None
    background_style: str = "default"
    stickers: list = Field(default_factory=list)
    consent_for_public: StrictBool = False
    consent_for_analysis: StrictBool = False
    revision: int = Field(default=1, ge=1, strict=True)
    created_at: datetime | None = None
    synced_at: datetime | None = None


def country_from_flag(flag):
    if isinstance(flag, str) and len(flag) == 2 and all(
        0x1F1E6 <= ord(char) <= 0x1F1FF for char in flag
    ):
        return "".join(chr(ord(char) - 0x1F1E6 + ord("A")) for char in flag)
    return None


def business_uuid(value):
    """Resolve the existing seeded frontend alias without fuzzy name matching."""
    try:
        return str(UUID(str(value)))
    except ValueError:
        # content.json uses `noor`; seed.sql uses this exact business name.
        if value != "noor":
            raise HTTPException(400, "Business must have a Supabase UUID or the demo alias 'noor'.")
        rows = supabase.table("businesses").select("id").eq("name", "Noor Coffee Farm").execute().data
        if len(rows) != 1:
            raise HTTPException(400, "The demo business is missing or ambiguous; supply business_id.")
        return rows[0]["id"]


def postcard_row(rec):
    """Adapt the current app.js postcard or accept native Supabase columns.

    Legacy-only presentation/device fields stay in the JSON compatibility copy.
    Consent is never inferred from submitting a postcard.
    """
    row = dict(rec)
    legacy = "biz" in rec or "t" in rec
    aliases = {
        "t": "message", "n": "display_name", "bg": "background_style",
        # Existing photos are data URLs; preserve them without claiming an upload.
        "photo": "photo_path",
    }
    for old, new in aliases.items():
        if new not in row and old in rec:
            row[new] = rec[old]
    if legacy:
        if "country_code" not in row:
            row["country_code"] = country_from_flag(rec.get("f"))
        if "language" not in row:
            row["language"] = "und" if rec.get("l") in (None, "", "Original language") else rec["l"]
        if "stickers" not in row:
            stickers = rec.get("s", "")
            if not isinstance(stickers, str):
                raise HTTPException(400, "Legacy s must be a sticker string.")
            row["stickers"] = [stickers] if stickers else []
        if "id" in rec:
            if not isinstance(rec["id"], str) or not 0 < len(rec["id"]) <= 80:
                raise HTTPException(400, "Record needs a short text id.")
            try:
                row["id"] = str(UUID(rec["id"]))
            except ValueError:
                # Stable across retries from the unchanged frontend outbox.
                row["id"] = str(uuid5(NAMESPACE_URL, "yolowisata:postcards:" + rec["id"]))
        if "ts" in rec:
            try:
                timestamp = datetime.fromtimestamp(rec["ts"] / 1000, timezone.utc)
            except (ValueError, TypeError, OverflowError, OSError):
                raise HTTPException(400, "ts must be a valid Unix timestamp in milliseconds.")
            row.setdefault("created_at", timestamp)

    business_id = None
    for key in ("business_id", "biz"):
        if rec.get(key) is not None:
            resolved = business_uuid(rec[key])
            if business_id and resolved != business_id:
                raise HTTPException(400, "biz and business_id identify different businesses.")
            business_id = resolved
    if not row.get("experience_id"):
        if not business_id:
            raise HTTPException(400, "Supply experience_id or a business id.")
        experiences = (supabase.table("experiences").select("id")
                       .eq("business_id", business_id).eq("is_active", True).execute().data)
        if not experiences:
            raise HTTPException(400, "This business has no active experiences.")
        if len(experiences) != 1:
            raise HTTPException(400, "Multiple active experiences; supply experience_id.")
        row["experience_id"] = experiences[0]["id"]
    try:
        validated = PostcardInput.model_validate(row)
    except ValidationError:
        raise HTTPException(400, "Invalid postcard fields, UUIDs, timestamps or consent flags.")
    if not validated.message.strip():
        raise HTTPException(400, "message must not be blank.")
    experience = (supabase.table("experiences").select("id,business_id,is_active")
                  .eq("id", str(validated.experience_id)).limit(1).execute().data)
    if not experience or not experience[0]["is_active"]:
        raise HTTPException(400, "Experience does not exist or is inactive.")
    if business_id and experience[0]["business_id"] != business_id:
        raise HTTPException(400, "Experience does not belong to this business.")
    return validated.model_dump(mode="json", exclude_none=True), legacy


@app.post("/api/postcards")
async def create_postcard(req: Request):
    """Write Supabase first; retain the legacy frontend's /api/sync copy."""
    raw = await req.body()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Record is too large.")
    try:
        rec = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Body must be JSON.")
    if not isinstance(rec, dict):
        raise HTTPException(400, "Body must be a JSON object.")
    try:
        row, legacy = postcard_row(rec)
        if legacy and row.get("id"):
            result = (supabase.table("postcards")
                      .upsert(row, on_conflict="id", ignore_duplicates=True).execute())
            rows = result.data or (supabase.table("postcards").select("*")
                                   .eq("id", row["id"]).execute().data)
        else:
            rows = supabase.table("postcards").insert(row).execute().data
        if not rows:
            raise HTTPException(500, "Postcard insert returned no record.")
    except HTTPException:
        raise
    except Exception as exc:
        # Do not return database/client exception text or credentials.
        code = getattr(exc, "code", None)
        if code == "23505":
            raise HTTPException(409, "Postcard id already exists.") from None
        if code in ("23503", "23514", "22P02"):
            raise HTTPException(400, "Invalid postcard reference or field value.") from None
        raise HTTPException(500, "Failed to save postcard.") from None
    if legacy and all(rec.get(key) for key in ("id", "biz", "t")):
        with _lock:
            store = load()
            bucket = store.setdefault("postcards", {})
            old = bucket.get(rec["id"])
            if not old or (old.get("ts") or 0) <= (rec.get("ts") or 0):
                bucket[rec["id"]] = rec
                save(store)
    return {"ok": True, "postcard": rows[0]}


# ============================================================
# SMALL AI
# ============================================================


# ------------------------------------------------------------
# TEXT -> STRUCTURED LISTING
# ------------------------------------------------------------

@app.post("/api/extract")
async def extract(
    req: Request,
):
    """Text of a voice note -> structured listing fields."""

    body = await req.json()

    c = content()

    sector = c["sectors"].get(
        body.get(
            "sector",
            "",
        ),
        c["sectors"]["Other"],
    )

    text = str(
        body.get(
            "text",
            "",
        )
    )[:2000]

    place = str(
        body.get(
            "place",
            "the village",
        )
    )[:80]

    return ai.extract_listing(
        text,
        sector["suffix"],
        place,
    )


# ------------------------------------------------------------
# AUDIO -> TRANSCRIPT -> STRUCTURED LISTING
# ------------------------------------------------------------

@app.post("/api/voice")
async def voice(
    audio: UploadFile = File(...),
    sector: str = Form("Other"),
):
    """Audio of a voice note -> transcript + listing fields.

    Without a configured speech model, the sector sample transcript
    is returned and `demo` will be true.
    """

    data = await audio.read()

    if len(data) > 8_000_000:
        raise HTTPException(
            status_code=413,
            detail="Voice note is too long. Keep it under a minute.",
        )

    c = content()

    sec = c["sectors"].get(
        sector,
        c["sectors"]["Other"],
    )

    suffix = (
        Path(
            audio.filename
            or "note.webm"
        ).suffix
        or ".webm"
    )

    text = ai.transcribe(
        data,
        suffix,
    )

    demo = text is None

    if demo:
        text = sec["sample"]

    listing = ai.extract_listing(
        text,
        sec["suffix"],
    )

    return {
        "transcript": text,
        "demo": demo,
        "listing": listing,
    }


# ------------------------------------------------------------
# EXPERIENCE DNA / VISITOR INSIGHTS
#
# Supabase records are adapted here; ai.analyse remains unchanged.
# ------------------------------------------------------------

@app.get("/api/businesses/{biz_id}/insights")
def insights(
    biz_id: str,
):
    """Analyse visitor postcards/messages for one business."""

    try:
        biz_id = business_uuid(biz_id)
        businesses = (supabase.table("businesses").select("*")
                      .eq("id", biz_id).limit(1).execute().data)
        if not businesses:
            raise HTTPException(404, "No such business.")
        business = businesses[0]
        # Include historical experiences too: their consented feedback still counts.
        experiences = (supabase.table("experiences").select("id")
                       .eq("business_id", biz_id).execute().data)
        postcards = []
        if experiences:
            postcards = (supabase.table("postcards").select("*")
                         .in_("experience_id", [e["id"] for e in experiences])
                         .eq("consent_for_analysis", True).execute().data)
        conversations = (supabase.table("conversations").select("id,traveler_id")
                         .eq("business_id", biz_id).execute().data)
        messages, travelers = [], []
        if conversations:
            messages = (supabase.table("messages").select("*")
                        .in_("conversation_id", [c["id"] for c in conversations])
                        .eq("sender_type", "traveler").execute().data)
            travelers = (supabase.table("traveler_profiles").select("id,country_code")
                         .in_("id", list({c["traveler_id"] for c in conversations}))
                         .execute().data)
        owner_name = None
        if business.get("owner_id"):
            owners = (supabase.table("profiles").select("display_name")
                      .eq("id", business["owner_id"]).limit(1).execute().data)
            if owners:
                owner_name = (owners[0].get("display_name") or "").strip()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Failed to fetch visitor insight data.") from None

    themes = content()["themes"]  # Only the static keyword lexicon, never demo feedback.
    # Supabase has no host column. Without an owner name, re-use a single-word
    # host keyword; an empty string would tag EVERY postcard as praising the host.
    host_words = themes.get("loved", {}).get("host", {}).get("words", [])
    host = owner_name or next((w for w in host_words if w and " " not in w), "host")
    ai_business = {"id": biz_id, "host": host, "cards": [], "qs": []}
    ai_postcards = [
        {"biz": biz_id, "t": p["message"]}
        for p in postcards if p.get("consent_for_analysis") is True
    ]
    countries = {t["id"]: t.get("country_code") for t in travelers}
    conversation_countries = {c["id"]: countries.get(c["traveler_id"]) for c in conversations}
    ai_messages = [
        {"from": "g", "thread": biz_id + ":" + m["conversation_id"],
         "t": m["original_text"],
         # Preserve the AI's existing Indonesian/local segmentation rule.
         "f": "🇮🇩" if conversation_countries.get(m["conversation_id"]) == "ID" else ""}
        for m in messages if m.get("sender_type") == "traveler" and m.get("original_text")
    ]
    return ai.analyse(ai_business, themes, ai_postcards, ai_messages)


# ============================================================
# LEGACY WRITE ENDPOINT
#
# IMPORTANT:
# Keep this AFTER the specific /api/... endpoints.
#
# The current frontend still sends:
#   POST /api/postcards
#   POST /api/messages
#   POST /api/bookings
#   POST /api/businesses
#   etc.
#
# We will gradually replace these with Supabase-backed routes.
# ============================================================

@app.post("/api/{kind}")
async def upsert(
    kind: str,
    req: Request,
):
    """Save one legacy shared record.

    Sending the same ID again replaces it only when the incoming
    record is at least as recent as the stored record.
    """

    if kind not in KINDS:
        raise HTTPException(
            status_code=404,
            detail="Unknown kind.",
        )

    raw = await req.body()

    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Record is too large.",
        )

    try:
        rec = json.loads(
            raw
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Body must be JSON.",
        )

    if (
        not isinstance(
            rec,
            dict,
        )
        or not isinstance(
            rec.get("id"),
            str,
        )
        or not 0 < len(
            rec["id"]
        ) <= 80
    ):
        raise HTTPException(
            status_code=400,
            detail="Record needs a short text id.",
        )

    missing = [
        field
        for field
        in REQUIRED[kind]
        if rec.get(field) in (
            None,
            "",
        )
    ]

    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing: "
                + ", ".join(
                    missing
                )
            ),
        )

    with _lock:
        store = load()

        bucket = store.setdefault(
            kind,
            {},
        )

        old = bucket.get(
            rec["id"]
        )

        if (
            old
            and (
                old.get("ts")
                or 0
            )
            > (
                rec.get("ts")
                or 0
            )
        ):
            return {
                "ok": True,
                "kept": "newer copy already stored",
            }

        bucket[
            rec["id"]
        ] = rec

        save(
            store
        )

    return {
        "ok": True,
    }


# ============================================================
# FRONTEND CONFIG
# ============================================================

@app.get("/config.js")
def config_js():
    """Point the website at the same FastAPI origin."""

    from fastapi.responses import Response

    return Response(
        (
            "window.YOLO_CONFIG = "
            "{ api: location.origin };"
        ),
        media_type="application/javascript",
    )


# ============================================================
# FRONTEND CONTENT FILE
# ============================================================

@app.get("/data/content.json")
def content_file():
    return FileResponse(
        CONTENT,
        media_type="application/json",
    )


# ============================================================
# STATIC FRONTEND
#
# MUST REMAIN LAST.
# Otherwise "/" may swallow API routes.
# ============================================================

app.mount(
    "/",
    StaticFiles(
        directory=ROOT / "frontend",
        html=True,
    ),
    name="site",
)
