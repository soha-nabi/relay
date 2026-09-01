"""Seed script for populating MongoDB with sample payment transactions and customers.

Safe to run repeatedly — operations are idempotent and use upserts to prevent duplicates.
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import pandas as pd
from backend.db import (
    check_mongodb_connection,
    customer_repository,
    is_mongodb_configured,
    transaction_repository,
)


def seed_sample_data(csv_path: str = "sample_payments.csv", merchant_id: str = "merchant") -> dict:
    """Read CSV, normalize, and upsert transactions and customers into MongoDB."""
    import backend.db as db_mod
    conn = db_mod.check_mongodb_connection()
    if conn["status"] != "connected":
        print(f"[-] MongoDB is not connected (status: {conn['status']}). Aborting seed.")
        return {"status": "aborted", "reason": conn.get("message", "MongoDB unavailable")}

    if not os.path.exists(csv_path):
        print(f"[-] Sample CSV file '{csv_path}' not found.")
        return {"status": "error", "reason": f"File '{csv_path}' not found"}

    print(f"[*] Reading and normalizing '{csv_path}'...")
    df = pd.read_csv(csv_path, dtype={"customer_id": str, "transaction_id": str})
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df = df.dropna(subset=["amount"])

    if "recovery_amount" in df.columns:
        df["recovery_amount"] = pd.to_numeric(df["recovery_amount"], errors="coerce").fillna(0.0)
    else:
        df["recovery_amount"] = 0.0
    df["payment_status"] = df.get("status", df.get("payment_status")).astype("string").str.lower().str.strip()
    df["status"] = df["payment_status"]

    records = df.to_dict(orient="records")
    print(f"[*] Found {len(records)} normalized records. Upserting to MongoDB...")

    # 1. Upsert transactions
    txn_count = db_mod.transaction_repository.upsert_transactions_batch(records, merchant_id=merchant_id)
    print(f"[+] Successfully upserted {txn_count} transactions for merchant '{merchant_id}'.")

    # 2. Upsert customers
    cust_count = db_mod.customer_repository.upsert_customers_from_transactions(records, merchant_id=merchant_id)
    print(f"[+] Successfully upserted {cust_count} customer records for merchant '{merchant_id}'.")

    return {
        "status": "success",
        "transactions_upserted": txn_count,
        "customers_upserted": cust_count,
        "merchant_id": merchant_id,
    }


if __name__ == "__main__":
    result = seed_sample_data()
    print(f"[✓] Seed result: {result}")
