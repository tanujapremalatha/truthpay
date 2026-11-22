"""
config.py — Enterprise Verity Gateway Configuration
Configures server environment, Firestore sync settings, security thresholds,
and NPCI / UPI validation heuristics.
"""

import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class GatewayConfig:
    # Server Binding
    HOST: str = os.getenv("VERITY_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("VERITY_PORT", 8080))
    DEBUG: bool = os.getenv("VERITY_DEBUG", "True").lower() == "true"

    # Security & Admin Access
    ADMIN_PIN: str = os.getenv("VERITY_ADMIN_PIN", "1234")
    API_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("VERITY_RATE_LIMIT", 120))
    JWT_SECRET: str = os.getenv("VERITY_SECRET", "verity-sentinel-vault-key-prod-9812")

    # Firestore Cloud Ledger Sync
    FIREBASE_PROJECT_ID: str = "paytruth-f1b03"
    FIRESTORE_COLLECTION: str = "verityTransactions"
    LEDGER_DATA_FILE: str = os.path.join(
        os.path.dirname(__file__), "data", "ledger.json"
    )

    # Risk Analysis & Fraud Scoring Thresholds
    COLLECT_TRAP_KEYWORDS: List[str] = field(default_factory=lambda: [
        "requested money from you",
        "request received",
        "ignore this request",
        "decline",
        "pay request",
        "collect request",
        "requested from",
        "pending request"
    ])

    # Supported UPI UTR & Transaction Token Patterns
    BANK_UTR_REGEX: str = r"\b\d{12}\b"
    ALPHANUM_ORDER_REGEX: str = r"\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{10,20}\b"
    LABELED_UTR_REGEX: str = (
        r"(?:UPI\s*Ref\s*No|UTR|Ref\s*No|Order\s*ID|Transaction\s*ID|Txn\s*ID)[:\s#-]*"
        r"([A-Za-z0-9]{8,24})"
    )

    # Indian Currency Patterns
    AMOUNT_REGEX: str = r"(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)"


config = GatewayConfig()
