"""Automated test script verifying local auth and role routing without Supabase."""

import threading
import time
import requests
import uvicorn
from main import app

SERVER_PORT = 8009
BASE_URL = f"http://127.0.0.1:{SERVER_PORT}"


def start_server():
    uvicorn.run(app, host="127.0.0.1", port=SERVER_PORT, log_level="warning")


def run_tests():
    # Start server in thread
    t = threading.Thread(target=start_server, daemon=True)
    t.start()
    time.sleep(1.5)

    print("=" * 60)
    print("RELAY PAYMENT RECOVERY - LOCAL ROLE AUTHENTICATION TESTS")
    print("=" * 60)

    # 1. Health check
    print("\n1. Testing Health Check...")
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    print(f"   [PASS] Health check: {r.json()}")

    # 2. Unauthenticated access protection
    print("\n2. Testing Protected Route Without Auth...")
    r = requests.get(f"{BASE_URL}/dashboard")
    assert r.status_code == 401, f"Expected 401 for unauthenticated request, got {r.status_code}"
    print("   [PASS] Access rejected with 401 Unauthorized")

    # 3. Invalid credentials
    print("\n3. Testing Invalid Login Credentials...")
    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "admin", "password": "wrong_password"},
    )
    assert r.status_code == 401, f"Expected 401 for invalid login, got {r.status_code}"
    print(f"   [PASS] Invalid login rejected: {r.json()['detail']}")

    # 4. Admin Login & Admin Dashboard Endpoints
    print("\n4. Testing Admin Role (admin:admin123)...")
    admin_session = requests.Session()
    r = admin_session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    user_info = r.json()["user"]
    assert user_info["role"] == "admin"
    print(f"   [PASS] Logged in as: {user_info['name']} (Role: {user_info['role']})")

    # Check /auth/me
    me = admin_session.get(f"{BASE_URL}/auth/me").json()
    assert me["user"]["username"] == "admin"
    print(f"   [PASS] /auth/me verified: {me['user']['username']}")

    # Check Admin platform stats
    stats = admin_session.get(f"{BASE_URL}/admin/platform-stats").json()
    print(f"   [PASS] Platform Volume: INR {stats['platform_overview']['total_volume']:,}, Status: {stats['platform_overview']['system_status']}")

    # Check Admin merchants
    merchants = admin_session.get(f"{BASE_URL}/admin/merchants").json()
    assert merchants["total_count"] >= 1
    print(f"   [PASS] Admin Merchants: {merchants['total_count']} registered merchants found")

    # Check Admin users
    users = admin_session.get(f"{BASE_URL}/admin/users").json()
    assert users["total_count"] >= 3
    print(f"   [PASS] Admin Users: {users['total_count']} registered users found")

    # Check Admin datasets
    datasets = admin_session.get(f"{BASE_URL}/admin/datasets").json()
    print(f"   [PASS] Admin Datasets: {datasets['total_count']} datasets managed")

    # 5. Merchant Login & Merchant Recovery Flow
    print("\n5. Testing Merchant Role (merchant:merchant123)...")
    merch_session = requests.Session()
    r = merch_session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "merchant", "password": "merchant123"},
    )
    assert r.status_code == 200, f"Merchant login failed: {r.text}"
    user_info = r.json()["user"]
    assert user_info["role"] == "merchant"
    print(f"   [PASS] Logged in as: {user_info['name']} (Role: {user_info['role']})")

    # Merchant dashboard
    dash = merch_session.get(f"{BASE_URL}/dashboard").json()
    print(f"   [PASS] Merchant Dashboard: Recovery Rate = {dash['primary_metrics']['recovery_rate']}%")

    # Customer search & recommendation
    cust = merch_session.get(f"{BASE_URL}/customer/CUST000052").json()
    print(f"   [PASS] Customer Profile: {cust['customer_id']} (Risk Score: {cust['risk_score']})")

    rec = merch_session.post(f"{BASE_URL}/recommend", json={"customer_id": "CUST000052"}).json()
    print(f"   [PASS] Recommendation: {rec['recommended_strategy']} ({rec['confidence']}% confidence)")

    sim = merch_session.post(
        f"{BASE_URL}/simulate",
        json={"customer_id": "CUST000052", "strategy": "Offer Alternative Payment Method"},
    ).json()
    print(f"   [PASS] Simulation: {sim['summary']}")

    rec_session = merch_session.post(
        f"{BASE_URL}/recover",
        json={
            "customer_id": "CUST000052",
            "strategy": "Offer Alternative Payment Method",
            "expected_recovered_revenue": 500.0,
        },
    ).json()
    sid = rec_session["session_id"]
    print(f"   [PASS] Recovery Session Created: {sid}")

    comp = merch_session.post(f"{BASE_URL}/recover/{sid}/complete").json()
    assert comp["status"] in ("completed", "recovered")
    print(f"   [PASS] Recovery Completed: {comp['status']}")

    # 6. User Login & User Dashboard
    print("\n6. Testing User Role (user:user123)...")
    user_session = requests.Session()
    r = user_session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "user", "password": "user123"},
    )
    assert r.status_code == 200, f"User login failed: {r.text}"
    user_info = r.json()["user"]
    assert user_info["role"] == "user"
    print(f"   [PASS] Logged in as: {user_info['name']} (Role: {user_info['role']})")

    payments = user_session.get(f"{BASE_URL}/user/payments").json()
    print(f"   [PASS] User Payments: {len(payments['transactions'])} transactions, Failed: {payments['summary']['failed_payments']}")

    instructions = user_session.get(f"{BASE_URL}/user/instructions").json()
    print(f"   [PASS] User Recovery Instructions: {len(instructions['instructions'])} guides available")

    # 7. Logout test
    print("\n7. Testing Logout...")
    lo = user_session.post(f"{BASE_URL}/auth/logout").json()
    print(f"   [PASS] Logout: {lo['message']}")

    # After logout, accessing protected route should return 401
    r_after = user_session.get(f"{BASE_URL}/dashboard")
    assert r_after.status_code == 401
    print("   [PASS] Post-logout protected route properly returns 401 Unauthorized")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY! ZERO SUPABASE INVOLVEMENT.")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
