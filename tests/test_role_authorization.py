"""Tests for Role-Based Product Separation and Authorization Guards.

Verifies:
1. Admin access to platform control center endpoints
2. Merchant access to recovery intelligence & automations
3. Merchant 403 Forbidden on admin endpoints
4. User access to personal payments & recovery guidance
5. User 403 Forbidden on merchant endpoints (/dashboard, /customer, /automations)
6. User 403 Forbidden on admin endpoints (/admin/*)
7. Unauthenticated 401 Unauthorized on protected routes
8. Object-level isolation: Merchant cannot access another merchant's session
"""

import uuid
import pytest
import httpx

from backend.auth import USERS
from backend.db import is_mongodb_configured, recovery_session_repository
from main import Dataset, app, data_store
from scripts.seed_users import seed_demo_users
import pandas as pd


def get_client():
    try:
        transport = httpx.ASGITransport(app=app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")
    except (AttributeError, TypeError):
        return httpx.AsyncClient(app=app, base_url="http://test")


async def login_as(client: httpx.AsyncClient, username: str, password: str) -> str:
    seed_demo_users()
    res = await client.post("/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return res.json()["session_id"]


# ---------------------------------------------------------------------------
# 1. ADMIN AUTHORIZATION
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_can_access_admin_endpoints():
    """Admin can access platform stats, merchants, users, and datasets."""
    async with get_client() as client:
        token = await login_as(client, "admin", "admin123")
        headers = {"X-Session-ID": token}

        # 1. Platform stats
        r1 = await client.get("/admin/platform-stats", headers=headers)
        assert r1.status_code == 200
        assert "platform_overview" in r1.json()

        # 2. Merchants directory
        r2 = await client.get("/admin/merchants", headers=headers)
        assert r2.status_code == 200
        assert "merchants" in r2.json()

        # 3. Platform users
        r3 = await client.get("/admin/users", headers=headers)
        assert r3.status_code == 200
        assert "users" in r3.json()

        # 4. Webhook stream
        r4 = await client.get("/admin/webhooks", headers=headers)
        assert r4.status_code == 200
        assert "webhook_events" in r4.json()


@pytest.mark.asyncio
async def test_admin_can_access_merchant_and_user_endpoints():
    """Admin has operator privileges to inspect merchant and user views."""
    async with get_client() as client:
        token = await login_as(client, "admin", "admin123")
        headers = {"X-Session-ID": token}

        r1 = await client.get("/dashboard", headers=headers)
        assert r1.status_code == 200

        r2 = await client.get("/automations", headers=headers)
        assert r2.status_code == 200

        r3 = await client.get("/user/payments", headers=headers)
        assert r3.status_code == 200


# ---------------------------------------------------------------------------
# 2. MERCHANT AUTHORIZATION & ISOLATION
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_merchant_can_access_merchant_features():
    """Merchant can access own dashboard, customer intelligence, and automations."""
    async with get_client() as client:
        token = await login_as(client, "merchant", "merchant123")
        headers = {"X-Session-ID": token}

        # Dashboard
        r1 = await client.get("/dashboard", headers=headers)
        assert r1.status_code == 200
        assert "primary_metrics" in r1.json()

        # Customer lookup
        r2 = await client.get("/customer/CUST000052", headers=headers)
        assert r2.status_code in (200, 404)  # 200 if sample data exists

        # Automations
        r3 = await client.get("/automations", headers=headers)
        assert r3.status_code == 200
        assert "automations" in r3.json()


@pytest.mark.asyncio
async def test_merchant_blocked_from_admin_endpoints():
    """Merchant gets 403 Forbidden when attempting to access Admin endpoints."""
    async with get_client() as client:
        token = await login_as(client, "merchant", "merchant123")
        headers = {"X-Session-ID": token}

        r1 = await client.get("/admin/platform-stats", headers=headers)
        assert r1.status_code == 403
        assert "Access forbidden" in r1.json()["detail"]

        r2 = await client.get("/admin/merchants", headers=headers)
        assert r2.status_code == 403

        r3 = await client.get("/admin/users", headers=headers)
        assert r3.status_code == 403


@pytest.mark.asyncio
async def test_merchant_cannot_access_other_merchant_recovery_session():
    """Merchant A cannot read or modify Merchant B's recovery session (Object-level Auth)."""
    ds = data_store.get("merchant")
    other_sid = f"sess_other_{uuid.uuid4().hex[:8]}"
    ds.recovery_sessions[other_sid] = {
        "session_id": other_sid,
        "customer_id": "CUST_OTHER_01",
        "merchant_id": "other_merchant",
        "strategy": "Smart Retry",
        "status": "in_recovery",
        "amount": 5000.0,
    }

    async with get_client() as client:
        token = await login_as(client, "merchant", "merchant123")
        headers = {"X-Session-ID": token}

        # Merchant tries to access other_merchant's recovery session
        res = await client.get(f"/recover/{other_sid}", headers=headers)
        assert res.status_code == 403
        assert "belongs to another merchant" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 3. USER AUTHORIZATION
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_user_can_access_user_endpoints():
    """User can view own payments, recovery instructions, and profile."""
    async with get_client() as client:
        token = await login_as(client, "user", "user123")
        headers = {"X-Session-ID": token}

        # User payments
        r1 = await client.get("/user/payments", headers=headers)
        assert r1.status_code == 200
        assert "transactions" in r1.json()

        # User recovery instructions
        r2 = await client.get("/user/instructions", headers=headers)
        assert r2.status_code == 200
        assert "instructions" in r2.json()

        # User dashboard alias
        r3 = await client.get("/user/dashboard", headers=headers)
        assert r3.status_code == 200


@pytest.mark.asyncio
async def test_user_blocked_from_merchant_endpoints():
    """User gets 403 Forbidden on merchant dashboard, customer lookup, and automations."""
    async with get_client() as client:
        token = await login_as(client, "user", "user123")
        headers = {"X-Session-ID": token}

        # Blocked from /dashboard
        r1 = await client.get("/dashboard", headers=headers)
        assert r1.status_code == 403

        # Blocked from /customer
        r2 = await client.get("/customer/CUST000052", headers=headers)
        assert r2.status_code == 403

        # Blocked from /automations
        r3 = await client.get("/automations", headers=headers)
        assert r3.status_code == 403

        # Blocked from /data
        r4 = await client.get("/data", headers=headers)
        assert r4.status_code == 403


@pytest.mark.asyncio
async def test_user_blocked_from_admin_endpoints():
    """User gets 403 Forbidden on platform admin endpoints."""
    async with get_client() as client:
        token = await login_as(client, "user", "user123")
        headers = {"X-Session-ID": token}

        r1 = await client.get("/admin/platform-stats", headers=headers)
        assert r1.status_code == 403

        r2 = await client.get("/admin/merchants", headers=headers)
        assert r2.status_code == 403


# ---------------------------------------------------------------------------
# 4. UNAUTHENTICATED ACCESS
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_requests_return_401():
    """Requests without active session token return 401 Unauthorized."""
    async with get_client() as client:
        r1 = await client.get("/admin/platform-stats")
        assert r1.status_code == 401

        r2 = await client.get("/dashboard")
        assert r2.status_code == 401

        r3 = await client.get("/user/payments")
        assert r3.status_code == 401
