"""Closed-loop Payment Recovery Engine with Smart Retry & Custom Schedules.

Implements the DETECT -> DIAGNOSE -> DECIDE -> ACT -> VERIFY -> STOP OR CONTINUE -> MEASURE workflow
for failed payment recovery against the in-memory dataset, featuring transparent Smart Retry timing,
scoring, session locking, communication deduplication, and MongoDB audit logging.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import threading
from typing import Any
import uuid
import pandas as pd

# Hard guardrail limit (Requirement 5)
MAX_ATTEMPTS = 3

# Standardized Recovery Session States (Requirement 8)
STATE_ACTIVE = "ACTIVE"
STATE_RETRY_SCHEDULED = "RETRY_SCHEDULED"
STATE_PAYMENT_PENDING = "PAYMENT_PENDING"
STATE_RECOVERED = "RECOVERED"
STATE_EXHAUSTED = "EXHAUSTED"
STATE_STOPPED_PAID = "STOPPED_PAID"

RECOVERY_STATES = [
    STATE_ACTIVE,
    STATE_RETRY_SCHEDULED,
    STATE_PAYMENT_PENDING,
    STATE_RECOVERED,
    STATE_EXHAUSTED,
    STATE_STOPPED_PAID,
]

# Classification categories
SOFT_FAILURES = {
    "insufficient funds",
    "daily limit exceeded",
    "session expired",
    "network timeout",
    "processing error",
    "bank timeout",
    "temporary error",
    "gateway timeout",
    "system error",
}

HARD_FAILURES = {
    "card declined",
    "expired card",
    "cvv mismatch",
    "address mismatch",
    "device not verified",
    "funding source declined",
    "sender unverified",
    "invalid card",
}

PERMANENT_FAILURES = {
    "account closed",
    "account inactive",
    "account suspended",
    "fraud blocked",
    "permanent decline",
    "stolen card",
    "fraud",
    "blacklisted",
}


def now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def normalize_status(status_str: str) -> str:
    """Map any status (uppercase, lowercase, legacy) into the 6 standard states."""
    s = str(status_str or "").strip().upper()
    if s in RECOVERY_STATES:
        return s
    mapping = {
        "CREATED": STATE_ACTIVE,
        "DIAGNOSED": STATE_ACTIVE,
        "ACTION_PENDING": STATE_ACTIVE,
        "AWAITING_CUSTOMER": STATE_PAYMENT_PENDING,
        "RETRY_SCHEDULED": STATE_RETRY_SCHEDULED,
        "RECOVERED": STATE_RECOVERED,
        "COMPLETED": STATE_RECOVERED,
        "EXHAUSTED": STATE_EXHAUSTED,
        "STOPPED": STATE_STOPPED_PAID,
        "STOPPED_PAID": STATE_STOPPED_PAID,
        "FAILED": STATE_EXHAUSTED,
    }
    return mapping.get(s, STATE_ACTIVE)


# ---------------------------------------------------------------------------
# Recovery Session State Locking (Requirement 2)
# ---------------------------------------------------------------------------

class SessionLockManager:
    """Thread-safe in-memory session lock manager for concurrency control."""

    def __init__(self) -> None:
        self._locks: dict[str, threading.RLock] = {}
        self._global_lock = threading.Lock()

    def get_lock(self, session_id: str) -> threading.RLock:
        clean_id = str(session_id).strip()
        with self._global_lock:
            if clean_id not in self._locks:
                self._locks[clean_id] = threading.RLock()
            return self._locks[clean_id]

    def clear(self) -> None:
        with self._global_lock:
            self._locks.clear()


session_lock_manager = SessionLockManager()


@contextmanager
def session_lock(session_id: str):
    """Context manager for acquiring exclusive access to a recovery session."""
    if not session_id:
        yield True
        return
    lock = session_lock_manager.get_lock(session_id)
    acquired = lock.acquire(timeout=10.0)
    try:
        yield acquired
    finally:
        if acquired:
            try:
                lock.release()
            except RuntimeError:
                pass


# ---------------------------------------------------------------------------
# Audit Logging with MongoDB Persistence (Requirements 6 & 7)
# ---------------------------------------------------------------------------

def log_audit_event(
    session: dict[str, Any],
    event: str,
    details: dict[str, Any] | None = None,
    actor: str = "system",
    action: str | None = None,
) -> dict[str, Any]:
    """Record an audit trail event in the session document and persist to MongoDB audit_logs collection."""
    if "audit_trail" not in session:
        session["audit_trail"] = []

    timestamp = now_iso()
    event_entry = {
        "audit_id": str(uuid.uuid4()),
        "event": event,
        "action": action or session.get("action"),
        "actor": actor,
        "timestamp": timestamp,
        "details": details or {},
    }
    session["audit_trail"].append(event_entry)

    # Persist to MongoDB collections (audit_logs and recovery_sessions)
    sid = session.get("session_id")
    txn_id = session.get("transaction_id")
    cust_id = session.get("customer_id")
    merchant_id = session.get("merchant_id", "merchant")

    try:
        from backend.db import audit_log_repository, is_mongodb_configured, recovery_session_repository
        if is_mongodb_configured():
            audit_log_repository.log_event(
                event=event,
                session_id=sid,
                transaction_id=txn_id,
                customer_id=cust_id,
                merchant_id=merchant_id,
                action=action or session.get("action"),
                actor=actor,
                details=details,
                timestamp=timestamp,
            )
            if sid:
                recovery_session_repository.append_audit_event(sid, event_entry)
    except Exception:
        pass

    return event_entry


# ---------------------------------------------------------------------------
# Communication Deduplication Guards (Requirements 3 & 4)
# ---------------------------------------------------------------------------

def can_send_recovery_email(session: dict[str, Any], attempt: int | None = None) -> bool:
    """Check if an email can be safely dispatched to avoid duplicate sends."""
    status = normalize_status(session.get("status", ""))
    if status in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        return False

    dispatched = session.get("dispatched_emails", [])
    if isinstance(dispatched, list):
        curr_attempt = attempt if attempt is not None else session.get("attempt_count", 0)
        attempt_key = f"attempt_{curr_attempt}"
        if attempt_key in dispatched:
            return False
    return True


def mark_recovery_email_sent(
    session: dict[str, Any],
    message_id: str,
    attempt: int | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Record an email dispatch on session and persist audit log."""
    curr_attempt = attempt if attempt is not None else session.get("attempt_count", 0)
    if "dispatched_emails" not in session:
        session["dispatched_emails"] = []
    session["dispatched_emails"].append(str(message_id))
    session["dispatched_emails"].append(f"attempt_{curr_attempt}")
    session["last_email_sent_at"] = now_iso()
    session["last_email_id"] = str(message_id)

    log_audit_event(
        session=session,
        event="recovery_email_dispatched",
        action="send_email",
        details={
            "message_id": message_id,
            "attempt": curr_attempt,
            **(details or {}),
        },
    )

    try:
        from backend.db import is_mongodb_configured, recovery_session_repository
        if is_mongodb_configured() and session.get("session_id"):
            recovery_session_repository.record_communication_dispatch(
                session["session_id"], "email", message_id, details
            )
    except Exception:
        pass


