# YoloWisata

**Travel local. Stay connected. Even offline.**

YoloWisata is an offline-first tourism web app for small local tourism operators and travelers, built for the World Bank Small AI Hackathon 2026 tourism track.

Small operators can be hard to discover online, struggle to create digital listings, lack a shared language with visitors, and have little help understanding visitor feedback. YoloWisata connects traveler preferences with local experiences, helps owners turn spoken descriptions into listings they review themselves, and presents feedback with supporting evidence.

This README describes the current repository implementation. It does not imply a live production deployment or completed real-world user validation.

## Demo

### Web demo

**https://yolowisata.vercel.app/**

The hosted Vercel version demonstrates the frontend experience, including Travel DNA, business discovery, Plan My Day, and local-first interactions.

### Full AI demo

The complete voice AI workflow uses the local Python backend:
Voice → Faster-Whisper → Qwen → Human review → Local save → Supabase sync 

## Current features

| Traveler | Business owner |
| --- | --- |
| Swipe-based Travel DNA and business match scores | Record a description or type a transcript |
| Business discovery and experience detail pages | Get a structured proposal from a local model |
| **Plan my day** with available time and optional budget | Review missing/uncertain fields and edit before confirming |
| Traveler-to-business messaging and booking requests | Save confirmed listings locally, then sync to Supabase experiences |
| Postcards and the visitor Story/feedback experience | Visitor insights with theme counts, quotes, and evidence labels |
| Phrase cards, prepared translations, and speech playback | Message and booking management |
| Cached browsing and local-first interactions | Clear saved, syncing, retry, and sync-needs-attention feedback |

The interface supports English and Indonesian. Owner voice processing accepts English, Spanish, and Indonesian speech/transcripts. Messaging uses prepared phrases and stored translations; it is **not** unrestricted machine translation.

## AI and deterministic features

| Component | Actual role and runtime |
| --- | --- |
| **Faster-Whisper** | Speech-to-text for owner onboarding. The default is `Systran/faster-whisper-base`, loaded on the Python host with CPU `int8` inference after model setup. |
| **Qwen 2.5 1.5B Instruct** | Small local language model that converts transcripts into structured listing proposals. Default: `Qwen/Qwen2.5-1.5B-Instruct-GGUF`. It does not save or publish listings autonomously. |
| **llama-cpp-python / GGUF** | Runs the Qwen `Q4_K_M` quantized model on CPU (`n_gpu_layers=0`). Current configuration: 4096-token context, temperature 0, seed 42. |
| **Travel DNA** | Deterministic swipe preferences across six dimensions, compared with existing business DNA through `matchOf(b)`. Not an LLM. |
| **Plan My Day** | Deterministic frontend selection using existing businesses/listings, DNA scores, time, and budget. Not an LLM itinerary generator; building a plan needs no network request. |
| **Visitor insights** | Multilingual keyword/theme analysis with counts, supporting quotes, and evidence-strength labels. Uses Supabase records when available and a local fallback otherwise; not generative business advice. |

Optional speech playback is separate: configured ElevenLabs TTS uses the network, with browser speech synthesis as a fallback where suitable voices are installed. It is not used for STT or listing extraction.

### Voice listing workflow

```text
Browser recording -> /api/voice/transcribe -> local Faster-Whisper
                  -> editable transcript
                  -> /api/voice/proposal -> local Qwen + strict validation
                  -> editable proposal -> human Confirm & save
                  -> localStorage -> existing outbox -> /api/listings
                  -> Supabase experiences -> compatibility mirror
```

Proposal fields are `business_name`, `experience_title`, `description`, `price`, `currency`, `duration_minutes`, `activities`, and `availability`. Schema/type checks and transcript-evidence checks reject or flag unsupported information. Missing information stays null/empty; validation does not guarantee that every interpretation is correct.

