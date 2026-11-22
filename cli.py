"""
cli.py — Verity Merchant Command Line Interface (CLI)
Provides command-line terminal verification, ledger audits, and benchmark checks.
Usage:
  python cli.py verify 440995361349
  python cli.py add 501234987612 --amount 1500 --note "Counter 2"
  python cli.py list
  python cli.py demo
  python cli.py audit
"""

import argparse
import json
import sys
from core import FraudEngine, OCREngine, VerdictStatus, ledger


def cmd_verify(args):
    """Verifies a single UTR or transaction ID."""
    token = args.token.upper().strip()
    raw_text = args.text or ""

    verdict = FraudEngine.evaluate(
        candidates=[token],
        raw_text=raw_text,
        ledger_lookup_fn=ledger.get,
        claim_fn=ledger.claim_atomic if args.claim else None
    )

    print("\n" + "=" * 60)
    print(f"  VERITY VERIFICATION AUDIT: {token}")
    print("=" * 60)
    print(f"  Status:       {verdict.status.value}")
    print(f"  Headline:     {verdict.headline}")
    print(f"  Risk Score:   {verdict.risk_score} / 100")
    print(f"  Audit Note:   {verdict.sub_meta}")
    if verdict.matched_entry:
        print(f"  Amount:       {verdict.matched_entry.get('amount')}")
        print(f"  Settled At:   {verdict.matched_entry.get('addedAt')}")
    print("=" * 60 + "\n")


def cmd_add(args):
    """Adds a new bank settlement ID to the ledger."""
    token = args.token.upper().strip()
    amount = args.amount or "—"
    note = args.note or "CLI Entry"

    success = ledger.add(token, amount=amount, note=note)
    if success:
        print(f"[✓] Successfully registered UTR: {token} ({amount} • {note})")
    else:
        print(f"[✗] Transaction ID {token} already exists in ledger.")


def cmd_list(args):
    """Lists all entries in the ledger."""
    entries = ledger.get_all()
    if args.status == "unused":
        entries = [e for e in entries if not e.get("claimed")]
    elif args.status == "claimed":
        entries = [e for e in entries if e.get("claimed")]

    print("\n" + "-" * 70)
    print(f"{'UTR / TRANSACTION ID':<22} {'AMOUNT':<10} {'STATUS':<10} {'NOTE':<18} {'ADDED':<10}")
    print("-" * 70)
    for e in entries:
        status_tag = "CLAIMED" if e.get("claimed") else "UNUSED"
        print(f"{e.get('id'):<22} {e.get('amount'):<10} {status_tag:<10} {e.get('note')[:17]:<18} {e.get('addedAt'):<10}")
    print("-" * 70)
    print(f"Total: {len(entries)} entries\n")


def cmd_demo(args):
    """Executes the standard 3 benchmark diagnostic scenarios."""
    scenarios = [
        ("Valid Paytm Settlement", ["440995361349"], "Paid Successfully\n₹871\nUPI Ref No: 440995361349"),
        ("Unregistered Counterfeit UTR", ["998877665544"], "Paid Successfully\n₹450\nUPI Ref No: 998877665544"),
        ("Google Pay Collect Scam Trap", ["CICAgPDTxtWHYA"], "Vishu Mad requested money from you\n₹800\nRequest received\ndecline\nignore this request\nCICAgPDTxtWHYA")
    ]

    print("\n" + "=" * 65)
    print("  VERITY FRAUD SENTINEL — BENCHMARK SUITE")
    print("=" * 65)

    for title, candidates, raw_text in scenarios:
        res = FraudEngine.evaluate(candidates, raw_text, ledger_lookup_fn=ledger.get)
        print(f"\n[Test] {title}")
        print(f"       -> Target:     {candidates[0]}")
        print(f"       -> Result:     {res.status.value}")
        print(f"       -> Headline:   {res.headline}")
        print(f"       -> Risk Score: {res.risk_score}/100")
    print("\n" + "=" * 65 + "\n")


def cmd_audit(args):
    """Audits system state and telemetry."""
    all_entries = ledger.get_all()
    unused = [e for e in all_entries if not e.get("claimed")]
    claimed = [e for e in all_entries if e.get("claimed")]

    print("\n" + "=" * 50)
    print("  LEDGER HEALTH & INTEGRITY AUDIT")
    print("=" * 50)
    print(f"  Total Monitored UTRs:    {len(all_entries)}")
    print(f"  Active Unused Tokens:    {len(unused)}")
    print(f"  Settled / Claimed:       {len(claimed)}")
    print(f"  Zero-Trust Guard:        ENABLED (Claim-Once)")
    print(f"  Storage Location:        {ledger.storage_path}")
    print("=" * 50 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Verity UPI Verification CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # verify
    p_verify = subparsers.add_parser("verify", help="Verify a transaction token")
    p_verify.add_argument("token", help="12-digit UTR or Order ID")
    p_verify.add_argument("--text", help="Raw OCR text context", default="")
    p_verify.add_argument("--claim", action="store_true", help="Claim token if valid")
    p_verify.set_defaults(func=cmd_verify)

    # add
    p_add = subparsers.add_parser("add", help="Register a new transaction token")
    p_add.add_argument("token", help="12-digit UTR or Order ID")
    p_add.add_argument("--amount", help="Transaction amount (e.g. ₹871)", default="—")
    p_add.add_argument("--note", help="Origin or counter note", default="CLI Registration")
    p_add.set_defaults(func=cmd_add)

    # list
    p_list = subparsers.add_parser("list", help="List registered transactions")
    p_list.add_argument("--status", choices=["all", "unused", "claimed"], default="all")
    p_list.set_defaults(func=cmd_list)

    # demo
    p_demo = subparsers.add_parser("demo", help="Run benchmark verification scenarios")
    p_demo.set_defaults(func=cmd_demo)

    # audit
    p_audit = subparsers.add_parser("audit", help="Audit ledger telemetry and security health")
    p_audit.set_defaults(func=cmd_audit)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
