"""
core/ocr_engine.py — Receipt Image Pre-Processing & Token Extraction
Parses transaction candidates, amounts, beneficiary VPAs, and UPI app signatures.
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Set
from config import config


@dataclass
class ReceiptMetadata:
    candidates: List[str]
    amount: Optional[str] = None
    app_detected: Optional[str] = None
    timestamp: Optional[str] = None
    raw_text: str = ""


class OCREngine:
    """
    High-accuracy optical text parser and candidate extractor for UPI screenshots.
    Works seamlessly with Tesseract outputs, server-side OCR, or synthetic text streams.
    """

    APP_SIGNATURES = {
        "Paytm": ["paytm", "one97 communications", "order id: u2", "paytm payments bank"],
        "Google Pay": ["google pay", "gpay", "google transaction id", "cicag"],
        "PhonePe": ["phonepe", "t240", "transaction id: t"],
        "BHIM": ["bhim", "npci", "upi ref no"],
        "CRED": ["cred", "cred pay", "clubhouse"],
        "Amazon Pay": ["amazon pay", "amazon.in"]
    }

    @classmethod
    def extract_candidates(cls, ocr_text: str) -> List[str]:
        """
        Extracts all potential transaction identifiers using labeled & structural regexes.
        """
        found: Set[str] = set()
        clean_text = ocr_text or ""

        # Pattern 1: Labeled UTR / Ref / Order IDs
        labeled_matches = re.findall(config.LABELED_UTR_REGEX, clean_text, re.IGNORECASE)
        for m in labeled_matches:
            clean = re.sub(r"[^A-Za-z0-9]", "", m).upper()
            if len(clean) >= 6:
                found.add(clean)

        # Pattern 2: Standard 12-digit numeric bank UTRs
        numeric_matches = re.findall(config.BANK_UTR_REGEX, clean_text)
        for m in numeric_matches:
            found.add(m)

        # Pattern 3: Alphanumeric IDs (10-20 chars containing digits and letters)
        alpha_matches = re.findall(config.ALPHANUM_ORDER_REGEX, clean_text)
        for m in alpha_matches:
            clean = re.sub(r"[^A-Za-z0-9]", "", m).upper()
            if len(clean) >= 8:
                found.add(clean)

        return list(found)

    @classmethod
    def detect_upi_app(cls, ocr_text: str) -> str:
        """Detects which UPI app produced the screenshot."""
        lower = ocr_text.lower()
        for app_name, keywords in cls.APP_SIGNATURES.items():
            for kw in keywords:
                if kw in lower:
                    return app_name
        return "Generic UPI"

    @classmethod
    def extract_amount(cls, ocr_text: str) -> Optional[str]:
        """Extracts transaction monetary value in INR (e.g. ₹871)."""
        match = re.search(config.AMOUNT_REGEX, ocr_text)
        if match:
            return f"₹{match.group(1)}"
        return None

    @classmethod
    def parse_receipt(cls, ocr_text: str) -> ReceiptMetadata:
        """Runs the complete metadata extraction pipeline."""
        candidates = cls.extract_candidates(ocr_text)
        amount = cls.extract_amount(ocr_text)
        app_name = cls.detect_upi_app(ocr_text)

        # Look for standard time pattern (e.g. 03:31 PM)
        time_match = re.search(r"\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))\b", ocr_text)
        timestamp = time_match.group(1) if time_match else None

        return ReceiptMetadata(
            candidates=candidates,
            amount=amount,
            app_detected=app_name,
            timestamp=timestamp,
            raw_text=ocr_text
        )
