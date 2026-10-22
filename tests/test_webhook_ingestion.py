"""Automated test suite verifying Hardened Payment Webhook Ingestion."""

import hashlib
import hmac
import json
import os
import httpx
import pandas as pd
import pytest

from backend.auth import SESSION_STORE, USERS
from backend.automation_engine import _AUTOMATION_STORE, create_automation
from backend.recovery_engine import create_recovery_session
from main import Dataset, _PROCESSED_WEBHOOKS, app, data_store


@pytest.fixture(autouse=True)
def setup_webhook_test_dataset():
    """Create test dataset and clear in-memory and database stores before each webhook test."""
    from backend.db import webhook_event_repository
    _PROCESSED_WEBHOOKS.clear()
    _AUTOMATION_STORE.clear()
    if webhook_event_repository.collection is not None:
        try:
            webhook_event_repository.collection.delete_many({})
        except Exception:
            pass
    os.environ["WEBHOOK_VERIFY_SIGNATURES"] = "false"
    os.environ.pop("WEBHOOK_SECRET", None)

    test_df = pd.DataFrame([
        {
            "transaction_id": "TXN_WH_SOFT_01",
            "customer_id": "CUST_WH_SOFT",
            "amount": 2400.0,
            "payment_method": "Debit Card",
            "failure_reason": "Insufficient Funds",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_WH_HARD_02",
            "customer_id": "CUST_WH_HARD",
            "amount": 1800.0,
            "payment_method": "Credit Card",
            "failure_reason": "Expired Card",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_WH_PERM_03",
            "customer_id": "CUST_WH_PERM",
            "amount": 5000.0,
            "payment_method": "ACH",
            "failure_reason": "Account Closed",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_WH_SUCC_04",
            "customer_id": "CUST_WH_HEALTHY",
            "amount": 1200.0,
            "payment_method": "UPI",
            "failure_reason": "",
            "recovery_amount": 0.0,
            "payment_status": "success",
            "status": "success",
        },
    ])
    ds = Dataset(dataframe=test_df, uploaded_at="2026-08-29T12:00:00Z", file_name="webhook_test.csv")
    data_store._datasets["merchant"] = ds
    SESSION_STORE["test-merchant-token"] = "merchant"
    yield ds
    _PROCESSED_WEBHOOKS.clear()
    _AUTOMATION_STORE.clear()
    if webhook_event_repository.collection is not None:
        try:
            webhook_event_repository.collection.delete_many({})
        except Exception:
            pass
    os.environ["WEBHOOK_VERIFY_SIGNATURES"] = "false"
    os.environ.pop("WEBHOOK_SECRET", None)



# ===========================================================================
# 1. VALID FAILED & CAPTURED WEBHOOKS
# ===========================================================================

@pytest.mark.asyncio
async def test_valid_failed_webhook():
    """Test 1: Valid payment.failed webhook automatically starts recovery and creates session."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event_id": "evt_failed_001",
                "event": "payment.failed",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
                "reason": "Insufficient Funds",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "processed"
        assert data["recovery_started"] is True
        assert data["strategy"] == "Smart Retry"
        assert data["failure_category"] == "soft"
        assert "payment_url" in data


@pytest.mark.asyncio
async def test_valid_captured_webhook():
    """Test 2: Valid payment.captured webhook marks recovery recovered and stops retries."""
    ds = data_store.get("merchant")
    session = create_recovery_session(ds, "CUST_WH_SOFT", strategy="Smart Retry")
    session_id = session["session_id"]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event_id": "evt_captured_002",
                "event": "payment.captured",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "processed"
        assert data["session_status"] == "recovered"
        assert data["recovered_amount"] == 2400.0
        assert session["status"] == "recovered"


# ===========================================================================
# 2. VALIDATION & ERROR HANDLING
# ===========================================================================

@pytest.mark.asyncio
async def test_missing_event_returns_400():
    """Test 3: Missing event returns clear 400 Bad Request."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
            },
        )
        assert res.status_code == 400
        assert "event" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_missing_transaction_id_returns_400():
    """Test 4: Missing transaction_id returns clear 400 Bad Request."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
            },
        )
        assert res.status_code == 400
        assert "transaction_id" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invalid_amount_returns_400():
    """Test 5: Invalid or negative amount returns clear 400 Bad Request."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": -50.0,
            },
        )
        assert res.status_code == 400
        assert "amount" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_unsupported_event_returns_400():
    """Test 6: Unsupported webhook event returns clear 400 response."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event": "subscription.cancelled",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
            },
        )
        assert res.status_code == 400
        assert "unsupported" in res.json()["detail"].lower()


# ===========================================================================
# 3. IDEMPOTENCY & DUPLICATE PROTECTION
# ===========================================================================

@pytest.mark.asyncio
async def test_duplicate_event_with_same_event_id():
    """Test 7: Duplicate event with same event_id is safely ignored."""
    payload = {
        "event_id": "evt_dedup_unique_888",
        "event": "payment.failed",
        "transaction_id": "TXN_WH_SOFT_01",
        "customer_id": "CUST_WH_SOFT",
        "amount": 2400.0,
        "reason": "Insufficient Funds",
    }
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/webhooks/payment", json=payload)
        assert res1.status_code == 200
        assert res1.json()["status"] == "processed"
        sid = res1.json()["session_id"]

        res2 = await client.post("/webhooks/payment", json=payload)
        assert res2.status_code == 200
        assert res2.json()["status"] == "already_processed"
        assert res2.json()["session_id"] == sid


@pytest.mark.asyncio
async def test_duplicate_payment_failed_without_event_id():
    """Test 8: Duplicate payment.failed without event_id uses composite key and avoids second session."""
    payload = {
        "event": "payment.failed",
        "transaction_id": "TXN_WH_SOFT_01",
        "customer_id": "CUST_WH_SOFT",
        "amount": 2400.0,
        "reason": "Insufficient Funds",
    }
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res1 = await client.post("/webhooks/payment", json=payload)
        assert res1.status_code == 200
        assert res1.json()["status"] == "processed"

        res2 = await client.post("/webhooks/payment", json=payload)
        assert res2.status_code == 200
        assert res2.json()["status"] == "already_processed"

        ds = data_store.get("merchant")
        matching = [s for s in ds.recovery_sessions.values() if s.get("transaction_id") == "TXN_WH_SOFT_01"]
        assert len(matching) == 1


# ===========================================================================
# 4. CAPTURE STOPS RECOVERY & ALREADY SUCCESSFUL
# ===========================================================================

@pytest.mark.asyncio
async def test_captured_event_stops_recovery_and_records_audit():
    """Test 9: Captured event stops active recovery and logs recovery_auto_stopped."""
    ds = data_store.get("merchant")
    session = create_recovery_session(ds, "CUST_WH_SOFT", strategy="Smart Retry")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.captured",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
            },
        )
        assert res.status_code == 200
        events = [e["event"] for e in session["audit_trail"]]
        assert "webhook_received" in events
        assert "payment_captured" in events
        assert "recovery_auto_stopped" in events


@pytest.mark.asyncio
async def test_already_successful_payment_ignored():
    """Test 10: payment.failed on already successful transaction is safely ignored."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "transaction_id": "TXN_WH_SUCC_04",
                "customer_id": "CUST_WH_HEALTHY",
                "amount": 1200.0,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ignored"
        assert "Payment already completed" in data["message"]


