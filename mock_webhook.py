#!/usr/bin/env python3
"""Mock Payment Webhook Tester CLI for Relay Recovery Engine.

Usage:
  python mock_webhook.py failed <transaction_id> [amount] [customer_id] [reason] [--event-id ID] [--secret SECRET]
  python mock_webhook.py captured <transaction_id> [amount] [customer_id] [--event-id ID] [--secret SECRET]

Examples:
  # Generate unique event_id automatically
  python mock_webhook.py failed TXN0000001

  # Test idempotency (run twice with same event_id)
  python mock_webhook.py failed TXN0000001 2400 CUST000052 "Card Declined" --event-id evt_test_123
  python mock_webhook.py failed TXN0000001 2400 CUST000052 "Card Declined" --event-id evt_test_123

  # Capture/complete payment
  python mock_webhook.py captured TXN0000001
"""

import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.request
import uuid


def send_webhook(
    event_type: str,
    txn_id: str,
    amount: float = 2400.0,
    customer_id: str = "CUST000052",
    reason: str = "Card Declined",
    event_id: str | None = None,
    secret: str | None = None,
    url: str = "http://localhost:8000/webhooks/payment",
):
    ev_id = event_id or f"evt_{uuid.uuid4().hex[:12]}"
    norm_event = "payment.failed" if event_type.lower() in ("failed", "payment.failed") else "payment.captured"

    payload = {
        "event_id": ev_id,
        "event": norm_event,
        "transaction_id": txn_id,
        "customer_id": customer_id,
        "amount": amount,
        "reason": reason if norm_event == "payment.failed" else None,
        "payment_method": "Credit Card",
        "merchant_id": "merchant",
    }

    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Relay-Mock-Webhook-CLI/1.0",
    }

    # If secret provided, compute HMAC-SHA256 signature
    webhook_secret = secret or os.environ.get("WEBHOOK_SECRET")
    if webhook_secret:
        sig = hmac.new(webhook_secret.encode("utf-8"), data, hashlib.sha256).hexdigest()
        headers["X-Relay-Signature"] = sig

    print(f"\n🚀 Sending mock {payload['event']} webhook to {url}...")
    print(f"📦 Payload (event_id={ev_id}):")
    print(json.dumps(payload, indent=2))
    if "X-Relay-Signature" in headers:
        print("🔒 Header: X-Relay-Signature attached")
    print()

    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            status_code = response.status
            try:
                parsed = json.loads(res_body)
                print(f"✓ Response [{status_code} OK]:")
                print(json.dumps(parsed, indent=2))
            except Exception:
                print(f"✓ Response [{status_code}]: {res_body}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"❌ HTTP Error [{e.code}]: {err_body}")
    except Exception as e:
        print(f"❌ Connection Error: {e}")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(1)

    event_type = sys.argv[1]
    args = sys.argv[2:]

    txn_id = "TXN0000001"
    amount = 2400.0
    customer_id = "CUST000052"
    reason = "Card Declined"
    event_id = None
    secret = None

    i = 0
    pos_idx = 0
    while i < len(args):
        if args[i] == "--event-id" and i + 1 < len(args):
            event_id = args[i + 1]
            i += 2
        elif args[i] == "--secret" and i + 1 < len(args):
            secret = args[i + 1]
            i += 2
        else:
            if pos_idx == 0:
                txn_id = args[i]
            elif pos_idx == 1:
                amount = float(args[i])
            elif pos_idx == 2:
                customer_id = args[i]
            elif pos_idx == 3:
                reason = args[i]
            pos_idx += 1
            i += 1

    send_webhook(
        event_type=event_type,
        txn_id=txn_id,
        amount=amount,
        customer_id=customer_id,
        reason=reason,
        event_id=event_id,
        secret=secret,
    )


if __name__ == "__main__":
    main()
