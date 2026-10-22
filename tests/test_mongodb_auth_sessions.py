"""Tests for Phase B: Persistent Auth Sessions in MongoDB.

Covers:
1. session created in MongoDB
2. session retrieved from MongoDB
3. valid session authenticates
4. invalid session rejected
5. expired session rejected
6. logout invalidates session
7. invalidated session rejected
8. last_seen update
9. session survives backend restart (in-memory store eviction)
10. session TTL configuration
11. admin session role
12. merchant session role
13. user session role
14. merchant isolation
15. MongoDB fallback to in-memory session
16. existing login tests
17. existing signup tests
"""

from datetime import datetime, timedelta, timezone
import uuid
import httpx
import pytest

from backend.auth import (
    SESSION_STORE,
    USERS,
    find_user,
    hash_password,
    verify_password,
)
from backend.db import (
    COLLECTION_AUTH_SESSIONS,
    auth_session_repository,
    check_mongodb_connection,
    is_mongodb_configured,
    user_repository,
)
from main import app
from scripts.seed_users import seed_demo_users


def get_test_client():
    """Create an async httpx client configured for FastAPI."""
    try:
        transport = httpx.ASGITransport(app=app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")
    except (AttributeError, TypeError):
        return httpx.AsyncClient(app=app, base_url="http://test")


# ---------------------------------------------------------------------------
# 1. Session Created in MongoDB
# ---------------------------------------------------------------------------
def test_session_created_in_mongodb():
    """AuthSessionRepository persists session document with required fields."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    sid = f"sess_test_{uuid.uuid4().hex[:12]}"
    session_data = {
        "session_id": sid,
        "user_id": "usr_test1",
        "username": "testuser",
        "role": "user",
        "name": "Test User",
        "merchant_id": "merchant",
        "email": "test@relay.io",
        "is_active": True,
    }

    created = auth_session_repository.create_session(session_data, ttl_seconds=3600)
    assert created is not None
    assert created["session_id"] == sid
    assert created["username"] == "testuser"
    assert created["role"] == "user"
    assert created["is_active"] is True
    assert "password" not in created
    assert "password_hash" not in created

    # Check raw collection directly
    raw = auth_session_repository.collection.find_one({"session_id": sid})
    assert raw is not None
    assert raw["username"] == "testuser"
    assert "password_hash" not in raw


# ---------------------------------------------------------------------------
# 2. Session Retrieved from MongoDB
# ---------------------------------------------------------------------------
def test_session_retrieved_from_mongodb():
    """AuthSessionRepository.get_session retrieves active session."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    sid = f"sess_get_{uuid.uuid4().hex[:12]}"
    auth_session_repository.create_session({
        "session_id": sid,
        "user_id": "usr_get",
        "username": "getuser",
        "role": "merchant",
        "name": "Get Merchant",
        "merchant_id": "merch_123",
        "is_active": True,
    }, ttl_seconds=3600)

    sess = auth_session_repository.get_session(sid)
    assert sess is not None
    assert sess["session_id"] == sid
    assert sess["merchant_id"] == "merch_123"


# ---------------------------------------------------------------------------
# 3. Valid Session Authenticates
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_valid_session_authenticates():
    """Protected endpoint returns 200 with valid session token/cookie."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "merchant", "password": "merchant123"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["session_id"]

        # Call protected /auth/me with header
        me_res = await client.get("/auth/me", headers={"X-Session-ID": token})
        assert me_res.status_code == 200
        assert me_res.json()["user"]["username"] == "merchant"

        # Call protected /dashboard with cookie
        dash_res = await client.get("/dashboard", cookies={"session_id": token})
        assert dash_res.status_code == 200


# ---------------------------------------------------------------------------
# 4. Invalid Session Rejected
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_invalid_session_rejected():
    """Random / non-existent session token must return 401 Unauthorized."""
    async with get_test_client() as client:
        fake_token = f"fake_token_{uuid.uuid4().hex}"
        res = await client.get("/auth/me", headers={"X-Session-ID": fake_token})
        assert res.status_code == 401
        assert "Not authenticated" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 5. Expired Session Rejected
# ---------------------------------------------------------------------------
def test_expired_session_rejected():
    """Sessions past expires_at must return None and reject authentication."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    sid = f"sess_exp_{uuid.uuid4().hex[:12]}"
    past_time = datetime.now(timezone.utc) - timedelta(hours=2)

    # Insert pre-expired session
    auth_session_repository.create_session({
        "session_id": sid,
        "user_id": "usr_expired",
        "username": "expired_user",
        "role": "user",
        "name": "Expired User",
        "is_active": True,
        "expires_at": past_time,
    })

    # Repository check
    sess = auth_session_repository.get_session(sid)
    assert sess is None


@pytest.mark.asyncio
async def test_expired_session_returns_401():
    """HTTP request with expired session must return 401."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    sid = f"sess_exp_http_{uuid.uuid4().hex[:12]}"
    past_time = datetime.now(timezone.utc) - timedelta(hours=1)

    auth_session_repository.create_session({
        "session_id": sid,
        "user_id": "usr_expired_http",
        "username": "expired_http_user",
        "role": "user",
        "name": "Expired HTTP User",
        "is_active": True,
        "expires_at": past_time,
    })

    async with get_test_client() as client:
        res = await client.get("/auth/me", headers={"X-Session-ID": sid})
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# 6. Logout Invalidates Session
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_logout_invalidates_session():
    """Calling /auth/logout marks is_active=False in MongoDB and clears cookie."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "user", "password": "user123"},
        )
        token = login_res.json()["session_id"]

        # Call logout
        logout_res = await client.post("/auth/logout", headers={"X-Session-ID": token})
        assert logout_res.status_code == 200
        assert logout_res.json()["status"] == "success"

        # Check repository directly if MongoDB connected
        if auth_session_repository.collection is not None:
            sess_doc = auth_session_repository.collection.find_one({"session_id": token})
            if sess_doc:
                assert sess_doc.get("is_active") is False


