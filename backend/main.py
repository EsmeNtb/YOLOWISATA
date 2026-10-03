"""YoloWisata backend: a small FastAPI server.

It does three things:
  1. shares postcards, messages, bookings, listings and new businesses between phones,
  2. runs the small AI (voice note -> listing, visitor insights),
  3. serves the website itself so one command runs everything locally.

Current migration state:
  - Supabase is used for new database-backed read endpoints.
  - data/store.json is temporarily preserved for legacy frontend sync/write compatibility.

Run from the project root:

    uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
"""

import json
import os
import threading
from pathlib import Path

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
# Still uses legacy content/store during this migration phase.
# We will migrate its data source to Supabase next.
# ------------------------------------------------------------

@app.get("/api/businesses/{biz_id}/insights")
def insights(
    biz_id: str,
):
    """Analyse visitor postcards/messages for one business."""

    c = content()
    store = load()

    legacy_businesses = [
        dict(
            business,
            cards=[],
            qs=[],
        )
        for business
        in store.get(
            "businesses",
            {},
        ).values()
    ]

    everyone = (
        c["businesses"]
        + legacy_businesses
    )

    business = next(
        (
            item
            for item
            in everyone
            if item["id"] == biz_id
        ),
        None,
    )

    if not business:
        raise HTTPException(
            status_code=404,
            detail="No such business.",
        )

    postcards = list(
        store.get(
            "postcards",
            {},
        ).values()
    )

    messages = list(
        store.get(
            "messages",
            {},
        ).values()
    )

    return ai.analyse(
        business,
        c["themes"],
        postcards,
        messages,
    )


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