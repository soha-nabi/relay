"""Upstash QStash & In-Memory Delayed Retry Scheduler for Relay Recovery Engine.

Dispatches delayed HTTP webhooks to wake up and execute scheduled retries automatically.
When QSTASH_TOKEN is set, uses serverless Upstash QStash API (with 'Upstash-Delay' header).
Falls back to a daemon threading.Timer for local development and unit tests.
"""

from datetime import datetime, timezone
import json
import logging
import os
import threading
from typing import Any
import urllib.parse
import urllib.request
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

QSTASH_TOKEN = os.getenv("QSTASH_TOKEN", "").strip()
QSTASH_URL = os.getenv("QSTASH_URL", "https://qstash.upstash.io/v2/publish/").rstrip("/") + "/"
BASE_API_URL = os.getenv("BASE_CALLBACK_URL", "https://relay-recovery.onrender.com").rstrip("/")

# Active in-memory timers: session_id -> threading.Timer
_ACTIVE_TIMERS: dict[str, threading.Timer] = {}
_TIMER_LOCK = threading.Lock()


def is_qstash_configured() -> bool:
    """Return True if Upstash QStash token is configured."""
    return bool(QSTASH_TOKEN)


def get_scheduler_status() -> dict[str, Any]:
    """Return scheduler status and active in-memory task count."""
    with _TIMER_LOCK:
        active_count = len([t for t in _ACTIVE_TIMERS.values() if t.is_alive()])
    return {
        "engine": "Upstash QStash" if is_qstash_configured() else "In-Memory Timer Fallback",
        "qstash_configured": is_qstash_configured(),
        "active_local_timers": active_count,
    }


def _local_retry_callback(session_id: str, callback_url: str) -> None:
    """Invoked by local threading.Timer when delayed retry window expires."""
    logger.info("[LOCAL RETRY SCHEDULER] Triggering retry for session %s via %s", session_id, callback_url)
    try:
        req = urllib.request.Request(
            callback_url,
            data=b"{}",
            headers={"Content-Type": "application/json", "X-Relay-Trigger": "scheduler_worker"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            logger.info("[LOCAL RETRY SCHEDULER] Retry session %s returned HTTP %s", session_id, resp.status)
    except Exception as e:
        logger.warning("[LOCAL RETRY SCHEDULER] Failed to execute callback for session %s: %s", session_id, e)
    finally:
        with _TIMER_LOCK:
            _ACTIVE_TIMERS.pop(session_id, None)


def schedule_delayed_retry(
    session_id: str,
    delay_hours: float,
    callback_url: str | None = None,
) -> dict[str, Any]:
    """Schedule a delayed retry via Upstash QStash or local background timer.

    Args:
        session_id: The ID of the recovery session to retry.
        delay_hours: The delay in hours before executing the retry (e.g. 24.0 or 0.01 for test).
        callback_url: The target URL to call. Defaults to BASE_API_URL/recover/{session_id}/retry.

    Returns:
        Dict detailing the scheduled job status.
    """
    target_url = callback_url or f"{BASE_API_URL}/recover/{urllib.parse.quote(session_id)}/retry"
    delay_seconds = max(1, int(delay_hours * 3600))

    # Format human delay for QStash (e.g. "24h", "60s")
    delay_str = f"{delay_seconds}s" if delay_seconds < 3600 else f"{int(delay_hours)}h"

    if is_qstash_configured():
        # Dispatch to Upstash QStash REST endpoint
        destination = f"{QSTASH_URL}{target_url}"
        req = urllib.request.Request(
            destination,
            data=json.dumps({"session_id": session_id, "scheduled_at": datetime.now(timezone.utc).isoformat()}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {QSTASH_TOKEN}",
                "Content-Type": "application/json",
                "Upstash-Delay": delay_str,
                "Upstash-Retries": "3",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                logger.info("[QSTASH] Scheduled retry for session %s with delay %s. MessageId: %s", session_id, delay_str, data.get("messageId"))
                return {
                    "status": "scheduled",
                    "engine": "upstash_qstash",
                    "message_id": data.get("messageId"),
                    "session_id": session_id,
                    "delay_hours": delay_hours,
                    "target_url": target_url,
                }
        except Exception as e:
            logger.error("[QSTASH] Failed to publish delayed retry: %s. Falling back to local timer.", e)

    # In-memory timer fallback
    with _TIMER_LOCK:
        # Cancel any existing timer for this session
        existing = _ACTIVE_TIMERS.pop(session_id, None)
        if existing and existing.is_alive():
            existing.cancel()

        timer = threading.Timer(
            delay_seconds,
            _local_retry_callback,
            args=[session_id, target_url],
        )
        timer.daemon = True
        timer.start()
        _ACTIVE_TIMERS[session_id] = timer

    logger.info("[SCHEDULER] Local timer armed for session %s: %s seconds", session_id, delay_seconds)
    return {
        "status": "scheduled",
        "engine": "local_timer",
        "session_id": session_id,
        "delay_hours": delay_hours,
        "delay_seconds": delay_seconds,
        "target_url": target_url,
    }


def cancel_scheduled_retry(session_id: str) -> bool:
    """Cancel any active in-memory timer for a session (e.g. if paid before retry)."""
    with _TIMER_LOCK:
        timer = _ACTIVE_TIMERS.pop(session_id, None)
        if timer and timer.is_alive():
            timer.cancel()
            logger.info("[SCHEDULER] Cancelled active timer for session %s", session_id)
            return True
    return False
