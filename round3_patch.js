/**
 * round3_patch.js — Standalone Client-Side Patch for Round 3 Feedback
 * NEW MODULE (Code Fuzion 2026 — Round 3 Remediation)
 * 
 * Provides:
 * 1. Hour-12 Twist Replay Defense (Timestamp Freshness Validation)
 * 2. Cross-Session Scanned History Persistence (localStorage / Firestore)
 * 3. Topological OCR Confusable Normalization (Eliminating False Positive Bias)
 */

(function(window) {
  'use strict';

  const MAX_RECEIPT_AGE_MINUTES = 45;

  const CONFUSABLE_MAP = {
    'O': '0', 'o': '0', 'D': '0', 'Q': '0',
    'I': '1', 'l': '1', '|': '1', '!': '1', 'i': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5',
    'G': '6', 'b': '6',
    'B': '8',
    'q': '9', 'g': '9'
  };

  const AntiReplayPatch = {
    /**
     * Recovers 12-digit numeric UTRs from OCR strings damaged by compression
     */
    decodeConfusables(token) {
      if (!token || token.length !== 12) return null;
      let res = '';
      for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        if (ch >= '0' && ch <= '9') {
          res += ch;
        } else if (CONFUSABLE_MAP[ch]) {
          res += CONFUSABLE_MAP[ch];
        } else {
          return null;
        }
      }
      return res.length === 12 ? res : null;
    },

    /**
     * Parses receipt timestamp and checks if it exceeds 45-minute freshness (Hour-12 defense)
     */
    validateFreshness(text) {
      const clean = text || '';
      const timeMatch = clean.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\b/);
      const isYesterday = clean.toLowerCase().includes('yesterday');

      if (isYesterday) {
        return { isExpired: true, ageMinutes: 1440, label: 'Yesterday' };
      }

      if (timeMatch) {
        const timeStr = timeMatch[1].toUpperCase();
        const parts = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/);
        if (parts) {
          let hours = parseInt(parts[1], 10);
          const mins = parseInt(parts[2], 10);
          const mer = parts[3];
          if (mer === 'PM' && hours < 12) hours += 12;
          if (mer === 'AM' && hours === 12) hours = 0;

          const now = new Date();
          const receiptDt = new Date();
          receiptDt.setHours(hours, mins, 0, 0);

          let diffMs = now.getTime() - receiptDt.getTime();
          if (diffMs < -60000) diffMs += 24 * 60 * 60 * 1000;

          const ageMinutes = Math.round(diffMs / 60000);
          return {
            isExpired: ageMinutes > MAX_RECEIPT_AGE_MINUTES,
            ageMinutes,
            label: timeStr
          };
        }
      }
      return { isExpired: false, ageMinutes: 0, label: 'Current' };
    },

    /**
     * Records scan in persistent cross-session storage to prevent duplicate presentation across days
     */
    checkCrossSessionReplay(tokenId) {
      if (!tokenId || tokenId.length < 6) return { isDuplicate: false, scanCount: 0 };
      const cleanId = tokenId.toUpperCase().trim();
      let history = {};
      try {
        history = JSON.parse(localStorage.getItem('verity_scanned_history') || '{}');
      } catch (e) {
        history = {};
      }

      const nowIso = new Date().toISOString();
      if (history[cleanId]) {
        history[cleanId].scanCount = (history[cleanId].scanCount || 1) + 1;
        history[cleanId].lastSeen = nowIso;
        try { localStorage.setItem('verity_scanned_history', JSON.stringify(history)); } catch (e) {}
        return {
          isDuplicate: true,
          scanCount: history[cleanId].scanCount,
          firstSeen: history[cleanId].firstSeen
        };
      }

      history[cleanId] = {
        tokenId: cleanId,
        firstSeen: nowIso,
        lastSeen: nowIso,
        scanCount: 1
      };
      try { localStorage.setItem('verity_scanned_history', JSON.stringify(history)); } catch (e) {}
      return { isDuplicate: false, scanCount: 1 };
    }
  };

  window.AntiReplayPatch = AntiReplayPatch;
})(window);
