"""Copy data/content.json into frontend/data/ so the static site (Vercel) and the service worker can serve it.
Run this after every change to the data:  python scripts/export_static.py"""
import shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
dst = ROOT / "frontend" / "data"
dst.mkdir(parents=True, exist_ok=True)
shutil.copyfile(ROOT / "data" / "content.json", dst / "content.json")
print("Copied data/content.json -> frontend/data/content.json")
