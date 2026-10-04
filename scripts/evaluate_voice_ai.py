"""Run frozen transcripts through real local inference; NEVER substitute baseline results."""
import hashlib
import importlib.metadata
import json
import os
import platform
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import ai, listing_ai
from scripts.listing_evaluation import score_listings
from scripts.voice_runtime_smoke import hardware


def main():
    dataset = ROOT / "data/evaluation/voice_listing.json"
    original = dataset.read_bytes()
    cases = json.loads(original)
    evidence_path = ROOT / "data/processed/voice_model_evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {}
    results = {"generated_at": datetime.now(timezone.utc).isoformat(),
               "dataset_sha256": hashlib.sha256(original).hexdigest(),
               "listing_extraction_baseline": score_listings(cases, lambda ex: ai.extract_listing(ex["text"])),
               "model_evidence": evidence,
               "runtime": {**hardware(), "logical_cpus": os.cpu_count(),
                           "threads": int(os.environ.get("YOLO_AI_THREADS", "4")), "context_tokens": 4096,
                           "python": platform.python_version(),
                           "packages": {p: importlib.metadata.version(p) for p in ("llama-cpp-python", "faster-whisper", "ctranslate2")}},
               "cases": [], "notes": ["No STT accuracy measurement: dataset contains text only.",
               "Original semantic scoring retained: description presence, list containment and numeric substrings are permissive.",
               "Typed currency comparison fixes legacy scorer's IDR-only assumption for new output; baseline code path unchanged.",
               "Benchmark expects inferred business names and MXN for unspecified pesos; safety wrapper does not supply those facts."]}
    predictions = {}
    for ex in cases:
        start = time.perf_counter()
        # An unavailable model aborts the benchmark instead of masquerading as Small AI.
        response = listing_ai.extract_proposal(ex["text"], ex["language"], allow_fallback=False)
        predictions[ex["id"]] = response["listing"]
        results["cases"].append({"id": ex["id"], "wall_ms": round((time.perf_counter()-start)*1000, 2), **response})
        print(ex["id"], response["processing_ms"], response["error"], flush=True)
    results["listing_extraction_small_ai"] = score_listings(cases, lambda ex: predictions[ex["id"]], structured=True)
    times = [case["wall_ms"] for case in results["cases"]]
    results["latency_ms"] = {"mean_including_cold_load": statistics.mean(times), "median": statistics.median(times),
                             "min": min(times), "max": max(times), "p90_nearest_rank": sorted(times)[16],
                             "first_case_cold_load": times[0], "mean_remaining_17": statistics.mean(times[1:])}
    results["invalid_outputs"] = sum(case["error"] == "invalid_model_output" for case in results["cases"])
    results["implementation_sha256"] = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                                         for p in ("backend/listing_ai.py", "scripts/listing_evaluation.py")}
    assert original == dataset.read_bytes(), "Frozen dataset changed"
    path = ROOT / "data/processed/voice_ai_evaluation.json"
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k:v for k,v in results.items() if k not in ("cases",)}, indent=2))


if __name__ == "__main__":
    main()
