"""Automated test suite for No-Code Recovery Automations."""

import httpx
import pandas as pd
import pytest

from backend.auth import SESSION_STORE, USERS
from backend.automation_engine import (
    ACTION_OPTIONS,
    CONDITION_FIELDS,
    CONDITION_OPERATORS,
    STOP_RULE_OPTIONS,
    TRIGGER_OPTIONS,
    _AUTOMATION_STORE,
    build_payment_context,
    create_automation,
    delete_automation,
    duplicate_automation,
    evaluate_condition,
    evaluate_conditions,
    find_matching_automation,
    generate_automation_preview,
    get_automation,
    list_automations,
    pause_automation,
    resume_automation,
    run_automation,
    update_automation,
    validate_automation,
)
from backend.recovery_engine import create_recovery_session, diagnose_payment_failure, run_recovery_workflow
from main import Dataset, app, data_store


@pytest.fixture(autouse=True)
def clean_automations_and_store():
    """Clear automations and setup test dataset before each test."""
    from backend.db import automation_repository
    _AUTOMATION_STORE.clear()
    if automation_repository.collection is not None:
        try:
            automation_repository.collection.delete_many({})
        except Exception:
            pass

    test_df = pd.DataFrame([
        {
            "transaction_id": "TXN_A1",
            "customer_id": "CUST_AUTO_1",
            "amount": 5000.0,
            "payment_method": "UPI",
            "failure_reason": "Insufficient Funds",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_A2",
            "customer_id": "CUST_AUTO_2",
            "amount": 15000.0,
            "payment_method": "Credit Card",
            "failure_reason": "Account Closed",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_A3",
            "customer_id": "CUST_AUTO_3",
            "amount": 250.0,
            "payment_method": "NetBanking",
            "failure_reason": "Network Timeout",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
    ])
    ds = Dataset(dataframe=test_df, uploaded_at="2026-08-29T12:00:00Z", file_name="test_auto.csv")
    data_store._datasets["merchant"] = ds
    SESSION_STORE["test-merchant-token"] = "merchant"
    yield
    _AUTOMATION_STORE.clear()


# ===========================================================================
# 1. VALIDATION TESTS
# ===========================================================================

def test_validate_automation_valid():
    valid_data = {
        "name": "High Value Failed Payments",
        "trigger": "payment_failed",
        "conditions": [{"field": "amount", "operator": "greater_than", "value": "1000"}],
        "actions": [{"type": "smart_retry"}],
        "stop_rules": ["payment_succeeds", "permanent_failure"],
    }
    is_valid, msg = validate_automation(valid_data)
    assert is_valid is True
    assert msg == ""


def test_validate_automation_invalid_name():
    is_valid, msg = validate_automation({"name": "", "trigger": "payment_failed", "actions": [{"type": "smart_retry"}]})
    assert is_valid is False
    assert "name is required" in msg


def test_validate_automation_invalid_trigger():
    is_valid, msg = validate_automation({"name": "Test", "trigger": "invalid_trigger", "actions": [{"type": "smart_retry"}]})
    assert is_valid is False
    assert "Unsupported trigger" in msg


def test_validate_automation_invalid_condition_field():
    data = {
        "name": "Test",
        "trigger": "payment_failed",
        "conditions": [{"field": "unknown_field", "operator": "equals", "value": "x"}],
        "actions": [{"type": "smart_retry"}],
    }
    is_valid, msg = validate_automation(data)
    assert is_valid is False
    assert "Unsupported condition field" in msg


def test_validate_automation_invalid_condition_operator():
    data = {
        "name": "Test",
        "trigger": "payment_failed",
        "conditions": [{"field": "amount", "operator": "invalid_op", "value": "100"}],
        "actions": [{"type": "smart_retry"}],
    }
    is_valid, msg = validate_automation(data)
    assert is_valid is False
    assert "Unsupported condition operator" in msg


def test_validate_automation_numeric_condition_check():
    data = {
        "name": "Test",
        "trigger": "payment_failed",
        "conditions": [{"field": "amount", "operator": "greater_than", "value": "not_a_number"}],
        "actions": [{"type": "smart_retry"}],
    }
    is_valid, msg = validate_automation(data)
    assert is_valid is False
    assert "requires a numeric value" in msg


def test_validate_automation_empty_actions():
    data = {
        "name": "Test",
        "trigger": "payment_failed",
        "conditions": [],
        "actions": [],
    }
    is_valid, msg = validate_automation(data)
    assert is_valid is False
    assert "At least one action is required" in msg


# ===========================================================================
# 2. CRUD & LIFECYCLE TESTS
# ===========================================================================

def test_crud_lifecycle():
    # Create
    auto = create_automation({
        "name": "Soft Decline Workflow",
        "trigger": "payment_failed_soft",
        "conditions": [{"field": "failure_type", "operator": "equals", "value": "soft"}],
        "actions": [{"type": "smart_retry"}],
        "stop_rules": ["payment_succeeds", "max_attempts_reached"],
    })
    auto_id = auto["id"]
    assert auto["status"] == "active"
    assert auto["times_triggered"] == 0

    # Get
    fetched = get_automation(auto_id)
    assert fetched is not None
    assert fetched["name"] == "Soft Decline Workflow"

    # List
    all_autos = list_automations()
    assert len(all_autos) == 1

    # Pause
    paused = pause_automation(auto_id)
    assert paused["status"] == "paused"

    # Resume
    resumed = resume_automation(auto_id)
    assert resumed["status"] == "active"

    # Duplicate
    dupe = duplicate_automation(auto_id)
    assert dupe["id"] != auto_id
    assert dupe["name"] == "Soft Decline Workflow (Copy)"
    assert dupe["status"] == "paused"
    assert len(list_automations()) == 2

    # Update
    updated = update_automation(auto_id, {
        "name": "Updated Soft Workflow",
        "trigger": "payment_failed_soft",
        "actions": [{"type": "offer_alternative_payment"}],
    })
    assert updated["name"] == "Updated Soft Workflow"

    # Delete
    deleted = delete_automation(auto_id)
    assert deleted is True
    assert get_automation(auto_id) is None


# ===========================================================================
# 3. CONDITION EVALUATION TESTS
# ===========================================================================

def test_condition_operators():
    ctx = {
        "amount": 5000.0,
        "failure_type": "soft",
        "failure_reason": "Insufficient Funds",
        "payment_method": "Debit Card",
        "customer_risk": "low",
    }

    assert evaluate_condition({"field": "amount", "operator": "greater_than", "value": "1000"}, ctx) is True
    assert evaluate_condition({"field": "amount", "operator": "less_than", "value": "1000"}, ctx) is False
    assert evaluate_condition({"field": "failure_type", "operator": "equals", "value": "soft"}, ctx) is True
    assert evaluate_condition({"field": "failure_type", "operator": "not_equals", "value": "hard"}, ctx) is True
    assert evaluate_condition({"field": "failure_reason", "operator": "contains", "value": "Funds"}, ctx) is True
    assert evaluate_condition({"field": "payment_method", "operator": "equals", "value": "UPI"}, ctx) is False


def test_evaluate_conditions_and_logic():
    ctx = {"amount": 2500.0, "failure_type": "soft", "customer_risk": "low"}
    conds = [
        {"field": "amount", "operator": "greater_than", "value": "1000"},
        {"field": "failure_type", "operator": "equals", "value": "soft"},
    ]
    all_passed, results = evaluate_conditions(conds, ctx)
    assert all_passed is True
    assert len(results) == 2

    conds_fail = [
        {"field": "amount", "operator": "greater_than", "value": "5000"},
        {"field": "failure_type", "operator": "equals", "value": "soft"},
    ]
    all_passed2, _ = evaluate_conditions(conds_fail, ctx)
    assert all_passed2 is False


# ===========================================================================
# 4. MATCHING & AUTOMATION EXECUTION
# ===========================================================================

def test_matching_and_execution():
    # Setup active automation
    create_automation({
        "name": "UPI Soft Retry Automation",
        "trigger": "payment_failed",
        "conditions": [{"field": "payment_method", "operator": "equals", "value": "UPI"}],
        "actions": [{"type": "smart_retry"}],
        "stop_rules": ["payment_succeeds", "permanent_failure"],
    })

    dataset = data_store.get("merchant")
    diag = diagnose_payment_failure(dataset.dataframe, "CUST_AUTO_1")
    ctx = build_payment_context(diag, dataset.dataframe, "CUST_AUTO_1")

    matched = find_matching_automation("payment_failed", ctx)
    assert matched is not None
    assert matched["name"] == "UPI Soft Retry Automation"

    # Run automation
    result = run_automation(
        automation=matched,
        customer_id="CUST_AUTO_1",
        payment_context=ctx,
        dataset=dataset,
        create_recovery_session_fn=create_recovery_session,
        run_recovery_workflow_fn=run_recovery_workflow,
        diagnose_fn=diagnose_payment_failure,
    )

    assert result["session_id"] is not None
    assert result["strategy"] == "Smart Retry"
    assert matched["times_triggered"] == 1
    assert matched["customers_affected"] == 1
    assert matched["last_triggered"] is not None

    # Check session audit log has automation events
    session = dataset.recovery_sessions[result["session_id"]]
    audit_event_names = [e["event"] for e in session["audit_trail"]]
    assert "automation_matched" in audit_event_names
    assert "automation_action_triggered" in audit_event_names


def test_paused_automation_does_not_match():
    auto = create_automation({
        "name": "Paused Automation",
        "trigger": "payment_failed",
        "conditions": [],
        "actions": [{"type": "smart_retry"}],
        "status": "paused",
    })

    ctx = {"amount": 5000.0, "failure_type": "soft"}
    matched = find_matching_automation("payment_failed", ctx)
    assert matched is None


# ===========================================================================
# 5. PREVIEW GENERATOR TESTS
# ===========================================================================

def test_preview_generation():
    auto_data = {
        "name": "Preview Test",
        "trigger": "payment_failed_soft",
        "conditions": [
            {"field": "amount", "operator": "greater_than", "value": "1000"},
            {"field": "payment_method", "operator": "equals", "value": "UPI"},
        ],
        "actions": [
            {"type": "smart_retry"},
            {"type": "offer_alternative_payment"},
        ],
        "stop_rules": ["payment_succeeds", "permanent_failure"],
    }
    steps = generate_automation_preview(auto_data)
    assert len(steps) == 6
    assert "Detect when a soft-decline payment fails" in steps[0]
    assert "amount is greater than ₹1000" in steps[1]
    assert "payment method is UPI" in steps[2]
    assert "Run Smart Retry (auto-scheduled)" in steps[3]
    assert "If still unpaid → Offer Alternative Payment Method" in steps[4]
    assert "Stop immediately when payment succeeds or a permanent failure is detected" in steps[5]


# ===========================================================================
# 6. HTTP API ENDPOINTS TEST
# ===========================================================================

@pytest.mark.asyncio
async def test_automation_api_endpoints():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Login to get token
        login_res = await client.post("/auth/login", json={"username": "merchant", "password": "merchant123"})
        assert login_res.status_code == 200
        token = login_res.json()["session_id"]
        headers = {"X-Session-ID": token}

        # 1. List (record initial count — MongoDB may have records from prior tests)
        res = await client.get("/automations", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data["automations"], list)
        assert "meta" in data
        initial_count = len(data["automations"])

        # 2. Create
        payload = {
            "name": "API Created Automation",
            "trigger": "payment_failed",
            "conditions": [{"field": "amount", "operator": "greater_than", "value": "500"}],
            "actions": [{"type": "smart_retry"}],
            "stop_rules": ["payment_succeeds"],
        }
        res = await client.post("/automations", json=payload, headers=headers)
        assert res.status_code == 200
        created = res.json()
        auto_id = created["id"]
        assert created["name"] == "API Created Automation"

        # 3. Preview endpoint
        res = await client.post("/automations/preview", json=payload, headers=headers)
        assert res.status_code == 200
        assert "steps" in res.json()
        assert len(res.json()["steps"]) > 0

        # 4. Trigger endpoint
        res = await client.post(
            "/automations/trigger",
            json={"customer_id": "CUST_AUTO_1", "trigger_event": "payment_failed"},
            headers=headers,
        )
        assert res.status_code == 200
        trig_res = res.json()
        assert trig_res["matched"] is True
        assert trig_res["automation_id"] == auto_id

        # 5. Pause & Resume
        res = await client.post(f"/automations/{auto_id}/pause", headers=headers)
        assert res.status_code == 200
        assert res.json()["status"] == "paused"

        res = await client.post(f"/automations/{auto_id}/resume", headers=headers)
        assert res.status_code == 200
        assert res.json()["status"] == "active"

        # 6. Duplicate
        res = await client.post(f"/automations/{auto_id}/duplicate", headers=headers)
        assert res.status_code == 200
        dupe_id = res.json()["id"]

        # 7. Delete
        res = await client.delete(f"/automations/{dupe_id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["status"] == "deleted"