# ===========================================================================
# 5. SIGNATURE VERIFICATION (PRODUCTION & DEMO MODES)
# ===========================================================================

@pytest.mark.asyncio
async def test_signature_verification_enabled_valid_signature():
    """Test 11: When WEBHOOK_VERIFY_SIGNATURES=true, valid HMAC signature succeeds."""
    secret = "test_webhook_secret_key_123"
    os.environ["WEBHOOK_VERIFY_SIGNATURES"] = "true"
    os.environ["WEBHOOK_SECRET"] = secret

    payload = {
        "event_id": "evt_sig_valid_01",
        "event": "payment.failed",
        "transaction_id": "TXN_WH_SOFT_01",
        "customer_id": "CUST_WH_SOFT",
        "amount": 2400.0,
        "reason": "Insufficient Funds",
    }
    raw_body = json.dumps(payload).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            content=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Relay-Signature": sig,
            },
        )
        assert res.status_code == 200
        assert res.json()["status"] == "processed"


@pytest.mark.asyncio
async def test_signature_verification_enabled_invalid_signature():
    """Test 12: When WEBHOOK_VERIFY_SIGNATURES=true, invalid signature returns 401."""
    os.environ["WEBHOOK_VERIFY_SIGNATURES"] = "true"
    os.environ["WEBHOOK_SECRET"] = "correct_secret"

    payload = {
        "event_id": "evt_sig_invalid_02",
        "event": "payment.failed",
        "transaction_id": "TXN_WH_SOFT_01",
        "customer_id": "CUST_WH_SOFT",
        "amount": 2400.0,
    }
    raw_body = json.dumps(payload).encode("utf-8")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            content=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Relay-Signature": "invalid_signature_hex",
            },
        )
        assert res.status_code == 401
        assert "signature" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_demo_mode_without_signature_allowed():
    """Test 13: In Demo mode (WEBHOOK_VERIFY_SIGNATURES=false), request without signature succeeds."""
    os.environ["WEBHOOK_VERIFY_SIGNATURES"] = "false"

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event_id": "evt_demo_no_sig",
                "event": "payment.failed",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
                "reason": "Insufficient Funds",
            },
        )
        assert res.status_code == 200
        assert res.json()["status"] == "processed"


# ===========================================================================
# 6. AUDIT TRAIL
# ===========================================================================

@pytest.mark.asyncio
async def test_audit_events_recorded_during_webhook_flow():
    """Test 14: Audit trail records webhook_received, payment_failure_detected, recovery_auto_initialized."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/webhooks/payment",
            json={
                "event_id": "evt_audit_verify",
                "event": "payment.failed",
                "transaction_id": "TXN_WH_SOFT_01",
                "customer_id": "CUST_WH_SOFT",
                "amount": 2400.0,
                "reason": "Insufficient Funds",
            },
        )
        assert res.status_code == 200
        sid = res.json()["session_id"]
        ds = data_store.get("merchant")
        session = ds.recovery_sessions[sid]
        events = [e["event"] for e in session["audit_trail"]]
        assert "webhook_received" in events
        assert "payment_failure_detected" in events
        assert "recovery_auto_initialized" in events