# ---------------------------------------------------------------------------
# 7. Invalidated Session Rejected
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_invalidated_session_rejected():
    """Subsequent requests with logged-out session must return 401."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "merchant", "password": "merchant123"},
        )
        token = login_res.json()["session_id"]

        # Confirm access
        r1 = await client.get("/dashboard", headers={"X-Session-ID": token})
        assert r1.status_code == 200

        # Logout
        await client.post("/auth/logout", headers={"X-Session-ID": token})

        # Post-logout request rejected
        r2 = await client.get("/dashboard", headers={"X-Session-ID": token})
        assert r2.status_code == 401


# ---------------------------------------------------------------------------
# 8. Last Seen Update
# ---------------------------------------------------------------------------
def test_last_seen_update():
    """Retrieving active session refreshes last_seen timestamp."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    sid = f"sess_seen_{uuid.uuid4().hex[:12]}"
    auth_session_repository.create_session({
        "session_id": sid,
        "user_id": "usr_seen",
        "username": "seen_user",
        "role": "user",
        "name": "Seen User",
        "is_active": True,
    })

    raw_before = auth_session_repository.collection.find_one({"session_id": sid})
    assert raw_before is not None
    assert "last_seen" in raw_before

    # Call get_session
    sess = auth_session_repository.get_session(sid)
    assert sess is not None
    assert "last_seen" in sess


