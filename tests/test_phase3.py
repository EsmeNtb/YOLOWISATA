"""Backend contract consumed by the Phase 3 dashboard; no live database writes."""
import copy
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main
from test_phase2 import BIZ, EXP, Database


class Phase3ContractTests(unittest.TestCase):
    def test_multilingual_consented_feedback_reaches_the_frontend_contract(self):
        db = Database()
        english = "I loved roasting coffee and would like more tasting."
        indonesian = "Saya senang sangrai kopi dan ingin cicip kopi lagi."
        db.rows["postcards"] = [
            {"experience_id": EXP, "message": english, "language": "en", "consent_for_analysis": True},
            {"experience_id": EXP, "message": indonesian, "language": "id", "consent_for_analysis": True},
            {"experience_id": EXP, "message": "PRIVATE roasting", "consent_for_analysis": False},
        ]
        before = copy.deepcopy(db.rows)
        with patch.object(main, "supabase", db), patch.object(main, "save", side_effect=AssertionError("Unexpected write")):
            client = TestClient(main.app)
            response = client.get(f"/api/businesses/{BIZ}/insights")
            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["postcards"], 2)
            self.assertEqual(result["questions"], 0)
            self.assertEqual(result["segments"], {"international": {}, "local": {}})
            for group, key in (("loved", "roast"), ("asks", "tasting")):
                self.assertEqual(result[group][key], {
                    "count": 2, "label": "Not enough evidence yet", "quotes": [english, indonesian],
                })
            # More consented Supabase feedback changes the next response without a local sync.
            db.rows["postcards"].append({
                "experience_id": EXP, "message": "Sangrai kopi menyenangkan.", "consent_for_analysis": True,
            })
            refreshed = client.get(f"/api/businesses/{BIZ}/insights").json()
            self.assertEqual(refreshed["postcards"], 3)
            self.assertEqual(refreshed["loved"]["roast"]["label"], "Early signal")
        self.assertEqual(db.rows["postcards"][:-1], before["postcards"])
        self.assertEqual(db.rows["businesses"], before["businesses"])
        self.assertEqual(db.rows["experiences"], before["experiences"])


if __name__ == "__main__":
    unittest.main()
