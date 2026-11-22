"""
core/fraud_engine.py — Advanced UPI Fraud & Heuristic Analysis Engine
Detects counterfeit receipts, GPay collect request traps, replay attacks,
and validates standard NPCI 12-digit UTR identifiers.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple
from config import config


class VerdictStatus(str, Enum):
    AUTHENTIC = "AUTHENTIC"
    COLLECT_SCAM = "COLLECT_SCAM"
    REPLAY_ATTACK = "REPLAY_ATTACK"
    UNVERIFIED = "UNVERIFIED"


@dataclass
class RiskFactor:
    name: str
    severity: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    description: str


@dataclass
class VerificationVerdict:
    status: VerdictStatus
    headline: str
    token_id: str
    risk_score: int  # 0 (safe) to 100 (critical fraud)
    sub_meta: str
    matched_entry: Optional[dict] = None
    risk_factors: List[RiskFactor] = field(default_factory=list)


class FraudEngine:
    """
    Enterprise heuristic analyzer for UPI payment receipts.
    Evaluates OCR tokens, scam markers, and double-claim replay attempts.
    """

    @staticmethod
    def normalize_token(token: str) -> str:
        """Sanitize and uppercase transaction tokens."""
        return re.sub(r"[^A-Z0-9]", "", (token or "").upper()).strip()

    @classmethod
    def detect_collect_trap(cls, ocr_text: str) -> Tuple[bool, List[str]]:
        """
        Detects if screenshot is an incoming 'Payment Request' trap
        instead of an actual payment sent by customer.
        """
        lower = ocr_text.lower()
        matched_traps = []
        for keyword in config.COLLECT_TRAP_KEYWORDS:
            if keyword in lower:
                matched_traps.append(keyword)

        is_trap = len(matched_traps) >= 1 and (
            "requested money from you" in lower
            or ("request received" in lower and "decline" in lower)
            or ("ignore this request" in lower)
        )
        return is_trap, matched_traps

    @classmethod
    def validate_utr_structure(cls, token: str) -> dict:
        """
        Validates whether a token matches standard NPCI/Bank UTR guidelines.
        Standard UPI UTRs are 12 numeric digits (e.g., 440995361349).
        Merchant Order IDs are alphanumeric 10-20 chars (e.g., U2N9CEP1MD4W).
        """
        clean = cls.normalize_token(token)
        is_12_digit_utr = bool(re.fullmatch(r"\d{12}", clean))
        is_order_id = bool(re.fullmatch(r"[A-Z0-9]{10,20}", clean) and not clean.isdigit())

        return {
            "token": clean,
            "is_valid_syntax": is_12_digit_utr or is_order_id,
            "token_type": "NPCI_12_DIGIT_UTR" if is_12_digit_utr else ("ALPHANUM_ORDER_ID" if is_order_id else "UNKNOWN_TOKEN"),
            "length": len(clean)
        }

    @classmethod
    def evaluate(
        cls,
        candidates: List[str],
        raw_text: str = "",
        ledger_lookup_fn = None,
        claim_fn = None
    ) -> VerificationVerdict:
        """
        Runs the full verification pipeline:
        1. Collect trap scam detection
        2. Syntax and format validation
        3. Ledger match & replay protection
        """
        clean_candidates = [cls.normalize_token(c) for c in candidates if len(cls.normalize_token(c)) >= 6]
        primary_token = clean_candidates[0] if clean_candidates else "NO_UTR_DETECTED"

        # Check 1: Collect Trap Scam
        is_trap, matched_traps = cls.detect_collect_trap(raw_text)
        if is_trap:
            return VerificationVerdict(
                status=VerdictStatus.COLLECT_SCAM,
                headline="Payment Request Trap — NO Funds Sent!",
                token_id=primary_token,
                risk_score=98,
                sub_meta=(
                    f"Customer screen shows incoming collect request (triggers: {', '.join(matched_traps)}). "
                    "Zero funds were credited to your bank account."
                ),
                risk_factors=[
                    RiskFactor(
                        name="Incoming Payment Request",
                        severity="CRITICAL",
                        description="Attacker generated a collect request rather than a transfer."
                    )
                ]
            )

        # Check 2: Match against Merchant Ledger
        if ledger_lookup_fn and clean_candidates:
            for candidate in clean_candidates:
                match = ledger_lookup_fn(candidate)
                if match:
                    if match.get("claimed", False):
                        return VerificationVerdict(
                            status=VerdictStatus.REPLAY_ATTACK,
                            headline="Transaction ID Already Claimed!",
                            token_id=candidate,
                            risk_score=95,
                            sub_meta=(
                                f"This UTR was already validated and claimed earlier. "
                                f"Prevent double-handover of goods for token: {candidate}."
                            ),
                            matched_entry=match,
                            risk_factors=[
                                RiskFactor(
                                    name="Replay Attack",
                                    severity="CRITICAL",
                                    description="Screenshot was previously submitted and processed."
                                )
                            ]
                        )
                    else:
                        # Claim atomic lock if function provided
                        if claim_fn:
                            claim_fn(candidate)
                        return VerificationVerdict(
                            status=VerdictStatus.AUTHENTIC,
                            headline="Matched Bank Settlement Registry",
                            token_id=candidate,
                            risk_score=0,
                            sub_meta=(
                                f"Verified against entry ({match.get('amount', '—')} • {match.get('note', 'Direct')}). "
                                "Single-claim token locked. Safe to release goods."
                            ),
                            matched_entry=match
                        )

        # Check 3: Unregistered / Fake Screenshot
        syntax_info = cls.validate_utr_structure(primary_token)
        sub_info = (
            f"Extracted [{', '.join(clean_candidates)}] — none match your active bank ledger. "
            "High probability of fabricated APK generator."
            if clean_candidates else
            "Could not read a valid 12-digit UTR from screenshot. Use manual lookup."
        )

        return VerificationVerdict(
            status=VerdictStatus.UNVERIFIED,
            headline="Transaction ID Not Found in Registry",
            token_id=primary_token,
            risk_score=85,
            sub_meta=sub_info,
            risk_factors=[
                RiskFactor(
                    name="Missing Ledger Settlement",
                    severity="HIGH",
                    description="No banking credit matching this transaction reference was found."
                )
            ]
        )
