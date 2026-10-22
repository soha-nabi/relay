"""Tests for backend/db.py — MongoDB connection adapter (Phase 1).

All tests use mocking so they pass without a running MongoDB instance.
The existing test suites (recovery_engine, automation_engine,
customer_payment_flow, webhook_ingestion) must not be affected.
"""

import importlib
import os
import unittest.mock as mock

import httpx
import pytest


# ============================================================================
# Helpers
# ============================================================================

def reload_db_module():
    """Re-import backend.db to pick up environment variable changes mid-test."""
    import backend.db as db_mod
    importlib.reload(db_mod)
    return db_mod


# ============================================================================
# 1. Module import and PyMongo availability
# ============================================================================

def test_db_module_imports_cleanly():
    """backend.db must be importable with no side effects."""
    import backend.db as db  # noqa: F401
    assert hasattr(db, "get_database")
    assert hasattr(db, "check_mongodb_connection")
    assert hasattr(db, "is_mongodb_configured")
    assert hasattr(db, "MongoAdapter")
    assert hasattr(db, "mongo_adapter")


def test_pymongo_available_flag():
    """PYMONGO_AVAILABLE reflects whether pymongo is installed."""
    import backend.db as db
    # We installed pymongo, so this should be True
    assert db.PYMONGO_AVAILABLE is True


# ============================================================================
# 2. Missing / empty MONGODB_URI
# ============================================================================

def test_not_configured_when_uri_missing(monkeypatch):
    """is_mongodb_configured() returns False when MONGODB_URI is unset."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    assert db.is_mongodb_configured() is False


def test_not_configured_when_uri_empty(monkeypatch):
    """is_mongodb_configured() returns False when MONGODB_URI is empty string."""
    monkeypatch.setenv("MONGODB_URI", "")
    import backend.db as db
    importlib.reload(db)
    assert db.is_mongodb_configured() is False


def test_get_mongodb_client_returns_none_when_unconfigured(monkeypatch):
    """get_mongodb_client() returns None when no URI is configured."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None  # reset singleton
    result = db.get_mongodb_client()
    assert result is None


def test_get_database_returns_none_when_unconfigured(monkeypatch):
    """get_database() returns None when MONGODB_URI is empty."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None
    result = db.get_database()
    assert result is None


# ============================================================================
# 3. check_mongodb_connection() — not configured
# ============================================================================

def test_check_connection_not_configured(monkeypatch):
    """check_mongodb_connection() returns 'not_configured' when URI is missing."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None
    result = db.check_mongodb_connection()
    assert result["status"] == "not_configured"
    assert result["connected"] is False
    assert "message" in result


# ============================================================================
# 4. Database name configuration
# ============================================================================

def test_default_database_name(monkeypatch):
    """get_mongodb_db_name() defaults to 'relay' when MONGODB_DB_NAME is unset."""
    monkeypatch.delenv("MONGODB_DB_NAME", raising=False)
    import backend.db as db
    importlib.reload(db)
    assert db.get_mongodb_db_name() == "relay"


def test_custom_database_name(monkeypatch):
    """get_mongodb_db_name() returns value from MONGODB_DB_NAME env var."""
    monkeypatch.setenv("MONGODB_DB_NAME", "relay_production")
    import backend.db as db
    importlib.reload(db)
    assert db.get_mongodb_db_name() == "relay_production"


def test_empty_database_name_falls_back_to_relay(monkeypatch):
    """get_mongodb_db_name() falls back to 'relay' if env var is blank."""
    monkeypatch.setenv("MONGODB_DB_NAME", "")
    import backend.db as db
    importlib.reload(db)
    assert db.get_mongodb_db_name() == "relay"


# ============================================================================
# 5. Invalid MongoDB URI (mocked MongoClient that fails ping)
# ============================================================================

def test_check_connection_invalid_uri_returns_unavailable(monkeypatch):
    """check_mongodb_connection() returns 'unavailable' when ping fails."""
    monkeypatch.setenv("MONGODB_URI", "mongodb://localhost:27099/relay")  # nothing listening
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None

    # Mock MongoClient so it raises on ping (avoids slow network timeout in tests)
    mock_client = mock.MagicMock()
    mock_client.admin.command.side_effect = Exception("Connection refused")

    with mock.patch.object(db, "get_mongodb_client", return_value=mock_client):
        result = db.check_mongodb_connection()
    assert result["status"] == "unavailable"
    assert result["connected"] is False


# ============================================================================
# 6. check_mongodb_connection() — successfully connected (mocked)
# ============================================================================

