"""Twilio Telephony & Messaging Service for Relay Recovery Engine.

Provides real outbound phone calls and SMS recovery dispatches using Twilio REST API.
Reads TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER from environment.
Includes graceful fallback/mock mode when credentials are not configured.
"""

from typing import Any
import base64
import json
import logging
import os
import urllib.parse
import urllib.request
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
BASE_CALLBACK_URL = os.getenv("BASE_CALLBACK_URL", "https://relay-recovery.onrender.com").rstrip("/")


def is_twilio_configured() -> bool:
    """Check if all required Twilio environment variables are configured."""
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER)


def get_twilio_status() -> dict[str, Any]:
    """Return status of Twilio configuration."""
    return {
        "configured": is_twilio_configured(),
        "phone_number": TWILIO_PHONE_NUMBER if TWILIO_PHONE_NUMBER else None,
        "account_sid_masked": f"{TWILIO_ACCOUNT_SID[:4]}...{TWILIO_ACCOUNT_SID[-4:]}" if len(TWILIO_ACCOUNT_SID) > 8 else None,
    }


def send_recovery_sms(to_phone: str, message: str) -> dict[str, Any]:
    """Send an SMS via Twilio REST API with automated payment recovery link."""
    clean_to = to_phone.strip()
    if not clean_to.startswith("+"):
        clean_to = f"+{clean_to}"

    if not is_twilio_configured():
        logger.info("[MOCK TWILIO SMS] To: %s | Message: %s", clean_to, message)
        return {
            "status": "simulated",
            "mock": True,
            "to": clean_to,
            "message": message,
            "sid": f"SM_mock_{os.urandom(8).hex()}",
            "note": "Twilio credentials not configured in .env. SMS simulated successfully.",
        }

    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    data = urllib.parse.urlencode({
        "To": clean_to,
        "From": TWILIO_PHONE_NUMBER,
        "Body": message,
    }).encode("utf-8")

    auth_header = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode("utf-8")).decode("ascii")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return {
                "status": "sent",
                "mock": False,
                "sid": body.get("sid"),
                "to": clean_to,
                "date_created": body.get("date_created"),
            }
    except Exception as e:
        logger.error("Failed to send Twilio SMS to %s: %s", clean_to, e)
        raise RuntimeError(f"Twilio SMS delivery failed: {e}") from e


def initiate_recovery_call(
    to_phone: str,
    session_id: str,
    customer_name: str = "Valued Customer",
    amount: float = 0.0,
    merchant_name: str = "Relay Merchant",
    twiml_url: str | None = None,
) -> dict[str, Any]:
    """Trigger an outbound phone call via Twilio to initiate recovery dialogue."""
    clean_to = to_phone.strip()
    if not clean_to.startswith("+"):
        clean_to = f"+{clean_to}"

    if not is_twilio_configured():
        logger.info(
            "[MOCK TWILIO VOICE CALL] To: %s | Session: %s | Customer: %s | Amount: %s",
            clean_to, session_id, customer_name, amount
        )
        return {
            "status": "queued",
            "mock": True,
            "to": clean_to,
            "session_id": session_id,
            "sid": f"CA_mock_{os.urandom(8).hex()}",
            "note": "Twilio credentials not configured in .env. Call queued in simulation mode.",
        }

    # Default TwiML endpoint hosted on Relay
    call_twiml_url = twiml_url or f"{BASE_CALLBACK_URL}/api/telephony/twiml/outbound?session_id={urllib.parse.quote(session_id)}"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls.json"
    data = urllib.parse.urlencode({
        "To": clean_to,
        "From": TWILIO_PHONE_NUMBER,
        "Url": call_twiml_url,
    }).encode("utf-8")

    auth_header = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode("utf-8")).decode("ascii")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return {
                "status": body.get("status", "queued"),
                "mock": False,
                "sid": body.get("sid"),
                "to": clean_to,
                "session_id": session_id,
                "date_created": body.get("date_created"),
            }
    except Exception as e:
        logger.error("Failed to initiate Twilio Call to %s: %s", clean_to, e)
        raise RuntimeError(f"Twilio Voice call initiation failed: {e}") from e


def generate_outbound_twiml(
    session_id: str,
    customer_name: str = "Valued Customer",
    merchant_name: str = "Relay Merchant",
    amount: float = 0.0,
    failure_reason: str = "temporary card authorization issue",
    pay_url: str = "",
) -> str:
    """Generate interactive TwiML response for outbound recovery phone call."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural">
        Hello {customer_name}. This is an automated courtesy notification from {merchant_name}.
        We noticed that your recent payment of {amount:.2f} dollars did not complete due to a {failure_reason}.
        We have reserved your order and sent a secure, one-click authorization link to your phone so you can update your payment method.
        Thank you for your business.
    </Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
</Response>
"""
