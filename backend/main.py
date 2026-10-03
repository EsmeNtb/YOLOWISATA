"""YoloWisata backend: a small FastAPI server.

It does three things:
  1. shares postcards, messages, bookings, listings and new businesses between phones (a JSON file store),
  2. runs the small AI (voice note -> listing, visitor insights),
  3. can serve the website itself, so one command runs everything locally.

Run from the project root:  uvicorn backend.main:app --port 8000
"""
import hashlib, hmac, json, os, secrets, threading
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

try:
    from . import ai
except ImportError:  # started as `python main.py` from inside backend/
    import ai

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "data" / "content.json"
STORE = Path(os.environ.get("YOLO_STORE", ROOT / "data" / "store.json"))
KINDS = {"postcards", "messages", "bookings", "bookingstatus", "listings", "businesses"}
REQUIRED = {"postcards": ("biz", "t"), "messages": ("thread", "t", "from"), "bookings": ("biz", "date", "people"),
            "bookingstatus": ("status",), "listings": ("L",), "businesses": ("name", "host", "sector")}
MAX_BYTES = 200_000   # per record; postcard photos are shrunk by the website before sending

app = FastAPI(title="YoloWisata API")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("YOLO_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])
_lock = threading.Lock()


def content() -> dict:
    return json.loads(CONTENT.read_text(encoding="utf-8"))


def load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {k: {} for k in KINDS}


def save(store: dict) -> None:
    tmp = STORE.with_suffix(".tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
    tmp.replace(STORE)


@app.get("/api/health")
def health():
    return {"ok": True, "speech_model": bool(os.environ.get("YOLO_WHISPER_MODEL", "").strip())}


@app.get("/api/content")
def get_content():
    return content()


@app.get("/api/sync")
def sync():
    """Everything shared so far. The website asks for this every few seconds while online."""
    store = load()
    return {k: store.get(k, {}) for k in KINDS}


def _hash(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), 100_000).hex()


@app.post("/api/login")
async def login(req: Request):
    """Phone number + PIN. The first login with a number creates the account.
    kind "guest": returns the guest id, so visits and chats follow the person to another device.
    kind "biz":   returns the business id. Creating one needs "bizId" (sent by the register form).
    This identifies people; it does not yet protect the other endpoints (see README, Known limits)."""
    b = await req.json()
    kind, phone, pin = b.get("kind"), "".join(ch for ch in str(b.get("phone", "")) if ch.isdigit()), str(b.get("pin", ""))
    if kind not in ("guest", "biz") or not 8 <= len(phone) <= 15 or not (4 <= len(pin) <= 6 and pin.isdigit()):
        raise HTTPException(400, "Need kind, a phone number and a PIN of 4 to 6 digits.")
    key = kind + ":" + phone
    with _lock:
        store = load()
        accounts = store.setdefault("accounts", {})
        acc = accounts.get(key)
        if acc:
            if b.get("bizId") and kind == "biz":
                raise HTTPException(409, "This number already has a business.")
            if not hmac.compare_digest(acc["hash"], _hash(pin, acc["salt"])):
                raise HTTPException(401, "Wrong PIN.")
            created = False
        else:
            if kind == "biz" and not b.get("bizId"):
                raise HTTPException(404, "No business uses this number.")
            salt = secrets.token_hex(16)
            acc = {"salt": salt, "hash": _hash(pin, salt)}
            if kind == "guest":
                acc.update(gid=str(b.get("gid") or secrets.token_hex(5))[:40], name=str(b.get("name", ""))[:20], flag=str(b.get("flag", "🌍"))[:8])
            else:
                acc.update(bizId=str(b["bizId"])[:80])
            accounts[key] = acc
            save(store)
            created = True
    out = {k: v for k, v in acc.items() if k not in ("salt", "hash")}
    out["created"] = created
    return out


@app.post("/api/extract")
async def extract(req: Request):
    """Text of a voice note -> listing fields."""
    body = await req.json()
    c = content()
    sector = c["sectors"].get(body.get("sector", ""), c["sectors"]["Other"])
    return ai.extract_listing(str(body.get("text", ""))[:2000], sector["suffix"], str(body.get("place", "the village"))[:80])


@app.post("/api/voice")
async def voice(audio: UploadFile = File(...), sector: str = Form("Other")):
    """Audio of a voice note -> transcript + listing fields.
    Without a speech model the sector's sample transcript is returned, with "demo": true."""
    data = await audio.read()
    if len(data) > 8_000_000:
        raise HTTPException(413, "Voice note is too long. Keep it under a minute.")
    c = content()
    sec = c["sectors"].get(sector, c["sectors"]["Other"])
    text = ai.transcribe(data, Path(audio.filename or "note.webm").suffix or ".webm")
    demo = text is None
    if demo:
        text = sec["sample"]
    return {"transcript": text, "demo": demo, "listing": ai.extract_listing(text, sec["suffix"])}


@app.get("/api/businesses/{biz_id}/insights")
def insights(biz_id: str):
    c, store = content(), load()
    everyone = c["businesses"] + [dict(b, cards=[], qs=[]) for b in store.get("businesses", {}).values()]
    b = next((x for x in everyone if x["id"] == biz_id), None)
    if not b:
        raise HTTPException(404, "No such business.")
    return ai.analyse(b, c["themes"], list(store.get("postcards", {}).values()), list(store.get("messages", {}).values()))


@app.post("/api/{kind}")
async def upsert(kind: str, req: Request):
    """Save one record. Sending the same id again replaces it, but only if it is not older than what is stored."""
    if kind not in KINDS:
        raise HTTPException(404, "Unknown kind.")
    raw = await req.body()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Record is too large.")
    try:
        rec = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Body must be JSON.")
    if not isinstance(rec, dict) or not isinstance(rec.get("id"), str) or not 0 < len(rec["id"]) <= 80:
        raise HTTPException(400, "Record needs a short text id.")
    missing = [f for f in REQUIRED[kind] if rec.get(f) in (None, "")]
    if missing:
        raise HTTPException(400, "Missing: " + ", ".join(missing))
    with _lock:
        store = load()
        bucket = store.setdefault(kind, {})
        old = bucket.get(rec["id"])
        if old and (old.get("ts") or 0) > (rec.get("ts") or 0):
            return {"ok": True, "kept": "newer copy already stored"}
        bucket[rec["id"]] = rec
        save(store)
    return {"ok": True}


@app.get("/config.js")
def config_js():
    """When this server also serves the website, point the website at this same server."""
    from fastapi.responses import Response
    return Response('window.YOLO_CONFIG = { api: location.origin };', media_type="application/javascript")


@app.get("/data/content.json")
def content_file():
    return FileResponse(CONTENT, media_type="application/json")


# The website itself. Must come last so it does not hide the /api routes.
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="site")