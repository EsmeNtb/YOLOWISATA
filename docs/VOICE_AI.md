# YoloWisata Voice AI Implementation Specification

This document details the architecture and implementation plan for adding Accessible AI / Voice capabilities to the YoloWisata platform, specifically targeting small tourism operators in English (en), Spanish (es), and Bahasa Indonesia (id).

## A. Final Pipeline Architecture

The primary goal is to let a business owner speak to their phone to update their listing. The pipeline operates as follows:

1. **Audio Capture**: The user records their voice on the device.
2. **STT (Speech-to-Text)**: Audio is transcribed into raw text.
3. **Transcript**: The raw text is preserved for reference.
4. **Structured Extraction**: The transcript is passed to a small Large Language Model (LLM) instructed to extract specific listing fields into a strict JSON schema.
5. **Validation**: The extracted JSON is checked for correct data types (currencies, prices, durations) against expected validation rules.
6. **Missing / Uncertain Fields**: The LLM flags any fields that are missing or ambiguous.
7. **Human Confirmation**: The extracted proposal is presented in the UI alongside the raw transcript. The owner reviews and edits before any data is permanently stored.
8. **Save**: The confirmed listing data is persisted to the local database / backend.
9. **Optional Online TTS (Text-to-Speech)**: Synthesize audio for text playback when requested by the user.

### Offline vs. Online Capabilities

- **Guaranteed Core Offline**:
  - cached PWA / local UI
  - IndexedDB persistence
  - postcard outbox
  - local deterministic Experience DNA fallback

- **Voice Capability to Be Validated**:
  - offline audio capture
  - local STT
  - local small-model structured extraction

  These features depend on the runtime, device resources, and models actually
  implemented and tested. They must not be described as guaranteed offline
  behavior until measured in the target environment.

- **Online Optional**:
  - ElevenLabs TTS

  ElevenLabs remains optional. Failure or lack of connectivity must never prevent
  the user from reading, editing, or saving information.

## B. Voice Extraction Contract

The extractor must output a deterministic JSON structure.

### Expected JSON Schema
```json
{
  "language": "id",
  "transcript": "...",
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
  "missing_fields": ["business_name", "price", "currency", "duration_minutes", "activities", "availability"],
  "uncertain_fields": ["experience_title", "description"]
}
```

### Core Extraction Rules
* **Never invent information**: If a field is not explicitly stated in the transcript, it must remain `null` or `[]` (empty list).
* **Uncertain values must be flagged**: If the speaker is vague, the corresponding field should be logged in `uncertain_fields`.
* **Proposal Only**: The AI output serves strictly as a draft. The owner must manually confirm or edit the fields before persistence.
* **Preserve Transcript**: Always store the raw transcript so the owner can review exactly what the AI heard.

### Validation Rules
* **Prices**: Must be integers. Strings like "150 ribu" must be evaluated and converted to `150000`.
* **Currencies**: Must be standard ISO codes (e.g. `IDR`, `MXN`, `USD`). The model should not assume currency based solely on language unless explicitly identifiable.
* **Durations**: Must be parsed into integer `duration_minutes`. E.g. "two hours" -> `120`.
* **Availability**: Must be a list of normalized standard day identifiers (e.g., `["monday", "tuesday"]` or `["every_day"]`).
* **Activities**: Expected to map to a standardized list of internal activity IDs (e.g., `farm_walk`, `coffee_roasting`) where possible, falling back to literal phrases only if they do not match.

## C. Model Interfaces

The implementation should decouple the application logic from any specific AI provider via implementation-independent Python interfaces.

```python
def transcribe_audio(audio: bytes, language: str = None) -> dict:
    """
    STT Provider Interface.
    Takes raw audio bytes and an optional language hint.
    Returns a dictionary containing the raw transcript string.
    """
    pass

def extract_listing(transcript: str, language: str) -> dict:
    """
    Structured Extraction Interface.
    Takes a raw transcript and language.
    Returns a validated dictionary matching the structured JSON contract.
    """
    pass

def synthesize_speech(text: str, language: str) -> bytes:
    """
    TTS Provider Interface.
    Takes text and language.
    Returns audio bytes.
    """
    pass
```

