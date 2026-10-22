"""Comprehensive test suite for Phase 3: MongoDB Persistence for Recovery Sessions.

Tests recovery session CRUD, active session lookup, merchant isolation,
Smart Retry persistence, Custom Schedule persistence, customer payment flow,
webhook updates, audit trail persistence, restart persistence, and in-memory fallback.
"""

from datetime import datetime, timezone
import importlib
import os
import unittest.mock as mock

import httpx
import mongomock
import pandas as pd
import pytest

from backend.auth import SESSION_STORE
from backend.db import (
    CustomerRepository,
    MongoAdapter,
    RecoverySessionRepository,
    TransactionRepository,
    is_mongodb_configured,
    recovery_session_repository,
)

# mongomock compatibility with pymongo 4.x UpdateOne sort argument
_orig_add_update = mongomock.collection.BulkOperationBuilder.add_update


def _patched_add_update(self, filter, doc, is_patch, upsert=False, collation=None, array_filters=None, hint=None, **kwargs):
    return _orig_add_update(self, filter, doc, is_patch, upsert=upsert, collation=collation, array_filters=array_filters, hint=hint)


mongomock.collection.BulkOperationBuilder.add_update = _patched_add_update


@pytest.fixture(autouse=True)
def mock_mongo_environment(monkeypatch):
    """Provide an isolated in-memory mongomock database for each test."""
    mock_client = mongomock.MongoClient()
    monkeypatch.setenv("MONGODB_URI", "mongodb://localhost:27017/relay")
    monkeypatch.setenv("MONGODB_DB_NAME", "relay_test")

    import backend.db as db_mod
    monkeypatch.setattr(db_mod, "get_mongodb_client", lambda force_reconnect=False: mock_client)
    monkeypatch.setattr(db_mod, "_mongo_client", mock_client)

    mock_adapter = MongoAdapter("relay_test")
    monkeypatch.setattr(db_mod, "mongo_adapter", mock_adapter)
    monkeypatch.setattr(db_mod, "transaction_repository", TransactionRepository(mock_adapter))
    monkeypatch.setattr(db_mod, "customer_repository", CustomerRepository(mock_adapter))
    monkeypatch.setattr(db_mod, "recovery_session_repository", RecoverySessionRepository(mock_adapter))

    import main as main_mod
    monkeypatch.setattr(main_mod, "transaction_repository", TransactionRepository(mock_adapter))
    monkeypatch.setattr(main_mod, "customer_repository", CustomerRepository(mock_adapter))
    monkeypatch.setattr(main_mod, "recovery_session_repository", RecoverySessionRepository(mock_adapter))

    SESSION_STORE["merchant-token"] = {"username": "merchant", "role": "merchant", "name": "Merchant"}
    SESSION_STORE["merchant2-token"] = {"username": "merchant2", "role": "merchant", "name": "Merchant 2"}
    SESSION_STORE["admin-token"] = {"username": "admin", "role": "admin", "name": "Admin"}

    yield mock_client


# ============================================================================
# 1. RECOVERY SESSION CRUD TESTS
# ============================================================================

def test_recovery_session_create(mock_mongo_environment):
    """RecoverySessionRepository.create() persists all required recovery fields."""
    from backend.db import recovery_session_repository

    session_data = {
        "session_id": "rec_crud_01",
        "customer_id": "CUST_001",
        "transaction_id": "TXN_001",
        "amount": 2500.0,
        "recovered_amount": 0.0,
        "strategy": "Smart Retry",
        "status": "created",
        "failure_reason": "Insufficient Funds",
        "failure_category": "soft",
        "is_recoverable": True,
        "attempt_count": 0,
        "max_attempts": 3,
        "retry_schedule": [0, 24, 72],
        "confidence": 85.0,
        "expected_recovery": 2125.0,
        "payment_url": "/pay/rec_crud_01",
        "merchant_id": "merchant",
    }
    created = recovery_session_repository.create(session_data)
    assert created is not None
    assert created["session_id"] == "rec_crud_01"
    assert created["amount"] == 2500.0
    assert created["status"] == "created"
    assert isinstance(created.get("_id"), str)


def test_recovery_session_get(mock_mongo_environment):
    """RecoverySessionRepository.get() retrieves document by session_id."""
    from backend.db import recovery_session_repository

    recovery_session_repository.create({
        "session_id": "rec_crud_02",
        "customer_id": "CUST_002",
        "transaction_id": "TXN_002",
        "merchant_id": "merchant",
        "status": "awaiting_customer",
    })
    fetched = recovery_session_repository.get("rec_crud_02")
    assert fetched is not None
    assert fetched["customer_id"] == "CUST_002"
    assert fetched["status"] == "awaiting_customer"


