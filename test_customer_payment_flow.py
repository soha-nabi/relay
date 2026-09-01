"""Automated test suite verifying the Customer Recovery Payment Flow."""

import httpx
import pandas as pd
import pytest

from backend.auth import SESSION_STORE, USERS
from backend.recovery_engine import (
    create_recovery_session,
    diagnose_payment_failure,
    get_customer_payment_options,
    run_recovery_workflow,
)
from main import Dataset, app, data_store


@pytest.fixture(autouse=True)
def setup_customer_pay_dataset():
    """Create test dataset with various failure scenarios for customer recovery testing."""
    test_df = pd.DataFrame([
        {
            "transaction_id": "TXN_CARD_DEC_01",
            "customer_id": "CUST_DECLINED",
            "amount": 2400.0,
            "payment_method": "Credit Card",
            "failure_reason": "Card Declined",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_EXP_02",
            "customer_id": "CUST_EXPIRED",
            "amount": 1800.0,
            "payment_method": "Debit Card",
            "failure_reason": "Expired Card",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_INSUF_03",
            "customer_id": "CUST_INSUFFICIENT",
            "amount": 3500.0,
            "payment_method": "NetBanking",
            "failure_reason": "Insufficient Funds",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_PERM_04",
            "customer_id": "CUST_PERM_FAIL",
            "amount": 5000.0,
            "payment_method": "ACH",
            "failure_reason": "Account Closed",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_HEALTHY_05",
            "customer_id": "CUST_HEALTHY_PAY",
            "amount": 1200.0,
            "payment_method": "UPI",
            "failure_reason": "",
            "recovery_amount": 0.0,
            "payment_status": "success",
            "status": "success",
        },
    ])
    ds = Dataset(dataframe=test_df, uploaded_at="2026-08-29T12:00:00Z", file_name="customer_pay_test.csv")
    data_store._datasets["merchant"] = ds
    SESSION_STORE["test-merchant-token"] = "merchant"
    yield ds


# ===========================================================================
# 1. RECOVERY LINK GENERATION & OPTIONS TESTS
# ===========================================================================

def test_recovery_link_generated(setup_customer_pay_dataset):
    """Test 1: When recovery session is created, safe payment_url is generated and logged."""
    ds = setup_customer_pay_dataset
    session = create_recovery_session(ds, "CUST_DECLINED", strategy="Smart Retry")

    assert "payment_url" in session
    assert session["payment_url"] == f"/pay/{session['session_id']}"
    assert "password" not in session["payment_url"]
    assert "token" not in session["payment_url"]

    # Audit event payment_link_generated
    events = [e["event"] for e in session["audit_trail"]]
    assert "payment_link_generated" in events


def test_card_declined_options(setup_customer_pay_dataset):
    """Test 2: Card declined flow provides UPI, Wallet, and Another Card options."""
    ds = setup_customer_pay_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_DECLINED")
    session = create_recovery_session(ds, "CUST_DECLINED", strategy="Offer Alternative Payment Method")
    options = get_customer_payment_options(diag, session)

    assert options["can_pay"] is True
    assert options["message"] == "Your card payment could not be completed. Try another payment method."
    method_labels = [m["label"] for m in options["methods"]]
    assert any("upi" in m.lower() for m in method_labels)
    assert any("wallet" in m.lower() for m in method_labels)
    assert any("card" in m.lower() for m in method_labels)


def test_expired_card_options(setup_customer_pay_dataset):
    """Test 3: Expired card flow prompts to update saved card."""
    ds = setup_customer_pay_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_EXPIRED")
    session = create_recovery_session(ds, "CUST_EXPIRED", strategy="Offer Alternative Payment Method")
    options = get_customer_payment_options(diag, session)

    assert options["can_pay"] is True
    assert options["message"] == "Your saved card needs to be updated."
    method_labels = [m["label"] for m in options["methods"]]
    assert any("update" in m.lower() for m in method_labels)


def test_insufficient_funds_options(setup_customer_pay_dataset):
    """Test 4: Insufficient funds flow prompts to retry payment."""
    ds = setup_customer_pay_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_INSUFFICIENT")
    session = create_recovery_session(ds, "CUST_INSUFFICIENT", strategy="Smart Retry")
    options = get_customer_payment_options(diag, session)

    assert options["can_pay"] is True
    assert options["message"] == "Please ensure sufficient balance is available and retry."
    method_labels = [m["label"] for m in options["methods"]]
    assert any("retry" in m.lower() for m in method_labels)


