"""
Standalone Resend test script for Relay.
Reads RESEND_API_KEY and RESEND_FROM_EMAIL from .env.
"""

import os
import resend
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

# Get API key from environment
api_key = os.getenv("RESEND_API_KEY")

if not api_key:
    raise ValueError("RESEND_API_KEY is not set in your .env file. Please add: RESEND_API_KEY=re_xxxxxxxxx")

resend.api_key = api_key
from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
to_email = "relaysupport.ai@gmail.com"

print(f"Sending test email from {from_email} to {to_email}...")

response = resend.Emails.send({
    "from": from_email,
    "to": [to_email],
    "subject": "Hello World - Relay Test",
    "html": "<p>Congrats on sending your <strong>first email</strong> from Relay!</p>"
})

print("Email sent successfully!")
print("Response:", response)