def test_recovery_session_update(mock_mongo_environment):
    """RecoverySessionRepository.update() updates fields and records updated_at."""
    from backend.db import recovery_session_repository

    recovery_session_repository.create({
        "session_id": "rec_crud_03",
        "customer_id": "CUST_003",
        "transaction_id": "TXN_003",
        "merchant_id": "merchant",
        "status": "created",
        "attempt_count": 0,
    })
    updated = recovery_session_repository.update("rec_crud_03", {
        "status": "retry_scheduled",
        "attempt_count": 1,
        "retry_time": "2026-08-31T10:00:00Z",
    })
    assert updated is not None
    assert updated["status"] == "retry_scheduled"
    assert updated["attempt_count"] == 1
    assert updated["retry_time"] == "2026-08-31T10:00:00Z"


def test_recovery_session_delete(mock_mongo_environment):
    """RecoverySessionRepository.delete() removes document."""
    from backend.db import recovery_session_repository

    recovery_session_repository.create({
        "session_id": "rec_crud_04",
        "customer_id": "CUST_004",
        "transaction_id": "TXN_004",
        "merchant_id": "merchant",
    })
    assert recovery_session_repository.delete("rec_crud_04") is True
    assert recovery_session_repository.get("rec_crud_04") is None


# ============================================================================
# 2. LOOKUPS & ACTIVE SESSION FILTERING
# ============================================================================

def test_active_session_lookup(mock_mongo_environment):
    """find_active_by_transaction returns only active, non-recovered sessions."""
    from backend.db import recovery_session_repository

    recovery_session_repository.create({
        "session_id": "rec_active_01",
        "transaction_id": "TXN_ACT_1",
        "merchant_id": "merchant",
        "status": "retry_scheduled",
    })
    recovery_session_repository.create({
        "session_id": "rec_done_02",
        "transaction_id": "TXN_ACT_2",
        "merchant_id": "merchant",
        "status": "recovered",
    })

    active1 = recovery_session_repository.find_active_by_transaction("TXN_ACT_1")
    assert active1 is not None
    assert active1["session_id"] == "rec_active_01"

    active2 = recovery_session_repository.find_active_by_transaction("TXN_ACT_2")
    assert active2 is None


def test_transaction_to_session_lookup(mock_mongo_environment):
    """find_by_transaction retrieves all sessions linked to a transaction."""
    from backend.db import recovery_session_repository

    recovery_session_repository.create({
        "session_id": "rec_hist_01",
        "transaction_id": "TXN_HIST_1",
        "merchant_id": "merchant",
        "status": "stopped",
    })
    recovery_session_repository.create({
        "session_id": "rec_hist_02",
        "transaction_id": "TXN_HIST_1",
        "merchant_id": "merchant",
        "status": "recovered",
    })

    sessions = recovery_session_repository.find_by_transaction("TXN_HIST_1")
    assert len(sessions) == 2


# ============================================================================
# 3. MERCHANT ISOLATION
# ============================================================================

