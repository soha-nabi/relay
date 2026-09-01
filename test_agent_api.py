import os
import pytest
from fastapi.testclient import TestClient
from main import app, data_store
import pandas as pd

# Set the environment variable for testing before creating the client
os.environ["RELAY_AGENT_API_KEY"] = "test-secret-key"

client = TestClient(app)

from unittest.mock import patch

@pytest.fixture(autouse=True)
def mock_mongodb():
    with patch("backend.agent_api.is_mongodb_configured", return_value=False):
        yield

@pytest.fixture(autouse=True)
def setup_test_data():
    """Setup a fresh merchant dataset for each test."""
    os.environ["RELAY_AGENT_API_KEY"] = "test-secret-key"
    
    # Clear any existing datasets
    data_store._datasets.clear()

    # Create dummy DataFrame
    df = pd.DataFrame([
        {
            "transaction_id": "txn_001",
            "customer_id": "cust_123",
            "amount": 1000.0,
            "payment_status": "failed",
            "payment_method": "credit_card",
            "failure_reason": "card declined",
            "recovery_amount": 0.0
        },
        {
            "transaction_id": "txn_002",
            "customer_id": "cust_124",
            "amount": 500.0,
            "payment_status": "failed",
            "payment_method": "credit_card",
            "failure_reason": "account closed", # permanent
            "recovery_amount": 0.0
        },
        {
            "transaction_id": "txn_003",
            "customer_id": "cust_125",
            "amount": 1500.0,
            "payment_status": "success",
            "payment_method": "credit_card",
            "failure_reason": "",
            "recovery_amount": 1500.0
        }
    ])
    
    # Use merchant user to match defaults
    dataset = data_store.put("merchant", df, "test_file.csv")

    # Manually create some recovery sessions
    dataset.recovery_sessions["sess_001"] = {
        "session_id": "sess_001",
        "customer_id": "cust_123",
        "transaction_id": "txn_001",
        "amount": 1000.0,
        "status": "awaiting_customer",
        "failure_reason": "card declined",
        "failure_category": "hard",
        "is_recoverable": True,
        "attempt_count": 0,
        "max_attempts": 3,
        "strategy": "Offer Alternative Payment Method",
        "merchant_id": "merchant",
        "audit_trail": []
    }
    
    dataset.recovery_sessions["sess_002"] = {
        "session_id": "sess_002",
        "customer_id": "cust_124",
        "transaction_id": "txn_002",
        "amount": 500.0,
        "status": "stopped",
        "failure_reason": "account closed",
        "failure_category": "permanent",
        "is_recoverable": False,
        "attempt_count": 0,
        "max_attempts": 3,
        "strategy": "No recovery needed",
        "merchant_id": "merchant",
        "audit_trail": []
    }
    
    dataset.recovery_sessions["sess_003"] = {
        "session_id": "sess_003",
        "customer_id": "cust_123",
        "transaction_id": "txn_001",
        "amount": 1000.0,
        "status": "exhausted",
        "failure_reason": "card declined",
        "failure_category": "hard",
        "is_recoverable": True,
        "attempt_count": 3,
        "max_attempts": 3,
        "strategy": "Offer Alternative Payment Method",
        "merchant_id": "merchant",
        "audit_trail": []
    }
    
    dataset.recovery_sessions["sess_004"] = {
        "session_id": "sess_004",
        "customer_id": "cust_125",
        "transaction_id": "txn_003",
        "amount": 1500.0,
        "status": "recovered",
        "failure_reason": "",
        "failure_category": "soft",
        "is_recoverable": True,
        "attempt_count": 1,
        "max_attempts": 3,
        "strategy": "Smart Retry",
        "merchant_id": "merchant",
        "audit_trail": []
    }

    yield dataset
    data_store._datasets.clear()

def test_missing_agent_key():
    response = client.get("/api/agent/payment/cust_123")
    assert response.status_code == 422 # FastAPI validation for missing header

def test_invalid_agent_key():
    headers = {"X-Relay-Agent-Key": "wrong-key"}
    response = client.get("/api/agent/payment/cust_123", headers=headers)
    assert response.status_code == 401
    assert "Invalid Agent API Key" in response.json()["detail"]

def test_valid_agent_key_payment_context():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/payment/cust_123", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["customer_id"] == "cust_123"
    assert data["payment_status"] == "failed"
    assert data["amount"] == 1000.0
    assert data["recovery_session_id"] == "sess_001"

def test_missing_customer():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/payment/cust_999", headers=headers)
    assert response.status_code == 404
    assert "Customer not found" in response.json()["detail"]

def test_recovery_status():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/recovery/sess_001", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "sess_001"
    assert data["status"] == "awaiting_customer"

def test_recovery_options():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/recovery/sess_001/options", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "allowed_actions" in data
    assert isinstance(data["allowed_actions"], list)
    assert "UPI" in data["allowed_actions"]
    assert "Another Card" in data["allowed_actions"]

def test_recovery_options_permanent_failure():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/recovery/sess_002/options", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["allowed_actions"] == []

def test_payment_link():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_001/payment-link", headers=headers)
    assert response.status_code == 200
    assert response.json()["payment_url"] == "/pay/sess_001"

def test_payment_link_stopped():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_002/payment-link", headers=headers)
    assert response.status_code == 400

def test_allowed_payment_method():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_001/method", json={"payment_method": "UPI"}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    # action was awaiting_customer before, after execute_recovery_action it might stay awaiting_customer since it's an alternative method
    
def test_disallowed_payment_method():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_001/method", json={"payment_method": "Bitcoin"}, headers=headers)
    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]
    
def test_stopped_recovery_method():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_002/method", json={"payment_method": "UPI"}, headers=headers)
    assert response.status_code == 400
    
def test_exhausted_recovery_method():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_003/method", json={"payment_method": "UPI"}, headers=headers)
    assert response.status_code == 400

def test_payment_status():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/recovery/sess_001/status", headers=headers)
    assert response.status_code == 200
    assert response.json()["payment_status"] == "failed"
    
def test_successful_payment_status():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.get("/api/agent/recovery/sess_004/status", headers=headers)
    assert response.status_code == 200
    assert response.json()["payment_status"] == "success"
    
def test_promise_to_pay_validation_invalid_date():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_001/promise-to-pay", json={"promised_date": "not-a-date"}, headers=headers)
    assert response.status_code == 400

def test_promise_to_pay_not_implemented():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    response = client.post("/api/agent/recovery/sess_001/promise-to-pay", json={"promised_date": "2026-09-04T12:00:00Z"}, headers=headers)
    assert response.status_code == 501
    
def test_audit_events_recorded():
    headers = {"X-Relay-Agent-Key": "test-secret-key"}
    client.get("/api/agent/payment/cust_123", headers=headers)
    
    # Check if audit event is in memory session
    dataset = data_store.get("merchant")
    session = dataset.recovery_sessions["sess_001"]
    
    has_audit = any(event["event"] == "agent_context_requested" for event in session["audit_trail"])
    assert has_audit
