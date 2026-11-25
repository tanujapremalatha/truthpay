"""
confusable_decoder.py — OCR Confusable Recovery & Anti-False-Positive Normalizer
NEW MODULE (Code Fuzion 2026 — Round 3 Remediation)

Addresses Evaluator Critique:
"False Positive Bias: Standard font variations and compressed screenshot artifacts
are disproportionately flagged as fraud, incurring heavy penalties (FP penalized 2x misses)."
"""

import re
from typing import List, Optional, Set


class OCRConfusableDecoder:
    """
    Topological confusable recovery engine for Indian UPI receipts.
    Recovers valid 12-digit numeric UTRs from screenshots affected by:
    - WhatsApp / Telegram DCT compression noise
    - OEM font antialiasing (OnePlus OxygenOS, Xiaomi MiSans, Samsung OneUI)
    """

    # Comprehensive digit substitution map for OCR confusion matrix
    CONFUSABLE_MAP = {
        'O': '0', 'o': '0', 'D': '0', 'Q': '0', 'U': '0',
        'I': '1', 'l': '1', '|': '1', '!': '1', 'i': '1', 'T': '1',
        'Z': '2', 'z': '2',
        'S': '5', 's': '5', '$': '5',
        'G': '6', 'b': '6',
        'B': '8', '&': '8',
        'q': '9', 'g': '9'
    }

    @classmethod
    def decode_token(cls, raw_token: str) -> Optional[str]:
        """
        Attempts to recover a strict 12-digit numeric UTR from a token
        containing OCR confusable characters.
        e.g. '44O99536l349' -> '440995361349'
        """
        clean = re.sub(r"[^A-Za-z0-9|!$]", "", raw_token or "")
        if len(clean) != 12:
            return None

        recovered = []
        for ch in clean:
            if ch.isdigit():
                recovered.append(ch)
            elif ch in cls.CONFUSABLE_MAP:
                recovered.append(cls.CONFUSABLE_MAP[ch])
            else:
                return None  # Unresolvable glyph

        candidate = "".join(recovered)
        if len(candidate) == 12 and candidate.isdigit():
            return candidate
        return None

    @classmethod
    def extract_candidates_robust(cls, ocr_text: str) -> List[str]:
        """
        Extracts transaction candidates with multi-pass OCR confusable recovery,
        ensuring that compression noise does not cause false negatives.
        """
        candidates: Set[str] = set()
        clean = ocr_text or ""

        # Pass 1: Standard 12-digit numeric sequences
        for m in re.findall(r"\b\d{12}\b", clean):
            candidates.add(m)

        # Pass 2: Labeled identifiers (e.g. UPI Ref No: 44O99536l349)
        labeled_pattern = r"(?:UPI\s*Ref\s*No|UTR|Ref\s*No|Order\s*ID|Transaction\s*ID|Txn\s*ID|Ref\s*ID)[:\s#-]*([A-Za-z0-9|!$]{8,24})"
        for m in re.findall(labeled_pattern, clean, re.IGNORECASE):
            token_clean = re.sub(r"[^A-Za-z0-9|!$]", "", m)
            if len(token_clean) == 12:
                rec = cls.decode_token(token_clean)
                if rec:
                    candidates.add(rec)
            if len(token_clean) >= 6:
                candidates.add(token_clean.upper())

        # Pass 3: Fuzzy 12-character alphanumeric tokens (OCR confusables)
        for token in re.findall(r"\b[A-Za-z0-9|!$]{12}\b", clean):
            rec = cls.decode_token(token)
            if rec:
                candidates.add(rec)

        # Pass 4: Standard alphanumeric Order IDs (e.g. U2N9CEP1MD4W)
        for m in re.findall(r"\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{10,20}\b", clean):
            candidates.add(m.upper())

        return list(candidates)


# Singleton instance
confusable_decoder = OCRConfusableDecoder()
