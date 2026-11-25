# Code Fuzion 2026 — Round 3 Dedicated Patch Notes
**Team:** Scoobydoo (CF26-T040)  
**Problem Statement:** H2 — Fake UPI Payment Screenshot Detector  

This document details the dedicated, modular standalone files created to address the two vulnerabilities identified during the Round 3 evaluation:
1. **Replay Attack Vulnerability (Hour-12 Twist)**
2. **False Positive Bias on Compressed Screenshots & Standard Fonts**

---

## 📁 New Standalone Modules Overview

| New File | Responsibility | Solves Evaluator Feedback |
|---|---|---|
| **`anti_replay_engine.py`** | Timestamp freshness validator & persistent cross-session scan database | **Hour-12 Twist & Cross-Day Replay**: Enforces a 45-minute freshness window and indexes historical scans to block repeated presentations. |
| **`confusable_decoder.py`** | Topological OCR confusable recovery matrix (`O->0`, `l->1`, `B->8`, etc.) | **False Positive Bias**: Recovers authentic 12-digit UTRs degraded by WhatsApp JPEG DCT noise or OEM antialiased fonts. |
| **`forensic_verifier_v2.py`** | Autonomous multi-factor verification engine | **Unseeded Benchmark Evaluations**: Autonomously verifies authentic bank UI geometries, Julian day syntax, and timestamps without requiring pre-seeded admin databases. |
| **`test_round3_benchmarks.py`** | Standalone benchmark test runner | **Empirical Proof**: 4 test scenarios verifying that stale receipts are rejected, replays are trapped, and confusables are recovered. |
| **`round3_patch.js`** | Client-side standalone JavaScript patch | **Browser Runtime**: Provides identical freshness validation, confusable recovery, and persistent scan tracking in the web terminal. |

---

## 🔬 Technical Remediation Deep-Dive

### 1. Hour-12 Twist Replay Defense (`anti_replay_engine.py`)
* **Temporal Parsing:** Extracts timestamps (`HH:MM AM/PM`) and dates (`DD Mon YYYY`, `Yesterday`, `Today`).
* **Freshness Constraint:** Calculates elapsed time $\Delta t = t_{\text{current}} - t_{\text{receipt}}$. If $\Delta t > 45\text{ minutes}$, the receipt is deterministically rejected as `REPLAY_ATTACK (EXPIRED RECEIPT)`.
* **Stateful Persistence:** Maintains `data/scanned_history.json`. When any UTR is scanned, its cryptographic hash and initial observation timestamp are recorded. Replay attempts on subsequent days trigger an immediate duplicate alert.

### 2. Elimination of False Positive Bias (`confusable_decoder.py`)
* Standard OCR pipelines often mistake `44O99536l349` for a corrupt token because of JPEG block quantization.
* `OCRConfusableDecoder.decode_token()` runs an inverse topological substitution:
  $$\text{'O', 'o', 'D', 'Q'} \mapsto 0 \quad|\quad \text{'I', 'l', '\|', '!'} \mapsto 1 \quad|\quad \text{'Z', 'z'} \mapsto 2 \quad|\quad \text{'S', 's'} \mapsto 5 \quad|\quad \text{'B'} \mapsto 8$$
* Resolves the recovered token `440995361349` with zero syntax penalty, avoiding the 2x false-positive deduction.

---

## 🧪 Verification Commands

To run the standalone Round 3 evaluation suite:
```bash
python test_round3_benchmarks.py
```

Expected Output:
```
[✓] Hour-12 Twist Replay Defense: PASSED (Detected stale receipt)
[✓] Cross-Session Scan Persistence: PASSED (Caught repeated presentation)
[✓] False Positive Bias Elimination: PASSED (Confusable 44O99536l349 decoded to 440995361349)
[✓] GPay Collect Request Trap: PASSED (Intercepted incoming request)
```
