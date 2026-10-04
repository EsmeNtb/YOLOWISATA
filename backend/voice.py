import os
import io
import logging
import threading
import time
from pathlib import Path

import httpx


class STTUnavailable(Exception):
    pass


class STTError(Exception):
    pass


_stt_model = None
_stt_name = None
_stt_lock = threading.Lock()
_logger = logging.getLogger(__name__)
_REPO_ROOT = Path(__file__).resolve().parent.parent


def transcribe_audio(audio: bytes, language: str) -> dict:
    """CPU int8 multilingual STT on the Python host. Never downloads during requests."""
    global _stt_model, _stt_name
    if language not in ("en", "es", "id"):
        raise ValueError("Unsupported speech language")
    configured_name = os.environ.get("YOLO_WHISPER_MODEL", "").strip()
    model_path = Path(configured_name) if configured_name else Path("models/faster-whisper-base")
    if not model_path.is_absolute() and (_REPO_ROOT / model_path).exists():
        model_path = _REPO_ROOT / model_path
    name = str(model_path)
    started = time.perf_counter()
    with _stt_lock:
        try:
            from faster_whisper import WhisperModel
            if _stt_model is None or _stt_name != name:
                _stt_model = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True,
                                          cpu_threads=int(os.environ.get("YOLO_AI_THREADS", "4")))
                _stt_name = name
        except Exception:
            _logger.exception("Local Whisper model initialization failed")
            raise STTUnavailable("Local speech model unavailable; type your transcript instead.") from None
        try:
            # BytesIO also avoids Windows NamedTemporaryFile sharing restrictions.
            segments, info = _stt_model.transcribe(io.BytesIO(audio), language=None, beam_size=3, vad_filter=True)
            if info.duration > 60:
                _logger.warning("Rejected STT audio over duration limit (seconds=%.2f)", info.duration)
                raise STTError("Record up to 60 seconds at a time.")
            transcript = " ".join(segment.text.strip() for segment in segments).strip()
            if not transcript or info.language not in ("en", "es", "id"):
                _logger.warning("STT produced no supported transcript (language=%s, seconds=%.2f, empty=%s)",
                                info.language, info.duration, not bool(transcript))
                raise STTError("No supported speech recognized; type or try again.")
            return {"transcript": transcript, "language": info.language, "requested_language": language,
                    "model": name, "device": "cpu", "compute_type": "int8",
                    "processing_ms": round((time.perf_counter() - started) * 1000, 2)}
        except STTError:
            raise
        except Exception:
            _logger.exception("Local Whisper audio decode/transcription failed (language=%s, bytes=%d)", language, len(audio))
            raise STTError("Could not transcribe audio; type your transcript instead.") from None


ELEVENLABS_VOICE_IDS = {
    "id": "3mAVBNEqop5UbHtD8oxQ",
    "es": "htFfPSZGJwjBv1CL0aMD",
    "en": "s3TPKV1kjDlVtZbl4Ksh",
}


class TTSNotConfigured(Exception):
    pass


class TTSError(Exception):
    pass


async def synthesize_speech(text: str, language: str, speed: float = 1.0) -> bytes:
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise TTSNotConfigured

    voice_id = ELEVENLABS_VOICE_IDS[language]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": api_key,
                    "accept": "audio/mpeg",
                    "content-type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"speed": speed},
                },
            )
            response.raise_for_status()
            if not response.content:
                raise TTSError
            return response.content
    except TTSError:
        raise
    except Exception:
        raise TTSError from None
