"""Tests for Phase A Auth Migration: User Repository, Password Hashing, Login, and Signup.

Covers:
1. user creation
2. duplicate username
3. duplicate email
4. password hashing
5. password verification
6. successful login
7. invalid password
8. unknown user
9. signup
10. admin cannot be created through public signup
11. seed_users idempotency
12. MongoDB user persistence
13. in-memory fallback
14. existing role behavior
"""

import uuid
import httpx
import pytest

from backend.auth import (
    USERS,
    hash_password,
    verify_password,
    find_user,
    SESSION_STORE,
)
from backend.db import (
    COLLECTION_USERS,
    check_mongodb_connection,
    is_mongodb_configured,
    mongo_adapter,
    user_repository,
)
from main import app
from scripts.seed_users import seed_demo_users


def get_test_client():
    """Create an async httpx client configured for the FastAPI app."""
    try:
        transport = httpx.ASGITransport(app=app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")
    except (AttributeError, TypeError):
        return httpx.AsyncClient(app=app, base_url="http://test")


# ---------------------------------------------------------------------------
# 1. User Creation & Retrieval
# ---------------------------------------------------------------------------
def test_user_creation_and_retrieval():
    """Verify UserRepository can create and query users by ID, username, and email."""
    if user_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    test_uid = f"usr_test_{uuid.uuid4().hex[:8]}"
    test_uname = f"testuser_{uuid.uuid4().hex[:6]}"
    test_email = f"{test_uname}@relay.io"
    pwd_hash = hash_password("SecurePass123!")

    doc = {
        "user_id": test_uid,
        "username": test_uname,
        "email": test_email,
        "password_hash": pwd_hash,
        "role": "user",
        "name": "Test User",
        "merchant_id": "merchant",
        "is_active": True,
    }

    created = user_repository.create_user(doc)
    assert created is not None
    assert created["user_id"] == test_uid
    assert created["username"] == test_uname
    assert created["email"] == test_email
    assert created["is_active"] is True

    # Query by ID
    by_id = user_repository.get_by_id(test_uid)
    assert by_id is not None
    assert by_id["username"] == test_uname

    # Query by username (case-insensitive)
    by_uname = user_repository.get_by_username(test_uname.upper())
    assert by_uname is not None
    assert by_uname["user_id"] == test_uid

    # Query by email
    by_email = user_repository.get_by_email(test_email)
    assert by_email is not None
    assert by_email["user_id"] == test_uid


# ---------------------------------------------------------------------------
# 2. Duplicate Username Rejection
# ---------------------------------------------------------------------------
def test_duplicate_username_rejected():
    """UserRepository must reject duplicate usernames."""
    if user_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    dup_uname = f"dup_{uuid.uuid4().hex[:6]}"
    user_repository.create_user({
        "username": dup_uname,
        "password_hash": hash_password("pass1"),
    })

    with pytest.raises(ValueError, match="already taken"):
        user_repository.create_user({
            "username": dup_uname,
            "password_hash": hash_password("pass2"),
        })


# ---------------------------------------------------------------------------
# 3. Duplicate Email Rejection
# ---------------------------------------------------------------------------
def test_duplicate_email_rejected():
    """UserRepository must reject duplicate email addresses."""
    if user_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    dup_email = f"dup_{uuid.uuid4().hex[:6]}@relay.io"
    user_repository.create_user({
        "username": f"user_a_{uuid.uuid4().hex[:6]}",
        "email": dup_email,
        "password_hash": hash_password("pass1"),
    })

    with pytest.raises(ValueError, match="already registered"):
        user_repository.create_user({
            "username": f"user_b_{uuid.uuid4().hex[:6]}",
            "email": dup_email,
            "password_hash": hash_password("pass2"),
        })


# ---------------------------------------------------------------------------
# 4. Password Hashing
# ---------------------------------------------------------------------------
def test_password_hashing():
    """Verify hash_password generates PBKDF2 hash format with unique salts."""
    pwd = "MySecretPassword!2026"
    hash1 = hash_password(pwd)
    hash2 = hash_password(pwd)

    assert hash1.startswith("pbkdf2_sha256$100000$")
    assert hash2.startswith("pbkdf2_sha256$100000$")
    # Different salts must yield different hashes
    assert hash1 != hash2


# ---------------------------------------------------------------------------
# 5. Password Verification
# ---------------------------------------------------------------------------
def test_password_verification():
    """Verify verify_password correctly validates matching and non-matching passwords."""
    pwd = "VerifyMe123!"
    hashed = hash_password(pwd)

    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(pwd, "") is False


# ---------------------------------------------------------------------------
# 6. Successful Login
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_successful_login():
    """POST /auth/login returns session, user info, and cookie for valid credentials."""
    seed_demo_users()

    async with get_test_client() as client:
        res = await client.post(
            "/auth/login",
            json={"username": "merchant", "password": "merchant123"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "session_id" in data
        assert data["user"]["username"] == "merchant"
        assert data["user"]["role"] == "merchant"
        assert "session_id" in res.cookies


# ---------------------------------------------------------------------------
# 7. Invalid Password
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_invalid_password_returns_401():
    """POST /auth/login returns 401 for incorrect password."""
    seed_demo_users()

    async with get_test_client() as client:
        res = await client.post(
            "/auth/login",
            json={"username": "admin", "password": "WrongPassword999"},
        )
        assert res.status_code == 401
        assert "Invalid username or password" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 8. Unknown User Login
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_unknown_user_returns_401():
    """POST /auth/login returns 401 for nonexistent user."""
    async with get_test_client() as client:
        res = await client.post(
            "/auth/login",
            json={"username": f"nonexistent_{uuid.uuid4().hex[:8]}", "password": "password123"},
        )
        assert res.status_code == 401
        assert "Invalid username or password" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 9. Signup Endpoint
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_signup_endpoint_creates_user_and_session():
    """POST /auth/signup creates a user and initializes an active session."""
    uname = f"signup_user_{uuid.uuid4().hex[:6]}"
    email = f"{uname}@example.com"
    pwd = "SignupPassword!123"

    async with get_test_client() as client:
        res = await client.post(
            "/auth/signup",
            json={
                "username": uname,
                "email": email,
                "password": pwd,
                "name": "New Signup User",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "success"
        assert data["user"]["username"] == uname
        assert data["user"]["role"] == "user"
        assert data["user"]["email"] == email
        assert "session_id" in data

        # Verify new user can immediately login
        login_res = await client.post(
            "/auth/login",
            json={"username": uname, "password": pwd},
        )
        assert login_res.status_code == 200
        assert login_res.json()["user"]["username"] == uname


# ---------------------------------------------------------------------------
# 10. Admin Signup Blocked
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_admin_cannot_be_created_through_public_signup():
    """POST /auth/signup with role=admin must be forbidden."""
    async with get_test_client() as client:
        res = await client.post(
            "/auth/signup",
            json={
                "username": f"fake_admin_{uuid.uuid4().hex[:6]}",
                "password": "Password123!",
                "role": "admin",
            },
        )
        assert res.status_code == 403
        assert "Admin accounts cannot be created via public signup" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 11. Seed Users Idempotency
# ---------------------------------------------------------------------------
def test_seed_users_idempotency():
    """seed_demo_users() must be safely runnable repeatedly without duplicates or errors."""
    res1 = seed_demo_users()
    assert res1["status"] in ("success", "skipped")

    res2 = seed_demo_users()
    assert res2["status"] in ("success", "skipped")
    if res2["status"] == "success":
        assert res2["created"] == 0
        assert res2["updated"] == 3


# ---------------------------------------------------------------------------
# 12. MongoDB User Persistence
# ---------------------------------------------------------------------------
def test_mongodb_user_persistence():
    """Verify user is physically persisted in the MongoDB collection."""
    if not is_mongodb_configured() or user_repository.collection is None:
        pytest.skip("MongoDB not configured/available")

    uname = f"persist_{uuid.uuid4().hex[:6]}"
    doc = {
        "username": uname,
        "password_hash": hash_password("pass123"),
        "role": "user",
        "name": "Persist User",
    }
    user_repository.create_user(doc)

    # Check raw collection directly
    raw = user_repository.collection.find_one({"username": uname})
    assert raw is not None
    assert raw["name"] == "Persist User"
    assert raw["password_hash"].startswith("pbkdf2_sha256$")


# ---------------------------------------------------------------------------
# 13. In-Memory Fallback
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_in_memory_fallback(monkeypatch):
    """When MongoDB is unconfigured/unavailable, auth falls back to in-memory store."""
    monkeypatch.setattr("backend.auth.is_mongodb_configured", lambda: False)

    fallback_uname = f"fallback_{uuid.uuid4().hex[:6]}"
    async with get_test_client() as client:
        signup_res = await client.post(
            "/auth/signup",
            json={
                "username": fallback_uname,
                "password": "FallbackPass123!",
                "name": "Fallback User",
            },
        )
        assert signup_res.status_code == 201
        assert signup_res.json()["user"]["username"] == fallback_uname

        # Login via fallback
        login_res = await client.post(
            "/auth/login",
            json={"username": fallback_uname, "password": "FallbackPass123!"},
        )
        assert login_res.status_code == 200
        assert login_res.json()["user"]["username"] == fallback_uname


# ---------------------------------------------------------------------------
# 14. Existing Role Behavior
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_role_behavior():
    """Role access restrictions should be enforced for protected routes."""
    seed_demo_users()

    async with get_test_client() as client:
        # User role cannot access admin stats
        user_login = await client.post(
            "/auth/login",
            json={"username": "user", "password": "user123"},
        )
        assert user_login.status_code == 200
        user_token = user_login.json()["session_id"]

        admin_res = await client.get("/admin/platform-stats", headers={"X-Session-ID": user_token})
        assert admin_res.status_code == 403

        # Admin role can access admin stats
        admin_login = await client.post(
            "/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        admin_token = admin_login.json()["session_id"]
        admin_res2 = await client.get("/admin/platform-stats", headers={"X-Session-ID": admin_token})
        assert admin_res2.status_code == 200