- Recording is limited to 60 seconds and uploads to 8 MB. Transcript input is limited to 4000 characters. The frontend processing timeout is 180 seconds.
- Processing endpoints do not persist listings. Proposals carry `requires_confirmation: true`; the user must review and select **Confirm & save**.
- If Qwen is unavailable, a clearly identified `deterministic_fallback` proposal can return with `error: "small_ai_unavailable"`.
- Strict validation failure can intentionally return HTTP 200 with `error: "invalid_model_output"` and an empty listing. The frontend still opens the editable review form, preserves the transcript, flags fields for review, and invites manual completion.
- Failed transcription does not substitute sample speech in this workflow. Manual transcript and field entry remain available.
- Drafts and recorded audio are in memory: reloading before confirmation loses them. Confirmed listings are persisted locally.

### Confirmed listings and Supabase

The dedicated `POST /api/listings` route accepts the existing `{id, L, ts}` outbox payload and uses **`L.structured`**, not formatted display strings, as its persistence source.

- Business resolution accepts a real Supabase UUID or the exact demo alias `noor`; no fuzzy name matching.
- Zero active experiences creates one; exactly one updates it; multiple active experiences return HTTP 409 rather than guessing.
- Updates own the title, description, price, currency, duration, activities, availability days, and revision. Experience ID, business ID, capacity, start times, experience DNA, active status, and other columns are preserved.
- Null/omitted optional scalars and untouched empty arrays mean “not stated” and preserve existing database information. Deliberately cleared activity/day selections are marked through `L.confirmed_empty_fields`. `every_day` becomes seven explicit weekdays.
- Save timestamps, compatibility-store receipts, and stored-value comparisons prevent ordinary retries from incrementing revision again. A real later change increments revision.
- Supabase is written before the original record is mirrored into `data/store.json` for `/api/sync`. A subsequent mirror-write failure is logged without reporting the successful Supabase write as failed.

Owners immediately see **saved on this device / syncing** or **waiting to sync**. Success feedback appears on the owner's listing screen only after the POST succeeds. Network/5xx failures remain retryable; permanent 4xx failures retain the local listing, show **sync needs attention**, and stop endless retries of that operation.

Local registrations with IDs such as `c...` are **not automatically Supabase businesses**. Their listings remain local if server resolution fails. Business-registration migration is separate work.

### Plan My Day

Open **✨ Plan my day** from Explore, Travel DNA, or Matches. Complete Travel DNA first, choose 2/4/6/8 hours, optionally enter a budget in the displayed listing currency, then select **Build my plan**.

The planner ranks `all()` businesses by the existing `matchOf(b)` score and reads their current `Lst(b)` listings, including local overrides. It greedily selects up to three experiences within the listed-duration limit and known-price budget. Ties use the existing business order; it does not optimize a route or guarantee the maximum number of stops.

- Structured values take precedence; only unambiguous legacy duration/price formats are parsed.
- Missing or unclear durations are excluded. Approximate source durations stay marked approximate.
- Missing prices remain unknown, never zero. The budget constrains known prices only, so the final cost is not guaranteed when prices are missing.
- Same-currency known prices can be totaled. Mixed currencies are shown individually; with a budget, known prices in other currencies are excluded. No exchange rate is invented.
- Explanations use shared DNA preferences and time fit. No businesses, activities, prices, durations, travel times, opening times, or clock schedules are generated.

The bundled Noor, Darto, and Sari listings last about 3, 2, and 3 hours, so a four-hour plan may contain only one experience. Genuine shorter local listing overrides can allow more; the planner does not shorten experiences to improve the demo.

## Offline boundaries and architecture

The frontend is plain HTML, CSS, and JavaScript with no build step. FastAPI serves APIs and can serve the frontend from the same origin. Supabase PostgreSQL backs migrated online operations; a JSON compatibility store still supports existing sync and login behavior.

