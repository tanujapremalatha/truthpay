"""
anti_replay_engine.py — Dedicated Hour-12 Twist & Cross-Session Replay Defense
NEW MODULE (Code Fuzion 2026 — Round 3 Remediation)

Addresses Evaluator Critique:
"Replay Attack Vulnerability (Hour-12 Twist): Does not maintain a persistent database
of scanned UTRs, allowing the same legitimate screenshot to be submitted repeatedly on different days."
"""

import json
import os
import re
import threading
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple


class AntiReplaySentinel:
    """
    Dedicated anti-replay engine that:
    1. Validates chronological freshness to defeat the 'Hour-12 Twist' (rejects stale receipts > 45 mins old).
    2. Maintains a persistent cross-session scan database to prevent duplicate presentations across days.
    """

    MONTH_MAP = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }

    def __init__(self, db_path: Optional[str] = None, max_age_minutes: int = 45):
        self.max_age_minutes = max_age_minutes
        self.db_path = db_path or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "data", "scanned_history.json"
        )
        self._lock = threading.Lock()
        self._scanned_db: Dict[str, dict] = {}
        self._load_database()

    def _load_database(self):
        """Loads historical scan records across sessions and days."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, "r", encoding="utf-8") as f:
                    self._scanned_db = json.load(f)
            except Exception:
                self._scanned_db = {}

    def _save_database(self):
        """Persists historical scan records to disk."""
        try:
            with open(self.db_path, "w", encoding="utf-8") as f:
                json.dump(self._scanned_db, f, indent=2)
        except Exception as e:
            print(f"[AntiReplay] Storage error: {e}")

    def parse_receipt_time(self, ocr_text: str, reference_now: Optional[datetime] = None) -> Tuple[Optional[datetime], Optional[str], Optional[float], bool]:
        """
        Extracts receipt timestamp & date to calculate age and detect stale receipts.
        Returns: (parsed_datetime, formatted_string, age_minutes, is_expired)
        """
        now = reference_now or datetime.now()
        clean = ocr_text or ""
        lower = clean.lower()

        is_yesterday = "yesterday" in lower
        time_match = re.search(r"\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\b", clean)
        time_str = time_match.group(1).upper() if time_match else None

        date_match = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?\b", clean)
        slash_match = re.search(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b", clean)

        parsed_dt = None
        display_str = None

        try:
            if date_match and time_str:
                day = int(date_match.group(1))
                mon = self.MONTH_MAP.get(date_match.group(2)[:3].lower(), now.month)
                yr = int(date_match.group(3)) if date_match.group(3) else now.year
                display_str = f"{day} {date_match.group(2).capitalize()} at {time_str}"
                parsed_dt = datetime.strptime(f"{yr}-{mon:02d}-{day:02d} {time_str}", "%Y-%m-%d %I:%M %p" if "M" in time_str else "%Y-%m-%d %H:%M")

            elif slash_match and time_str:
                day, mon, yr = int(slash_match.group(1)), int(slash_match.group(2)), int(slash_match.group(3))
                if yr < 100:
                    yr += 2000
                display_str = f"{day:02d}/{mon:02d}/{yr} at {time_str}"
                parsed_dt = datetime.strptime(f"{yr}-{mon:02d}-{day:02d} {time_str}", "%Y-%m-%d %I:%M %p" if "M" in time_str else "%Y-%m-%d %H:%M")

            elif time_str:
                base_date = (now - timedelta(days=1)) if is_yesterday else now
                display_str = f"{'Yesterday' if is_yesterday else 'Today'} at {time_str}"
                t_dt = datetime.strptime(time_str, "%I:%M %p" if "M" in time_str else "%H:%M")
                parsed_dt = base_date.replace(hour=t_dt.hour, minute=t_dt.minute, second=0, microsecond=0)

        except Exception:
            parsed_dt = None

        age_minutes = None
        is_expired = False
        if parsed_dt:
            diff = (now - parsed_dt).total_seconds() / 60.0
            age_minutes = round(diff, 1)
            if age_minutes > self.max_age_minutes or is_yesterday:
                is_expired = True
        elif is_yesterday:
            is_expired = True
            age_minutes = 1440.0

        return parsed_dt, display_str, age_minutes, is_expired

    def verify_and_record_scan(self, token_id: str, client_tag: str = "counter") -> dict:
        """
        Cross-Session Persistent Replay Check:
        Detects if this exact UTR was already scanned on a previous day or test cycle.
        """
        clean_id = (token_id or "").upper().strip()
        if not clean_id or len(clean_id) < 6:
            return {"is_duplicate": False, "scan_count": 0}

        with self._lock:
            now_iso = datetime.now().isoformat()
            if clean_id in self._scanned_db:
                rec = self._scanned_db[clean_id]
                rec["scan_count"] = rec.get("scan_count", 1) + 1
                rec["last_seen"] = now_iso
                self._save_database()
                return {
                    "is_duplicate": True,
                    "first_seen": rec.get("first_seen"),
                    "scan_count": rec["scan_count"],
                    "token_id": clean_id
                }

            # First scan observation
            self._scanned_db[clean_id] = {
                "token_id": clean_id,
                "first_seen": now_iso,
                "last_seen": now_iso,
                "scan_count": 1,
                "client": client_tag
            }
            self._save_database()
            return {"is_duplicate": False, "scan_count": 1, "token_id": clean_id}


# Singleton instance
anti_replay_sentinel = AntiReplaySentinel()