@pytest.mark.asyncio
async def test_merchant_isolation(mock_mongo_environment):
    """Merchant B cannot access or modify Merchant A's recovery session."""
    from backend.db import recovery_session_repository
    from main import Dataset, app, data_store

    recovery_session_repository.create({
        "session_id": "rec_secret_merchant_a",
        "transaction_id": "TXN_A_001",
        "customer_id": "CUST_A_001",
        "merchant_id": "merchant",
        "amount": 5000.0,
        "status": "awaiting_customer",
    })

    # Merchant B tries to access Merchant A's session
    cookies_b = {"session_id": "merchant2-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies_b) as client:
        res = await client.get("/recover/rec_secret_merchant_a")
        assert res.status_code in (403, 404)

    # Merchant A can access
    cookies_a = {"session_id": "merchant-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies_a) as client:
        res = await client.get("/recover/rec_secret_merchant_a")
        assert res.status_code == 200
        assert res.json()["session_id"] == "rec_secret_merchant_a"

    # Admin can access
    cookies_admin = {"session_id": "admin-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies_admin) as client:
        res = await client.get("/recover/rec_secret_merchant_a")
        assert res.status_code == 200


# ============================================================================
# 4. SMART RETRY & CUSTOM RETRY PERSISTENCE
# ============================================================================

@pytest.mark.asyncio
async def test_smart_retry_persistence(mock_mongo_environment):
    """Smart retry scheduling persists in MongoDB."""
    from backend.db import recovery_session_repository, transaction_repository
    from main import Dataset, app, data_store

    txns = [{"transaction_id": "TXN_SMART_01", "customer_id": "CUST_SMART_01", "amount": 2000.0, "payment_status": "failed", "failure_reason": "Insufficient Funds", "recovery_amount": 0.0, "payment_method": "UPI", "merchant_id": "merchant"}]
    data_store._datasets["merchant"] = Dataset(dataframe=pd.DataFrame(txns), uploaded_at="2026-08-30T00:00:00Z", file_name="test.csv")

    cookies = {"session_id": "merchant-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        # Start recovery with Smart Retry
        rec_res = await client.post("/recover", json={
            "customer_id": "CUST_SMART_01",
            "strategy": "Smart Retry",
            "expected_recovered_revenue": 1800.0,
        })
        assert rec_res.status_code == 200
        session_id = rec_res.json()["session_id"]

        # Verify persisted in MongoDB
        doc = recovery_session_repository.get(session_id)
        assert doc is not None
        assert doc["strategy"] == "Smart Retry"
        assert doc["status"] in ("retry_scheduled", "awaiting_customer", "diagnosed")


@pytest.mark.asyncio
async def test_custom_retry_persistence(mock_mongo_environment):
    """Custom retry schedule configuration persists in MongoDB."""
    from backend.db import recovery_session_repository
    from main import Dataset, app, data_store

    txns = [{"transaction_id": "TXN_CUST_SCH_01", "customer_id": "CUST_SCH_01", "amount": 3000.0, "payment_status": "failed", "failure_reason": "Insufficient Funds", "recovery_amount": 0.0, "payment_method": "UPI", "merchant_id": "merchant"}]
    data_store._datasets["merchant"] = Dataset(dataframe=pd.DataFrame(txns), uploaded_at="2026-08-30T00:00:00Z", file_name="test.csv")

    cookies = {"session_id": "merchant-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        rec_res = await client.post("/recover", json={
            "customer_id": "CUST_SCH_01",
            "strategy": "Custom Schedule",
            "expected_recovered_revenue": 2700.0,
            "retry_schedule": [0, 24, 72],
        })
        assert rec_res.status_code == 200
        session_id = rec_res.json()["session_id"]

        doc = recovery_session_repository.get(session_id)
        assert doc is not None
        assert doc["strategy"] == "Custom Schedule"
        assert doc["retry_schedule"] == [0, 24, 72]
        assert doc["max_attempts"] == 3


# ============================================================================
# 5. CUSTOMER PAYMENT FLOW & AUDIT TRAIL PERSISTENCE
# ============================================================================

@pytest.mark.asyncio
async def test_customer_payment_flow_and_audit_trail_persistence(mock_mongo_environment):
    """Customer payment interactions update MongoDB session and record audit events."""
    from backend.db import recovery_session_repository
    from main import Dataset, app, data_store

    txns = [{"transaction_id": "TXN_PAY_01", "customer_id": "CUST_PAY_01", "amount": 1500.0, "payment_status": "failed", "failure_reason": "Card Declined", "recovery_amount": 0.0, "payment_method": "Credit Card", "merchant_id": "merchant"}]
    data_store._datasets["merchant"] = Dataset(dataframe=pd.DataFrame(txns), uploaded_at="2026-08-30T00:00:00Z", file_name="test.csv")

    cookies = {"session_id": "merchant-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        # Create session
        res = await client.post("/recover", json={
            "customer_id": "CUST_PAY_01",
            "strategy": "Offer Alternative Payment Method",
            "expected_recovered_revenue": 1500.0,
        })
        session_id = res.json()["session_id"]

    # Customer checkout flow (no merchant auth required for customer public pages)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Open customer payment details
        det_res = await client.get(f"/api/pay/{session_id}")
        assert det_res.status_code == 200

        # 2. Select payment method
        sel_res = await client.post(f"/api/pay/{session_id}/select-method", json={"payment_method": "UPI"})
        assert sel_res.status_code == 200

        # 3. Process payment
        proc_res = await client.post(f"/api/pay/{session_id}/process", json={"payment_method": "UPI", "simulate_outcome": "success"})
        assert proc_res.status_code == 200
        assert proc_res.json()["recovered"] is True

    # Verify session in MongoDB is updated to recovered with full audit trail
    doc = recovery_session_repository.get(session_id)
    assert doc is not None
    assert doc["status"] == "recovered"
    assert doc["recovered_amount"] == 1500.0

    events = [e["event"] for e in doc["audit_trail"]]
    assert "customer_payment_opened" in events
    assert "payment_method_selected" in events
    assert "payment_attempted" in events
    assert "payment_recovered" in events


# ============================================================================
# 6. WEBHOOK PERSISTENCE
# ============================================================================

@pytest.mark.asyncio
async def test_webhook_payment_captured_updates_recovery_session(mock_mongo_environment):
    """Payment captured webhook locates session in MongoDB, marks recovered, and stops retries."""
    from backend.db import recovery_session_repository
    from main import Dataset, app, data_store

    txns = [{"transaction_id": "TXN_WH_REC_01", "customer_id": "CUST_WH_REC_01", "amount": 2200.0, "payment_status": "failed", "failure_reason": "Network Timeout", "recovery_amount": 0.0, "payment_method": "NetBanking", "merchant_id": "merchant"}]
    data_store._datasets["merchant"] = Dataset(dataframe=pd.DataFrame(txns), uploaded_at="2026-08-30T00:00:00Z", file_name="test.csv")

    # Create active session directly in MongoDB
    recovery_session_repository.create({
        "session_id": "rec_wh_target_01",
        "customer_id": "CUST_WH_REC_01",
        "transaction_id": "TXN_WH_REC_01",
        "amount": 2200.0,
        "recovered_amount": 0.0,
        "strategy": "Smart Retry",
        "status": "retry_scheduled",
        "merchant_id": "merchant",
        "audit_trail": [],
    })

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/webhooks/payment", json={
            "event_id": "evt_cap_001",
            "event": "payment.captured",
            "transaction_id": "TXN_WH_REC_01",
            "customer_id": "CUST_WH_REC_01",
            "amount": 2200.0,
        })
        assert res.status_code == 200

    # Verify session status is updated in MongoDB
    doc = recovery_session_repository.get("rec_wh_target_01")
    assert doc is not None
    assert doc["status"] == "recovered"
    assert doc["recovered_amount"] == 2200.0


# ============================================================================
# 7. RESTART PERSISTENCE SIMULATION
# ============================================================================

@pytest.mark.asyncio
async def test_restart_persistence_simulation(mock_mongo_environment):
    """Recovery session persists in MongoDB and is retrievable after simulated app restart."""
    from backend.db import recovery_session_repository
    from main import Dataset, app, data_store

    # 1. Store session in MongoDB
    recovery_session_repository.create({
        "session_id": "rec_restart_survivor_01",
        "customer_id": "CUST_SURVIVE_01",
        "transaction_id": "TXN_SURVIVE_01",
        "amount": 4800.0,
        "recovered_amount": 0.0,
        "strategy": "Custom Schedule",
        "status": "retry_scheduled",
        "retry_schedule": [0, 24, 72],
        "attempt_count": 1,
        "retry_time": "2026-08-31T12:00:00Z",
        "next_action_at": "2026-08-31T12:00:00Z",
        "confidence": 88.0,
        "expected_recovery": 4224.0,
        "merchant_id": "merchant",
        "audit_trail": [{"event": "custom_schedule_created", "timestamp": "2026-08-30T00:00:00Z"}],
    })

    # 2. Simulate server restart: clear memory dataset sessions
    data_store._datasets["merchant"].recovery_sessions.clear()

    # 3. Request recovery status
    cookies = {"session_id": "merchant-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        res = await client.get("/recover/rec_restart_survivor_01")
        assert res.status_code == 200
        body = res.json()
        assert body["session_id"] == "rec_restart_survivor_01"
        assert body["status"] == "retry_scheduled"
        assert body["retry_schedule"] == [0, 24, 72]
        assert body["attempt_count"] == 1
        assert body["retry_time"] == "2026-08-31T12:00:00Z"
        assert len(body["audit_trail"]) >= 1


# ============================================================================
# 8. IN-MEMORY FALLBACK
# ============================================================================

@pytest.mark.asyncio
async def test_in_memory_fallback(monkeypatch):
    """When MONGODB_URI is absent, recovery system runs 100% in-memory."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db_mod
    monkeypatch.setattr(db_mod, "_mongo_client", None)
    monkeypatch.setattr(db_mod, "get_mongodb_client", lambda force_reconnect=False: None)

    from main import Dataset, app, data_store
    txns = [{"transaction_id": "TXN_MEM_01", "customer_id": "CUST_MEM_01", "amount": 1000.0, "payment_status": "failed", "failure_reason": "Card Declined", "recovery_amount": 0.0, "payment_method": "Credit Card", "merchant_id": "merchant"}]
    data_store._datasets["merchant"] = Dataset(dataframe=pd.DataFrame(txns), uploaded_at="2026-08-30T00:00:00Z", file_name="mem.csv")

    cookies = {"session_id": "merchant-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        res = await client.post("/recover", json={
            "customer_id": "CUST_MEM_01",
            "strategy": "Offer Alternative Payment Method",
            "expected_recovered_revenue": 1000.0,
        })
        assert res.status_code == 200
        sid = res.json()["session_id"]

        status_res = await client.get(f"/recover/{sid}")
        assert status_res.status_code == 200
        assert status_res.json()["session_id"] == sid