| Layer | Responsibility |
| --- | --- |
| Service worker | Caches the app shell and content after an initial successful load. API requests bypass the cache. |
| Browser localStorage | App state, Travel DNA, confirmed listings, messages/bookings, and existing sync state. |
| Browser IndexedDB | Postcards and their persistent outbox operations. |
| FastAPI host | API adapters, local STT/model inference, deterministic insights, and compatibility mirroring. |
| Supabase | Businesses/experiences and migrated postcard, message, booking, and confirmed-listing operations. |
| `data/store.json` | Legacy sync mirrors, registration/account compatibility, and listing retry receipts. Requires writable persistent storage. |

Cached browsing, DNA, planning, and local saves work without internet. Synchronization retries when connectivity returns while the app is running; this is not a guarantee of background sync after closing it. Cross-device updates use existing API polling, approximately every eight seconds, rather than Supabase Realtime.

**Local AI runs on the Python host, not inside the browser or automatically on a phone.** Installed models need no cloud inference service, but the browser must still reach that host. Supabase sync needs connectivity to Supabase. Recording may work offline depending on browser support and permissions; processing cannot reach a disconnected host. Normal service-worker/microphone use requires HTTPS or localhost.

## Run locally

Run commands from the repository root. Python 3.12 is the runtime recorded in the repository's local voice evidence. Node.js is needed for JavaScript tests, not for serving the frontend.

### 1. Install Python dependencies

Windows PowerShell:

```powershell
python -m venv .venv-voice
.venv-voice/Scripts/Activate.ps1
python -m pip install -r backend/requirements.txt
```

macOS/Linux:

```sh
python3 -m venv .venv-voice
. .venv-voice/bin/activate
python -m pip install -r backend/requirements.txt
```

`llama-cpp-python` may require a compatible CPU wheel or a C++/CMake toolchain. The repository's [voice setup notes](docs/VOICE_AI.md#setup-windows-powershell-repository-root) include the CPU-wheel command used for the Windows setup.



### 2. Configure environment variables

Create `backend/.env` locally. **Never commit this file or real API keys.**

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SIDE_SECRET

YOLO_WHISPER_MODEL=models/faster-whisper-base
YOLO_LISTING_MODEL=models/qwen2.5-1.5b-instruct-q4_k_m.gguf
YOLO_AI_THREADS=4

# Optional: only needed for ElevenLabs voice output
ELEVENLABS_API_KEY=YOUR_ELEVENLABS_API_KEY

Use an existing configured Supabase project or apply [supabase/migrations](supabase/migrations) in filename order to a suitable development project. Review [supabase/seed.sql](supabase/seed.sql) before loading demo records. The backend does not provision the database at startup; it requires the Supabase URL and secret even if you only intend to exercise voice processing.

Keep the Supabase secret on the server, never in `frontend/config.js` or Git. `YOLO_STORE` overrides the default `data/store.json` path. `ELEVENLABS_API_KEY` is optional for online TTS, not required for local STT/Qwen.

### 3. Install local voice models

```sh
python scripts/setup_voice_models.py
```

This explicit step needs internet. It downloads the Qwen Q4_K_M GGUF and Faster-Whisper base files into `models/`, verifies the GGUF checksum, and records model revisions/evidence. Model weights and virtual environments are gitignored. Normal requests use installed models rather than downloading them. Use the repository root or configure absolute model paths.

### 4. Start the app

#### Windows: easiest option
After the one-time dependency and model setup, run:

```powershell
.\run.bat
```
#### Others options

