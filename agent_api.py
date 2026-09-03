import os
from typing import Any
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from backend.db import is_mongodb_configured, recovery_session_repository
from backend.recovery_engine import (
    execute_recovery_action,
    get_customer_payment_options,
    verify_payment_status,
    log_audit_event,
    diagnose_payment_failure,
    normalize_status,
    session_lock,
    STATE_RECOVERED,
    STATE_EXHAUSTED,
    STATE_STOPPED_PAID,
)

router = APIRouter(prefix="/api/agent", tags=["agent"])


def verify_agent_key(x_relay_agent_key: str = Header(..., alias="X-Relay-Agent-Key")) -> bool:
    """Verify the agent API key against the environment variable."""
    expected_key = os.environ.get("RELAY_AGENT_API_KEY")
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Agent API key is not configured on the server."
        )
    if x_relay_agent_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Agent API Key."
        )
    return True


agent_dependency = Depends(verify_agent_key)


def get_merchant_dataset(merchant_id: str = "merchant"):
    from main import data_store
    try:
        return data_store.get(merchant_id)
    except Exception:
        if data_store._datasets:
            return next(iter(data_store._datasets.values()))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant dataset not found.")


@router.get("/payment/{customer_id}")
async def get_payment_context(
    customer_id: str,
    _: bool = agent_dependency
) -> dict[str, Any]:
    from main import customer_profile
    dataset = get_merchant_dataset()
    try:
        prof = customer_profile(dataset.dataframe, customer_id)
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

    diagnosis = diagnose_payment_failure(dataset.dataframe, customer_id)

    session_id = None
    if is_mongodb_configured():
        active_session = recovery_session_repository.find_active_by_transaction(diagnosis.get("transaction_id", ""))
        if active_session:
            session_id = active_session["session_id"]
            log_audit_event(active_session, "agent_context_requested", details={"customer_id": customer_id}, actor="agent_api")
            recovery_session_repository.update(session_id, active_session)
    else:
        for sid, sess in dataset.recovery_sessions.items():
            if sess.get("customer_id") == customer_id and normalize_status(sess.get("status")) not in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
                session_id = sid
                log_audit_event(sess, "agent_context_requested", details={"customer_id": customer_id}, actor="agent_api")
                break

    return {
        "customer_id": customer_id,
        "customer_name": customer_id,
        "amount": prof.get("last_failed_amount", 0.0),
        "payment_status": "failed" if diagnosis.get("has_failed_payment") else "success",
        "failure_reason": diagnosis.get("failure_reason", ""),
        "failure_category": diagnosis.get("failure_category", ""),
        "recovery_session_id": session_id
    }


@router.get("/recovery/{session_id}")
async def get_recovery_status(
    session_id: str,
    _: bool = agent_dependency
) -> dict[str, Any]:
    dataset = get_merchant_dataset()
    session = dataset.recovery_sessions.get(session_id)

    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id)
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery session not found.")

    if normalize_status(session.get("status")) not in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        verify_payment_status(session, dataset)

    return {
        "session_id": session["session_id"],
        "customer_id": session["customer_id"],
        "amount": session["amount"],
        "status": session["status"],
        "strategy": session.get("strategy", ""),
        "attempt_count": session.get("attempt_count", 0),
        "max_attempts": session.get("max_attempts", 3),
        "next_action_at": session.get("next_action_at"),
        "recovered_amount": session.get("recovered_amount", 0.0)
    }


@router.get("/recovery/{session_id}/options")
async def get_recovery_options(
    session_id: str,
    _: bool = agent_dependency
) -> dict[str, Any]:
    dataset = get_merchant_dataset()
    session = dataset.recovery_sessions.get(session_id)

    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id)
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery session not found.")

    if normalize_status(session.get("status")) not in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        verify_payment_status(session, dataset)

    diagnosis = diagnose_payment_failure(dataset.dataframe, session["customer_id"])
    options = get_customer_payment_options(diagnosis, session)

    allowed_actions = []
    if options.get("can_pay"):
        for method in options.get("methods", []):
            allowed_actions.append(method["label"])
            if method["type"] in ("card", "card_update"):
                allowed_actions.append("Another Card")

    log_audit_event(session, "agent_recovery_options_requested", details={"allowed_actions": allowed_actions}, actor="agent_api")
    if is_mongodb_configured():
        recovery_session_repository.update(session_id, session)

    return {
        "allowed_actions": list(set(allowed_actions))
    }


