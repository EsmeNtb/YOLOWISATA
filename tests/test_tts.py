import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main, voice


class FakeResponse:
    content = b"fake-mp3"

    def raise_for_status(self):
        return None


class FakeClient:
    calls = []

    def __init__(self, **kwargs):
        self.options = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, headers, json):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse()


class TextToSpeechTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        FakeClient.calls = []

    def test_endpoint_uses_language_voice_and_returns_audio(self):
        cases = {
            "id": "3mAVBNEqop5UbHtD8oxQ",
            "es": "htFfPSZGJwjBv1CL0aMD",
            "en": "s3TPKV1kjDlVtZbl4Ksh",
        }
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test-only-key"}), \
                patch.object(voice.httpx, "AsyncClient", FakeClient):
            for language, voice_id in cases.items():
                response = self.client.post(
                    "/api/tts",
                    json={"text": "Hello there", "language": language},
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["content-type"], "audio/mpeg")
                self.assertEqual(response.content, b"fake-mp3")
                self.assertIn(voice_id, FakeClient.calls[-1]["url"])
                self.assertEqual(FakeClient.calls[-1]["json"]["text"], "Hello there")
                self.assertEqual(FakeClient.calls[-1]["json"]["voice_settings"]["speed"], 1.0)

    def test_custom_speed_is_forwarded_for_this_request(self):
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test-only-key"}), \
                patch.object(voice.httpx, "AsyncClient", FakeClient):
            response = self.client.post(
                "/api/tts",
                json={"text": "Pelan-pelan", "language": "id", "speed": 0.8},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(FakeClient.calls[-1]["json"]["voice_settings"]["speed"], 0.8)

    def test_integer_normal_speed_is_accepted(self):
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test-only-key"}), \
                patch.object(voice.httpx, "AsyncClient", FakeClient):
            response = self.client.post(
                "/api/tts",
                json={"text": "Hello", "language": "en", "speed": 1},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(FakeClient.calls[-1]["json"]["voice_settings"]["speed"], 1.0)

    def test_invalid_language_is_rejected(self):
        response = self.client.post(
            "/api/tts",
            json={"text": "Hola", "language": "fr"},
        )
        self.assertEqual(response.status_code, 422)

    def test_specific_tts_route_precedes_legacy_catch_all(self):
        paths = [route.path for route in main.app.routes]
        self.assertLess(paths.index("/api/tts"), paths.index("/api/{kind}"))

    def test_blank_or_oversized_text_is_rejected(self):
        self.assertEqual(
            self.client.post("/api/tts", json={"text": "  ", "language": "id"}).status_code,
            400,
        )
        self.assertEqual(
            self.client.post("/api/tts", json={"text": "x" * 1001, "language": "id"}).status_code,
            422,
        )

    def test_speed_must_be_numeric_and_within_supported_range(self):
        for speed in (0.69, 1.21, "0.8", True):
            with self.subTest(speed=speed):
                response = self.client.post(
                    "/api/tts",
                    json={"text": "Hello", "language": "en", "speed": speed},
                )
                self.assertEqual(response.status_code, 422)

    def test_missing_key_fails_safely(self):
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": ""}), \
                patch.object(voice.httpx, "AsyncClient", FakeClient):
            response = self.client.post(
                "/api/tts",
                json={"text": "Berapa harganya?", "language": "id"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"detail": "Speech synthesis is not configured."})
        self.assertNotIn("test-only-key", response.text)
        self.assertNotIn("ELEVENLABS_API_KEY", response.text)
        self.assertNotIn("elevenlabs", response.text.lower())

    def test_upstream_failure_does_not_expose_provider_details(self):
        class FailedClient(FakeClient):
            async def post(self, *args, **kwargs):
                raise RuntimeError("provider secret detail")

        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "test-only-key"}), \
                patch.object(voice.httpx, "AsyncClient", FailedClient):
            response = self.client.post(
                "/api/tts",
                json={"text": "Hello", "language": "en"},
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Speech synthesis is temporarily unavailable."})
        self.assertNotIn("provider secret detail", response.text)


if __name__ == "__main__":
    unittest.main()