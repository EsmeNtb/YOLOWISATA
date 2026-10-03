"""Check data/content.json before deploying.  python scripts/validate_data.py
Errors stop the build. Warnings are things the website copes with but the judges may notice."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
c = json.loads((ROOT / "data" / "content.json").read_text(encoding="utf-8"))
errors, warns = [], []
for key in ("sectors", "swipeCards", "phrases", "themes", "businesses"):
    if key not in c:
        errors.append("content.json is missing '%s'" % key)
if errors:
    print("\n".join("ERROR  " + e for e in errors)); sys.exit(1)

def tags(text, lex):
    s = text.lower()
    return [k for k, v in lex.items() if any(w in s for w in v["words"])]

ids = set()
for b in c["businesses"]:
    name = b.get("id", "?")
    for f in ("id", "name", "host", "sector"):
        if not b.get(f):
            errors.append("business %s: missing %s" % (name, f))
    if b.get("id") in ids:
        errors.append("business id used twice: %s" % name)
    ids.add(b.get("id"))
    if b.get("sector") not in c["sectors"]:
        errors.append("business %s: sector '%s' is not in sectors" % (name, b.get("sector")))
    if not b.get("pos"):
        warns.append("business %s: no map position (pos), it will sit in the middle of the map" % name)
    for i, card in enumerate(b.get("cards", [])):
        where = "%s postcard %d (%s)" % (name, i + 1, card.get("n", "?"))
        if not card.get("t"):
            errors.append(where + ": empty text"); continue
        if not tags(card["t"], c["themes"]["loved"]) and not tags(card["t"], c["themes"]["asks"]):
            warns.append(where + ": matches no theme keyword, so it is not counted in insights")
        if card.get("l") != "Indonesian" and not card.get("loc") and not card.get("idt"):
            warns.append(where + ": no Indonesian translation (idt), the owner sees the original")
        if card.get("l") not in ("English", None) and not card.get("en"):
            warns.append(where + ": no English translation (en)")
    for i, q in enumerate(b.get("qs", [])):
        where = "%s question %d" % (name, i + 1)
        if not q.get("t"):
            errors.append(where + ": empty text"); continue
        if not tags(q["t"], c["themes"]["asks"]):
            warns.append(where + ": matches no request keyword, so it is not counted")
        if not q.get("loc") and not q.get("idt"):
            warns.append(where + ": no Indonesian translation (idt)")
    print("%-8s %2d postcards, %2d questions" % (name, len(b.get("cards", [])), len(b.get("qs", []))))
for w in warns:
    print("WARN   " + w)
for e in errors:
    print("ERROR  " + e)
print("%d error(s), %d warning(s)" % (len(errors), len(warns)))
sys.exit(1 if errors else 0)
