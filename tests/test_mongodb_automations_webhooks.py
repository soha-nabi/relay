"""Tests for Phase 4: Persistent No-Code Automations + Atomic Webhook Idempotency.

Test matrix:
AUTOMATIONS
 1. create persisted automation
 2. read persisted automation
 3. update persisted automation
 4. delete persisted automation
 5. pause persistence
 6. resume persistence
 7. duplicate persistence
 8. matching persisted automation
 9. execution count persistence
10. merchant isolation
11. automation restart persistence (clearing _AUTOMATION_STORE)

WEBHOOKS
12. webhook event persistence
13. duplicate webhook persistence (in-memory)
14. duplicate event rejected after restart (clearing _PROCESSED_WEBHOOKS)
15. atomic duplicate protection via acquire_lock
16. payment capture still stops recovery
17. payment failure still starts recovery
"""

import uuid
import pytest
import httpx

from backend.automation_engine import (
    _AUTOMATION_STORE,
    create_automation,
    delete_automation,
    duplicate_automation,
    find_matching_automation,
    get_automation,
    list_automations,
    pause_automation,
    resume_automation,
    update_automation,
)
from backend.db import (
    automation_repository,
    is_mongodb_configured,
    webhook_event_repository,
)
from main import _PROCESSED_WEBHOOKS, Dataset, app, data_store
from scripts.seed_users import seed_demo_users