### Decoupling Benefits
* **STT**: The interface allows easily swapping `Whisper`, `whisper.cpp`, `faster-whisper`, or future, more efficient alternatives.
* **Extraction**: Allows pivoting between a small Qwen instruct model, a remote API, or specialized rule-based fallback without rewriting application logic.
* **TTS**: Keeps ElevenLabs isolated behind an interface, enabling graceful fallback to native device/browser TTS when offline or if the request fails.

## D. Model Options

To ensure feasibility within the constraints of a small prototype/hackathon running on consumer hardware:

### Speech-to-Text (STT) Options
* **Whisper**: Highly accurate but heavy and slow without a dedicated GPU.
* **faster-whisper**: A reimplementation of Whisper using CTranslate2. Significant speed and memory improvements. Highly suited for CPU execution.
* **whisper.cpp**: Ultra-lightweight C++ port with Python bindings. Best for raw CPU edge constraints, minimal dependencies.

**STT Tradeoffs**: Smaller models (e.g., `tiny`, `base`) run very fast on CPU and consume little RAM (<1GB), but struggle with multilingual accuracy (particularly Indonesian). `small` or `medium` offer better multilingual support but require more RAM (2-5GB).

### Structured Extraction Options
* **Quantized 1.5B - 3B Instruct Models** (e.g., Qwen2.5-1.5B/3B, Llama-3.2-3B): Lightweight LLMs capable of instruction following and JSON generation. This is the **primary target** for a "Small AI" prototype when hardware and runtime constraints are evaluated.
* **llama.cpp / GGUF Models (7B-8B)**: Larger quantized instruct models (like a quantized Llama-3-8B or Qwen-7B) can offer stronger JSON reliability and multilingual behavior, but they represent a heavier fallback/development option if the hardware permits it and the runtime remains acceptable.

**Extraction Tradeoffs**: Smaller models (around 1.5B-3B parameters) are the main target for small-device feasibility studies, but they must still be validated on RAM, latency, and extraction quality. A quantized 7B/8B model may be useful as a heavier fallback, but it should not be described as a device-feasible default without measurement.

### Recommended Configurations
* **Demo-Safe (Recommended Primary)**:
  * STT: `faster-whisper` (`small` or `base` model).
  * Extraction: Quantized multilingual model around 1.5B–3B parameters (e.g., Qwen2.5-1.5B Instruct) via `llama.cpp` for balanced JSON capability and CPU feasibility.
* **Heavier Fallback (If hardware permits)**:
  * STT: `faster-whisper` (`small`).
  * Extraction: Quantized 7B-8B model (e.g., Llama-3-8B), only where runtime, RAM, and latency measurements support it.
* **Lighter Fallback**:
  * STT: `whisper.cpp` (`tiny` model).
  * Extraction: Continue using the current deterministic regex fallback baseline (no LLM).

*Note: Current repository uses a mock STT and a regex-based extractor. Do not claim any model is device-feasible until runtime, RAM, latency, and extraction quality are measured. LLM feasibility estimates are based on general industry benchmarks, not currently verified repository facts.*

## E. ElevenLabs TTS Design

The TTS feature will be an optional, backend-only enhancement utilizing ElevenLabs.

### Voice Mapping
* **ID (Bahasa Indonesia)**: `3mAVBNEqop5UbHtD8oxQ`
* **ES (Spanish)**: `htFfPSZGJwjBv1CL0aMD`
* **EN (English)**: `s3TPKV1kjDlVtZbl4Ksh`

### Security
The future API key must be defined as `ELEVENLABS_API_KEY` in `backend/.env`. It must **never** be exposed or bundled in the frontend source code.

### Proposed Endpoint
A future `POST /api/tts` route should be added using the repository's existing backend routing structure, preferably in `backend/main.py`.

**Input:**
```json
{
  "text": "Selamat pagi, nama saya Noor.",
  "language": "id"
}
```

**Output:**
An audio stream representing the spoken text.