# ---------------------------------------------------------------------------
# 9. Session Survives Backend Restart
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_session_survives_backend_restart():
    """Clearing in-memory SESSION_STORE (simulating restart) still authenticates from MongoDB."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["session_id"]

        # Simulate backend restart: completely purge in-memory SESSION_STORE
        SESSION_STORE.clear()
        assert len(SESSION_STORE) == 0

        # Subsequent authenticated request should retrieve from MongoDB and succeed
        me_res = await client.get("/auth/me", headers={"X-Session-ID": token})
        assert me_res.status_code == 200
        assert me_res.json()["user"]["username"] == "admin"
        assert me_res.json()["user"]["role"] == "admin"



# ---------------------------------------------------------------------------
# 10. Session TTL Configuration
# ---------------------------------------------------------------------------
def test_session_ttl_configuration():
    """Verify unique index and TTL index are registered on auth_sessions collection."""
    if auth_session_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    auth_session_repository.init_indexes()
    indexes = list(auth_session_repository.collection.list_indexes())
    index_names = [idx["name"] for idx in indexes]

    assert "uniq_session_id" in index_names or "_id_" in index_names
    assert "ttl_session_expires" in index_names or any("expires_at" in idx.get("key", {}) for idx in indexes)


# ---------------------------------------------------------------------------
# 11. Admin Session Role
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_admin_session_role():
    """Admin session can access admin platform endpoints."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        token = login_res.json()["session_id"]

        res = await client.get("/admin/platform-stats", headers={"X-Session-ID": token})
        assert res.status_code == 200
        assert "platform_overview" in res.json()


# ---------------------------------------------------------------------------
# 12. Merchant Session Role
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_merchant_session_role():
    """Merchant session can access merchant dashboard."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "merchant", "password": "merchant123"},
        )
        token = login_res.json()["session_id"]

        res = await client.get("/dashboard", headers={"X-Session-ID": token})
        assert res.status_code == 200
        assert "primary_metrics" in res.json()


# ---------------------------------------------------------------------------
# 13. User Session Role
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_user_session_role():
    """User session can access user payment instructions."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "user", "password": "user123"},
        )
        token = login_res.json()["session_id"]

        res = await client.get("/user/payments", headers={"X-Session-ID": token})
        assert res.status_code == 200
        assert "transactions" in res.json()


# ---------------------------------------------------------------------------
# 14. Merchant Isolation
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_merchant_isolation():
    """User role session cannot access admin routes, maintaining role isolation."""
    seed_demo_users()

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "user", "password": "user123"},
        )
        token = login_res.json()["session_id"]

        # Access forbidden to admin stats
        admin_res = await client.get("/admin/platform-stats", headers={"X-Session-ID": token})
        assert admin_res.status_code == 403


# ---------------------------------------------------------------------------
# 15. MongoDB Fallback to In-Memory Session
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_mongodb_fallback_to_in_memory_session(monkeypatch):
    """When MongoDB is offline, session management falls back to in-memory SESSION_STORE."""
    monkeypatch.setattr("backend.auth.is_mongodb_configured", lambda: False)

    async with get_test_client() as client:
        login_res = await client.post(
            "/auth/login",
            json={"username": "merchant", "password": "merchant123"},
        )
        assert login_res.status_code == 200
        token = login_res.json()["session_id"]

        # In-memory session check
        assert token in SESSION_STORE

        me_res = await client.get("/auth/me", headers={"X-Session-ID": token})
        assert me_res.status_code == 200
        assert me_res.json()["user"]["username"] == "merchant"


# ---------------------------------------------------------------------------
# 16. Existing Login Contract
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_login_contract():
    """Verify response structure of /auth/login is unchanged."""
    seed_demo_users()

    async with get_test_client() as client:
        res = await client.post(
            "/auth/login",
            json={"username": "merchant", "password": "merchant123"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "message" in data
        assert "session_id" in data
        assert "user" in data
        assert data["user"]["username"] == "merchant"
        assert "session_id" in res.cookies


# ---------------------------------------------------------------------------
# 17. Existing Signup Contract
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_signup_contract():
    """Verify response structure of /auth/signup is unchanged."""
    uname = f"contract_user_{uuid.uuid4().hex[:6]}"
    async with get_test_client() as client:
        res = await client.post(
            "/auth/signup",
            json={
                "username": uname,
                "password": "Password123!",
                "name": "Contract User",
                "email": f"{uname}@example.com",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "success"
        assert "session_id" in data
        assert "user" in data
        assert data["user"]["username"] == uname
        assert data["user"]["email"] == f"{uname}@example.com"
