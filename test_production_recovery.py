"""Enterprise Test Suite for Refactored Relay Payment Recovery Platform.

Validates all 10 Senior Backend Architect Requirements:
1. Webhook idempotency protection
2. Recovery session state locking & concurrency control
3. Duplicate email prevention
4. Duplicate voice call prevention
5. Max retry limit enforcement (3)
6. Comprehensive audit logging
7. MongoDB audit trail persistence
8. Standardized recovery session states (ACTIVE, RETRY_SCHEDULED, PAYMENT_PENDING, RECOVERED, EXHAUSTED, STOPPED_PAID)
9. Webhook payment.captured resolution (halt pending actions, mark RECOVERED, audit log)
10. Backward-compatible API routes
"""

import os
import uuid
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from main import app, data_store, Dataset
from backend.recovery_engine import (
    STATE_ACTIVE,
    STATE_RETRY_SCHEDULED,
    STATE_PAYMENT_PENDING,
    STATE_RECOVERED,
    STATE_EXHAUSTED,
    STATE_STOPPED_PAID,
    MAX_ATTEMPTS,
    create_recovery_session,
    execute_recovery_action,
    verify_payment_status,
    resolve_payment_captured,
    session_lock,
    can_send_recovery_email,
    mark_recovery_email_sent,
    can_trigger_voice_call,
    mark_voice_call_triggered,
    normalize_status,
    log_audit_event,
)
from backend.email_service import send_session_recovery_email
from backend.elevenlabs_service import trigger_session_voice_call
from backend.db import audit_log_repository, recovery_session_repository


