"""Comprehensive test suite for Phase 2: MongoDB Persistence for Transactions and Customers.

Tests all repository functions, batch upserts, CSV uploads, customer lookups,
dashboard metrics, webhook updates, seed idempotency, restart persistence, and fallback.
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
    TransactionRepository,
    customer_repository,
    is_mongodb_configured,
    transaction_repository,
)
from scripts.seed_mongodb import seed_sample_data


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

    # Patch get_mongodb_client to return our mock_client
    import backend.db as db_mod
    monkeypatch.setattr(db_mod, "get_mongodb_client", lambda force_reconnect=False: mock_client)
    monkeypatch.setattr(db_mod, "_mongo_client", mock_client)

    # Re-initialize repository instances with mock adapter
    mock_adapter = MongoAdapter("relay_test")
    monkeypatch.setattr(db_mod, "mongo_adapter", mock_adapter)
    monkeypatch.setattr(db_mod, "transaction_repository", TransactionRepository(mock_adapter))
    monkeypatch.setattr(db_mod, "customer_repository", CustomerRepository(mock_adapter))

    # Also patch in main.py
    import main as main_mod
    monkeypatch.setattr(main_mod, "transaction_repository", TransactionRepository(mock_adapter))
    monkeypatch.setattr(main_mod, "customer_repository", CustomerRepository(mock_adapter))

    SESSION_STORE["test-token"] = {"username": "merchant", "role": "merchant", "name": "Merchant"}

    yield mock_client


# ============================================================================
# 1. TRANSACTION REPOSITORY TESTS
# ============================================================================

def test_transaction_insert(mock_mongo_environment):
    """TransactionRepository.insert_transaction creates a clean document without raw ObjectId leaks."""
    from backend.db import transaction_repository

    data = {
        "transaction_id": "TXN_TEST_001",
        "customer_id": "CUST_TEST_001",
        "merchant_id": "merchant",
        "amount": 1500.0,
        "payment_method": "Credit Card",
        "payment_status": "failed",
        "failure_reason": "Card Declined",
    }
    result = transaction_repository.insert_transaction(data)
    assert result is not None
    assert result["transaction_id"] == "TXN_TEST_001"
    assert result["amount"] == 1500.0
    assert isinstance(result.get("_id"), str)

    found = transaction_repository.find_by_transaction_id("TXN_TEST_001")
    assert found is not None
    assert found["customer_id"] == "CUST_TEST_001"


def test_transaction_upsert(mock_mongo_environment):
    """Upserting an existing transaction updates fields instead of creating duplicates."""
    from backend.db import transaction_repository

    data = {
        "transaction_id": "TXN_TEST_002",
        "customer_id": "CUST_TEST_002",
        "merchant_id": "merchant",
        "amount": 2000.0,
        "payment_status": "failed",
    }
    transaction_repository.upsert_transaction(data)

    # Update amount and status
    data["amount"] = 2500.0
    data["payment_status"] = "success"
    data["recovery_amount"] = 2500.0
    updated = transaction_repository.upsert_transaction(data)

    assert updated["amount"] == 2500.0
    assert updated["payment_status"] == "success"
    assert updated["recovery_amount"] == 2500.0

    all_txns = transaction_repository.list_transactions({"transaction_id": "TXN_TEST_002"})
    assert len(all_txns) == 1


def test_duplicate_transaction_prevention(mock_mongo_environment):
    """Batch upsert does not create duplicate entries for same transaction_id."""
    from backend.db import transaction_repository

    rows = [
        {"transaction_id": "TXN_DUP_01", "customer_id": "CUST_DUP", "amount": 100.0, "payment_status": "failed"},
        {"transaction_id": "TXN_DUP_01", "customer_id": "CUST_DUP", "amount": 100.0, "payment_status": "failed"},
    ]
    count = transaction_repository.upsert_transactions_batch(rows, merchant_id="merchant")
    assert count >= 1

    records = transaction_repository.list_transactions({"transaction_id": "TXN_DUP_01"})
    assert len(records) == 1


def test_merchant_scoping(mock_mongo_environment):
    """Transactions are properly scoped by merchant_id."""
    from backend.db import transaction_repository

    transaction_repository.upsert_transaction({
        "transaction_id": "TXN_M1_01",
        "customer_id": "CUST_01",
        "merchant_id": "merchant_a",
        "amount": 500.0,
        "payment_status": "failed",
    })
    transaction_repository.upsert_transaction({
        "transaction_id": "TXN_M2_01",
        "customer_id": "CUST_02",
        "merchant_id": "merchant_b",
        "amount": 900.0,
        "payment_status": "failed",
    })

    m1_txns = transaction_repository.find_by_merchant_id("merchant_a")
    assert len(m1_txns) == 1
    assert m1_txns[0]["transaction_id"] == "TXN_M1_01"

    m2_txns = transaction_repository.find_by_merchant_id("merchant_b")
    assert len(m2_txns) == 1
    assert m2_txns[0]["transaction_id"] == "TXN_M2_01"


# ============================================================================
# 2. CUSTOMER REPOSITORY TESTS
# ============================================================================

def test_customer_upsert(mock_mongo_environment):
    """CustomerRepository upserts customer records correctly."""
    from backend.db import customer_repository

    cust_data = {
        "customer_id": "CUST_PERSIST_01",
        "merchant_id": "merchant",
        "primary_payment_method": "UPI",
        "risk_score": 45.0,
    }
    res = customer_repository.upsert_customer(cust_data)
    assert res is not None
    assert res["customer_id"] == "CUST_PERSIST_01"
    assert res["primary_payment_method"] == "UPI"

    found = customer_repository.find_customer("CUST_PERSIST_01", "merchant")
    assert found is not None
    assert found["risk_score"] == 45.0


def test_customer_upsert_from_transactions(mock_mongo_environment):
    """Unique customers are extracted and persisted from transaction lists."""
    from backend.db import customer_repository

    txns = [
        {"transaction_id": "T1", "customer_id": "CUST_BATCH_1", "payment_method": "Credit Card", "amount": 100.0},
        {"transaction_id": "T2", "customer_id": "CUST_BATCH_1", "payment_method": "Credit Card", "amount": 200.0},
        {"transaction_id": "T3", "customer_id": "CUST_BATCH_2", "payment_method": "UPI", "amount": 300.0},
    ]
    count = customer_repository.upsert_customers_from_transactions(txns, merchant_id="merchant")
    assert count >= 2

    c1 = customer_repository.find_customer("CUST_BATCH_1", "merchant")
    assert c1 is not None
    assert c1["primary_payment_method"] == "Credit Card"

    c2 = customer_repository.find_customer("CUST_BATCH_2", "merchant")
    assert c2 is not None
    assert c2["primary_payment_method"] == "UPI"


# ============================================================================
# 3. CSV UPLOAD PERSISTENCE & DATASTORE
# ============================================================================

def test_csv_upload_persists_to_mongodb(mock_mongo_environment):
    """DataStore.put() stores transactions and customer records in MongoDB."""
    from backend.db import customer_repository, transaction_repository
    from main import DataStore

    df = pd.DataFrame([
        {
            "transaction_id": "TXN_CSV_01",
            "customer_id": "CUST_CSV_01",
            "amount": 3200.0,
            "payment_method": "NetBanking",
            "failure_reason": "Bank Timeout",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
        {
            "transaction_id": "TXN_CSV_02",
            "customer_id": "CUST_CSV_02",
            "amount": 1800.0,
            "payment_method": "UPI",
            "failure_reason": "Insufficient Funds",
            "recovery_amount": 0.0,
            "payment_status": "failed",
            "status": "failed",
        },
    ])
    ds = DataStore()
    ds.put("merchant", df, "upload_test.csv")

    # Verify transactions exist in MongoDB
    t1 = transaction_repository.find_by_transaction_id("TXN_CSV_01")
    assert t1 is not None
    assert t1["amount"] == 3200.0

    # Verify customer exists in MongoDB
    c1 = customer_repository.find_customer("CUST_CSV_01", "merchant")
    assert c1 is not None
    assert c1["primary_payment_method"] == "NetBanking"


# ============================================================================
# 4. CUSTOMER LOOKUP & DASHBOARD API FROM PERSISTED TRANSACTIONS
# ============================================================================

@pytest.mark.asyncio
async def test_customer_lookup_and_dashboard_from_mongodb(mock_mongo_environment):
    """Endpoints compute profile and dashboard statistics from persistent records."""
    from backend.db import transaction_repository
    from main import Dataset, app, data_store

    test_txns = [
        {"transaction_id": "T_D1", "customer_id": "CUST_DASH_1", "amount": 1000.0, "payment_status": "failed", "failure_reason": "Card Declined", "recovery_amount": 1000.0, "payment_method": "Credit Card", "merchant_id": "merchant"},
        {"transaction_id": "T_D2", "customer_id": "CUST_DASH_1", "amount": 1000.0, "payment_status": "success", "failure_reason": "", "recovery_amount": 0.0, "payment_method": "Credit Card", "merchant_id": "merchant"},
        {"transaction_id": "T_D3", "customer_id": "CUST_DASH_2", "amount": 500.0, "payment_status": "success", "failure_reason": "", "recovery_amount": 0.0, "payment_method": "UPI", "merchant_id": "merchant"},
    ]
    transaction_repository.upsert_transactions_batch(test_txns, merchant_id="merchant")

    # Sync DataStore
    df = pd.DataFrame(test_txns)
    data_store._datasets["merchant"] = Dataset(dataframe=df, uploaded_at=datetime.now(timezone.utc).isoformat(), file_name="mongodb:test")

    cookies = {"session_id": "test-token"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", cookies=cookies) as client:
        # Test customer endpoint
        cust_res = await client.get("/customer/CUST_DASH_1")
        assert cust_res.status_code == 200
        cdata = cust_res.json()
        assert cdata["customer_id"] == "CUST_DASH_1"
        assert cdata["total_transactions"] == 2
        assert cdata["recovery_rate"] == 100.0

        # Test dashboard endpoint
        dash_res = await client.get("/dashboard")
        assert dash_res.status_code == 200
        ddata = dash_res.json()
        assert ddata["summary"]["total_transactions"] == 3
        assert ddata["summary"]["total_amount"] == 2500.0


# ============================================================================
# 5. WEBHOOK UPDATES PERSISTENT TRANSACTIONS
# ============================================================================

@pytest.mark.asyncio
async def test_webhook_persists_failed_and_captured_events(mock_mongo_environment):
    """Payment webhooks update MongoDB transactions in real-time."""
    from backend.db import transaction_repository
    from main import Dataset, app, data_store

    initial_txns = [
        {"transaction_id": "TXN_WH_P01", "customer_id": "CUST_WH_P01", "amount": 4000.0, "payment_status": "pending", "payment_method": "Credit Card", "merchant_id": "merchant"},
    ]
    transaction_repository.upsert_transactions_batch(initial_txns, merchant_id="merchant")
    data_store._datasets["merchant"] = Dataset(dataframe=pd.DataFrame(initial_txns), uploaded_at="2026-08-30T00:00:00Z", file_name="wh_test.csv")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Send payment.failed
        f_res = await client.post("/webhooks/payment", json={
            "event_id": "evt_wh_p_01",
            "event": "payment.failed",
            "transaction_id": "TXN_WH_P01",
            "customer_id": "CUST_WH_P01",
            "amount": 4000.0,
            "reason": "Card Declined",
        })
        assert f_res.status_code == 200

        # Verify MongoDB updated to failed
        doc = transaction_repository.find_by_transaction_id("TXN_WH_P01")
        assert doc["payment_status"] == "failed"
        assert doc["failure_reason"] == "Card Declined"

        # Send payment.captured
        c_res = await client.post("/webhooks/payment", json={
            "event_id": "evt_wh_p_02",
            "event": "payment.captured",
            "transaction_id": "TXN_WH_P01",
            "customer_id": "CUST_WH_P01",
            "amount": 4000.0,
        })
        assert c_res.status_code == 200

        # Verify MongoDB updated to success
        doc_captured = transaction_repository.find_by_transaction_id("TXN_WH_P01")
        assert doc_captured["payment_status"] == "success"
        assert doc_captured["recovery_amount"] == 4000.0


# ============================================================================
# 6. SEED SCRIPT IDEMPOTENCY
# ============================================================================

def test_seed_script_idempotent(mock_mongo_environment, tmp_path):
    """Running seed_sample_data() twice yields identical counts without duplicates."""
    from backend.db import customer_repository, transaction_repository

    test_csv = tmp_path / "test_sample.csv"
    test_csv.write_text(
        "transaction_id,customer_id,amount,payment_method,failure_reason,status\n"
        "TXN_SEED_1,CUST_S1,1000,UPI,Insufficient Funds,failed\n"
        "TXN_SEED_2,CUST_S2,2500,Credit Card,Card Declined,failed\n"
        "TXN_SEED_3,CUST_S1,3000,UPI,,success\n",
        encoding="utf-8",
    )

    res1 = seed_sample_data(str(test_csv), merchant_id="merchant")
    assert res1["status"] == "success"
    txns_count_1 = len(transaction_repository.list_transactions())
    cust_count_1 = len(customer_repository.list_customers())

    # Run again (idempotent)
    res2 = seed_sample_data(str(test_csv), merchant_id="merchant")
    assert res2["status"] == "success"
    txns_count_2 = len(transaction_repository.list_transactions())
    cust_count_2 = len(customer_repository.list_customers())

    assert txns_count_1 == txns_count_2 == 3
    assert cust_count_1 == cust_count_2 == 2


# ============================================================================
# 7. RESTART PERSISTENCE SIMULATION
# ============================================================================

def test_restart_persistence_simulation(mock_mongo_environment):
    """DataStore reloads persisted transactions on fresh initialization (server reboot)."""
    from backend.db import transaction_repository
    from main import DataStore

    # Populate MongoDB
    test_rows = [
        {"transaction_id": "TXN_RESTART_1", "customer_id": "CUST_R1", "amount": 1200.0, "payment_status": "failed", "merchant_id": "merchant"},
        {"transaction_id": "TXN_RESTART_2", "customer_id": "CUST_R2", "amount": 3400.0, "payment_status": "success", "merchant_id": "merchant"},
    ]
    transaction_repository.upsert_transactions_batch(test_rows, merchant_id="merchant")

    # Simulate server restart by creating a new DataStore
    fresh_datastore = DataStore()
    dataset = fresh_datastore.get("merchant")

    assert dataset is not None
    assert len(dataset.dataframe) >= 2
    assert "TXN_RESTART_1" in dataset.dataframe["transaction_id"].values
    assert "TXN_RESTART_2" in dataset.dataframe["transaction_id"].values


# ============================================================================
# 8. IN-MEMORY FALLBACK
# ============================================================================

def test_in_memory_fallback_when_mongodb_unconfigured(monkeypatch):
    """When MONGODB_URI is unset, DataStore functions completely in-memory."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db_mod
    monkeypatch.setattr(db_mod, "_mongo_client", None)
    monkeypatch.setattr(db_mod, "get_mongodb_client", lambda force_reconnect=False: None)

    from main import DataStore
    ds = DataStore()
    dataset = ds.get("merchant")
    assert dataset is not None
    assert not dataset.dataframe.empty
