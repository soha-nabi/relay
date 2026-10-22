"""Automated test suite verifying the Closed-Loop Recovery Engine, Smart Retry, and Custom Schedules."""

import httpx
import pandas as pd
import pytest

from backend.auth import SESSION_STORE, USERS
from backend.recovery_engine import (
    MAX_ATTEMPTS,
    calculate_smart_retry,
    classify_failure,
    complete_recovery_session,
    create_recovery_session,
    diagnose_payment_failure,
    execute_recovery_action,
    run_recovery_workflow,
    validate_custom_schedule,
    verify_payment_status,
)
from main import Dataset, app, customer_profile, data_store, recommendation


@pytest.fixture(autouse=True)
def setup_test_dataset():
    """Create a mock test dataset in data_store for 'merchant'."""
    test_df = pd.DataFrame([
        {
            "transaction_id": "TXN_SOFT_001",
            "customer_id": "CUST_SOFT",
            "amount": 1500.0,
            "payment_method": "Debit Card",
            "failure_reason": "Insufficient Funds",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_PERM_002",
            "customer_id": "CUST_PERM",
            "amount": 3000.0,
            "payment_method": "ACH",
            "failure_reason": "Account Closed",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_CARD_003",
            "customer_id": "CUST_CARD",
            "amount": 2500.0,
            "payment_method": "Credit Card",
            "failure_reason": "Expired Card",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_TIMEOUT_005",
            "customer_id": "CUST_TIMEOUT",
            "amount": 1200.0,
            "payment_method": "Digital Wallet",
            "failure_reason": "Network Timeout",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_ROUTING_006",
            "customer_id": "CUST_ROUTING",
            "amount": 1800.0,
            "payment_method": "Bank Transfer",
            "failure_reason": "Temporary Routing Error",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_SUCC_004",
            "customer_id": "CUST_HEALTHY",
            "amount": 5000.0,
            "payment_method": "UPI",
            "failure_reason": "",
            "recovery_amount": 0.0,
            "payment_status": "success",
            "status": "success",
        },
    ])
    ds = Dataset(dataframe=test_df, uploaded_at="2026-08-29T12:00:00Z", file_name="test_data.csv")
    data_store._datasets["merchant"] = ds
    return ds


# ----------------------------------------------------
# 1. FAILURE CLASSIFICATION TESTS
# ----------------------------------------------------
def test_failure_classification():
    """Verify soft, hard, and permanent failure classification."""
    cat, rec = classify_failure("Insufficient Funds")
    assert cat == "soft" and rec is True

    cat, rec = classify_failure("Daily Limit Exceeded")
    assert cat == "soft" and rec is True

    cat, rec = classify_failure("Expired Card")
    assert cat == "hard" and rec is True

    cat, rec = classify_failure("Card Declined")
    assert cat == "hard" and rec is True

    cat, rec = classify_failure("Account Closed")
    assert cat == "permanent" and rec is False

    cat, rec = classify_failure("Account Suspended")
    assert cat == "permanent" and rec is False


# ----------------------------------------------------
# 2. SMART RETRY ENGINE TESTS
# ----------------------------------------------------
def test_smart_retry_scoring_insufficient_funds(setup_test_dataset):
    """Smart Retry Rule 1: Insufficient funds recommends 24h delay with high confidence."""
    ds = setup_test_dataset
    res = calculate_smart_retry(ds.dataframe, "CUST_SOFT")
    assert res["retry_recommended"] is True
    assert res["recommended_delay_hours"] == 24.0
    assert res["confidence"] >= 70
    assert res["expected_recovery"] > 0
    assert "Smart Retry" in res["strategy"]


def test_smart_retry_scoring_temporary_timeout(setup_test_dataset):
    """Smart Retry Rule 2: Network / gateway timeouts recommend 4h delay."""
    ds = setup_test_dataset
    res = calculate_smart_retry(ds.dataframe, "CUST_TIMEOUT")
    assert res["retry_recommended"] is True
    assert res["recommended_delay_hours"] == 4.0
    assert res["confidence"] >= 75


def test_smart_retry_scoring_routing_error(setup_test_dataset):
    """Smart Retry Rule 3: Routing/bank issues recommend 18h clearing cycle delay."""
    ds = setup_test_dataset
    res = calculate_smart_retry(ds.dataframe, "CUST_ROUTING")
    assert res["retry_recommended"] is True
    assert res["recommended_delay_hours"] == 18.0


def test_smart_retry_hard_failure(setup_test_dataset):
    """Smart Retry Rule 4: Hard failures (Expired Card) require customer action, no direct auto-retry."""
    ds = setup_test_dataset
    res = calculate_smart_retry(ds.dataframe, "CUST_CARD")
    assert res["retry_recommended"] is False


