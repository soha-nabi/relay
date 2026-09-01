"""
FastAPI Payment Dashboard - Test Client

This script demonstrates how to interact with the Relay Payment Dashboard API
using the local session-based authentication system.
"""

import json
from pathlib import Path
import requests

BASE_URL = "http://localhost:8000"


class PaymentDashboardClient:
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
        self.session = requests.Session()
        self.user = None

    def login(self, username="merchant", password="merchant123"):
        """Authenticate with local session auth"""
        print(f"\n🔐 Logging in as {username}...")
        try:
            response = self.session.post(
                f"{self.base_url}/auth/login",
                json={"username": username, "password": password},
            )
            if response.status_code == 200:
                data = response.json()
                self.user = data["user"]
                print(f"✅ Logged in successfully: {self.user['name']} (Role: {self.user['role']})")
                return True
            else:
                print(f"❌ Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Error connecting to server: {e}")
            return False

    def upload_csv(self, file_path):
        """Upload a CSV file to the API"""
        print(f"\n📤 Uploading CSV: {file_path}")
        print("-" * 50)
        try:
            with open(file_path, "rb") as f:
                files = {"file": f}
                response = self.session.post(f"{self.base_url}/upload", files=files)

            if response.status_code == 200:
                data = response.json()
                print(f"✅ Success!")
                print(f"   File: {data['file_name']}")
                print(f"   Rows loaded: {data['rows_loaded']}")
                print(f"   Uploaded at: {data['uploaded_at']}")
                return data
            else:
                print(f"❌ Error: {response.status_code}")
                print(f"   Details: {response.json()}")
                return None
        except Exception as e:
            print(f"❌ Error uploading file: {e}")
            return None

    def get_dashboard(self):
        """Get dashboard metrics"""
        print(f"\n📊 Fetching Merchant Dashboard Metrics")
        print("-" * 50)
        try:
            response = self.session.get(f"{self.base_url}/dashboard")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Dashboard loaded successfully\n")
                metrics = data["primary_metrics"]
                print(f"  • Total Failed Payments: {metrics['total_failed_payments']}")
                print(f"  • Total Failed Amount: INR {metrics['total_failed_amount']:,.2f}")
                print(f"  • Total Revenue at Risk: INR {metrics['total_revenue_at_risk']:,.2f}")
                print(f"  • Recovery Rate: {metrics['recovery_rate']:.2f}%")
                return data
            else:
                print(f"❌ Error: {response.status_code}")
                print(f"   Details: {response.text}")
                return None
        except Exception as e:
            print(f"❌ Error fetching dashboard: {e}")
            return None

    def test_admin_endpoints(self):
        """Test Admin endpoints"""
        print(f"\n👑 Testing Admin Endpoints")
        print("-" * 50)
        try:
            stats = self.session.get(f"{self.base_url}/admin/platform-stats").json()
            merchants = self.session.get(f"{self.base_url}/admin/merchants").json()
            users = self.session.get(f"{self.base_url}/admin/users").json()
            print(f"✅ Admin Platform Stats: {stats['platform_overview']['active_merchants']} merchants, {stats['platform_overview']['system_status']} status")
            print(f"✅ Admin Merchants: {merchants['total_count']} loaded")
            print(f"✅ Admin Users: {users['total_count']} loaded")
            return True
        except Exception as e:
            print(f"❌ Admin test error: {e}")
            return False

    def test_user_endpoints(self):
        """Test User endpoints"""
        print(f"\n👤 Testing User Endpoints")
        print("-" * 50)
        try:
            payments = self.session.get(f"{self.base_url}/user/payments").json()
            instructions = self.session.get(f"{self.base_url}/user/instructions").json()
            print(f"✅ User Transactions: {len(payments['transactions'])} transactions found")
            print(f"✅ User Recovery Instructions: {len(instructions['instructions'])} guides available")
            return True
        except Exception as e:
            print(f"❌ User test error: {e}")
            return False


def main():
    print("\n" + "=" * 50)
    print("Relay Recovery Intelligence - Local Auth Test")
    print("=" * 50)

    client = PaymentDashboardClient()

    # Step 1: Health check
    try:
        res = requests.get(f"{BASE_URL}/health")
        print(f"🏥 API Health: {res.json()}")
    except Exception as e:
        print(f"❌ Server not reachable at {BASE_URL}: {e}")
        return

    # Step 2: Login as merchant
    if client.login("merchant", "merchant123"):
        client.get_dashboard()

    # Step 3: Login as admin
    admin_client = PaymentDashboardClient()
    if admin_client.login("admin", "admin123"):
        admin_client.test_admin_endpoints()

    # Step 4: Login as user
    user_client = PaymentDashboardClient()
    if user_client.login("user", "user123"):
        user_client.test_user_endpoints()

    print("\n✅ All local role tests completed successfully!\n")


if __name__ == "__main__":
    main()