def test_permanent_failure_blocks_payment(setup_customer_pay_dataset):
    """Test 5: Permanent failure blocks payment methods and shows non-retryable message."""
    ds = setup_customer_pay_dataset
    diag = diagnose_payment_failure(ds.dataframe, "CUST_PERM_FAIL")
    session = create_recovery_session(ds, "CUST_PERM_FAIL", strategy="stop")
    options = get_customer_payment_options(diag, session)

    assert options["can_pay"] is False
    assert options["message"] == "This payment cannot be retried."
    assert len(options["methods"]) == 0


# ===========================================================================
# 2. HTTP CUSTOMER RECOVERY FLOW API TESTS
# ===========================================================================

@pytest.mark.asyncio
async def test_customer_pay_page_and_details_api(setup_customer_pay_dataset):
    """Test 6: GET /pay/{session_id} and GET /api/pay/{session_id} work publicly."""
    ds = setup_customer_pay_dataset
    session = create_recovery_session(ds, "CUST_DECLINED", strategy="Smart Retry")
    session_id = session["session_id"]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. HTML pay page
        page_res = await client.get(f"/pay/{session_id}")
        assert page_res.status_code == 200
        assert "text/html" in page_res.headers.get("content-type", "")

        # 2. Public API details
        api_res = await client.get(f"/api/pay/{session_id}")
        assert api_res.status_code == 200
        data = api_res.json()
        assert data["session_id"] == session_id
        assert data["amount"] == 2400.0
        assert data["customer_id"] == "CUST_DECLINED"
        assert data["can_pay"] is True
        assert len(data["methods"]) > 0

        # Verify audit event customer_payment_opened was logged
        events = [e["event"] for e in session["audit_trail"]]
        assert "customer_payment_opened" in events


@pytest.mark.asyncio
async def test_customer_select_method_audit(setup_customer_pay_dataset):
    """Test 7: POST /api/pay/{session_id}/select-method records payment_method_selected."""
    ds = setup_customer_pay_dataset
    session = create_recovery_session(ds, "CUST_DECLINED", strategy="Smart Retry")
    session_id = session["session_id"]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/pay/{session_id}/select-method",
            json={"payment_method": "UPI (Instant)"},
        )
        assert res.status_code == 200
        assert res.json()["payment_method"] == "UPI (Instant)"

        events = [e["event"] for e in session["audit_trail"]]
        assert "payment_method_selected" in events


@pytest.mark.asyncio
async def test_customer_complete_payment_flow(setup_customer_pay_dataset):
    """Test 8: Customer completes simulated payment -> marks recovered and updates dataset."""
    ds = setup_customer_pay_dataset
    session = create_recovery_session(ds, "CUST_DECLINED", strategy="Smart Retry")
    session_id = session["session_id"]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/pay/{session_id}/process",
            json={"payment_method": "UPI", "simulate_outcome": "success"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["recovered"] is True
        assert data["amount"] == 2400.0
        assert data["session_status"] == "recovered"

        # Check session is recovered in memory
        assert session["status"] == "recovered"
        assert session["recovered_amount"] == 2400.0

        # Check dataset dataframe was updated to success
        df = ds.dataframe
        row = df[df["customer_id"] == "CUST_DECLINED"].iloc[-1]
        assert row["payment_status"] == "success"
        assert row["recovery_amount"] == 2400.0

        # Check full audit trail sequence
        events = [e["event"] for e in session["audit_trail"]]
        assert "payment_link_generated" in events
        assert "payment_attempted" in events
        assert "payment_recovered" in events
        assert "recovery_recovered" in events


@pytest.mark.asyncio
async def test_customer_failed_payment_simulation(setup_customer_pay_dataset):
    """Test 9: Simulated failure increments attempts without breaking guardrails."""
    ds = setup_customer_pay_dataset
    session = create_recovery_session(ds, "CUST_DECLINED", strategy="Smart Retry")
    session_id = session["session_id"]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/pay/{session_id}/process",
            json={"payment_method": "Credit Card", "simulate_outcome": "failure"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "failed"
        assert data["recovered"] is False
        assert data["attempt_count"] == 1

        events = [e["event"] for e in session["audit_trail"]]
        assert "payment_attempted" in events
        assert "payment_failed" in events


@pytest.mark.asyncio
async def test_permanent_failure_rejected_on_process(setup_customer_pay_dataset):
    """Test 10: Permanent failures cannot be processed via /api/pay/{session_id}/process."""
    ds = setup_customer_pay_dataset
    session = create_recovery_session(ds, "CUST_PERM_FAIL", strategy="stop")
    session_id = session["session_id"]

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            f"/api/pay/{session_id}/process",
            json={"payment_method": "UPI", "simulate_outcome": "success"},
        )
        assert res.status_code == 400
        assert "permanent" in res.json()["detail"].lower()
