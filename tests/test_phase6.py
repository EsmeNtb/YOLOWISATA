"""Voice API and validation without downloading models or contacting Supabase."""
import hashlib
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from backend import ai, listing_ai as listing, main, voice
from scripts.listing_evaluation import score_listings


class VoiceListingTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.text = "Visit Blue Farm. Roast coffee for ninety minutes. Price 150000 rupiah."
        self.fields = {**listing.empty_listing(), "business_name": "Blue Farm", "description": "Roast coffee for ninety minutes.",
                       "price": 150000, "currency": "idr", "duration_minutes": 90, "activities": ["coffee_roasting"]}
        self.output = {"listing": self.fields, "uncertain_fields": ["duration_minutes"],
                       "evidence": {"business_name": "Blue Farm", "description": "Roast coffee for ninety minutes.",
                                    "price": "150000 rupiah", "currency": "rupiah", "duration_minutes": "ninety minutes", "activities": "Roast coffee"}}

    def test_valid_json_normalization_and_missing(self):
        fields, uncertain = listing.validate_output(json.dumps(self.output), self.text)
        self.assertEqual(fields["currency"], "IDR")
        self.assertEqual(fields["price"], 150000)
        self.assertIn("duration_minutes", uncertain)
        self.assertEqual(fields["availability"], [])

    def test_invalid_json_rejected(self):
        for value in ('not json', '```json\n{}\n```', '{}', '[]', '{"listing": {}, "listing": {}}'):
            with self.subTest(value=value), self.assertRaises(listing.InvalidProposal):
                listing.validate_output(value, self.text)

    def test_invalid_types_ranges_extra_fields(self):
        for field, value in (("price", "150000"), ("price", True), ("price", -1), ("price", 1.5),
                             ("duration_minutes", 0), ("duration_minutes", 10081), ("currency", "$$$"),
                             ("availability", ["tomorrow"]), ("activities", "coffee"), ("capacity", 10)):
            with self.subTest(field=field, value=value), self.assertRaises(listing.InvalidProposal):
                listing.validate_output(json.dumps({**self.output, "listing": {**self.fields, field: value}}), self.text)

    def test_unsupported_fields_are_missing_not_defaults(self):
        self.output["evidence"] = {}
        fields, uncertain = listing.validate_output(json.dumps(self.output), "Nothing specific was stated.")
        self.assertEqual(fields, listing.empty_listing())
        self.assertIn("price", uncertain)

    def test_ambiguous_currency_and_assembled_names_are_not_facts(self):
        self.fields.update(currency="MXN", business_name="Noor's Coffee Farm")
        self.output["evidence"].update(currency="200 pesos", business_name="Noor")
        fields, uncertain = listing.validate_output(json.dumps(self.output), "Noor offers a visit for 200 pesos")
        self.assertIsNone(fields["currency"])
        self.assertIsNone(fields["business_name"])
        self.assertIn("currency", uncertain)

    def test_description_cannot_invent_even_with_real_quote(self):
        self.fields["description"] = "An amazing seaside experience with lunch included."
        fields, _ = listing.validate_output(json.dumps(self.output), self.text)
        self.assertIsNone(fields["description"])

    def test_languages_transcript_metadata_no_writes(self):
        with patch.object(listing, "infer", return_value=json.dumps(self.output)), patch.object(main, "supabase") as db, patch.object(main, "save") as save:
            for lang in ("en", "es", "id"):
                response = self.client.post("/api/voice/proposal", json={"transcript": self.text, "language": lang})
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["language"], lang)
                self.assertEqual(data["transcript"], self.text)
                self.assertEqual(data["extractor"]["type"], "small_ai")
                self.assertIn("availability", data["missing_fields"])
                self.assertTrue(data["requires_confirmation"])
            db.table.assert_not_called()
            save.assert_not_called()

    def test_bad_requests(self):
        for transcript, language in (("", "en"), ("   ", "id"), ("hello", "fr"), ("a"*4001, "es"), ([], "en")):
            response = self.client.post("/api/voice/proposal", json={"transcript": transcript, "language": language})
            self.assertEqual(response.status_code, 422)

    def test_unavailable_fallback_no_hallucinated_defaults(self):
        with patch.object(listing, "infer", side_effect=listing.ModelUnavailable):
            data = listing.extract_proposal("I have a business", "en")
            self.assertEqual(data["extractor"]["type"], "deterministic_fallback")
            self.assertEqual(data["listing"], listing.empty_listing())
            self.assertEqual(set(data["missing_fields"]), set(listing.FIELDS))
            self.assertIsNone(data["extractor"]["model_size_bytes"])
            with self.assertRaises(listing.ModelUnavailable):
                listing.extract_proposal("Hello", "en", allow_fallback=False)

    def test_invalid_output_preserves_transcript_without_partial_listing(self):
        with patch.object(listing, "infer", return_value='{"price": 100}'):
            data = listing.extract_proposal(self.text, "en")
            self.assertEqual(data["error"], "invalid_model_output")
            self.assertEqual(data["transcript"], self.text)
            self.assertEqual(data["listing"], listing.empty_listing())

    def test_approximation_flag(self):
        self.output["uncertain_fields"] = []
        fields, uncertain = listing.validate_output(json.dumps(self.output), self.text + " Maybe a little longer.")
        self.assertIn("duration_minutes", uncertain)

    def test_generation_grammar_constrains_contract_values(self):
        schema = listing.generation_schema()
        self.assertEqual(set(schema["$defs"]["Listing"]["properties"]["availability"]["items"]["enum"]), listing.DAYS)
        self.assertFalse(schema["properties"]["evidence"]["additionalProperties"])

    def test_duration_is_not_a_price_and_nonliteral_title_is_missing(self):
        self.output["evidence"]["price"] = "ninety minutes"
        self.fields["experience_title"] = "Luxury coffee tour with lunch"
        self.output["evidence"]["experience_title"] = "Roast coffee"
        fields, uncertain = listing.validate_output(json.dumps(self.output), "Roast coffee for ninety minutes.")
        self.assertIsNone(fields["price"])
        self.assertIsNone(fields["experience_title"])
        self.assertIn("price", uncertain)

    def test_spoken_numeric_grounding_in_three_languages(self):
        for text, value, field in (
            ("It costs one hundred fifty thousand rupiah", 150000, "price"),
            ("It takes ninety minutes", 90, "duration_minutes"),
            ("Cuesta ciento cincuenta euros", 150, "price"),
            ("Dura dos horas", 120, "duration_minutes"),
            ("Harganya seratus lima puluh ribu rupiah", 150000, "price"),
            ("Lamanya sembilan puluh menit", 90, "duration_minutes"),
            ("The price is 75,000 rupiah", 75000, "price"),
        ):
            with self.subTest(text=text):
                self.assertTrue(listing.numeric_supported(text, value, field))
                self.assertFalse(listing.numeric_supported(text, value+7, field))
        for text in ("We have 20 visitors", "The price is unknown. 20 minutes", "It costs 20.5 euros", "It does not cost 20 euros"):
            self.assertFalse(listing.numeric_supported(text, 20, "price"), text)

    def test_spoken_values_survive_bad_model_citations_only_when_independently_supported(self):
        self.output["evidence"]["price"] = "150000 IDR"
        self.output["evidence"]["duration_minutes"] = "90"
        fields, _ = listing.validate_output(json.dumps(self.output), self.text)
        self.assertEqual(fields["price"], 150000)
        self.assertEqual(fields["duration_minutes"], 90)
        self.fields["price"] = 999999
        fields, _ = listing.validate_output(json.dumps(self.output), self.text)
        self.assertIsNone(fields["price"])

    def test_speaker_and_sector_are_not_business_names(self):
        for text, name in (("My name is Noor", "Noor"), ("We offer clay sculpting", "clay sculpting")):
            self.fields["business_name"] = name
            self.output["evidence"]["business_name"] = name
            fields, _ = listing.validate_output(json.dumps(self.output), text)
            self.assertIsNone(fields["business_name"])
        self.fields["business_name"] = "Blue Farm"
        self.output["evidence"]["business_name"] = "Blue Farm"
        fields, _ = listing.validate_output(json.dumps(self.output), "Our business is called Blue Farm.")
        self.assertEqual(fields["business_name"], "Blue Farm")

    def test_stt_languages_real_adapter_contract(self):
        for language in ("en", "es", "id"):
            model = Mock()
            model.transcribe.return_value = (iter([SimpleNamespace(text=" spoken words ")]), SimpleNamespace(language=language, duration=10))
            factory = Mock(return_value=model)
            with patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=factory)}), patch.object(voice, "_stt_model", None):
                result = voice.transcribe_audio(b"audio", language)
                self.assertEqual(result["transcript"], "spoken words")
                self.assertEqual(result["language"], language)
                self.assertIn("processing_ms", result)
                self.assertTrue(factory.call_args.kwargs["local_files_only"])
                self.assertEqual(factory.call_args.kwargs["compute_type"], "int8")
                self.assertEqual(factory.call_args.kwargs["device"], "cpu")

    def test_empty_whisper_setting_resolves_downloaded_model_from_repo_root(self):
        model = Mock()
        model.transcribe.return_value = (iter([SimpleNamespace(text=" spoken words ")]),
                                         SimpleNamespace(language="en", duration=2))
        factory = Mock(return_value=model)
        with patch.dict(os.environ, {"YOLO_WHISPER_MODEL": ""}), \
                patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=factory)}), \
                patch.object(voice, "_stt_model", None), patch.object(voice, "_stt_name", None):
            result = voice.transcribe_audio(b"audio", "en")
        expected = str(Path(__file__).resolve().parents[1] / "models" / "faster-whisper-base")
        self.assertEqual(factory.call_args.args[0], expected)
        self.assertEqual(result["transcript"], "spoken words")

    def test_stt_unavailable_bad_audio_empty_no_sample(self):
        for exc, code in ((voice.STTUnavailable, 503), (voice.STTError, 422)):
            with patch.object(voice, "transcribe_audio", side_effect=exc):
                response = self.client.post("/api/voice/transcribe", data={"language": "id"}, files={"audio": ("voice.webm", b"audio")})
                self.assertEqual(response.status_code, code)
                self.assertNotIn("transcript", response.json())
        response = self.client.post("/api/voice/transcribe", data={"language": "id"}, files={"audio": ("voice.webm", b"")})
        self.assertEqual(response.status_code, 422)

    def test_stt_rejects_long_unsupported_or_empty_speech(self):
        for lang, duration, text in (("fr", 10, "hello"), ("en", 61, "hello"), ("id", 10, "")):
            model = Mock()
            model.transcribe.return_value = (iter([SimpleNamespace(text=text)]), SimpleNamespace(language=lang, duration=duration))
            with patch.object(voice, "_stt_model", model), patch.object(voice, "_stt_name", "models/faster-whisper-base"), patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=Mock())}), patch.dict(os.environ, {"YOLO_WHISPER_MODEL": "models/faster-whisper-base"}):
                with self.assertRaises(voice.STTError):
                    voice.transcribe_audio(b"audio", "en")

    def test_legacy_voice_contract_preserved(self):
        with patch.object(ai, "transcribe", return_value=None):
            response = self.client.post("/api/voice", files={"audio": ("note.webm", b"old client")})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["demo"])
            self.assertIn("listing", response.json())

    def test_frozen_data_and_baseline_unchanged(self):
        data = Path("data/evaluation/voice_listing.json").read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), "bf467c3ce73841c4b3d99d989c11b991d3058949af877eab989c5b82960b78cc")
        metrics = score_listings(json.loads(data), lambda ex: ai.extract_listing(ex["text"]))
        self.assertEqual((metrics["correct_fields"], metrics["evaluated_fields"], metrics["hallucinations"]), (55, 144, 0))

    def test_independent_structured_currency_scoring(self):
        example = {"expected": {**listing.empty_listing(), "currency": "EUR"}}
        result = score_listings([example], lambda _: example["expected"], structured=True)
        self.assertEqual(result["per_field"]["currency"]["correct"], 1)


if __name__ == "__main__":
    unittest.main()