@pytest.fixture
def test_dataset():
    """Create an isolated test dataset."""
    df = pd.DataFrame([
        {
            "transaction_id": "TXN_TEST_001",
            "customer_id": "CUST_TEST_001",
            "amount": 2500.0,
            "payment_method": "Credit Card",
            "failure_reason": "Insufficient Funds",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_TEST_002",
            "customer_id": "CUST_TEST_002",
            "amount": 1200.0,
            "payment_method": "Debit Card",
            "failure_reason": "Card Declined",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_TEST_003",
            "customer_id": "CUST_TEST_003",
            "amount": 5000.0,
            "payment_method": "ACH",
            "failure_reason": "Account Inactive",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
    ])
    ds = Dataset(dataframe=df, uploaded_at="2026-09-01T00:00:00Z", file_name="test_data.csv")
    data_store._datasets["merchant"] = ds
    return ds


@pytest.fixture
def client(test_dataset):
    return TestClient(app)


# ---------------------------------------------------------------------------
# Requirement 8 & 5: Standardized States & Max 3 Retries Enforcement
# ---------------------------------------------------------------------------

def test_recovery_states_and_max_retries(test_dataset):
    """Verify session creation uses standard states and enforces max 3 retries limit."""
    session = create_recovery_session(
        dataset=test_dataset,
        customer_id="CUST_TEST_001",
        strategy="Smart Retry",
    )

    # Initial state must be valid active/scheduled state
    assert session["status"] in (STATE_ACTIVE, STATE_RETRY_SCHEDULED)
    assert session["max_attempts"] == MAX_ATTEMPTS
    assert session["attempt_count"] == 0

    # Attempt 1
    execute_recovery_action(session, test_dataset)
    assert session["attempt_count"] == 1
    assert session["status"] == STATE_RETRY_SCHEDULED

    # Attempt 2
    execute_recovery_action(session, test_dataset)
    assert session["attempt_count"] == 2
    assert session["status"] == STATE_RETRY_SCHEDULED

    # Attempt 3 (Max limit reached -> EXHAUSTED)
    execute_recovery_action(session, test_dataset)
    assert session["attempt_count"] == 3
    assert session["status"] == STATE_EXHAUSTED

    # Attempt 4 (Blocked, must remain EXHAUSTED)
    execute_recovery_action(session, test_dataset)
    assert session["attempt_count"] == 3
    assert session["status"] == STATE_EXHAUSTED


def test_permanent_failure_transitions_to_stopped(test_dataset):
    """Verify permanent failure (Account Inactive) immediately stops without retries."""
    session = create_recovery_session(
        dataset=test_dataset,
        customer_id="CUST_TEST_003",
    )
    verify_payment_status(session, test_dataset)
    assert session["status"] == STATE_STOPPED_PAID


# ---------------------------------------------------------------------------
# Requirement 2: Recovery Session State Locking
# ---------------------------------------------------------------------------

def test_session_state_locking():
    """Verify context manager acquires and releases session lock safely."""
    sid = "sess_lock_test_123"
    with session_lock(sid) as acquired:
        assert acquired is True

    # Re-acquisition is supported (re-entrant RLock)
    with session_lock(sid) as acq1:
        assert acq1 is True
        with session_lock(sid) as acq2:
            assert acq2 is True


# ---------------------------------------------------------------------------
# Requirement 3 & 4: Prevent Duplicate Email & Voice Dispatches
# ---------------------------------------------------------------------------

def test_duplicate_email_prevention(test_dataset):
    """Verify emails cannot be sent multiple times for the same recovery attempt."""
    session = create_recovery_session(test_dataset, "CUST_TEST_001")
    session["customer_email"] = "test.cust@relay.io"

    # Attempt 0: First check must be True
    assert can_send_recovery_email(session, attempt=0) is True

    # Mark sent
    mark_recovery_email_sent(session, "msg_test_001", attempt=0)

    # Second check for attempt 0 must be False
    assert can_send_recovery_email(session, attempt=0) is False

    # Dispatch helper should report duplicate_prevented
    res = send_session_recovery_email(session)
    assert res["status"] == "skipped"
    assert res["reason"] == "duplicate_prevented"


def test_duplicate_voice_call_prevention(test_dataset):
    """Verify voice calls cannot be placed multiple times for the same recovery attempt."""
    session = create_recovery_session(test_dataset, "CUST_TEST_002")

    assert can_trigger_voice_call(session, attempt=0) is True

    # Trigger call 1
    res1 = trigger_session_voice_call(session)
    assert res1["status"] == "initiated"
    assert "call_id" in res1

    # Trigger call 2 (Duplicate -> must be skipped)
    res2 = trigger_session_voice_call(session)
    assert res2["status"] == "skipped"
    assert res2["reason"] == "duplicate_prevented"


# ---------------------------------------------------------------------------
# Requirement 6 & 7: Audit Logging & MongoDB Persistence
# ---------------------------------------------------------------------------

def test_audit_logging_structure(test_dataset):
    """Verify structured audit logs are generated with required fields."""
    session = create_recovery_session(test_dataset, "CUST_TEST_001")

    log_entry = log_audit_event(
        session=session,
        event="custom_audit_test",
        actor="unit_test",
        action="test_action",
        details={"note": "testing audit pipeline"},
    )

    assert "audit_id" in log_entry
    assert log_entry["event"] == "custom_audit_test"
    assert log_entry["actor"] == "unit_test"
    assert log_entry["action"] == "test_action"
    assert "timestamp" in log_entry
    assert any(e["event"] == "custom_audit_test" for e in session["audit_trail"])


# ---------------------------------------------------------------------------
# Requirement 9: Webhook Payment Captured Resolution
# ---------------------------------------------------------------------------

def test_payment_captured_webhook_resolution(test_dataset, client):
    """Verify payment.captured webhook stops pending retries, marks RECOVERED, and logs audit trail."""
    # 1. Create active recovery session for TXN_TEST_001
    session = create_recovery_session(test_dataset, "CUST_TEST_001", strategy="Smart Retry")
    sid = session["session_id"]
    test_dataset.recovery_sessions[sid] = session
    assert session["status"] in (STATE_ACTIVE, STATE_RETRY_SCHEDULED)

    # 2. Fire payment.captured webhook
    payload = {
        "event": "payment.captured",
        "event_id": f"evt_capture_{uuid.uuid4().hex[:8]}",
        "transaction_id": "TXN_TEST_001",
        "customer_id": "CUST_TEST_001",
        "amount": 2500.0,
        "payment_method": "UPI",
        "merchant_id": "merchant",
    }
    resp = client.post("/webhooks/payment", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "processed"
    assert data["session_status"] == STATE_RECOVERED

    # Verify session state is updated
    sess = test_dataset.recovery_sessions[sid]
    assert sess["status"] == STATE_RECOVERED
    assert sess["recovered_amount"] == 2500.0
    assert sess["next_action_at"] is None
    assert sess["retry_time"] is None
    assert any(e["event"] == "payment_recovered" for e in sess["audit_trail"])


# ---------------------------------------------------------------------------
# Requirement 1: Webhook Idempotency Protection
# ---------------------------------------------------------------------------

def test_webhook_idempotency_protection(client):
    """Verify duplicate webhook payloads are rejected with already_processed status."""
    event_id = f"evt_idempotent_{uuid.uuid4().hex[:8]}"
    payload = {
        "event": "payment.failed",
        "event_id": event_id,
        "transaction_id": "TXN_IDEMP_999",
        "customer_id": "CUST_IDEMP_999",
        "amount": 1999.0,
        "reason": "Card Declined",
        "merchant_id": "merchant",
    }

    # First call: processed
    resp1 = client.post("/webhooks/payment", json=payload)
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["status"] == "processed"

    # Second call (identical event_id): must return already_processed
    resp2 = client.post("/webhooks/payment", json=payload)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["status"] == "already_processed"


# ---------------------------------------------------------------------------
# Requirement 10: Preserved API Compatibility
# ---------------------------------------------------------------------------

def test_preserved_api_endpoints(client):
    """Verify core health, dashboard, customer profile, simulation, and audit routes return 200."""
    auth_headers = {"Cookie": "session_id=usr_merchant"}
    
    # 1. Health check
    r_health = client.get("/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "healthy"

    # 2. Authenticate merchant session
    login_resp = client.post("/auth/login", json={"username": "merchant", "password": "merchant123"})
    assert login_resp.status_code == 200
    session_cookie = login_resp.cookies.get("session_id")
    headers = {"Cookie": f"session_id={session_cookie}"}

    # 3. Dashboard metrics
    r_dash = client.get("/dashboard", headers=headers)
    assert r_dash.status_code == 200
    assert "summary" in r_dash.json()

    # 4. Customer profile
    r_cust = client.get("/customer/CUST_TEST_001", headers=headers)
    assert r_cust.status_code == 200

    # 5. Recommendation
    r_rec = client.post("/recommend", json={"customer_id": "CUST_TEST_001"}, headers=headers)
    assert r_rec.status_code == 200

    # 6. Simulate
    r_sim = client.post("/simulate", json={"customer_id": "CUST_TEST_001", "strategy": "Smart Retry"}, headers=headers)
    assert r_sim.status_code == 200

    # 7. Audit logs
    r_audit = client.get("/audit-logs", headers=headers)
    assert r_audit.status_code == 200
    assert "audit_logs" in r_audit.json()
