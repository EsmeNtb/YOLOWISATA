"""Explicit one-time downloads. Never called by the application; weights are gitignored."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


def download(repo, revision, filename, destination):
    target = destination / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(f"https://huggingface.co/{repo}/resolve/{revision}/{filename}?download=true", timeout=120) as response:
        with target.with_suffix(target.suffix + ".part").open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    target.with_suffix(target.suffix + ".part").replace(target)
    return target

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "models"
DEST.mkdir(exist_ok=True)
repo = "Qwen/Qwen2.5-1.5B-Instruct-GGUF"
filename = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
with urlopen(f"https://huggingface.co/api/models/{repo}?blobs=true", timeout=60) as response:
    info = json.load(response)
entry = next(f for f in info["siblings"] if f["rfilename"] == filename)
assert entry["size"] < 1_500_000_000, "Stop: unexpected model download size"
path = DEST / filename
if not path.exists() or path.stat().st_size != entry["size"]:
    path = download(repo, info["sha"], filename, DEST)
with path.open("rb") as stream:
    sha = hashlib.file_digest(stream, "sha256").hexdigest()
assert sha == entry["lfs"]["sha256"]
evidence = {"model": repo, "revision": info["sha"], "filename": filename,
            "model_size_bytes": path.stat().st_size, "sha256": sha,
            "license": info.get("cardData", {}).get("license"), "parameters_model_card": "1.54B", "quantization": "Q4_K_M"}
with urlopen("https://huggingface.co/api/models/Systran/faster-whisper-base", timeout=60) as response:
    stt = json.load(response)
for file in stt["siblings"]:
    name = file["rfilename"]
    if name in ("config.json", "model.bin", "tokenizer.json", "README.md") or name.startswith("vocabulary."):
        download("Systran/faster-whisper-base", stt["sha"], name, DEST / "faster-whisper-base")
evidence["stt"] = {"model": "Systran/faster-whisper-base", "revision": stt["sha"],
                   "license": stt.get("cardData", {}).get("license"),
                   "files_size_bytes": sum(p.stat().st_size for p in (DEST / "faster-whisper-base").glob("*") if p.is_file())}
(ROOT / "data/processed/voice_model_evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
print(json.dumps(evidence, indent=2))