@router.post("/recovery/{session_id}/payment-link")
async def create_payment_link(
    session_id: str,
    _: bool = agent_dependency
) -> dict[str, Any]:
    dataset = get_merchant_dataset()
    session = dataset.recovery_sessions.get(session_id)

    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id)
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery session not found.")

    if normalize_status(session.get("status")) in (STATE_RECOVERED, STATE_STOPPED_PAID, STATE_EXHAUSTED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot generate payment link for a completed or stopped session.")

    payment_url = session.get("payment_url", f"/pay/{session_id}")
    log_audit_event(session, "agent_payment_link_created", details={"payment_url": payment_url}, actor="agent_api")
    if is_mongodb_configured():
        recovery_session_repository.update(session_id, session)

    return {
        "payment_url": payment_url
    }


class PaymentMethodRequest(BaseModel):
    payment_method: str = Field(..., min_length=1)


@router.post("/recovery/{session_id}/method")
async def select_payment_method(
    session_id: str,
    request: PaymentMethodRequest,
    _: bool = agent_dependency
) -> dict[str, Any]:
    dataset = get_merchant_dataset()
    session = dataset.recovery_sessions.get(session_id)

    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id)
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery session not found.")

    if normalize_status(session.get("status")) in (STATE_RECOVERED, STATE_STOPPED_PAID, STATE_EXHAUSTED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot select payment method for a completed or stopped session.")

    diagnosis = diagnose_payment_failure(dataset.dataframe, session["customer_id"])
    options = get_customer_payment_options(diagnosis, session)

    allowed = False
    requested_method_clean = request.payment_method.lower().strip()
    if options.get("can_pay"):
        for method in options.get("methods", []):
            label_clean = method["label"].lower().strip()
            type_clean = method["type"].lower().strip()
            if requested_method_clean in (label_clean, type_clean, "card", "another card"):
                allowed = True
                break

    if not allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Payment method '{request.payment_method}' is not allowed for this session.")

    with session_lock(session_id):
        log_audit_event(session, "agent_payment_method_selected", details={"payment_method": request.payment_method}, actor="agent_api")
        execute_recovery_action(session, dataset)
        if is_mongodb_configured():
            recovery_session_repository.update(session_id, session)

    return {
        "status": session["status"],
        "action": session.get("action"),
        "message": "Payment method selected and recovery action executed."
    }


@router.get("/recovery/{session_id}/status")
async def get_payment_status(
    session_id: str,
    _: bool = agent_dependency
) -> dict[str, Any]:
    dataset = get_merchant_dataset()
    session = dataset.recovery_sessions.get(session_id)

    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id)
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery session not found.")

    log_audit_event(session, "agent_payment_status_checked", details={}, actor="agent_api")

    if normalize_status(session.get("status")) not in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        verify_payment_status(session, dataset)

    if is_mongodb_configured():
        recovery_session_repository.update(session_id, session)

    is_success = normalize_status(session.get("status")) == STATE_RECOVERED

    return {
        "status": session["status"],
        "payment_status": "success" if is_success else "failed",
        "amount": session["amount"],
        "recovered_amount": session.get("recovered_amount", 0.0)
    }


class PromiseToPayRequest(BaseModel):
    promised_date: str = Field(...)


@router.post("/recovery/{session_id}/promise-to-pay")
async def promise_to_pay(
    session_id: str,
    request: PromiseToPayRequest,
    _: bool = agent_dependency
) -> dict[str, Any]:
    try:
        datetime.fromisoformat(request.promised_date.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ISO date format.")

    dataset = get_merchant_dataset()
    session = dataset.recovery_sessions.get(session_id)
    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id)

    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recovery session not found.")

    log_audit_event(session, "agent_promise_to_pay_requested", details={"promised_date": request.promised_date}, actor="agent_api")
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Promise-to-pay capability is not yet enabled in the recovery engine.")
