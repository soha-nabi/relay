"""
Standalone Resend test script for Relay.
Reads RESEND_API_KEY and RESEND_FROM_EMAIL from .env.
"""

import os
import pytest
import resend
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()


def test_send_resend_email_live():
    """Live Resend test sending email if key is configured."""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        pytest.skip("RESEND_API_KEY is not set in your .env file.")

    resend.api_key = api_key
    from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
    to_email = "relaysupport.ai@gmail.com"

    response = resend.Emails.send({
        "from": from_email,
        "to": [to_email],
        "subject": "Hello World - Relay Test",
        "html": "<p>Congrats on sending your <strong>first email</strong> from Relay!</p>",
    })
    assert response is not None