```sh
python scripts/export_static.py
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000/**. FastAPI serves `/config.js` with the current origin as the API address. Interactive API documentation is at `/docs`.

After setup, Windows `run.bat` uses `.venv-voice` when present, exports static data, and starts port 8000. `run.sh` installs requirements, exports data, and starts on `0.0.0.0:8000`; use an activated environment and an appropriate trusted network. Neither launcher installs model weights or provisions Supabase.



### Frontend-only preview

```sh
python -m http.server 8000 --directory frontend
```

The checked-in `frontend/config.js` has `api: ""`. Browsing, Travel DNA, planning, manual listing entry, and local interactions can be demonstrated this way, but there is no server sharing, server login, Whisper/Qwen processing, or Supabase sync.

## Suggested demo walkthrough

1. **Traveler:** complete Travel DNA → view matches → open Plan my day → choose time/budget → inspect actual listing values and match explanations.
2. **Owner:** select the Noor demo business → record or type a description → correct the transcript → extract a proposal → edit missing fields → **Confirm & save** → observe local-save and actual sync feedback.
3. **Connection loss:** save locally while disconnected, then reconnect with the app open and watch retry/sync status. Do not promise a synced custom business before its database migration.
4. **Feedback:** explore visitor Story/postcards and owner insights, including the quotes and evidence labels behind theme counts. Use two browser sessions with a configured backend for messages and booking decisions.

Bundled businesses and sample feedback are demo data. GPS permission is real, but the fictional Ondera map uses its village-gate position rather than plotting the actual coordinates. Postcard voice-note attachment remains a simulated marker, separate from real owner voice recording. Booking requests are not payments or automatic confirmations.

## API map

| Method and path | Current purpose |
| --- | --- |
| `GET /api/health` | Backend/database status and a speech-model configuration flag; not an end-to-end inference test. |
| `GET /api/content` | Bundled application content. |
| `GET /api/businesses`, `GET /api/businesses/{biz_id}` | Supabase business reads. |
| `GET /api/experiences`, `GET /api/postcards` | Supabase experience/postcard reads. |
| `POST /api/voice/transcribe` | Multipart `audio` + `language` → local STT transcript. |
| `POST /api/voice/proposal` | JSON transcript/language → validated, unconfirmed proposal. |
| `POST /api/listings` | Confirmed structured listing → Supabase experience, then legacy mirror. |
| `POST /api/postcards`, `/api/messages`, `/api/bookings`, `/api/bookingstatus` | Dedicated Supabase-backed adapters for current frontend payloads. |
| `GET /api/businesses/{biz_id}/insights` | Deterministic visitor insights with database evidence. |
| `GET /api/sync` | Compatibility records used by frontend polling. |
| `POST /api/login` | Demo phone/PIN account identification in the compatibility store. |
| `POST /api/tts` | Optional ElevenLabs speech playback. |
| `POST /api/{kind}` | Remaining legacy writes, including local business registration. Specific routes take precedence. |
| `POST /api/extract`, deprecated `POST /api/voice` | Legacy extraction/audio contracts. The old audio route can return demo sample text; the current owner UI does not use it. |

## Repository guide

| Path | Role |
| --- | --- |
| [frontend/app.js](frontend/app.js) | Screens, Travel DNA, matching, planner, actions, and existing sync. |
| [frontend/voice-listing.js](frontend/voice-listing.js) | Recording, proposal review, accessible controls, confirmation, and listing feedback. |
| [frontend/offline-db.js](frontend/offline-db.js) | IndexedDB postcard/outbox storage. |
| [frontend/sw.js](frontend/sw.js) | Cached shell and offline loading. |
| [backend/main.py](backend/main.py) | FastAPI routes, Supabase adapters, compatibility store, and static serving. |
| [backend/listing_ai.py](backend/listing_ai.py) | Local Qwen inference, validation, and labelled deterministic fallback. |
| [backend/voice.py](backend/voice.py) | Local Faster-Whisper STT and independent optional TTS. |
| [backend/ai.py](backend/ai.py) | Legacy deterministic extraction and theme/insight analysis. |
| [backend/database.py](backend/database.py) | Server-side Supabase configuration. |
| [data/content.json](data/content.json) | Authoritative bundled content, exported to `frontend/data/content.json`. |
| [scripts](scripts) | Content import/export, model setup, evaluation, and runtime smoke tools. |
| [tests](tests) | API, planner, voice, persistence, and offline/sync regressions. |

See [docs/DATA.md](docs/DATA.md) for demo data provenance and formats. Older phase documents describe earlier stages: statements that Supabase listing writes are not integrated are superseded by the current route documented here. Analysis/audit tables in the SQL schema do not imply that the current code persists every AI run to them.

## Tests and recorded evidence

With Python dependencies installed and backend environment variables configured:

```sh
python -m unittest discover -s tests -p "test_*.py"
node --test tests/test_day_planner.js tests/test_phase3_frontend.js tests/test_phase4_frontend.js tests/test_phase5_frontend.js tests/test_phase5_offline_db.js tests/test_phase6_frontend.js
```

These suites use mocked services and temporary storage. They cover listing field preservation/idempotency, local-first sync feedback/retries, invalid-model-output manual review, accessibility associations, deterministic planning, and existing traveler/owner behavior. `tests/check_*_live.py` are separate live integration scripts, not part of the mocked test command.

Optional model evaluations and smoke checks:

```sh
python scripts/evaluate_ai.py
python scripts/evaluate_voice_ai.py
python scripts/voice_runtime_smoke.py
```

Artifacts under [data/processed](data/processed) include [model evidence](data/processed/voice_model_evidence.json), [voice evaluation](data/processed/voice_ai_evaluation.json), and [runtime smoke evidence](data/processed/voice_runtime_smoke.json). These are measurements from specific runs, not promises about current hardware or speech accuracy. The recorded STT smoke test loaded the CPU model and rejected generated silence; it did **not** measure natural-speech accuracy or word error rate. The voice notes leave natural EN/ES/ID microphone acceptance testing outstanding.

## Deployment and remaining limits

- **Deployment options, not live-status claims:** the static frontend includes [Vercel configuration](frontend/vercel.json) and needs no build command. A separately hosted frontend must set its API origin in `frontend/config.js`; configure backend `YOLO_ORIGINS` accordingly. Use HTTPS for remote microphone/service-worker support.
- **Backend requirements:** Python, installed CPU model files for voice AI, Supabase access, and persistent writable compatibility storage. A static deployment alone cannot supply these. Export content after editing `data/content.json`; manage the service-worker cache version when releasing frontend changes.
- **Demo authentication:** phone/PIN login identifies accounts, but API endpoints do not enforce complete caller authorization. There is no SMS verification or PIN reset. This is not ready for unrestricted public use with sensitive personal data.
- **Partial migration:** discovery starts from bundled content plus local/custom records and listing mirrors, not a full Supabase catalog browser. Local business registration is not migrated. Multiple active experiences need explicit selection. Presentation-only legacy listings need structured reconfirmation.
- **Persistence limits:** retry receipts and cross-device compatibility still depend on the JSON store. Supabase success plus mirror failure can delay visibility through polling; this is not distributed transactional sync.
- **AI limits:** validation and human review reduce risk but do not establish factual correctness. CPU latency varies. No on-phone inference, low-end-device feasibility, or general multilingual translation capability is claimed.
- **Planner limits:** listed durations exclude travel and do not verify opening hours, availability, or booking acceptance. Unknown prices make budgets incomplete; currencies are never converted.

The current build is a hackathon prototype with real local inference and Supabase-backed operations, alongside explicit demo data and compatibility paths.

## Team & Credits

YoloWisata was built by a two-person team working asynchronously across a 12-hour time difference.

| Team member | Focus | Contributions |
| --- | --- | --- |
| **Esme** | **Backend, AI integration, data, and system integration** | FastAPI backend · Supabase integration · Faster-Whisper and Qwen voice-listing pipeline · Offline synchronization and persistence · Testing, debugging, and AI evaluation · Backend/frontend integration · Paper Documentation|
| **Olip** | **Product concept, frontend, visual design, and user experience** | Product ideation and tourism experience design · Frontend interface and interaction design · Visual direction and styling · Traveler and business user flows · Usability feedback and frontend iteration · Demo and presentation support · Video Editing · Paper Documentation· |
### AI-assisted development

We also used AI development tools including Claude, ChatGPT / OpenAI Codex, Cursor, Antigravity, and Entire for brainstorming, implementation support, debugging, testing, and code review.

All final product decisions, integrations, testing, and submission choices were made by the team.

Built for the **World Bank Small AI Hackathon 2026**.