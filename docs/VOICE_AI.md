# Accessible AI / Voice Listing ? Phase 6

Implemented: browser recording ? local-host STT ? editable transcript ? local Small AI proposal ? editable fields ? explicit **Confirm & save**.

AI proposes; the human decides. The new processing endpoints never write listings or Supabase. An invalid response never substitutes a demo transcript.

## What actually runs

- STT: `faster-whisper` 1.2.1 / CTranslate2 4.8.2, multilingual `Systran/faster-whisper-base`, CPU `int8`, beam size 3, VAD. Automatic language detection is checked against EN/ES/ID; requested and recognized language are returned separately. No cloud STT or OpenAI API.
- Extractor: official **Qwen/Qwen2.5-1.5B-Instruct-GGUF**, **1.54 billion parameters**, **Q4_K_M**, through `llama-cpp-python` 0.3.36. CPU only (`n_gpu_layers=0`), 4 threads by default, context 4096, temperature 0, seed 42, maximum output 1200 tokens. This is real neural inference, separate from the regex fallback.
- Downloaded GGUF: **1,117,320,736 bytes** (about 1.04 GiB). SHA-256: `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
- Qwen revision: `91cad51170dc346986eccefdc2dd33a9da36ead9`. Whisper revision: `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. Whisper installed top-level files total **147,884,932 bytes**, including configuration/tokenizer/model card. Weights on disk are converted FP16; runtime uses int8.
- Machine measured: Windows 11 build 26200, Python 3.12.10, AMD Ryzen 7 7840HS with Radeon 780M, 16 logical CPUs, **16,309,932,032 bytes physical RAM** reported by Windows. No GPU inference. Process peak RAM and phone/edge performance have **not** been measured.