def test_smart_retry_permanent_failure(setup_test_dataset):
    """Smart Retry Rule 5: Permanent failure (Account Closed) -> no retry recommended."""
    ds = setup_test_dataset
    res = calculate_smart_retry(ds.dataframe, "CUST_PERM")
    assert res["retry_recommended"] is False
    assert res["confidence"] == 0


def test_smart_retry_already_successful(setup_test_dataset):
    """Smart Retry Rule 6: Customer with successful transactions needs no recovery."""
    ds = setup_test_dataset
    res = calculate_smart_retry(ds.dataframe, "CUST_HEALTHY")
    assert res["retry_recommended"] is False


# ----------------------------------------------------
# 3. CUSTOM RETRY SCHEDULE TESTS
# ----------------------------------------------------
def test_custom_schedule_1_retry(setup_test_dataset):
    """Test 1: Custom schedule with 1 retry (e.g. Immediately [0.0])."""
    ds = setup_test_dataset
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0])
    assert session["strategy"] == "Custom Schedule"
    assert session["max_attempts"] == 1
    assert session["retry_schedule"] == [0.0]

    # Attempt 1 executed
    execute_recovery_action(session, ds)
    assert session["attempt_count"] == 1
    assert session["status"] == "retry_scheduled"

    # Verifying single failed attempt exhausts the 1 attempt configured
    verify_payment_status(session, ds)
    assert session["status"] == "exhausted"

    events = [a["event"] for a in session["audit_trail"]]
    assert "custom_schedule_created" in events
    assert "retry_scheduled" in events


def test_custom_schedule_2_retries(setup_test_dataset):
    """Test 2: Custom schedule with 2 retries (e.g. [0.0, 24.0])."""
    ds = setup_test_dataset
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0, 24.0])
    assert session["max_attempts"] == 2
    assert session["retry_schedule"] == [0.0, 24.0]

    # Attempt 1
    execute_recovery_action(session, ds)
    verify_payment_status(session, ds)
    assert session["attempt_count"] == 1
    assert session["status"] != "exhausted"

    # Attempt 2
    execute_recovery_action(session, ds)
    verify_payment_status(session, ds)
    assert session["attempt_count"] == 2
    assert session["status"] == "exhausted"


def test_custom_schedule_3_retries(setup_test_dataset):
    """Test 3: Custom schedule with 3 retries (e.g. [0.0, 24.0, 72.0])."""
    ds = setup_test_dataset
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0, 24.0, 72.0])
    assert session["max_attempts"] == 3
    assert session["retry_schedule"] == [0.0, 24.0, 72.0]


def test_custom_schedule_invalid_rejected(setup_test_dataset):
    """Test 4: Invalid schedule (>3 attempts, negative delay, empty) rejected with validation message."""
    ds = setup_test_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_SOFT")

    # >3 attempts
    valid, msg = validate_custom_schedule([0, 12, 24, 48], diag)
    assert valid is False
    assert "cannot exceed" in msg

    # Negative delay
    valid, msg = validate_custom_schedule([-1, 24], diag)
    assert valid is False
    assert "negative" in msg

    # Empty schedule
    valid, msg = validate_custom_schedule([], diag)
    assert valid is False


def test_custom_schedule_duplicate_rejected(setup_test_dataset):
    """Test 5: Duplicate delay times rejected."""
    ds = setup_test_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_SOFT")

    valid, msg = validate_custom_schedule([24, 24], diag)
    assert valid is False
    assert "duplicate" in msg.lower()


def test_custom_schedule_hard_failure_rejected(setup_test_dataset):
    """Test 6: Hard failures (Expired Card) cannot use custom retry schedule."""
    ds = setup_test_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_CARD")
    valid, msg = validate_custom_schedule([0, 24], diag)
    assert valid is False
    assert msg == "Custom retries aren't available for this payment because it requires customer action."


def test_custom_schedule_permanent_failure_rejected(setup_test_dataset):
    """Test 7: Permanent failures (Account Closed) cannot use custom retry schedule."""
    ds = setup_test_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_PERM")
    valid, msg = validate_custom_schedule([0, 24], diag)
    assert valid is False
    assert msg == "This payment can't be retried because the failure is permanent."


def test_custom_schedule_already_successful_rejected(setup_test_dataset):
    """Test 7b: Already successful payments cannot use custom retry schedule."""
    ds = setup_test_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_HEALTHY")
    valid, msg = validate_custom_schedule([0, 24], diag)
    assert valid is False
    assert msg == "Payment already completed. No recovery action is needed."


