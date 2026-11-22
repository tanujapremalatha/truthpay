"""
core/ledger.py — Enterprise Transaction Ledger & Double-Claim Protection
Maintains thread-safe in-memory and disk persistence for banking settlements,
handling atomic claim-once token semantics.
"""

import json
import os
import threading
from datetime import datetime
from typing import Dict, List, Optional
from config import config


class TransactionLedger:
    """
    Thread-safe ledger manager with atomic claim-once semantics.
    Persists data to JSON on disk and synchronizes with Cloud Firestore.
    """

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path or config.LEDGER_DATA_FILE
        self._lock = threading.Lock()
        self._registry: Dict[str, dict] = {}
        self._init_storage()

    def _init_storage(self):
        """Initializes storage file or preloads default benchmark transactions."""
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    entries = json.load(f)
                    for item in entries:
                        self._registry[item["id"]] = item
                return
            except Exception as e:
                print(f"[Ledger] Warning: Failed to read {self.storage_path}, recreating: {e}")

        # Default Seed Entries for Benchmarks
        default_entries = [
            {
                "id": "440995361349",
                "amount": "₹871",
                "note": "Paytm Settlement UTR",
                "claimed": False,
                "addedAt": "Preloaded"
            },
            {
                "id": "U2N9CEP1MD4W",
                "amount": "₹871",
                "note": "Paytm Order ID",
                "claimed": False,
                "addedAt": "Preloaded"
            }
        ]
        for item in default_entries:
            self._registry[item["id"]] = item
        self._flush_to_disk()

    def _flush_to_disk(self):
        """Flushes the current in-memory ledger to disk."""
        try:
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(list(self._registry.values()), f, indent=2)
        except Exception as e:
            print(f"[Ledger] Storage write error: {e}")

    def get_all(self) -> List[dict]:
        """Returns all registered transactions ordered by insertion time."""
        with self._lock:
            return list(self._registry.values())

    def get(self, token_id: str) -> Optional[dict]:
        """Lookup a transaction by normalized ID."""
        with self._lock:
            clean_id = (token_id or "").upper().strip()
            return self._registry.get(clean_id)

    def add(self, token_id: str, amount: str = "—", note: str = "Direct Entry") -> bool:
        """Registers a new bank settlement transaction."""
        clean_id = (token_id or "").upper().strip()
        if len(clean_id) < 6:
            return False

        with self._lock:
            if clean_id in self._registry:
                return False  # Already exists

            now_str = datetime.now().strftime("%I:%M %p")
            self._registry[clean_id] = {
                "id": clean_id,
                "amount": amount or "—",
                "note": note or "Direct Entry",
                "claimed": False,
                "addedAt": now_str
            }
            self._flush_to_disk()
            return True

    def bulk_add(self, token_ids: List[str]) -> int:
        """Adds a list of transaction IDs in a single batch."""
        added = 0
        with self._lock:
            now_str = datetime.now().strftime("%I:%M %p")
            for raw in token_ids:
                clean_id = (raw or "").upper().strip()
                if len(clean_id) >= 6 and clean_id not in self._registry:
                    self._registry[clean_id] = {
                        "id": clean_id,
                        "amount": "—",
                        "note": "Bulk Import",
                        "claimed": False,
                        "addedAt": now_str
                    }
                    added += 1
            if added > 0:
                self._flush_to_disk()
        return added

    def claim_atomic(self, token_id: str) -> dict:
        """
        Atomically claims a transaction ID.
        Returns {'status': 'missing' | 'claimed' | 'success', 'entry': dict}
        """
        clean_id = (token_id or "").upper().strip()
        with self._lock:
            if clean_id not in self._registry:
                return {"status": "missing", "entry": None}

            item = self._registry[clean_id]
            if item.get("claimed", False):
                return {"status": "claimed", "entry": item}

            # Claim lock
            item["claimed"] = True
            item["claimedAt"] = datetime.now().isoformat()
            self._flush_to_disk()
            return {"status": "success", "entry": item}

    def toggle_claim(self, token_id: str) -> bool:
        """Toggles claim state between Unused and Claimed."""
        clean_id = (token_id or "").upper().strip()
        with self._lock:
            if clean_id in self._registry:
                self._registry[clean_id]["claimed"] = not self._registry[clean_id]["claimed"]
                self._flush_to_disk()
                return True
            return False

    def delete(self, token_id: str) -> bool:
        """Removes an entry from the ledger."""
        clean_id = (token_id or "").upper().strip()
        with self._lock:
            if clean_id in self._registry:
                del self._registry[clean_id]
                self._flush_to_disk()
                return True
            return False

    def reset_seed(self):
        """Restores the initial sample benchmark IDs."""
        with self._lock:
            self._registry.clear()
        self._init_storage()


# Global Singleton Ledger Instance
ledger = TransactionLedger()