Sources: [official Qwen model identity, parameters and license](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF), [Whisper conversion and license](https://huggingface.co/Systran/faster-whisper-base), [faster-whisper runtime](https://github.com/SYSTRAN/faster-whisper), [llama-cpp-python setup](https://github.com/abetlen/llama-cpp-python).

Measured artifacts: `data/processed/voice_model_evidence.json`, `voice_runtime_smoke.json`, and `voice_ai_evaluation.json`. Size is a file measurement, not a phone-feasibility claim.

## Setup (Windows PowerShell, repository root)

```powershell
python -m venv .venv-voice
.venv-voice/Scripts/python -m pip install llama-cpp-python --only-binary=:all: --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
.venv-voice/Scripts/python -m pip install -r backend/requirements.txt
.venv-voice/Scripts/python scripts/setup_voice_models.py
.venv-voice/Scripts/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

Existing backend Supabase configuration still applies; the application currently imports the database client at startup. A working speech model is not required to use the core app. Models are lazily loaded. Downloading is a separate explicit setup step, never part of an API request. `models/`, `.venv-voice/`, and GGUF files are gitignored.

The setup script downloads only the official 1.54B Q4_K_M artifact, stops if its advertised size exceeds 1.5 GB, verifies its upstream SHA-256, and records the exact revision. It uses the system TLS trust store. TLS verification is not disabled. If wheels are unavailable for a different Python/Windows version, use the upstream build instructions (Visual Studio C++ tools/CMake); do not silently replace this with a heavier model. No server process was left running by implementation work.

Optional environment variables (or existing `backend/.env`):

```text
YOLO_WHISPER_MODEL=models/faster-whisper-base
YOLO_LISTING_MODEL=models/qwen2.5-1.5b-instruct-q4_k_m.gguf
YOLO_AI_THREADS=4
```

Run from the repository root, or use absolute model paths. `YOLO_WHISPER_MODEL` can select a separately installed multilingual model, e.g. small; its performance would need separate measurement. Paths do not select a hosted provider. A different GGUF needs its own identity/license/size evaluation; the tested default remains 1.54B.

## API and compatibility

`POST /api/voice/transcribe`: multipart `audio` and `language=en|es|id`. Maximum 8,000,000 bytes, decoded duration at most 60 seconds. Returns:

```json
{
  "transcript": "recognized speech",
  "language": "id",
  "requested_language": "id",
  "model": "models/faster-whisper-base",
  "device": "cpu",
  "compute_type": "int8",
  "processing_ms": 1234
}
```

The number above illustrates the contract, not measured speech latency. Empty/unsupported/invalid speech gives 422; an unavailable local model/runtime gives 503; oversized audio gives 413. No sample words are returned. STT runs in a worker thread so it does not block the API event loop.

`POST /api/voice/proposal`: JSON `{ "transcript": "...", "language": "en" }`, nonblank text up to 4000 characters. Returns the original transcript, language, extractor metadata, processing_ms, `requires_confirmation: true`, nullable error, and:

```json
{
  "listing": {
    "business_name": null,
    "experience_title": null,
    "description": null,
    "price": null,
    "currency": null,
    "duration_minutes": null,
    "activities": [],
    "availability": []
  },
  "missing_fields": ["business_name", "experience_title", "description", "price", "currency", "duration_minutes", "activities", "availability"],
  "uncertain_fields": []
}
```

This uses the exact eight fields and array representations in `data/evaluation/voice_listing.json`. Availability uses English lowercase weekdays or `every_day`; activities use the existing canonical IDs where possible, otherwise literal phrases.

`extractor.type` is `small_ai` or `deterministic_fallback`; model, quantization and actual model_size_bytes accompany it. The fallback reports null quantization/size. Error `small_ai_unavailable` means a basic proposal was made using legacy regexes. Error `invalid_model_output` means an empty proposal, all fields missing, and a preserved transcript; it is never treated as valid partial output.

Legacy `POST /api/voice` and `/api/extract` remain compatible. `/api/voice` is marked deprecated and still has its old `demo=true` sample fallback for old clients. **The new UI never calls it.** There is no `backend/api.py` and no new database table.

## Validation and review

The model receives the transcript, source language, explicit JSON Schema and non-invention instructions. Grammar constrains JSON, weekdays, currency syntax and uncertainty field names. The Python wrapper independently rejects invalid JSON, duplicate keys, extra fields, wrong scalar/list types, booleans masquerading as numbers, fractional/negative/oversized prices and invalid durations/days/currency syntax. Prices are integer units from 0 through 1 billion; duration is 1?10080 minutes. Safe whitespace, currency capitalization and duplicate-list normalization are allowed.

Every nonempty model field must supply a verbatim supporting transcript excerpt. Unsupported values become null/empty, with an uncertainty marker. Names, titles and descriptions must occur literally in the transcript; business names are never assembled from a speaker name and sector. Currency is not inferred from language: unspecified pesos/dollars do not identify MXN/USD. Price/duration evidence must mention pricing/currency or duration units respectively. Numeric/list proposals and approximate durations are conservatively marked for review. These are review flags, not calibrated confidence scores.

Evidence matching and schema validation **do not prove semantic truth**. A model can attach a real quote to a mistaken interpretation. Humans must review every proposed fact. The existing evaluator's hallucination count is not a comprehensive factuality audit.

The EN/ID interface exposes speech-language selection (EN/ES/ID), Record, Stop, processing status, an always-editable transcript, Extract/re-extract, manual entry, and editable proposal fields. Missing and uncertain indicators are text, not color alone, and are associated with labelled inputs. Status uses a live region. Edits made while processing take precedence over late results. Changing the transcript blocks confirmation until re-extraction or explicit manual review. Clearing a field preserves null/empty rather than restoring a model value.

Only **Confirm & save** mutates `S.listings`. An experience title is required; unknown price, currency, duration or schedule may remain missing. Confirmation stores the exact structured object, edited transcript, language and confirmation timestamp alongside legacy display fields. It uses existing localStorage persistence and the existing `/api/listings` sync behavior. It does **not** claim Supabase `experiences` persistence; that integration still needs an ownership/experience-selection contract. Listing synchronization happens only after confirmation, and sync success is recorded only after the server accepts the POST. Drafts/audio are in-memory; reloading before confirmation loses them. Postcard IndexedDB/outbox logic is unchanged.

## Offline and failure boundaries

The verified core remains cached PWA, IndexedDB postcards, persistent postcard outbox/reconnect sync, and deterministic Experience DNA. The service worker now caches the voice UI script and still bypasses every API request.

Browser recording may work without network, subject to secure-context microphone permission and MediaRecorder support. Local STT and Small AI run on the **Python host**, not automatically on the phone. A disconnected phone cannot reach that host; a phone on the same local network may reach it without internet. Microphone access normally requires HTTPS (localhost is special). No on-phone offline inference or low-end device feasibility has been demonstrated.

Microphone denial, unsupported recording, failed STT, invalid model output, unreachable backend and request timeouts expose a readable status and retain the transcript/manual fields. Small AI model/runtime unavailability uses the clearly labelled deterministic adapter. That adapter preserves `backend.ai.extract_listing` unchanged for baseline use, but drops its invented display name/location/description and only proposes supported values. Uncertain fallback fields still require review.

TTS remains independent: ElevenLabs online-only, browser Web Speech on offline/provider failure, existing EN/ES/ID speech routing. No ElevenLabs credentials or OpenAI dependencies were added.

## Frozen evaluation

Dataset SHA-256: `bf467c3ce73841c4b3d99d989c11b991d3058949af877eab989c5b82960b78cc` (18 transcripts ? 8 fields). The dataset and expected answers are unchanged.

```powershell
python scripts/evaluate_ai.py
.venv-voice/Scripts/python scripts/evaluate_voice_ai.py
.venv-voice/Scripts/python scripts/voice_runtime_smoke.py
```

The original semantic scorer was moved into `scripts/listing_evaluation.py`; both extractors call it. Original deterministic behavior remains **55/144, 38.19%, 89 missing predictions, 0 evaluator-counted hallucinations**. It remains available under the original result key and `listing_extraction_baseline`. Small AI results are stored independently as `listing_extraction_small_ai` in `voice_ai_evaluation.json`. A missing neural model aborts this evaluation rather than substituting a fallback score. Invalid output counts as an empty prediction, not a skipped case.

Typed output adapts separate business/title fields and canonical activity IDs to the same scoring semantics. Currency required a narrowly scoped correction for typed output: the old scorer only recognized `Rp`/IDR inside its display-price string; new typed currencies are compared directly. The legacy baseline branch is unchanged. Other permissive legacy behavior remains: descriptions count when present, activity/day matching uses expected containment, and numeric scoring uses substrings/hour conversion. These metrics do not measure STT, paraphrase quality, extra activities, or all kinds of hallucination. Benchmark expectations also infer business names and MXN from ambiguous pesos; safety takes priority over those expected answers.

The initial neural run is preserved in `voice_ai_evaluation_initial.json`: **36/144 (25%), 108 missing, 0 counted hallucinations, 10 invalid outputs**. After that run, the grammar was constrained to valid weekday/currency/uncertainty vocabularies; the wrapper also restricted title text and required pricing/duration units in evidence. No expected answers were changed. Its latency overlapped other smoke tests; use the final sequential run for latency reporting.

<!-- FINAL_METRICS -->

## Automated validation and manual speech acceptance

The automatic suites cover supported languages, transcript handling, output validation, absent fields, unavailable-model fallback, explicit metadata, legacy compatibility, frozen dataset/baseline invariance, microphone denial, manual entry, proposal editing, uncertainty markers, no pre-confirmation listing save, persistence after confirmation, invalid-response recovery and late-result isolation. Existing TTS and Phase 2?5 behavior is included in regressions.

<!-- FINAL_TESTS -->

Actual STT runtime smoke: two seconds of generated **silence**, loaded on CPU and safely rejected, 5087.02 ms including cold load. This establishes local model execution, **not** speech accuracy. No WER is claimed.

Natural speech acceptance status:

| Language | Natural recording ? transcript ? proposal ? edit ? confirm/save |
|---|---|
| English | Not performed; human microphone/speech required |
| Spanish | Not performed; human microphone/speech required |
| Bahasa Indonesia | Not performed; human microphone/speech required |

For each language, open the owner Listing screen in a secure browser with the configured host reachable. Select the speech language, record a natural description, and Stop. Inspect the visible transcript and recognized language; correct the transcript before Extract. Inspect all eight fields and missing/uncertain labels. Change one field. Verify no `/api/listings` request before confirmation, then select Confirm & save and verify the local listing plus legacy server synchronization. Repeat with microphone permission denied, STT path missing, GGUF path missing, and host disconnected: core browsing/postcards must work and manual editing must remain available. Record browser/device, spoken words, transcription, language, errors, edited field and saved result for each run.

Suggested utterances (new manual examples, not measured recordings):

- EN: ?We run a family pottery studio. Visitors can shape a cup. The session lasts forty-five minutes. Ask us about the price.?
- ES: ?Tenemos un taller familiar de cer?mica. Los visitantes pueden hacer una taza. La sesi?n dura cuarenta y cinco minutos. Preg?ntenos el precio.?
- ID: ?Kami punya tempat keramik keluarga. Pengunjung bisa membuat cangkir. Kegiatannya empat puluh lima menit. Silakan tanya harganya.?

## Licenses and remaining limits

Qwen GGUF: Apache-2.0, verified official model card. Whisper base conversion: MIT, verified model card. faster-whisper and llama-cpp-python: MIT ([STT license](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE), [LLM runtime license](https://github.com/abetlen/llama-cpp-python/blob/main/LICENSE.md)). Model files are excluded from Git.

The evaluation JSON is existing repository data. No separate redistribution license for `voice_listing.json` was found; do not relabel it CC0 or claim third-party audio provenance. Existing `docs/DATA.md` describes team-authored synthetic demo content as ?Own work.? No external speech dataset was introduced.

This is a measured prototype, not a production factuality guarantee. Natural speech quality, accessibility with a screen reader, real-browser microphone codecs, phone/edge memory, peak process RAM and natural-audio latency remain unmeasured. The small model can omit information or misinterpret a supported quote; manual review remains essential. Existing listing/auth/sync limitations remain. This phase does not change postcard outbox behavior or grant stronger authorization to the legacy listing endpoint.