### Requirements
* **Backend Only**: Prevents key leakage.
* **Graceful Failure**: If offline or if the API key fails, the UI must quietly discard the audio attempt. The text remains readable.
* **Non-blocking**: Core offline usability (reading listings/messages) must not be hindered by TTS loading or failures.

Provider/model logic should remain isolated behind `backend/ai.py` or a future dedicated voice helper only if that separation is genuinely useful. The goal is to keep the route logic simple and consistent with the existing backend structure.

## F. Evaluation Mapping

Any new LLM-based voice extractor must be benchmarked against the deterministic baseline already established in the repository.

### Baseline Reference
* **Dataset**: `data/evaluation/voice_listing.json`
* **Evaluator script**: `scripts/evaluate_ai.py`
* **Current Baseline Results**: `data/processed/evaluation_results.json` (Approx. 38.2% overall field accuracy, 0 hallucinated fields).

### Success Criteria
Future models replacing `backend.ai.extract_listing` must demonstrate:
1. **Substantial Accuracy Improvement**: The overall field accuracy must noticeably improve beyond the 38.2% benchmark across all tested languages (EN, ES, ID).
2. **Preserved Low Hallucinations**: Hallucinations must remain at or near 0. Inventing information is unacceptable for business listings.
3. **Correct Missing Behaviors**: Missing fields in the audio must explicitly map to `null` in the JSON, matching expected behavior.

### Note on Experience DNA Challenge
If the Small AI model is also used to upgrade Experience DNA theme extraction, it must be evaluated against the `tourism_feedback_challenge.json` dataset.
- This dataset is a **synthetic lexical generalization stress test**, intentionally constructed after inspecting the deterministic keyword vocabulary to reduce lexical overlap.
- It exposes keyword-matcher brittleness and is **NOT** an independent real-world benchmark.
- This challenge set must remain **frozen** before evaluating the future Small AI model to prevent data leakage.
- Future model results must always be reported on **BOTH** the standard set (`tourism_feedback.json`) and the challenge set to measure true generalization.

## G. Implementation Plan

The ordered plan is constrained to ensure hackathon feasibility.

### P0: Required for Judging/Demo
1. **Voice Capture and Multilingual STT**: Capture voice/audio and transcribe English (EN), Spanish (ES), and Indonesian (ID) speech.
2. **Small AI Structured Extraction**: Integrate a quantized multilingual 1.5B–3B Small AI model to extract listing fields into the structured JSON contract.
3. **Deterministic Fallback**: Preserve deterministic regex extraction as a fallback for unavailable or failed model inference; it is not the primary final implementation.
4. **Human Review Before Saving**: Present the raw transcript and extracted proposal for the owner to review and edit before saving.
5. **Voice Listing Evaluation**: Evaluate extraction against `data/evaluation/voice_listing.json`.
6. **Safety and Missing-Field Checks**: Check for hallucinated fields and verify missing information remains `null` or `[]` as specified by the extraction contract.
7. **Experience DNA Evaluation, If Upgraded**: If Small AI is also used for Experience DNA, evaluate against BOTH `tourism_feedback.json` and `tourism_feedback_challenge.json`.

### P1: Valuable Enhancement
1. **Supabase Persistence Improvements**: Update production API routes to persist the confirmed JSON structure to Supabase.
2. **Runtime Optimization**: Measure and optimize model loading, RAM use, and inference latency for supported devices.

### P2: Nice-to-Have
1. **ElevenLabs TTS Integration**: Add a `POST /api/tts` route using the existing backend routing structure, preferably in `backend/main.py`.
2. **TTS Frontend Playback**: Add a "Play Audio" button to the frontend for translations and listings, catching errors gracefully when offline.

### Impacted Files
* `frontend/app.js` (UI for recording, review, playback)
* `frontend/index.html` (DOM changes for Voice UI)
* `frontend/app.css` (Voice UI styling)
* `backend/main.py` (existing backend router and route registration)
* `backend/ai.py` (implementation of model interfaces, replacing regex)
* `backend/.env` (ElevenLabs API key)
* `backend/requirements.txt` (runtime dependencies such as `faster-whisper` if needed)
