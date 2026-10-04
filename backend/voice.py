import os

import httpx


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