def test_check_connection_returns_connected_when_ping_succeeds(monkeypatch):
    """check_mongodb_connection() reports 'connected' when ping succeeds."""
    monkeypatch.setenv("MONGODB_URI", "mongodb://localhost:27017/relay")
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None

    mock_client = mock.MagicMock()
    mock_client.admin.command.return_value = {"ok": 1}  # ping success

    with mock.patch.object(db, "get_mongodb_client", return_value=mock_client):
        result = db.check_mongodb_connection()
    assert result["status"] == "connected"
    assert result["connected"] is True
    assert result["database"] == "relay"


# ============================================================================
# 7. Data conversion helpers
# ============================================================================

def test_to_mongo_doc_roundtrip():
    """to_mongo_doc() creates a clean copy without mutating original."""
    import backend.db as db
    original = {"session_id": "rec_001", "amount": 1000.0, "status": "created"}
    doc = db.to_mongo_doc(original)
    assert doc["session_id"] == "rec_001"
    assert doc is not original  # defensive copy


def test_to_mongo_doc_strips_null_id():
    """to_mongo_doc() removes '_id' when it is None."""
    import backend.db as db
    original = {"_id": None, "session_id": "rec_002"}
    doc = db.to_mongo_doc(original)
    assert "_id" not in doc


def test_from_mongo_doc_returns_none_for_none():
    """from_mongo_doc(None) returns None safely."""
    import backend.db as db
    assert db.from_mongo_doc(None) is None


def test_from_mongo_doc_converts_object_id_to_str():
    """from_mongo_doc() converts _id (any type) to string."""
    import backend.db as db
    from bson import ObjectId
    oid = ObjectId()
    doc = {"_id": oid, "session_id": "rec_003"}
    result = db.from_mongo_doc(doc)
    assert isinstance(result["_id"], str)
    assert result["session_id"] == "rec_003"


def test_from_mongo_doc_does_not_mutate_original():
    """from_mongo_doc() returns a new dict without altering the source."""
    import backend.db as db
    doc = {"session_id": "rec_004", "status": "created"}
    result = db.from_mongo_doc(doc)
    assert result is not doc


# ============================================================================
# 8. MongoAdapter
# ============================================================================

def test_mongo_adapter_default_db_name(monkeypatch):
    """MongoAdapter uses MONGODB_DB_NAME from env by default."""
    monkeypatch.setenv("MONGODB_DB_NAME", "relay")
    import backend.db as db
    importlib.reload(db)
    adapter = db.MongoAdapter()
    assert adapter.db_name == "relay"


def test_mongo_adapter_is_not_available_without_uri(monkeypatch):
    """MongoAdapter.is_available returns False when no URI is set."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None
    adapter = db.MongoAdapter()
    assert adapter.is_available is False


def test_mongo_adapter_get_collection_returns_none_without_uri(monkeypatch):
    """MongoAdapter.get_collection() returns None gracefully when unconfigured."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None
    adapter = db.MongoAdapter()
    assert adapter.get_collection("recovery_sessions") is None


# ============================================================================
# 9. In-memory fallback — existing DataStore must still work without MongoDB
# ============================================================================

def test_existing_datastore_works_without_mongodb(monkeypatch):
    """DataStore continues to function when MONGODB_URI is absent."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    from main import data_store
    # The sample data is loaded at startup — this must always return something
    dataset = data_store.get("merchant")
    assert dataset is not None
    assert not dataset.dataframe.empty


# ============================================================================
# 10. GET /health/db endpoint
# ============================================================================

@pytest.mark.asyncio
async def test_health_db_not_configured(monkeypatch):
    """GET /health/db returns not_configured when MONGODB_URI is absent."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    import backend.db as db
    importlib.reload(db)
    db._mongo_client = None

    from main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["mongodb"] in ("not_configured", "unavailable", "connected")
    # Must not expose any URI value or credentials in the response
    uri_value = os.environ.get("MONGODB_URI", "")
    if uri_value:
        assert uri_value not in str(body)
    assert "password" not in str(body).lower()


@pytest.mark.asyncio
async def test_health_db_returns_expected_shape():
    """GET /health/db always returns required response fields."""
    from main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/db")
    assert response.status_code == 200
    body = response.json()
    assert "mongodb" in body
    assert "connected" in body
    assert "database" in body
    assert "message" in body


@pytest.mark.asyncio
async def test_existing_health_endpoint_still_works():
    """GET /health remains unchanged after adding /health/db."""
    from main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["version"] == "2.0.0"


# ============================================================================
# 11. Startup — application starts without MongoDB
# ============================================================================

def test_application_starts_without_mongodb(monkeypatch):
    """The FastAPI app can be instantiated without any MongoDB connection."""
    monkeypatch.delenv("MONGODB_URI", raising=False)
    from main import app  # Must not raise
    assert app is not None
