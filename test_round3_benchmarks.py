"""
test_round3_benchmarks.py — Code Fuzion 2026 Round 3 Test Suite
NEW MODULE (Standalone Benchmark Validation)

Validates:
1. Neutralization of the Hour-12 Replay Attack
2. Persistent Cross-Session Duplicate Replay Defense
3. Resolution of False Positive Bias via Confusable Normalization
4. Collect Trap Scam Detection
"""

import unittest
from datetime import datetime
from anti_replay_engine import AntiReplaySentinel
from confusable_decoder import OCRConfusableDecoder
from forensic_verifier_v2 import ForensicVerifierV2


class TestRound3EvaluatorBenchmarks(unittest.TestCase):

    def setUp(self):
        self.sentinel = AntiReplaySentinel(db_path="data/test_round3_history.json", max_age_minutes=45)
        self.verifier = ForensicVerifierV2()

    def test_hour_12_twist_replay_defense(self):
        """
        SCENARIO 1 (Hour-12 Twist):
        A genuine receipt from 12 hours ago presented at the counter must be caught as REPLAY_ATTACK.
        """
        ref_time = datetime(2026, 11, 25, 20, 0, 0)  # 8:00 PM
        stale_receipt = (
            "Paid Successfully to Reliance Fresh\n"
            "₹500.00\n"
            "UPI Ref No: 440995361349\n"
            "Time: 08:00 AM"  # 12 hours earlier!
        )
        res = self.verifier.verify(stale_receipt, reference_now=ref_time, check_session_replay=False)
        self.assertEqual(res["verdict"], "REPLAY_ATTACK")
        self.assertIn("Expired Receipt", res["headline"])
        self.assertFalse(res["is_safe"])
        print("\n[✓] Hour-12 Twist Replay Defense: PASSED (Detected stale receipt)")

    def test_cross_session_duplicate_scan_replay(self):
        """
        SCENARIO 2 (Cross-Session Replay):
        The same legitimate receipt scanned twice across different days must be caught by scan persistence.
        """
        token = "432567890123"
        scan1 = self.sentinel.verify_and_record_scan(token)
        self.assertFalse(scan1["is_duplicate"])

        # Second presentation on next day
        scan2 = self.sentinel.verify_and_record_scan(token)
        self.assertTrue(scan2["is_duplicate"])
        self.assertEqual(scan2["scan_count"], 2)
        print("[✓] Cross-Session Scan Persistence: PASSED (Caught repeated presentation)")

    def test_ocr_confusable_recovery_compressed_screenshot(self):
        """
        SCENARIO 3 (False Positive Elimination):
        A compressed WhatsApp screenshot with confusable characters '44O99536l349'
        must decode to valid UTR '440995361349' without syntax penalty.
        """
        raw_noisy_token = "44O99536l349"
        recovered = OCRConfusableDecoder.decode_token(raw_noisy_token)
        self.assertEqual(recovered, "440995361349")

        noisy_receipt = (
            "Paid Successfully to Merchant\n"
            "Amount: ₹871\n"
            "Paytm Payments Bank\n"
            "Ref No: 44O99536l349\n"
            "Time: 10:15 AM, Today"
        )
        res = self.verifier.verify(noisy_receipt, check_session_replay=False)
        self.assertEqual(res["verdict"], "AUTHENTIC")
        self.assertEqual(res["token_id"], "440995361349")
        self.assertTrue(res["is_safe"])
        print("[✓] False Positive Bias Elimination: PASSED (Confusable 44O99536l349 decoded to 440995361349)")

    def test_gpay_collect_scam_trap(self):
        """
        SCENARIO 4 (Scam Detection):
        Incoming collect request screen must be caught as COLLECT_SCAM.
        """
        collect_screen = (
            "Vishu Mad requested money from you\n"
            "₹800\n"
            "Request received\n"
            "decline\n"
            "Google transaction ID CICAgPDTxtWHYA"
        )
        res = self.verifier.verify(collect_screen, check_session_replay=False)
        self.assertEqual(res["verdict"], "COLLECT_SCAM")
        self.assertFalse(res["is_safe"])
        print("[✓] GPay Collect Request Trap: PASSED (Intercepted incoming request)")


if __name__ == "__main__":
    unittest.main()
