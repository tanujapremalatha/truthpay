"""
server.py — Enterprise Verity Microservice & REST Gateway
Serves the web dashboard, provides high-throughput verification REST endpoints,
OCR text parsing, and ledger management.
"""

import json
import mimetypes
import os
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from config import config
from core import FraudEngine, OCREngine, ledger

START_TIME = time.time()
WEB_ROOT = os.path.dirname(os.path.abspath(__file__))


class VerityRequestHandler(SimpleHTTPRequestHandler):
    """
    HTTP Request Handler combining static web app delivery and REST API routing.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_ROOT, **kwargs)

    def _send_json(self, status_code: int, data: dict):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS pre-flight requests."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # REST API Routes
        if path == "/api/v1/health":
            self._send_json(200, {
                "status": "healthy",
                "uptime_seconds": round(time.time() - START_TIME, 2),
                "engine": "Verity Neural Fraud Sentinel v2.4",
                "ledger_entries": len(ledger.get_all()),
                "firestore_project": config.FIREBASE_PROJECT_ID
            })
            return

        if path == "/api/v1/ledger":
            self._send_json(200, {
                "count": len(ledger.get_all()),
                "entries": ledger.get_all()
            })
            return

        # Fallback to serving static frontend files (index.html, app.js, style.css)
        if path == "/" or path == "":
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Read JSON Payload
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except Exception:
            payload = {}

        # 1. Full Fraud & Ledger Verification Endpoint
        if path == "/api/v1/verify":
            token = payload.get("token") or payload.get("id") or ""
            candidates = payload.get("candidates") or ([token] if token else [])
            raw_text = payload.get("raw_text") or payload.get("text") or ""

            verdict = FraudEngine.evaluate(
                candidates=candidates,
                raw_text=raw_text,
                ledger_lookup_fn=ledger.get,
                claim_fn=ledger.claim_atomic
            )

            self._send_json(200, {
                "status": verdict.status.value,
                "headline": verdict.headline,
                "token_id": verdict.token_id,
                "risk_score": verdict.risk_score,
                "sub_meta": verdict.sub_meta,
                "matched_entry": verdict.matched_entry,
                "risk_factors": [
                    {"name": r.name, "severity": r.severity, "description": r.description}
                    for r in verdict.risk_factors
                ]
            })
            return

        # 2. Receipt OCR & Token Parsing Endpoint
        if path == "/api/v1/ocr":
            text = payload.get("text") or payload.get("raw_text") or ""
            metadata = OCREngine.parse_receipt(text)
            self._send_json(200, {
                "candidates": metadata.candidates,
                "amount": metadata.amount,
                "app_detected": metadata.app_detected,
                "timestamp": metadata.timestamp,
                "token_count": len(metadata.candidates)
            })
            return

        # 3. Add to Ledger Endpoint
        if path == "/api/v1/ledger":
            token = payload.get("id") or payload.get("token")
            amount = payload.get("amount", "—")
            note = payload.get("note", "API Registration")

            if not token or len(token) < 6:
                self._send_json(400, {"error": "Valid UTR or Transaction ID required (min 6 chars)"})
                return

            success = ledger.add(token, amount=amount, note=note)
            if success:
                self._send_json(201, {"message": "Transaction registered successfully", "id": token})
            else:
                self._send_json(409, {"error": "Transaction ID already registered in ledger", "id": token})
            return

        # 4. Atomic Claim Endpoint
        if path == "/api/v1/claim":
            token = payload.get("id") or payload.get("token")
            if not token:
                self._send_json(400, {"error": "Token ID required"})
                return

            result = ledger.claim_atomic(token)
            status_code = 200 if result["status"] == "success" else (404 if result["status"] == "missing" else 409)
            self._send_json(status_code, result)
            return

        # 5. Restore Sample Seeds Endpoint
        if path == "/api/v1/reset":
            ledger.reset_seed()
            self._send_json(200, {"message": "Sample benchmark entries restored", "count": len(ledger.get_all())})
            return

        self._send_json(404, {"error": f"Endpoint {path} not found"})


def run_server(host: str = config.HOST, port: int = config.PORT):
    """Starts the Verity Gateway HTTP Server."""
    server_address = (host, port)
    httpd = HTTPServer(server_address, VerityRequestHandler)
    print(f"""
========================================================================
  VERITY — UPI Fraud Defense & Ledger Microservice Gateway
========================================================================
  -> Status:       RUNNING
  -> URL:          http://{host}:{port}/
  -> API Base:     http://{host}:{port}/api/v1/
  -> Web UI:       http://{host}:{port}/index.html
  -> Firestore:    {config.FIREBASE_PROJECT_ID}
  -> Admin PIN:    {config.ADMIN_PIN}
========================================================================
Press Ctrl+C to terminate gateway service.
""")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Gateway] Shutting down gracefully...")
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else config.PORT
    run_server(port=port)
