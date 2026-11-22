"""
tests/test_verifier.py — Automated Unit & Integration Tests
Validates UTR heuristics, scam trap detection, double-claim replay protection,
and OCR token parsing.
"""

import unittest
from core import FraudEngine, OCREngine, VerdictStatus, TransactionLedger


class TestVerityEngine(unittest.TestCase):

    def setUp(self):
        # Dedicated test ledger in memory
        self.ledger = TransactionLedger(storage_path="data/test_ledger.json")
        self.ledger.reset_seed()

    def test_valid_settlement_match(self):
        """Pre-registered UTR should match as AUTHENTIC."""
        verdict = FraudEngine.evaluate(
            candidates=["440995361349"],
            raw_text="Paid Successfully ₹871 UPI Ref No: 440995361349",
            ledger_lookup_fn=self.ledger.get,
            claim_fn=self.ledger.claim_atomic
        )
        self.assertEqual(verdict.status, VerdictStatus.AUTHENTIC)
        self.assertEqual(verdict.risk_score, 0)
        self.assertIn("Matched", verdict.headline)

    def test_collect_request_scam_detection(self):
        """Screenshots requesting money must be flagged as COLLECT_SCAM."""
        trap_text = (
            "Vishu Mad requested money from you\n"
            "₹800\n"
            "Request received\n"
            "decline or ignore this request\n"
            "Google transaction ID CICAgPDTxtWHYA"
        )
        verdict = FraudEngine.evaluate(
            candidates=["CICAGPDTXTWHYA"],
            raw_text=trap_text,
            ledger_lookup_fn=self.ledger.get
        )
        self.assertEqual(verdict.status, VerdictStatus.COLLECT_SCAM)
        self.assertGreaterEqual(verdict.risk_score, 90)

    def test_replay_attack_prevention(self):
        """Claiming a transaction twice must trigger REPLAY_ATTACK."""
        token = "440995361349"

        # Claim 1: Authentic
        v1 = FraudEngine.evaluate([token], "", self.ledger.get, self.ledger.claim_atomic)
        self.assertEqual(v1.status, VerdictStatus.AUTHENTIC)

        # Claim 2: Replay
        v2 = FraudEngine.evaluate([token], "", self.ledger.get, self.ledger.claim_atomic)
        self.assertEqual(v2.status, VerdictStatus.REPLAY_ATTACK)
        self.assertGreaterEqual(v2.risk_score, 90)

    def test_unregistered_counterfeit(self):
        """Fake UTRs not present in bank ledger must be flagged as UNVERIFIED."""
        verdict = FraudEngine.evaluate(
            candidates=["998877665544"],
            raw_text="Paid ₹450 to Canteen Ref: 998877665544",
            ledger_lookup_fn=self.ledger.get
        )
        self.assertEqual(verdict.status, VerdictStatus.UNVERIFIED)
        self.assertGreaterEqual(verdict.risk_score, 70)

    def test_ocr_candidate_extraction(self):
        """OCR parser should extract standard 12-digit UTRs and order IDs."""
        sample_receipt = (
            "Payment to Merchant\n"
            "Order ID: U2N9CEP1MD4W\n"
            "UPI Ref No: 440995361349\n"
            "Amount: ₹871.00\n"
            "Time: 03:31 PM"
        )
        meta = OCREngine.parse_receipt(sample_receipt)
        self.assertIn("440995361349", meta.candidates)
        self.assertIn("U2N9CEP1MD4W", meta.candidates)
        self.assertEqual(meta.amount, "₹871.00")
        self.assertEqual(meta.timestamp, "03:31 PM")


if __name__ == "__main__":
    unittest.main()
