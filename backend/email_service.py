import os
from html import escape
from typing import Any
import resend
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.getenv(
    "RESEND_FROM_EMAIL",
    "onboarding@resend.dev",
)


def send_email(to: str, subject: str, html: str) -> dict[str, Any]:
    """Dispatch email using Resend API."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured")

    resend.api_key = RESEND_API_KEY

    result = resend.Emails.send(
        {
            "from": RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        }
    )

    return {
        "status": "sent",
        "message_id": result.get("id") if isinstance(result, dict) else getattr(result, "id", None),
    }


def send_payment_recovery_email(
    customer_name: str,
    customer_email: str,
    amount: float,
    failure_reason: str,
    payment_url: str,
) -> dict[str, Any]:
    """Generate and send standard payment recovery template email."""
    safe_name = escape(customer_name or "Customer")
    safe_reason = escape(failure_reason or "payment issue")
    safe_url = escape(payment_url or "", quote=True)

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#0f172a;">Your payment needs attention</h2>
        <p style="color:#334155;">Hi {safe_name},</p>
        <p style="color:#334155;">
            Your payment of ₹{amount:,.2f} couldn't be completed.
        </p>
        <p style="color:#64748b;">
            Reason: <strong>{safe_reason}</strong>
        </p>
        <div style="margin:24px 0;">
            <a href="{safe_url}"
               style="display:inline-block;padding:12px 24px;
                      background:#2563eb;color:#fff;text-decoration:none;
                      font-weight:600;border-radius:8px;">
                Complete Payment
            </a>
        </div>
        <p style="font-size:13px;color:#94a3b8;">If you've already completed the payment, no further action is needed.</p>
        <p style="font-size:13px;color:#64748b;">— Relay Recovery Engine</p>
    </div>
    """

    return send_email(
        to=customer_email,
        subject="Relay — Your payment needs attention",
        html=html,
    )


def send_session_recovery_email(
    session: dict[str, Any],
    customer_name: str | None = None,
    customer_email: str | None = None,
    payment_url: str | None = None,
    subject: str | None = None,
) -> dict[str, Any]:
    """Session-aware recovery email dispatch with duplicate prevention (Requirement 3).

    Checks can_send_recovery_email(session) before dispatching and marks
    dispatch upon success to ensure zero duplicate emails per attempt.
    """
    from backend.recovery_engine import can_send_recovery_email, mark_recovery_email_sent

    attempt = session.get("attempt_count", 0)

    # 1. Guardrail against duplicate sends
    if not can_send_recovery_email(session, attempt=attempt):
        return {
            "status": "skipped",
            "reason": "duplicate_prevented",
            "message": f"Email was already sent for session {session.get('session_id')} attempt {attempt} or session is completed.",
            "session_id": session.get("session_id"),
        }

    c_email = customer_email or session.get("customer_email") or f"{session.get('customer_id', 'customer')}@relay.io"
    c_name = customer_name or session.get("customer_name") or session.get("customer_id", "Customer")
    p_url = payment_url or session.get("payment_url") or f"/pay/{session.get('session_id')}"
    amt = float(session.get("amount", 0.0))
    reason = str(session.get("failure_reason", "Payment verification needed"))

    res = send_payment_recovery_email(
        customer_name=c_name,
        customer_email=c_email,
        amount=amt,
        failure_reason=reason,
        payment_url=p_url,
    )

    msg_id = res.get("message_id") or "msg_sent"
    mark_recovery_email_sent(
        session=session,
        message_id=msg_id,
        attempt=attempt,
        details={
            "to": c_email,
            "amount": amt,
            "failure_reason": reason,
        },
    )

    return {
        "status": "sent",
        "message_id": msg_id,
        "session_id": session.get("session_id"),
        "customer_email": c_email,
    }