def test_custom_schedule_payment_succeeds_after_attempt_1(setup_test_dataset):
    """Test 8: Payment succeeds after attempt 1 -> immediately marked recovered and stops further attempts."""
    ds = setup_test_dataset
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0, 24.0, 72.0])

    execute_recovery_action(session, ds)
    assert session["attempt_count"] == 1

    # Payment succeeds in dataset
    ds.dataframe.loc[ds.dataframe["customer_id"] == "CUST_SOFT", "payment_status"] = "success"
    ds.dataframe.loc[ds.dataframe["customer_id"] == "CUST_SOFT", "status"] = "success"

    stopped = verify_payment_status(session, ds)
    assert stopped is True
    assert session["status"] == "recovered"
    assert session["recovered_amount"] == 1500.0
    assert session["attempt_count"] == 1


def test_custom_schedule_payment_succeeds_after_attempt_2(setup_test_dataset):
    """Test 9: Payment fails attempt 1, succeeds after attempt 2 -> stops at attempt 2 without running attempt 3."""
    ds = setup_test_dataset
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0, 24.0, 72.0])

    # Attempt 1 fails
    execute_recovery_action(session, ds)
    verify_payment_status(session, ds)
    assert session["attempt_count"] == 1
    assert session["status"] != "recovered"

    # Attempt 2 runs, payment marked success
    execute_recovery_action(session, ds)
    assert session["attempt_count"] == 2
    ds.dataframe.loc[ds.dataframe["customer_id"] == "CUST_SOFT", "payment_status"] = "success"
    ds.dataframe.loc[ds.dataframe["customer_id"] == "CUST_SOFT", "status"] = "success"

    stopped = verify_payment_status(session, ds)
    assert stopped is True
    assert session["status"] == "recovered"
    assert session["attempt_count"] == 2


def test_custom_schedule_exhausted_after_3_attempts(setup_test_dataset):
    """Test 10: Payment remains failed after 3 attempts -> status = exhausted, no 4th attempt allowed."""
    ds = setup_test_dataset
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0, 24.0, 72.0])

    # 1
    execute_recovery_action(session, ds)
    verify_payment_status(session, ds)
    # 2
    execute_recovery_action(session, ds)
    verify_payment_status(session, ds)
    # 3
    execute_recovery_action(session, ds)
    verify_payment_status(session, ds)

    assert session["attempt_count"] == 3
    assert session["status"] == "exhausted"

    # Attempt 4 should be rejected by guardrail
    execute_recovery_action(session, ds)
    assert session["attempt_count"] == 3
    assert session["status"] == "exhausted"


# ----------------------------------------------------
# 4. API & AUDIT TRAIL INTEGRATION TESTS
# ----------------------------------------------------
@pytest.mark.asyncio
async def test_api_custom_schedule_flow(setup_test_dataset):
    """Test Custom Schedule API validation, recover creation, and schedule endpoint."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Login
        login_res = await client.post("/auth/login", json={"username": "merchant", "password": "merchant123"})
        assert login_res.status_code == 200
        token = login_res.json()["session_id"]
        headers = {"X-Session-ID": token}

        # 1. Validate Schedule API
        val_res = await client.post(
            "/recover/validate-schedule",
            json={"customer_id": "CUST_SOFT", "retry_schedule": [0.0, 24.0, 72.0]},
            headers=headers,
        )
        assert val_res.status_code == 200
        assert val_res.json()["status"] == "valid"

        # 2. Invalid validation (duplicate)
        val_invalid = await client.post(
            "/recover/validate-schedule",
            json={"customer_id": "CUST_SOFT", "retry_schedule": [24.0, 24.0]},
            headers=headers,
        )
        assert val_invalid.status_code == 400

        # 3. Start Recovery with Custom Schedule
        rec_start = await client.post(
            "/recover",
            json={
                "customer_id": "CUST_SOFT",
                "strategy": "Custom Schedule",
                "expected_recovered_revenue": 1500.0,
                "retry_schedule": [0.0, 24.0, 72.0],
            },
            headers=headers,
        )
        assert rec_start.status_code == 200
        session_data = rec_start.json()
        assert session_data["strategy"] == "Custom Schedule"
        assert session_data["retry_schedule"] == [0.0, 24.0, 72.0]
        assert session_data["max_attempts"] == 3


def test_audit_event_trail(setup_test_dataset):
    """Verify audit events for both Smart Retry and Custom Schedule."""
    ds = setup_test_dataset

    # Custom Schedule Audit
    session = create_recovery_session(ds, "CUST_SOFT", strategy="Custom Schedule", retry_schedule=[0.0, 24.0])
    run_recovery_workflow(session["session_id"], ds)
    complete_recovery_session(session["session_id"], ds)

    events = [item["event"] for item in session["audit_trail"]]
    assert "recovery_created" in events
    assert "custom_schedule_created" in events
    assert "retry_scheduled" in events
    assert "retry_executed" in events
    assert "recovery_recovered" in events