def can_trigger_voice_call(session: dict[str, Any], attempt: int | None = None) -> bool:
    """Check if a voice call can be safely initiated to avoid duplicate calls."""
    status = normalize_status(session.get("status", ""))
    if status in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        return False

    dispatched = session.get("dispatched_voice_calls", [])
    if isinstance(dispatched, list):
        curr_attempt = attempt if attempt is not None else session.get("attempt_count", 0)
        attempt_key = f"attempt_{curr_attempt}"
        if attempt_key in dispatched:
            return False
    return True


def mark_voice_call_triggered(
    session: dict[str, Any],
    call_id: str,
    attempt: int | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Record a voice call trigger on session and persist audit log."""
    curr_attempt = attempt if attempt is not None else session.get("attempt_count", 0)
    if "dispatched_voice_calls" not in session:
        session["dispatched_voice_calls"] = []
    session["dispatched_voice_calls"].append(str(call_id))
    session["dispatched_voice_calls"].append(f"attempt_{curr_attempt}")
    session["last_voice_call_at"] = now_iso()
    session["last_voice_call_id"] = str(call_id)

    log_audit_event(
        session=session,
        event="recovery_voice_call_triggered",
        action="voice_call",
        details={
            "call_id": call_id,
            "attempt": curr_attempt,
            **(details or {}),
        },
    )

    try:
        from backend.db import is_mongodb_configured, recovery_session_repository
        if is_mongodb_configured() and session.get("session_id"):
            recovery_session_repository.record_communication_dispatch(
                session["session_id"], "voice_call", call_id, details
            )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Core Diagnosis & Decision Logic
# ---------------------------------------------------------------------------

def classify_failure(failure_reason: str) -> tuple[str, bool]:
    """Classify a failure reason into (category, is_recoverable)."""
    clean = str(failure_reason or "").strip().lower()
    if not clean:
        return ("soft", True)

    for p in PERMANENT_FAILURES:
        if p in clean:
            return ("permanent", False)

    for h in HARD_FAILURES:
        if h in clean:
            return ("hard", True)

    for s in SOFT_FAILURES:
        if s in clean:
            return ("soft", True)

    return ("soft", True)


def diagnose_payment_failure(dataframe: pd.DataFrame, customer_id: str) -> dict[str, Any]:
    """Inspect dataset to detect and diagnose failed payments for a customer."""
    customer_df = dataframe[dataframe["customer_id"].astype("string") == str(customer_id)]
    if customer_df.empty:
        return {
            "customer_id": customer_id,
            "has_failed_payment": False,
            "transaction_id": None,
            "amount": 0.0,
            "failure_reason": "Customer not found in dataset",
            "failure_category": "none",
            "is_recoverable": False,
            "suggested_action": "stop",
            "stop_reason": f"Customer '{customer_id}' not found",
        }

    status_series = customer_df["payment_status"].astype("string").str.lower().str.strip()
    failed = customer_df[status_series == "failed"]

    if failed.empty:
        return {
            "customer_id": customer_id,
            "has_failed_payment": False,
            "transaction_id": None,
            "amount": 0.0,
            "failure_reason": "No failed payments",
            "failure_category": "none",
            "is_recoverable": False,
            "suggested_action": "stop",
            "stop_reason": "Customer has no outstanding failed payments",
        }

    last_failed = failed.iloc[-1]
    txn_id = str(last_failed.get("transaction_id", "")) if "transaction_id" in last_failed else None
    amount = float(last_failed.get("amount", 0.0))
    reason = str(last_failed.get("failure_reason", "")).strip() if pd.notna(last_failed.get("failure_reason")) else ""

    category, is_recoverable = classify_failure(reason)

    if not is_recoverable:
        suggested_action = "stop"
    elif category == "soft":
        suggested_action = "retry_payment"
    elif "expired" in reason.lower() or "cvv" in reason.lower():
        suggested_action = "update_payment_method"
    else:
        suggested_action = "offer_alternative_method"

    return {
        "customer_id": customer_id,
        "has_failed_payment": True,
        "transaction_id": txn_id,
        "amount": amount,
        "failure_reason": reason,
        "failure_category": category,
        "is_recoverable": is_recoverable,
        "suggested_action": suggested_action,
        "stop_reason": "Permanent failure (non-recoverable)" if not is_recoverable else None,
    }


def validate_custom_schedule(schedule: list[float] | list[int] | None, diagnosis: dict[str, Any]) -> tuple[bool, str]:
    """Validate a merchant-configured custom retry schedule against hard max limits."""
    if schedule is None or len(schedule) == 0:
        return (False, "Custom schedule must contain at least 1 retry attempt.")

    if len(schedule) > MAX_ATTEMPTS:
        return (False, f"Custom schedule cannot exceed {MAX_ATTEMPTS} retry attempts.")

    for delay in schedule:
        if delay < 0:
            return (False, "Retry delay cannot be negative.")

    if len(schedule) != len(set(schedule)):
        return (False, "Duplicate retry delay times are not allowed in custom schedule.")

    if sorted(schedule) != list(schedule):
        return (False, "Retry delays must be configured in strictly increasing chronological order.")

    if not diagnosis.get("has_failed_payment", True):
        return (False, "Payment already completed. No recovery action is needed.")

    if not diagnosis.get("is_recoverable", True) or diagnosis.get("failure_category") == "permanent":
        return (False, "This payment can't be retried because the failure is permanent.")

    if diagnosis.get("failure_category") == "hard":
        return (False, "Custom retries aren't available for this payment because it requires customer action.")

    return (True, "")


def calculate_smart_retry(dataframe: pd.DataFrame, customer_id: str) -> dict[str, Any]:
    """Calculate deterministic Smart Retry scoring and schedule based on payment history."""
    diagnosis = diagnose_payment_failure(dataframe, customer_id)
    if not diagnosis["has_failed_payment"]:
        return {
            "retry_recommended": False,
            "recommended_delay_hours": 0.0,
            "recommended_retry_time": now_iso(),
            "display_retry_time": "No retry needed",
            "confidence": 100,
            "expected_recovery": 0.0,
            "strategy": "No recovery needed",
            "reason": "This customer has no outstanding failed payments.",
        }

    category = diagnosis["failure_category"]
    is_recoverable = diagnosis["is_recoverable"]
    reason = diagnosis["failure_reason"].lower()
    amount = diagnosis["amount"]

    if not is_recoverable or category == "permanent":
        return {
            "retry_recommended": False,
            "recommended_delay_hours": 0.0,
            "recommended_retry_time": now_iso(),
            "display_retry_time": "Non-retryable",
            "confidence": 0,
            "expected_recovery": 0.0,
            "strategy": "Recovery Not Recommended",
            "reason": f"Payment failure is permanent ({diagnosis['failure_reason']}). Automatic retry is not permitted.",
        }

    if category == "hard":
        return {
            "retry_recommended": False,
            "recommended_delay_hours": 0.0,
            "recommended_retry_time": now_iso(),
            "display_retry_time": "Customer action required",
            "confidence": 40,
            "expected_recovery": round(amount * 0.4, 2),
            "strategy": "Offer Alternative Payment Method",
            "reason": f"Failure reason ({diagnosis['failure_reason']}) requires customer credential or method update.",
        }

    # Soft failure timing estimation
    customer_df = dataframe[dataframe["customer_id"].astype("string") == str(customer_id)]
    status_series = customer_df["payment_status"].astype("string").str.lower().str.strip()
    failed_rows = customer_df[status_series == "failed"]
    success_rows = customer_df[status_series == "success"]

    total_failed_amt = float(failed_rows["amount"].sum()) if not failed_rows.empty else amount
    total_recovered_amt = float(failed_rows["recovery_amount"].sum()) if not failed_rows.empty else 0.0
    rec_rate = (total_recovered_amt / total_failed_amt * 100) if total_failed_amt > 0 else 0.0

    if "insufficient" in reason or "limit" in reason:
        delay_hours = 24.0
        time_desc = "Tomorrow · 10:30 AM"
        timing_explanation = "24h funds replenishment window"
    elif "network" in reason or "timeout" in reason or "session" in reason or "processing" in reason:
        delay_hours = 4.0
        time_desc = "In 4 hours · Today"
        timing_explanation = "short 4h gateway stabilization window"
    elif "routing" in reason or "bank" in reason or "temporary" in reason:
        delay_hours = 18.0
        time_desc = "In 18 hours · Next cycle"
        timing_explanation = "18h interbank clearing cycle"
    else:
        delay_hours = 24.0
        time_desc = "Tomorrow · 10:30 AM"
        timing_explanation = "24h standard retry window"

    confidence = 75
    if rec_rate > 60:
        confidence += 12
    elif rec_rate < 20 and len(failed_rows) >= 3:
        confidence -= 20

    if not success_rows.empty:
        success_methods = set(success_rows["payment_method"].dropna().unique())
        if len(success_methods) > 1:
            confidence += 8

    confidence = max(30, min(95, confidence))
    expected_recovery = round(amount * confidence / 100, 2)

    now = datetime.now(timezone.utc)
    scheduled_time = (now + timedelta(hours=delay_hours)).isoformat()

    explanation = (
        f"Customer has a temporary failure ({diagnosis['failure_reason']}) with "
        f"{confidence}% calculated historical recovery likelihood. Smart Retry scheduled for {timing_explanation}."
    )

    return {
        "retry_recommended": True,
        "recommended_delay_hours": delay_hours,
        "recommended_retry_time": scheduled_time,
        "display_retry_time": time_desc,
        "confidence": confidence,
        "expected_recovery": expected_recovery,
        "strategy": "Smart Retry",
        "reason": explanation,
    }


# ---------------------------------------------------------------------------
# Session Creation & Lifecycle (Requirements 5 & 8)
# ---------------------------------------------------------------------------

def create_recovery_session(
    dataset: Any,
    customer_id: str,
    strategy: str | None = None,
    expected_recovered_revenue: float = 0.0,
    retry_schedule: list[float] | None = None,
    recommendation_fn: Any = None,
    customer_profile_fn: Any = None,
) -> dict[str, Any]:
    """Create and initialize a new recovery session in ACTIVE or RETRY_SCHEDULED state."""
    diagnosis = diagnose_payment_failure(dataset.dataframe, customer_id)
    smart_retry = calculate_smart_retry(dataset.dataframe, customer_id)

    selected_strategy = strategy
    is_custom = bool(
        retry_schedule or (selected_strategy and "custom" in selected_strategy.lower())
    )

    if is_custom:
        custom_delays = retry_schedule if retry_schedule is not None else [0.0, 24.0, 72.0]
        is_valid, err_msg = validate_custom_schedule(custom_delays, diagnosis)
        if not is_valid:
            raise ValueError(err_msg)
        selected_strategy = "Custom Schedule"
    elif not selected_strategy:
        if smart_retry["retry_recommended"]:
            selected_strategy = "Smart Retry"
        elif recommendation_fn and customer_profile_fn:
            prof = customer_profile_fn(dataset.dataframe, customer_id)
            rec = recommendation_fn(prof)
            selected_strategy = rec.get("recommended_strategy", "Offer Alternative Payment Method")
        elif diagnosis["suggested_action"] == "retry_payment":
            selected_strategy = "Smart Retry"
        else:
            selected_strategy = "Offer Alternative Payment Method"

    session_id = str(uuid.uuid4())
    now = now_iso()

    amount = diagnosis["amount"] if diagnosis["amount"] > 0 else expected_recovered_revenue
    exp_recovery = smart_retry["expected_recovery"] if smart_retry["expected_recovery"] > 0 else amount
    is_smart_retry = "smart" in str(selected_strategy).lower() or selected_strategy == "Smart Retry"

    if is_custom:
        clean_schedule = [float(x) for x in custom_delays]
        max_attempts = min(len(clean_schedule), MAX_ATTEMPTS)
        first_delay = clean_schedule[0]
        first_retry_time = (datetime.now(timezone.utc) + timedelta(hours=first_delay)).isoformat()
        retry_time = first_retry_time
        next_action_at = first_retry_time
        confidence = 70
        initial_status = STATE_RETRY_SCHEDULED
    elif is_smart_retry:
        clean_schedule = None
        max_attempts = MAX_ATTEMPTS
        retry_time = smart_retry["recommended_retry_time"]
        next_action_at = smart_retry["recommended_retry_time"]
        confidence = smart_retry["confidence"]
        initial_status = STATE_RETRY_SCHEDULED
    else:
        clean_schedule = None
        max_attempts = MAX_ATTEMPTS
        retry_time = None
        next_action_at = None
        confidence = 80
        initial_status = STATE_ACTIVE

    session: dict[str, Any] = {
        "session_id": session_id,
        "customer_id": customer_id,
        "transaction_id": diagnosis["transaction_id"],
        "amount": amount,
        "failure_reason": diagnosis["failure_reason"],
        "failure_category": diagnosis["failure_category"],
        "is_recoverable": diagnosis["is_recoverable"],
        "strategy": selected_strategy,
        "action": diagnosis["suggested_action"],
        "retry_schedule": clean_schedule,
        "current_attempt": 0,
        "attempt_count": 0,
        "max_attempts": max_attempts,
        "status": initial_status,
        "created_at": now,
        "updated_at": now,
        "next_action_at": next_action_at,
        "retry_time": retry_time,
        "confidence": confidence,
        "expected_recovery": exp_recovery,
        "recovered_amount": 0.0,
        "expected_recovered_revenue": exp_recovery,
        "payment_url": f"/pay/{session_id}",
        "audit_trail": [],
        "dispatched_emails": [],
        "dispatched_voice_calls": [],
        "merchant_id": "merchant",
    }

    log_audit_event(
        session=session,
        event="recovery_created",
        action="initialize_session",
        details={
            "customer_id": customer_id,
            "transaction_id": session["transaction_id"],
            "amount": amount,
            "strategy": session["strategy"],
            "failure_reason": session["failure_reason"],
            "category": session["failure_category"],
            "initial_status": initial_status,
            "max_attempts": max_attempts,
        },
    )

    log_audit_event(
        session=session,
        event="payment_link_generated",
        action="generate_payment_url",
        details={
            "payment_url": session["payment_url"],
            "customer_id": customer_id,
            "amount": amount,
        },
    )

    if is_custom:
        log_audit_event(
            session=session,
            event="custom_schedule_created",
            action="schedule_custom_retry",
            details={
                "retry_schedule": clean_schedule,
                "max_attempts": max_attempts,
                "first_retry_time": first_retry_time,
            },
        )
    elif is_smart_retry and smart_retry["retry_recommended"]:
        log_audit_event(
            session=session,
            event="smart_retry_recommended",
            action="schedule_smart_retry",
            details={
                "delay_hours": smart_retry["recommended_delay_hours"],
                "retry_time": smart_retry["recommended_retry_time"],
                "confidence": smart_retry["confidence"],
                "expected_recovery": smart_retry["expected_recovery"],
                "reason": smart_retry["reason"],
            },
        )

    dataset.recovery_sessions[session_id] = session
    try:
        from backend.db import is_mongodb_configured, recovery_session_repository
        if is_mongodb_configured():
            recovery_session_repository.create(session)
    except Exception:
        pass

    return session


def get_customer_payment_options(diagnosis: dict[str, Any] | None, session: dict[str, Any]) -> dict[str, Any]:
    """Determine customer-facing payment options and failure-specific messaging."""
    diag = diagnosis or {}
    reason = str(session.get("failure_reason", "") or diag.get("failure_reason", "")).lower()
    category = session.get("failure_category", diag.get("failure_category", "soft"))
    is_rec = session.get("is_recoverable", diag.get("is_recoverable", True))
    raw_status = session.get("status", "")
    norm_status = normalize_status(raw_status)

    # Already completed / recovered
    if norm_status == STATE_RECOVERED:
        return {
            "can_pay": False,
            "status": STATE_RECOVERED,
            "message": "Payment already completed. No recovery action is needed.",
            "title": "Payment Successful",
            "methods": [],
        }

    # Stopped / Exhausted
    if norm_status in (STATE_EXHAUSTED, STATE_STOPPED_PAID) or not is_rec or category == "permanent" or "closed" in reason or "fraud" in reason:
        return {
            "can_pay": False,
            "status": norm_status,
            "message": "This payment cannot be retried.",
            "title": "Payment Cannot Be Retried",
            "methods": [],
        }

    # Expired card / CVV issue
    if "expired" in reason or "cvv" in reason or "card expired" in reason:
        return {
            "can_pay": True,
            "status": norm_status,
            "message": "Your saved card needs to be updated.",
            "title": "Update Payment Details",
            "methods": [
                {"id": "update_card", "label": "Update Payment Method", "icon": "💳", "type": "card_update", "is_primary": True},
                {"id": "upi", "label": "UPI (Instant)", "icon": "⚡", "type": "upi", "is_primary": False},
            ],
        }

    # Insufficient funds / daily limit exceeded
    if "insufficient" in reason or "limit" in reason or "low balance" in reason:
        return {
            "can_pay": True,
            "status": norm_status,
            "message": "Please ensure sufficient balance is available and retry.",
            "title": "Retry Payment",
            "methods": [
                {"id": "retry_payment", "label": "Retry Payment", "icon": "🔄", "type": "retry", "is_primary": True},
                {"id": "upi", "label": "UPI", "icon": "⚡", "type": "upi", "is_primary": False},
                {"id": "wallet", "label": "Wallet", "icon": "👛", "type": "wallet", "is_primary": False},
            ],
        }

    # Card declined / generic card failure
    if "declined" in reason or "card" in reason or "do not honor" in reason:
        return {
            "can_pay": True,
            "status": norm_status,
            "message": "Your card payment could not be completed. Try another payment method.",
            "title": "Choose Alternative Payment",
            "methods": [
                {"id": "upi", "label": "UPI", "icon": "⚡", "type": "upi", "is_primary": True},
                {"id": "wallet", "label": "Wallet", "icon": "👛", "type": "wallet", "is_primary": False},
                {"id": "card", "label": "Another Card", "icon": "💳", "type": "card", "is_primary": False},
            ],
        }

    # Default
    return {
        "can_pay": True,
        "status": norm_status,
        "message": "Your previous payment could not be completed.",
        "title": "Complete Your Payment",
        "methods": [
            {"id": "upi", "label": "UPI", "icon": "⚡", "type": "upi", "is_primary": True},
            {"id": "wallet", "label": "Wallet", "icon": "👛", "type": "wallet", "is_primary": False},
            {"id": "card", "label": "Card", "icon": "💳", "type": "card", "is_primary": False},
            {"id": "retry_payment", "label": "Retry Payment", "icon": "🔄", "type": "retry", "is_primary": False},
        ],
    }


def verify_payment_status(session: dict[str, Any], dataset: Any) -> bool:
    """Verify if the payment has transitioned to success in the dataset.

    Returns True if recovered or permanently stopped/exhausted, False if further action needed.
    """
    dataframe = getattr(dataset, "dataframe", None)
    if dataframe is None:
        return False

    txn_id = session.get("transaction_id")
    cust_id = session.get("customer_id")
    matched = False
    is_success = False

    if txn_id and "transaction_id" in dataframe.columns:
        matching_rows = dataframe[dataframe["transaction_id"].astype("string") == str(txn_id)]
        if not matching_rows.empty:
            matched = True
            row_status = str(matching_rows.iloc[-1].get("payment_status", "")).lower().strip()
            if row_status in ("success", "recovered", "completed"):
                is_success = True

    if not matched and cust_id and "customer_id" in dataframe.columns:
        cust_rows = dataframe[dataframe["customer_id"].astype("string") == str(cust_id)]
        if not cust_rows.empty:
            row_status = str(cust_rows.iloc[-1].get("payment_status", "")).lower().strip()
            if row_status in ("success", "recovered", "completed"):
                is_success = True

    session["updated_at"] = now_iso()

    # Rule 1: Payment succeeded -> RECOVERED
    if is_success:
        session["status"] = STATE_RECOVERED
        session["recovered_amount"] = session.get("amount", 0.0)
        session["next_action_at"] = None
        session["retry_time"] = None
        log_audit_event(session, "payment_recovered", details={
            "recovered_amount": session["recovered_amount"],
            "attempt_count": session.get("attempt_count", 0),
        })
        return True

    # Rule 2: Unrecoverable / Permanent failure -> STOPPED_PAID
    if not session.get("is_recoverable", True):
        session["status"] = STATE_STOPPED_PAID
        session["next_action_at"] = None
        session["retry_time"] = None
        log_audit_event(session, "recovery_stopped", details={
            "reason": "Payment failure is permanent or non-recoverable",
        })
        return True

    # Rule 3: Max attempts reached -> EXHAUSTED (Requirement 5)
    if session.get("attempt_count", 0) >= MAX_ATTEMPTS:
        session["status"] = STATE_EXHAUSTED
        session["next_action_at"] = None
        session["retry_time"] = None
        log_audit_event(session, "recovery_exhausted", details={
            "attempts": session["attempt_count"],
            "max_attempts": MAX_ATTEMPTS,
            "message": "Maximum retry limit of 3 attempts reached.",
        })
        return True

    return False


def execute_recovery_action(session: dict[str, Any], dataset: Any) -> dict[str, Any]:
    """Execute a single recovery step with strict concurrency and attempt limits."""
    sid = session.get("session_id", "")
    with session_lock(sid):
        session["updated_at"] = now_iso()

        # Guardrail 1: Already terminal
        current_status = normalize_status(session.get("status", ""))
        if current_status in (STATE_RECOVERED, STATE_STOPPED_PAID):
            return session

        # Guardrail 2: Non-recoverable
        if not session.get("is_recoverable", True):
            session["status"] = STATE_STOPPED_PAID
            session["next_action_at"] = None
            log_audit_event(session, "recovery_stopped", details={"reason": "Customer failure is non-recoverable"})
            return session

        # Guardrail 3: Max attempts reached (Requirement 5)
        if session.get("attempt_count", 0) >= MAX_ATTEMPTS:
            session["status"] = STATE_EXHAUSTED
            session["next_action_at"] = None
            log_audit_event(session, "recovery_exhausted", details={
                "attempts": session["attempt_count"],
                "max_attempts": MAX_ATTEMPTS,
            })
            return session

        # Increment attempt count
        session["attempt_count"] = session.get("attempt_count", 0) + 1
        session["current_attempt"] = session["attempt_count"]
        strat = str(session.get("strategy", "")).lower()

        if "custom" in strat:
            session["action"] = "retry_payment"
            session["status"] = STATE_RETRY_SCHEDULED
            schedule = session.get("retry_schedule", [])
            if session["attempt_count"] < len(schedule):
                next_delay = schedule[session["attempt_count"]]
                session["next_action_at"] = (datetime.now(timezone.utc) + timedelta(hours=next_delay)).isoformat()
                session["retry_time"] = session["next_action_at"]
            else:
                session["next_action_at"] = None

            log_audit_event(session, "retry_executed", action="retry_payment", details={
                "attempt_count": session["attempt_count"],
                "next_action_at": session.get("next_action_at"),
                "strategy": "Custom Schedule",
            })
        elif "retry" in strat or "smart" in strat:
            session["action"] = "retry_payment"
            session["status"] = STATE_RETRY_SCHEDULED
            log_audit_event(session, "retry_executed", action="retry_payment", details={
                "attempt_count": session["attempt_count"],
                "retry_time": session.get("retry_time"),
                "strategy": session.get("strategy"),
            })
        else:
            session["action"] = "offer_alternative_method"
            session["status"] = STATE_PAYMENT_PENDING
            log_audit_event(session, "customer_intervention_executed", action=session["action"], details={
                "attempt_count": session["attempt_count"],
                "status": session["status"],
            })

        # If reaching 3 attempts without recovery, mark EXHAUSTED
        if session["attempt_count"] >= MAX_ATTEMPTS and session["status"] not in (STATE_RECOVERED, STATE_STOPPED_PAID):
            session["status"] = STATE_EXHAUSTED
            session["next_action_at"] = None
            log_audit_event(session, "recovery_exhausted", details={
                "attempts": session["attempt_count"],
                "max_attempts": MAX_ATTEMPTS,
            })

        try:
            from backend.db import is_mongodb_configured, recovery_session_repository
            if is_mongodb_configured() and sid:
                recovery_session_repository.update(sid, session)
        except Exception:
            pass

        return session


def run_recovery_workflow(session_id: str, dataset: Any) -> dict[str, Any]:
    """Execute complete deterministic recovery loop for a session with state locking."""
    with session_lock(session_id):
        session = dataset.recovery_sessions.get(session_id)
        if not session:
            return {}

        # Initial transition
        if session.get("status") in ("created", "diagnosed"):
            session["status"] = STATE_ACTIVE
            log_audit_event(session, "recovery_active", action="start_workflow", details={
                "failure_category": session.get("failure_category"),
                "is_recoverable": session.get("is_recoverable"),
            })

        # Guard: Non-recoverable
        if not session.get("is_recoverable", True):
            session["status"] = STATE_STOPPED_PAID
            session["updated_at"] = now_iso()
            log_audit_event(session, "recovery_stopped", details={"reason": "Permanent failure detected"})
            return session

        # Guard: Verify if already succeeded
        if verify_payment_status(session, dataset):
            return session

        # Act
        execute_recovery_action(session, dataset)

        # Verify again
        verify_payment_status(session, dataset)

        try:
            from backend.db import is_mongodb_configured, recovery_session_repository
            if is_mongodb_configured():
                recovery_session_repository.update(session_id, session)
        except Exception:
            pass

        return session


# ---------------------------------------------------------------------------
# Webhook Payment Captured Resolution (Requirement 9)
# ---------------------------------------------------------------------------

def resolve_payment_captured(
    session: dict[str, Any],
    dataset: Any,
    amount: float | None = None,
    payment_method: str | None = None,
    source: str = "webhook",
) -> dict[str, Any]:
    """When a payment webhook arrives:
    1. Stop all pending actions / clear scheduled retries.
    2. Mark session RECOVERED (or STOPPED_PAID if alternate source).
    3. Write structured audit log to MongoDB & session document.
    """
    sid = session.get("session_id", "")
    with session_lock(sid):
        rec_amt = float(amount) if amount is not None else float(session.get("amount", 0.0))
        target_status = STATE_RECOVERED

        session["status"] = target_status
        session["recovered_amount"] = rec_amt
        session["next_action_at"] = None
        session["retry_time"] = None
        session["completed_at"] = now_iso()
        session["updated_at"] = now_iso()
        session["recovery_source"] = source
        if payment_method:
            session["recovered_payment_method"] = payment_method

        log_audit_event(
            session=session,
            event="payment_recovered",
            action="stop_all_pending_actions",
            actor=source,
            details={
                "recovered_amount": rec_amt,
                "payment_method": payment_method,
                "attempt_count": session.get("attempt_count", 0),
                "source": source,
                "message": "Payment captured webhook received: all pending actions stopped, session marked RECOVERED.",
            },
        )

        # Update in-memory dataset
        if hasattr(dataset, "dataframe") and dataset.dataframe is not None:
            df = dataset.dataframe
            txn_id = session.get("transaction_id")
            cust_id = session.get("customer_id")
            if txn_id and "transaction_id" in df.columns:
                mask = df["transaction_id"].astype("string") == str(txn_id)
                if mask.any():
                    df.loc[mask, "payment_status"] = "success"
                    df.loc[mask, "status"] = "success"
                    df.loc[mask, "recovery_amount"] = rec_amt
            elif cust_id and "customer_id" in df.columns:
                mask = (df["customer_id"].astype("string") == str(cust_id)) & (
                    df["payment_status"].astype("string").str.lower() == "failed"
                )
                if mask.any():
                    idx = df[mask].index[-1]
                    df.loc[idx, "payment_status"] = "success"
                    df.loc[idx, "status"] = "success"
                    df.loc[idx, "recovery_amount"] = rec_amt

        # Update in MongoDB
        try:
            from backend.db import is_mongodb_configured, recovery_session_repository, transaction_repository
            if is_mongodb_configured():
                recovery_session_repository.update(sid, session)
                txn_id = session.get("transaction_id")
                if txn_id:
                    transaction_repository.update_payment_status(str(txn_id), "success", recovery_amount=rec_amt)
        except Exception:
            pass

        return session


def complete_recovery_session(session_id: str, dataset: Any) -> dict[str, Any]:
    """Manually complete a recovery session and resolve payment status."""
    session = dataset.recovery_sessions.get(session_id)
    if not session:
        return {}
    return resolve_payment_captured(session, dataset, source="manual_completion")
