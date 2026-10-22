"""Unit and Integration tests for Bank Gateway, Telephony (Twilio), and Delayed Scheduler."""

import pytest
import pandas as pd
from unittest.mock import patch

from backend.recovery_engine import (
    create_recovery_session,
    diagnose_payment_failure,
    get_customer_payment_options,
    resolve_failure_intelligence,
    STATE_RECOVERED,
    STATE_PAYMENT_PENDING,
)
from backend.twilio_service import (
    is_twilio_configured,
    get_twilio_status,
    send_recovery_sms,
    initiate_recovery_call,
    generate_outbound_twiml,
)
from backend.scheduler_service import (
    schedule_delayed_retry,
    cancel_scheduled_retry,
    get_scheduler_status,
)


def test_resolve_failure_intelligence():
    """Verify ISO codes and plain-English breakdown for different failure types."""
    # 1. Insufficient funds
    res1 = resolve_failure_intelligence("insufficient funds")
    assert "ISO-51" in res1["bank_code"]
    assert "insufficient funds" in res1["customer_explanation"].lower()
    assert "liquidity" in res1["merchant_guidance"].lower() or "smart retry" in res1["merchant_guidance"].lower()

    # 2. Daily limit exceeded
    res2 = resolve_failure_intelligence("daily limit exceeded")
    assert "ISO-61" in res2["bank_code"]
    assert "daily" in res2["customer_explanation"].lower()

    # 3. Timeout / network
    res3 = resolve_failure_intelligence("bank timeout")
    assert "ISO-91" in res3["bank_code"]
    assert "timeout" in res3["customer_explanation"].lower()

    # 4. Expired card
    res4 = resolve_failure_intelligence("expired card")
    assert "ISO-54" in res4["bank_code"]

    # 5. Permanent
    res5 = resolve_failure_intelligence("account closed")
    assert "ISO-43" in res5["bank_code"] or "ISO-04" in res5["bank_code"]
    assert "halt" in res5["merchant_guidance"].lower() or "hard decline" in res5["merchant_guidance"].lower()


def test_diagnose_includes_intelligence():
    """Verify diagnose_payment_failure enriches output with intelligence."""
    df = pd.DataFrame([{
        "transaction_id": "TXN_TEST_99",
        "customer_id": "CUST_TEST",
        "amount": 1500.0,
        "payment_method": "Credit Card",
        "failure_reason": "Insufficient Funds",
        "payment_status": "failed",
    }])
    diag = diagnose_payment_failure(df, "CUST_TEST")
    assert diag["has_failed_payment"] is True
    assert "bank_technical_code" in diag
    assert "ISO-51" in diag["bank_technical_code"]
    assert "customer_explanation" in diag
    assert "merchant_guidance" in diag


def test_customer_payment_options_enriches_intel():
    """Verify get_customer_payment_options attaches banking intelligence."""
    session = {
        "session_id": "ses_test_123",
        "failure_reason": "Daily limit exceeded",
        "failure_category": "soft",
        "is_recoverable": True,
        "status": "awaiting_customer",
    }
    options = get_customer_payment_options(None, session)
    assert options["can_pay"] is True
    assert "bank_code" in options
    assert "ISO-61" in options["bank_code"]
    assert "intelligence" in options


def test_twilio_service_simulation():
    """Verify Twilio SMS and Voice call simulation when credentials are absent."""
    with patch.dict("os.environ", {"TWILIO_ACCOUNT_SID": "", "TWILIO_AUTH_TOKEN": "", "TWILIO_PHONE_NUMBER": ""}):
        status = get_twilio_status()
        assert status["configured"] is False

        # SMS simulation
        sms_res = send_recovery_sms("+15550001111", "Test recovery message")
        assert sms_res["status"] == "simulated"
        assert sms_res["mock"] is True
        assert sms_res["to"] == "+15550001111"

        # Voice call simulation
        call_res = initiate_recovery_call("+15550001111", "ses_test_call", "Alice", 250.0)
        assert call_res["status"] == "queued"
        assert call_res["mock"] is True
        assert call_res["session_id"] == "ses_test_call"


def test_generate_outbound_twiml():
    """Verify TwiML response generation."""
    twiml = generate_outbound_twiml(
        session_id="ses_abc",
        customer_name="John Doe",
        amount=500.0,
        failure_reason="card expired",
    )
    assert "<Response>" in twiml
    assert "John Doe" in twiml
    assert "500.00" in twiml
    assert "</Response>" in twiml


def test_scheduler_service_local_timer():
    """Verify delayed retry scheduling arms local timer in fallback mode."""
    sched_status = get_scheduler_status()
    assert "engine" in sched_status

    job = schedule_delayed_retry("ses_timer_test", delay_hours=1.0)
    assert job["status"] == "scheduled"
    assert job["session_id"] == "ses_timer_test"

    # Cancel timer
    cancelled = cancel_scheduled_retry("ses_timer_test")
    assert cancelled is True
