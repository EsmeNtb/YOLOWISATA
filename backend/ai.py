"""The small AI used by the backend.

Everything here has a rule-based version that needs no model, so the demo never breaks.
Real models are optional and switched on with settings in .env:
  - speech-to-text: YOLO_WHISPER_MODEL (needs `pip install faster-whisper`)
Translation and theme analysis with a language model are not wired in yet; see docs/DATA.md.
"""
import os, re, tempfile

NUM = {"satu": 1, "dua": 2, "tiga": 3, "empat": 4, "lima": 5, "enam": 6}
ACTS = [("keliling", "A guided walk"), ("petik", "Picking coffee cherries"), ("sangrai", "Roasting your own coffee"),
        ("minum", "Drinking the coffee"), ("cicip", "Tasting"), ("ukir", "Wood carving"), ("membuat", "Making your own piece"),
        ("pasar", "Market shopping"), ("masak", "Cooking together"), ("tenun", "Weaving")]
DAYS = [("senin", "Monday"), ("selasa", "Tuesday"), ("rabu", "Wednesday"), ("kamis", "Thursday"),
        ("jumat", "Friday"), ("sabtu", "Saturday"), ("minggu", "Sunday")]


def extract_listing(text: str, suffix: str = "Experience", place: str = "the village") -> dict:
    """Voice transcript (Bahasa Indonesia) -> listing fields. Same rules as extract() in frontend/app.js.
    A field that was not heard is simply left out. Nothing is guessed."""
    s, o = text.lower(), {}
    m = re.search(r"nama saya ([a-z]+)", s)
    if m:
        o["name"] = m.group(1).capitalize() + "’s " + ("Coffee Farm Experience" if "kopi" in s else suffix)
    m = re.search(r"(\d{2,4})\s*(?:[.,]000|ribu|rb)", s)
    if m:
        o["price"] = "Rp" + m.group(1) + ".000 per person"
    m = re.search(r"(\d+|satu|dua|tiga|empat|lima|enam)\s*jam", s)
    if m:
        o["duration"] = "About %s hours" % NUM.get(m.group(1), m.group(1))
    acts = [en for key, en in ACTS if key in s]
    if acts:
        o["activities"] = ", ".join(acts)
    days = [en for key, en in DAYS if key in s]
    if "setiap hari" in s:
        o["availability"] = "Every day"
    elif days:
        o["availability"] = " and ".join(days) + (" mornings" if "pagi" in s else "")
    if acts:
        lead = o["duration"].replace("About ", "A ").replace(" hours", "-hour") + " visit" if "duration" in o else "A visit"
        o["description"] = "%s in %s: %s." % (lead, place, o["activities"].lower())
    o["missing"] = [k for k in ("name", "description", "price", "duration", "activities", "availability") if k not in o]
    return o


def _tags(text: str, lex: dict) -> list:
    s = text.lower()
    return [k for k, v in lex.items() if any(w in s for w in v["words"])]


def evidence_label(n: int) -> str:
    return "Strong pattern" if n >= 6 else "Early signal" if n >= 3 else "Not enough evidence yet"


def analyse(business: dict, themes: dict, postcards: list, messages: list) -> dict:
    """Experience DNA: count themes in postcards, questions and guest messages. Same logic as analyse() in app.js.
    Every count comes with the quotes behind it and a label, so the owner can check it."""
    loved_lex = {k: dict(v) for k, v in themes["loved"].items()}
    if "host" in loved_lex:
        loved_lex["host"]["words"] = loved_lex["host"]["words"] + [business["host"].lower().split(" ")[-1]]
    cards = list(business.get("cards", [])) + [p for p in postcards if p.get("biz") == business["id"]]
    qs = list(business.get("qs", [])) + [
        {"f": m.get("f", ""), "t": m["t"], "loc": 1 if m.get("f") == "🇮🇩" else 0}
        for m in messages if m.get("from") == "g" and str(m.get("thread", "")).startswith(business["id"] + ":")]
    out = {"loved": {}, "asks": {}, "segments": {"international": {}, "local": {}}}

    def add(group, key, quote):
        e = out[group].setdefault(key, {"count": 0, "quotes": []})
        e["count"] += 1
        e["quotes"].append(quote)

    for c in cards:
        for k in _tags(c["t"], loved_lex):
            add("loved", k, c["t"])
        for k in _tags(c["t"], themes["asks"]):
            add("asks", k, c["t"])
    for q in qs:
        for k in _tags(q["t"], themes["asks"]):
            add("asks", k, q["t"])
            seg = out["segments"]["local" if q.get("loc") else "international"]
            seg[k] = seg.get(k, 0) + 1
    for group in ("loved", "asks"):
        for e in out[group].values():
            e["label"] = evidence_label(e["count"])
    out["postcards"], out["questions"] = len(cards), len(qs)
    return out


_model = None


def transcribe(audio: bytes, suffix: str = ".webm"):
    """Speech-to-text. Returns the transcript, or None when no speech model is set up
    (the caller then falls back to a sample transcript and says so)."""
    global _model
    name = os.environ.get("YOLO_WHISPER_MODEL", "").strip()
    if not name:
        return None
    try:
        from faster_whisper import WhisperModel
        if _model is None:
            _model = WhisperModel(name, device="cpu", compute_type="int8")
        with tempfile.NamedTemporaryFile(suffix=suffix) as f:
            f.write(audio)
            f.flush()
            segments, _ = _model.transcribe(f.name, language=os.environ.get("YOLO_LANG", "id"))
            return " ".join(seg.text.strip() for seg in segments).strip() or None
    except Exception as e:  # model missing, bad audio, etc: never break the demo
        print("transcribe failed:", e)
        return None
