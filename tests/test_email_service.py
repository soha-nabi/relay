import os
import pytest
from unittest.mock import patch, MagicMock
from backend.email_service import send_email, send_payment_recovery_email

@pytest.fixture
def mock_env():
    with patch.dict(os.environ, {"RESEND_API_KEY": "test_key", "RESEND_FROM_EMAIL": "test@example.com"}):
        yield

def test_missing_api_key():
    with patch.dict(os.environ, clear=True):
        result = send_email("test@example.com", "Subject", "<p>HTML</p>")
        assert result["status"] == "failed"
        assert result["reason"] == "Missing API key"

@patch("backend.email_service.resend.Emails.send")
def test_successful_email_send(mock_send, mock_env):
    mock_send.return_value = {"id": "msg_123"}
    
    result = send_email("test@example.com", "Subject", "<p>HTML</p>")
    
    assert result["status"] == "sent"
    assert result["message_id"] == "msg_123"
    mock_send.assert_called_once_with({
        "from": "test@example.com",
        "to": ["test@example.com"],
        "subject": "Subject",
        "html": "<p>HTML</p>"
    })

@patch("backend.email_service.resend.Emails.send")
def test_resend_api_failure(mock_send, mock_env):
    mock_send.side_effect = Exception("API Down")
    
    result = send_email("test@example.com", "Subject", "<p>HTML</p>")
    
    assert result["status"] == "failed"
    assert result["reason"] == "Resend API error"

@patch("backend.email_service.send_email")
def test_html_escaping_in_recovery_email(mock_send_email, mock_env):
    mock_send_email.return_value = {"status": "sent", "message_id": "msg_123"}
    
    send_payment_recovery_email(
        customer_name="John <script>alert(1)</script>", 
        customer_email="john@example.com", 
        amount=50.0, 
        payment_url="http://example.com/pay"
    )
    
    called_html = mock_send_email.call_args[1]["html"]
    assert "<script>" not in called_html
    assert "&lt;script&gt;" in called_html

def test_recovery_email_no_email():
    result = send_payment_recovery_email("John", "", 50.0, "http://example.com/pay")
    assert result["status"] == "ignored"
    assert result["reason"] == "No customer email"
