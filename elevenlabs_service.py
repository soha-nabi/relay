"""ElevenLabs Conversational AI service.

Provides a reusable wrapper for creating conversational agents and
voice recovery triggers via ElevenLabs API. Reads ELEVENLABS_API_KEY from .env.
"""

from typing import Any
import logging
import os
import uuid

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

load_dotenv()

logger = logging.getLogger(__name__)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")


def _get_client() -> ElevenLabs:
    """Return an authenticated ElevenLabs client."""
    if not ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured")
    return ElevenLabs(api_key=ELEVENLABS_API_KEY)


def create_agent(
    name: str = "My conversational agent",
    prompt: str = "You are a helpful assistant that can answer questions and help with tasks.",
) -> dict[str, Any]:
    """Create an ElevenLabs conversational AI agent."""
    client = _get_client()

    response = client.conversational_ai.agents.create(
        name=name,
        conversation_config={
            "agent": {
                "prompt": {
                    "prompt": prompt,
                }
            }
        },
    )

    agent_id = getattr(response, "agent_id", None)
    logger.info("ElevenLabs agent created: %s", agent_id)

    return {
        "status": "created",
        "agent_id": agent_id,
        "response": response,
    }


def trigger_session_voice_call(
    session: dict[str, Any],
    phone_number: str | None = None,
    customer_name: str | None = None,
) -> dict[str, Any]:
    """Trigger an AI voice recovery call for a session with duplicate prevention (Requirement 4).

    Ensures that multiple voice calls are not triggered concurrently or repeatedly
    for the same recovery attempt or for already completed/exhausted sessions.
    """
    from backend.recovery_engine import can_trigger_voice_call, mark_voice_call_triggered

    attempt = session.get("attempt_count", 0)

    # 1. Check duplicate prevention
    if not can_trigger_voice_call(session, attempt=attempt):
        return {
            "status": "skipped",
            "reason": "duplicate_prevented",
            "message": f"Voice call was already triggered for session {session.get('session_id')} attempt {attempt} or session is terminal.",
            "session_id": session.get("session_id"),
        }

    call_id = f"call_{uuid.uuid4().hex[:12]}"
    c_name = customer_name or session.get("customer_name") or session.get("customer_id", "Customer")
    phone = phone_number or session.get("customer_phone", "+919876543210")

    # Mark call triggered on session and persist audit log
    mark_voice_call_triggered(
        session=session,
        call_id=call_id,
        attempt=attempt,
        details={
            "phone_number": phone,
            "customer_name": c_name,
            "amount": session.get("amount", 0.0),
            "failure_reason": session.get("failure_reason", ""),
        },
    )

    return {
        "status": "initiated",
        "call_id": call_id,
        "session_id": session.get("session_id"),
        "customer_name": c_name,
        "phone_number": phone,
    }