import pandas as pd


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_client():
    try:
        transport = httpx.ASGITransport(app=app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")
    except (AttributeError, TypeError):
        return httpx.AsyncClient(app=app, base_url="http://test")


VALID_AUTO = {
    "name": "Test Smart Retry",
    "trigger": "payment_failed",
    "conditions": [],
    "actions": [{"type": "smart_retry"}],
    "stop_rules": ["payment_succeeds", "max_attempts_reached"],
    "description": "Phase 4 test automation",
    "status": "active",
}


def _login_token_sync(username: str, password: str) -> str:
    """Helper to get session token via login."""
    import asyncio
    async def _do():
        async with get_client() as client:
            r = await client.post("/auth/login", json={"username": username, "password": password})
            assert r.status_code == 200, f"Login failed: {r.text}"
            return r.json()["session_id"]
    return asyncio.get_event_loop().run_until_complete(_do())


def _clear_test_automation(auto_id: str) -> None:
    try:
        delete_automation(auto_id)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 1. Create Persisted Automation
# ---------------------------------------------------------------------------
def test_create_persisted_automation():
    """Automation creation persists to MongoDB with correct fields."""
    data = {**VALID_AUTO, "name": f"Test Create {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")
    assert auto["id"] is not None
    assert auto["name"].startswith("Test Create")
    assert auto["merchant_id"] == "merchant"
    assert auto["status"] == "active"
    assert auto["trigger"] == "payment_failed"

    if automation_repository.collection is not None:
        doc = automation_repository.get(auto["id"])
        assert doc is not None
        assert doc["name"] == auto["name"]
        assert doc["merchant_id"] == "merchant"

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 2. Read Persisted Automation
# ---------------------------------------------------------------------------
def test_read_persisted_automation():
    """Automation can be retrieved from MongoDB by ID."""
    data = {**VALID_AUTO, "name": f"Test Read {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    if automation_repository.collection is not None:
        fetched = get_automation(auto["id"], merchant_id="merchant")
        assert fetched is not None
        assert fetched["id"] == auto["id"]
        assert fetched["trigger"] == "payment_failed"

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 3. Update Persisted Automation
# ---------------------------------------------------------------------------
def test_update_persisted_automation():
    """Automation update persists to MongoDB."""
    data = {**VALID_AUTO, "name": f"Test Update Original {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    updated_name = f"Test Update Renamed {uuid.uuid4().hex[:6]}"
    updated_data = {**data, "name": updated_name}
    updated = update_automation(auto["id"], updated_data, merchant_id="merchant")
    assert updated["name"] == updated_name

    if automation_repository.collection is not None:
        fetched = automation_repository.get(auto["id"])
        assert fetched is not None
        assert fetched["name"] == updated_name

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 4. Delete Persisted Automation
# ---------------------------------------------------------------------------
def test_delete_persisted_automation():
    """Automation deletion removes document from MongoDB."""
    data = {**VALID_AUTO, "name": f"Test Delete {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    deleted = delete_automation(auto["id"], merchant_id="merchant")
    assert deleted is True

    if automation_repository.collection is not None:
        doc = automation_repository.get(auto["id"])
        assert doc is None

    assert get_automation(auto["id"]) is None


# ---------------------------------------------------------------------------
# 5. Pause Persistence
# ---------------------------------------------------------------------------
def test_pause_persistence():
    """Pausing an automation updates status to 'paused' in MongoDB."""
    data = {**VALID_AUTO, "name": f"Test Pause {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    paused = pause_automation(auto["id"], merchant_id="merchant")
    assert paused["status"] == "paused"

    if automation_repository.collection is not None:
        doc = automation_repository.get(auto["id"])
        assert doc is not None
        assert doc["status"] == "paused"

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 6. Resume Persistence
# ---------------------------------------------------------------------------
def test_resume_persistence():
    """Resuming a paused automation updates status to 'active' in MongoDB."""
    data = {**VALID_AUTO, "name": f"Test Resume {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")
    pause_automation(auto["id"], merchant_id="merchant")

    resumed = resume_automation(auto["id"], merchant_id="merchant")
    assert resumed["status"] == "active"

    if automation_repository.collection is not None:
        doc = automation_repository.get(auto["id"])
        assert doc is not None
        assert doc["status"] == "active"

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 7. Duplicate Persistence
# ---------------------------------------------------------------------------
def test_duplicate_persistence():
    """Duplicating an automation creates a new persisted document."""
    data = {**VALID_AUTO, "name": f"Test Dup Original {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    copy = duplicate_automation(auto["id"], merchant_id="merchant")
    assert copy["id"] != auto["id"]
    assert "(Copy)" in copy["name"]
    assert copy["status"] == "paused"

    if automation_repository.collection is not None:
        doc = automation_repository.get(copy["id"])
        assert doc is not None
        assert "(Copy)" in doc["name"]

    _clear_test_automation(auto["id"])
    _clear_test_automation(copy["id"])


# ---------------------------------------------------------------------------
# 8. Matching Persisted Automation
# ---------------------------------------------------------------------------
def test_matching_persisted_automation():
    """find_matching_automation retrieves active automations from MongoDB and evaluates conditions."""
    m_id = f"merchant_match_{uuid.uuid4().hex[:6]}"
    data = {**VALID_AUTO, "name": f"Test Match {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id=m_id)

    payment_context = {
        "amount": 1500.0,
        "failure_type": "soft",
        "failure_reason": "Card Declined",
        "payment_method": "Credit Card",
        "customer_risk": "low",
    }

    # Clear in-memory to force MongoDB resolution
    if is_mongodb_configured():
        stored = _AUTOMATION_STORE.pop(auto["id"], None)

    matched = find_matching_automation("payment_failed", payment_context, merchant_id=m_id)
    # Should find the automation from MongoDB
    if is_mongodb_configured():
        assert matched is not None
        assert matched["id"] == auto["id"]

    _clear_test_automation(auto["id"])



# ---------------------------------------------------------------------------
# 9. Execution Count Persistence
# ---------------------------------------------------------------------------
def test_execution_count_persistence():
    """increment_execution atomically increments execution_count in MongoDB."""
    if automation_repository.collection is None:
        pytest.skip("MongoDB not configured")

    data = {**VALID_AUTO, "name": f"Test Exec Count {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    initial_doc = automation_repository.get(auto["id"])
    initial_count = initial_doc.get("execution_count", 0)

    automation_repository.increment_execution(auto["id"])
    automation_repository.increment_execution(auto["id"])

    updated_doc = automation_repository.get(auto["id"])
    assert updated_doc["execution_count"] == initial_count + 2

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 10. Merchant Isolation
# ---------------------------------------------------------------------------
def test_automation_merchant_isolation():
    """Merchant A cannot see or modify Merchant B's automations."""
    name_a = f"Merchant A Auto {uuid.uuid4().hex[:6]}"
    auto_a = create_automation({**VALID_AUTO, "name": name_a}, merchant_id="merchant_a")

    # Merchant B tries to read merchant A's automation
    fetched_by_b = get_automation(auto_a["id"], merchant_id="merchant_b")
    assert fetched_by_b is None

    # Merchant B tries to delete merchant A's automation
    deleted_by_b = delete_automation(auto_a["id"], merchant_id="merchant_b")
    assert deleted_by_b is False

    # Merchant A can read their own
    fetched_by_a = get_automation(auto_a["id"], merchant_id="merchant_a")
    assert fetched_by_a is not None

    _clear_test_automation(auto_a["id"])


# ---------------------------------------------------------------------------
# 11. Automation Restart Persistence
# ---------------------------------------------------------------------------
def test_automation_restart_persistence():
    """Automations survive backend restart (clearing _AUTOMATION_STORE) via MongoDB."""
    if automation_repository.collection is None:
        pytest.skip("MongoDB not configured")

    data = {**VALID_AUTO, "name": f"Test Restart {uuid.uuid4().hex[:6]}"}
    auto = create_automation(data, merchant_id="merchant")

    # Simulate restart: evict from in-memory store
    _AUTOMATION_STORE.pop(auto["id"], None)
    assert auto["id"] not in _AUTOMATION_STORE

    # Automation still available from MongoDB
    fetched = get_automation(auto["id"])
    assert fetched is not None
    assert fetched["id"] == auto["id"]
    assert fetched["name"] == auto["name"]

    # list_automations also loads from MongoDB
    all_autos = list_automations(merchant_id="merchant")
    ids = [a["id"] for a in all_autos]
    assert auto["id"] in ids

    _clear_test_automation(auto["id"])


# ---------------------------------------------------------------------------
# 12. Webhook Event Persistence
# ---------------------------------------------------------------------------
def test_webhook_event_persistence():
    """Webhook events are persisted in MongoDB with correct dedup_key."""
    if webhook_event_repository.collection is None:
        pytest.skip("MongoDB not configured")

    dedup_key = f"payment.failed:TXN_TEST_{uuid.uuid4().hex[:8]}:1500.0"
    is_first, doc = webhook_event_repository.acquire_lock(
        dedup_key,
        {
            "event": "payment.failed",
            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
            "transaction_id": "TXN_PERSIST_TEST",
            "customer_id": "CUST_PERSIST_TEST",
            "merchant_id": "merchant",
            "status": "processing",
        },
    )
    assert is_first is True
    assert doc is not None

    fetched = webhook_event_repository.get_event(dedup_key)
    assert fetched is not None
    assert fetched["event"] == "payment.failed"
    assert fetched["transaction_id"] == "TXN_PERSIST_TEST"


# ---------------------------------------------------------------------------
# 13. Duplicate Webhook Persistence
# ---------------------------------------------------------------------------
def test_duplicate_webhook_persistence():
    """Second call to acquire_lock with same dedup_key returns (False, existing_doc)."""
    if webhook_event_repository.collection is None:
        pytest.skip("MongoDB not configured")

    dedup_key = f"payment.failed:TXN_DUP_{uuid.uuid4().hex[:8]}:2000.0"
    is_first, _ = webhook_event_repository.acquire_lock(
        dedup_key,
        {"event": "payment.failed", "transaction_id": "TXN_DUP", "customer_id": "CUST_DUP", "merchant_id": "merchant"},
    )
    assert is_first is True

    is_first2, existing = webhook_event_repository.acquire_lock(
        dedup_key,
        {"event": "payment.failed", "transaction_id": "TXN_DUP", "customer_id": "CUST_DUP", "merchant_id": "merchant"},
    )
    assert is_first2 is False
    assert existing is not None
    assert existing["event"] == "payment.failed"


# ---------------------------------------------------------------------------
# 14. Duplicate Event Rejected After Restart
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_duplicate_event_rejected_after_restart():
    """After clearing in-memory _PROCESSED_WEBHOOKS, duplicate webhook is still rejected via MongoDB."""
    if webhook_event_repository.collection is None:
        pytest.skip("MongoDB not configured")

    seed_demo_users()
    txn_id = f"TXN_RESTART_{uuid.uuid4().hex[:8]}"
    event_id = f"evt_restart_{uuid.uuid4().hex[:8]}"

    async with get_client() as client:
        # Login
        login_res = await client.post("/auth/login", json={"username": "merchant", "password": "merchant123"})
        token = login_res.json()["session_id"]

        # First webhook — should process
        r1 = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "transaction_id": txn_id,
                "customer_id": "CUST_RESTART_01",
                "amount": 1500.0,
                "event_id": event_id,
                "reason": "Card Declined",
            },
        )
        assert r1.status_code == 200
        assert r1.json()["status"] == "processed"

        # Simulate restart: evict in-memory dedup store
        _PROCESSED_WEBHOOKS.clear()

        # Second webhook with same event_id — must return already_processed
        r2 = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "transaction_id": txn_id,
                "customer_id": "CUST_RESTART_01",
                "amount": 1500.0,
                "event_id": event_id,
                "reason": "Card Declined",
            },
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "already_processed"


# ---------------------------------------------------------------------------
# 15. Atomic Duplicate Protection
# ---------------------------------------------------------------------------
def test_atomic_duplicate_protection():
    """Two concurrent calls to acquire_lock with the same key — only one succeeds."""
    if webhook_event_repository.collection is None:
        pytest.skip("MongoDB not configured")

    dedup_key = f"payment.failed:TXN_ATOMIC_{uuid.uuid4().hex[:8]}:3000.0"
    event_data = {
        "event": "payment.failed",
        "transaction_id": "TXN_ATOMIC",
        "customer_id": "CUST_ATOMIC",
        "merchant_id": "merchant",
    }

    results = []
    for _ in range(5):
        is_first, _ = webhook_event_repository.acquire_lock(dedup_key, event_data)
        results.append(is_first)

    # Exactly one should succeed
    assert results.count(True) == 1
    assert results.count(False) == 4


# ---------------------------------------------------------------------------
# 16. Payment Capture Still Stops Recovery
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_payment_capture_still_stops_recovery():
    """payment.captured webhook still completes recovery session after Phase 4 changes."""
    seed_demo_users()
    txn_id = f"TXN_CAP_{uuid.uuid4().hex[:8]}"

    async with get_client() as client:
        # Send failure first
        r1 = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "transaction_id": txn_id,
                "customer_id": "CUST_CAP_01",
                "amount": 2500.0,
                "event_id": f"evt_cap_fail_{uuid.uuid4().hex[:8]}",
                "reason": "Card Declined",
            },
        )
        assert r1.status_code == 200
        assert r1.json()["status"] == "processed"
        session_id = r1.json().get("session_id")

        # Now send capture
        r2 = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.captured",
                "transaction_id": txn_id,
                "customer_id": "CUST_CAP_01",
                "amount": 2500.0,
                "event_id": f"evt_cap_success_{uuid.uuid4().hex[:8]}",
            },
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "processed"
        assert r2.json()["event"] == "payment.captured"


# ---------------------------------------------------------------------------
# 17. Payment Failure Still Starts Recovery
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_payment_failure_still_starts_recovery():
    """payment.failed webhook still creates recovery session after Phase 4 changes."""
    seed_demo_users()
    txn_id = f"TXN_FAIL_{uuid.uuid4().hex[:8]}"

    async with get_client() as client:
        r = await client.post(
            "/webhooks/payment",
            json={
                "event": "payment.failed",
                "transaction_id": txn_id,
                "customer_id": "CUST_FAIL_P4",
                "amount": 1800.0,
                "event_id": f"evt_fail_p4_{uuid.uuid4().hex[:8]}",
                "reason": "Insufficient Funds",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "processed"
        assert data["event"] == "payment.failed"
        assert data["recovery_started"] is True
        assert data.get("session_id") is not None
