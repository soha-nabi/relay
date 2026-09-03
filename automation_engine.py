"""No-Code Recovery Automations Engine.

Provides a lightweight orchestration layer on top of the existing recovery engine.
Merchants define WHEN → IF → THEN → STOP WHEN automations without writing code.
All execution delegates to the existing recovery engine functions.
Phase 4: Persistence backed by MongoDB via AutomationRepository with in-memory fallback.
"""

from datetime import datetime, timezone
from typing import Any
import uuid

from backend.db import (
    automation_repository,
    is_mongodb_configured,
)

# ---------------------------------------------------------------------------
# Automation In-Memory Store (mirrors DataStore pattern — fallback / cache)
# ---------------------------------------------------------------------------
_AUTOMATION_STORE: dict[str, dict[str, Any]] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TRIGGER_OPTIONS = [
    "payment_failed",
    "payment_failed_soft",
    "payment_failed_hard",
]

CONDITION_FIELDS = ["amount", "failure_type", "failure_reason", "payment_method", "customer_risk"]

CONDITION_OPERATORS = ["equals", "not_equals", "greater_than", "less_than", "contains"]

ACTION_OPTIONS = [
    "smart_retry",
    "custom_retry_schedule",
    "offer_alternative_payment",
    "customer_recovery_instruction",
    "stop_recovery",
    "escalate",
]

STOP_RULE_OPTIONS = [
    "payment_succeeds",
    "max_attempts_reached",
    "permanent_failure",
    "non_recoverable",
]

# Map automation actions to strategy names understood by recovery_engine
ACTION_TO_STRATEGY: dict[str, str] = {
    "smart_retry": "Smart Retry",
    "custom_retry_schedule": "Custom Schedule",
    "offer_alternative_payment": "Offer Alternative Payment Method",
    "customer_recovery_instruction": "Offer Alternative Payment Method",
    "stop_recovery": "stop",
    "escalate": "High Priority Recovery Campaign",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_merchant_id(merchant_id: str | None) -> str | None:
    """Normalize merchant ID, treating admin as unrestricted."""
    if merchant_id and str(merchant_id).strip().lower() == "admin":
        return None
    return str(merchant_id).strip() if merchant_id else None


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_automation(data: dict[str, Any]) -> tuple[bool, str]:
    """Validate an automation definition dict.

    Returns (is_valid, error_message).
    """
    if not data.get("name", "").strip():
        return False, "Automation name is required."

    trigger = data.get("trigger")
    if trigger not in TRIGGER_OPTIONS:
        return False, f"Unsupported trigger '{trigger}'. Supported: {', '.join(TRIGGER_OPTIONS)}"

    conditions = data.get("conditions", [])
    for cond in conditions:
        if cond.get("field") not in CONDITION_FIELDS:
            return False, f"Unsupported condition field '{cond.get('field')}'."
        if cond.get("operator") not in CONDITION_OPERATORS:
            return False, f"Unsupported condition operator '{cond.get('operator')}'."
        if cond.get("value") is None:
            return False, f"Condition '{cond.get('field')}' is missing a value."
        if cond.get("operator") in ("greater_than", "less_than"):
            try:
                float(cond["value"])
            except (ValueError, TypeError):
                return False, f"Condition '{cond.get('field')}' with operator '{cond.get('operator')}' requires a numeric value."

    actions = data.get("actions", [])
    if not actions:
        return False, "At least one action is required."
    for act in actions:
        if act.get("type") not in ACTION_OPTIONS:
            return False, f"Unsupported action type '{act.get('type')}'. Supported: {', '.join(ACTION_OPTIONS)}"

    stop_rules = data.get("stop_rules", [])
    for rule in stop_rules:
        if rule not in STOP_RULE_OPTIONS:
            return False, f"Unsupported stop rule '{rule}'."

    return True, ""


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_automation(data: dict[str, Any], merchant_id: str | None = None) -> dict[str, Any]:
    """Create and persist a new automation. Raises ValueError if invalid."""
    is_valid, err = validate_automation(data)
    if not is_valid:
        raise ValueError(err)

    automation_id = str(uuid.uuid4())
    resolved_merchant = _resolve_merchant_id(merchant_id) or data.get("merchant_id") or "merchant"

    automation: dict[str, Any] = {
        "id": automation_id,
        "merchant_id": resolved_merchant,
        "name": data["name"].strip(),
        "status": data.get("status", "active"),
        "trigger": data["trigger"],
        "conditions": data.get("conditions", []),
        "actions": data["actions"],
        "stop_rules": data.get("stop_rules", ["payment_succeeds", "max_attempts_reached", "permanent_failure"]),
        "description": data.get("description", ""),
        "customers_affected": 0,
        "times_triggered": 0,
        "execution_count": 0,
        "last_triggered": None,
        "last_executed_at": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    # Persist to MongoDB when available
    if is_mongodb_configured():
        try:
            mongo_doc = automation_repository.create(automation)
            if mongo_doc:
                automation = mongo_doc
        except Exception:
            pass

    _AUTOMATION_STORE[automation_id] = automation
    return automation


def get_automation(automation_id: str, merchant_id: str | None = None) -> dict[str, Any] | None:
    """Get automation by ID from MongoDB (primary) or in-memory store (fallback)."""
    resolved = _resolve_merchant_id(merchant_id)

    if is_mongodb_configured():
        try:
            doc = automation_repository.get(automation_id, merchant_id=resolved)
            if doc:
                _AUTOMATION_STORE[automation_id] = doc
                return doc
        except Exception:
            pass

    # In-memory fallback
    auto = _AUTOMATION_STORE.get(automation_id)
    if auto is None:
        return None
    if resolved and auto.get("merchant_id") != resolved:
        return None
    return auto


def update_automation(
    automation_id: str, data: dict[str, Any], merchant_id: str | None = None
) -> dict[str, Any]:
    """Update an existing automation."""
    resolved = _resolve_merchant_id(merchant_id)

    # Fetch current state for merging and validation
    current = get_automation(automation_id, merchant_id=resolved)
    if current is None:
        raise KeyError(f"Automation '{automation_id}' not found.")

    merged = {**current, **data, "id": automation_id}
    is_valid, err = validate_automation(merged)
    if not is_valid:
        raise ValueError(err)

    merged["updated_at"] = now_iso()

    if is_mongodb_configured():
        try:
            updated = automation_repository.update(automation_id, merged, merchant_id=resolved)
            if updated:
                _AUTOMATION_STORE[automation_id] = updated
                return updated
        except Exception:
            pass

    _AUTOMATION_STORE[automation_id] = merged
    return merged


def delete_automation(automation_id: str, merchant_id: str | None = None) -> bool:
    """Delete an automation. Returns True if found and removed."""
    resolved = _resolve_merchant_id(merchant_id)

    deleted_in_mongo = False
    if is_mongodb_configured():
        try:
            deleted_in_mongo = automation_repository.delete(automation_id, merchant_id=resolved)
        except Exception:
            pass

    if automation_id in _AUTOMATION_STORE:
        auto = _AUTOMATION_STORE.get(automation_id)
        if resolved and auto and auto.get("merchant_id") != resolved:
            return False
        del _AUTOMATION_STORE[automation_id]
        return True

    return deleted_in_mongo


def list_automations(merchant_id: str | None = None) -> list[dict[str, Any]]:
    """List automations from MongoDB (primary) or in-memory store (fallback)."""
    resolved = _resolve_merchant_id(merchant_id)

    if is_mongodb_configured():
        try:
            docs = automation_repository.list_by_merchant(merchant_id=resolved)
            if docs is not None:
                # Sync to in-memory cache
                for doc in docs:
                    if doc.get("id"):
                        _AUTOMATION_STORE[doc["id"]] = doc
                return docs
        except Exception:
            pass

    # In-memory fallback
    all_autos = list(_AUTOMATION_STORE.values())
    if resolved:
        all_autos = [a for a in all_autos if a.get("merchant_id") == resolved]
    return all_autos


def pause_automation(automation_id: str, merchant_id: str | None = None) -> dict[str, Any]:
    """Pause an automation."""
    resolved = _resolve_merchant_id(merchant_id)
    automation = get_automation(automation_id, merchant_id=resolved)
    if not automation:
        raise KeyError(f"Automation '{automation_id}' not found.")

    updates = {"status": "paused", "updated_at": now_iso()}

    if is_mongodb_configured():
        try:
            updated = automation_repository.update(automation_id, updates, merchant_id=resolved)
            if updated:
                _AUTOMATION_STORE[automation_id] = updated
                return updated
        except Exception:
            pass

    automation.update(updates)
    _AUTOMATION_STORE[automation_id] = automation
    return automation


def resume_automation(automation_id: str, merchant_id: str | None = None) -> dict[str, Any]:
    """Resume a paused automation."""
    resolved = _resolve_merchant_id(merchant_id)
    automation = get_automation(automation_id, merchant_id=resolved)
    if not automation:
        raise KeyError(f"Automation '{automation_id}' not found.")

    updates = {"status": "active", "updated_at": now_iso()}

    if is_mongodb_configured():
        try:
            updated = automation_repository.update(automation_id, updates, merchant_id=resolved)
            if updated:
                _AUTOMATION_STORE[automation_id] = updated
                return updated
        except Exception:
            pass

    automation.update(updates)
    _AUTOMATION_STORE[automation_id] = automation
    return automation


def duplicate_automation(automation_id: str, merchant_id: str | None = None) -> dict[str, Any]:
    """Create a copy of an automation with a new ID."""
    resolved = _resolve_merchant_id(merchant_id)
    automation = get_automation(automation_id, merchant_id=resolved)
    if not automation:
        raise KeyError(f"Automation '{automation_id}' not found.")

    copy_data = {
        k: v for k, v in automation.items()
        if k not in ("id", "created_at", "updated_at", "last_triggered", "last_executed_at", "customers_affected", "times_triggered", "execution_count")
    }
    copy_data["name"] = f"{automation['name']} (Copy)"
    copy_data["status"] = "paused"
    # Preserve merchant ownership
    copy_data["merchant_id"] = automation.get("merchant_id", resolved or "merchant")

    return create_automation(copy_data, merchant_id=merchant_id)


# ---------------------------------------------------------------------------
# Condition Evaluation
# ---------------------------------------------------------------------------

def evaluate_condition(condition: dict[str, Any], payment_context: dict[str, Any]) -> bool:
    """Evaluate a single condition dict against a payment context.

    payment_context keys: amount, failure_type, failure_reason, payment_method, customer_risk
    """
    field = condition.get("field", "")
    operator = condition.get("operator", "equals")
    expected = condition.get("value")

    actual = payment_context.get(field)
    if actual is None:
        return False

    actual_str = str(actual).strip().lower()
    expected_str = str(expected).strip().lower()

    if operator == "equals":
        return actual_str == expected_str
    elif operator == "not_equals":
        return actual_str != expected_str
    elif operator == "contains":
        return expected_str in actual_str
    elif operator == "greater_than":
        try:
            return float(actual) > float(expected)
        except (ValueError, TypeError):
            return False
    elif operator == "less_than":
        try:
            return float(actual) < float(expected)
        except (ValueError, TypeError):
            return False
    return False


def evaluate_conditions(conditions: list[dict[str, Any]], payment_context: dict[str, Any]) -> tuple[bool, list[dict[str, Any]]]:
    """Evaluate all conditions (AND logic). Returns (all_passed, results)."""
    results = []
    for cond in conditions:
        passed = evaluate_condition(cond, payment_context)
        results.append({"condition": cond, "passed": passed})
    all_passed = all(r["passed"] for r in results)
    return all_passed, results


def build_payment_context(diagnosis: dict[str, Any], dataframe: Any, customer_id: str) -> dict[str, Any]:
    """Build a flat payment context dict from diagnosis + optional dataset info."""
    failure_type = diagnosis.get("failure_category", "soft")  # soft / hard / permanent
    failure_reason = diagnosis.get("failure_reason", "")
    amount = diagnosis.get("amount", 0.0)
    payment_method = ""

    try:
        cust_rows = dataframe[dataframe["customer_id"].astype("string") == str(customer_id)]
        if not cust_rows.empty:
            payment_method = str(cust_rows.iloc[-1].get("payment_method", ""))
    except Exception:
        pass

    # Simple risk heuristic based on failure category
    risk_map = {"permanent": "high", "hard": "medium", "soft": "low"}
    customer_risk = risk_map.get(failure_type, "low")

    return {
        "amount": amount,
        "failure_type": failure_type,
        "failure_reason": failure_reason,
        "payment_method": payment_method,
        "customer_risk": customer_risk,
    }


# ---------------------------------------------------------------------------
# Automation Matching & Execution
# ---------------------------------------------------------------------------

def find_matching_automation(
    trigger_event: str,
    payment_context: dict[str, Any],
    merchant_id: str | None = None,
) -> dict[str, Any] | None:
    """Find first active automation matching the trigger and conditions.

    Queries MongoDB when connected (so persistent automations are found after restart),
    then falls back to in-memory store.
    """
    resolved = _resolve_merchant_id(merchant_id)

    # Attempt to load candidates from MongoDB first
    candidates: list[dict[str, Any]] = []
    if is_mongodb_configured():
        try:
            candidates = automation_repository.find_matching(trigger_event, merchant_id=resolved)
        except Exception:
            pass

    # Fall back to in-memory store if nothing from MongoDB
    if not candidates:
        candidates = list(_AUTOMATION_STORE.values())

    for automation in candidates:
        if automation.get("status") != "active":
            continue

        # Match trigger
        auto_trigger = automation.get("trigger", "")
        if auto_trigger == "payment_failed":
            # Generic trigger matches any failed payment
            pass
        elif auto_trigger == "payment_failed_soft":
            if payment_context.get("failure_type") != "soft":
                continue
        elif auto_trigger == "payment_failed_hard":
            if payment_context.get("failure_type") != "hard":
                continue
        elif auto_trigger != trigger_event:
            continue

        # Merchant isolation when searching in-memory
        if resolved and automation.get("merchant_id") and automation.get("merchant_id") != resolved:
            continue

        # Evaluate conditions
        conditions = automation.get("conditions", [])
        if conditions:
            passed, _ = evaluate_conditions(conditions, payment_context)
            if not passed:
                continue

        return automation
    return None


def run_automation(
    automation: dict[str, Any],
    customer_id: str,
    payment_context: dict[str, Any],
    dataset: Any,
    create_recovery_session_fn: Any,
    run_recovery_workflow_fn: Any,
    diagnose_fn: Any,
) -> dict[str, Any]:
    """Execute the first action of a matched automation by creating a recovery session.

    Subsequent actions are handled by the recovery workflow engine.
    Records automation audit events on the session.
    """
    from backend.recovery_engine import log_audit_event, validate_custom_schedule

    automation_id = automation["id"]
    actions = automation.get("actions", [])
    if not actions:
        return {"status": "no_actions"}

    first_action = actions[0]
    action_type = first_action.get("type", "smart_retry")
    strategy = ACTION_TO_STRATEGY.get(action_type, "Smart Retry")

    retry_schedule = None
    if action_type == "custom_retry_schedule":
        retry_schedule = first_action.get("retry_schedule", [0.0, 24.0, 72.0])

    # Create/update recovery session via existing engine
    session = create_recovery_session_fn(
        dataset=dataset,
        customer_id=customer_id,
        strategy=strategy,
        retry_schedule=retry_schedule,
    )

    # Attach automation metadata to session
    session["automation_id"] = automation_id
    session["automation_name"] = automation.get("name", "")

    # Log automation-specific audit events
    log_audit_event(session, "automation_matched", {
        "automation_id": automation_id,
        "automation_name": automation.get("name"),
        "trigger": automation.get("trigger"),
    })

    log_audit_event(session, "automation_action_triggered", {
        "automation_id": automation_id,
        "action_type": action_type,
        "strategy": strategy,
    })

    # Run recovery workflow
    run_recovery_workflow_fn(session["session_id"], dataset)

    # Update automation counters (both MongoDB and in-memory)
    if is_mongodb_configured():
        try:
            automation_repository.increment_execution(automation_id)
        except Exception:
            pass

    automation["times_triggered"] = automation.get("times_triggered", 0) + 1
    automation["execution_count"] = automation.get("execution_count", 0) + 1
    automation["customers_affected"] = automation.get("customers_affected", 0) + 1
    automation["last_triggered"] = now_iso()
    automation["last_executed_at"] = now_iso()

    return {
        "automation_id": automation_id,
        "session_id": session["session_id"],
        "action_type": action_type,
        "strategy": strategy,
        "session_status": session.get("status"),
    }


# ---------------------------------------------------------------------------
# Automation Preview Generator
# ---------------------------------------------------------------------------

def generate_automation_preview(automation_data: dict[str, Any]) -> list[str]:
    """Generate a plain-English preview of an automation definition."""
    steps = []
    step = 1

    trigger = automation_data.get("trigger", "payment_failed")
    trigger_labels = {
        "payment_failed": "a payment fails",
        "payment_failed_soft": "a soft-decline payment fails",
        "payment_failed_hard": "a hard-decline payment fails",
    }
    steps.append(f"{step}. Detect when {trigger_labels.get(trigger, trigger)}")
    step += 1

    field_labels = {
        "amount": "amount",
        "failure_type": "failure type",
        "failure_reason": "failure reason",
        "payment_method": "payment method",
        "customer_risk": "customer risk",
    }
    op_labels = {
        "equals": "is",
        "not_equals": "is not",
        "greater_than": "is greater than",
        "less_than": "is less than",
        "contains": "contains",
    }

    for cond in automation_data.get("conditions", []):
        field = field_labels.get(cond.get("field", ""), cond.get("field", ""))
        op = op_labels.get(cond.get("operator", ""), cond.get("operator", ""))
        val = cond.get("value", "")
        if cond.get("field") == "amount":
            val = f"₹{val}"
        steps.append(f"{step}. Check whether {field} {op} {val}")
        step += 1

    action_labels = {
        "smart_retry": "Smart Retry (auto-scheduled)",
        "custom_retry_schedule": "Custom Retry Schedule",
        "offer_alternative_payment": "Offer Alternative Payment Method",
        "customer_recovery_instruction": "Send Customer Recovery Instruction",
        "stop_recovery": "Stop recovery immediately",
        "escalate": "Escalate to High-Priority Recovery",
    }

    for i, act in enumerate(automation_data.get("actions", [])):
        label = action_labels.get(act.get("type", ""), act.get("type", ""))
        prefix = "Run" if i == 0 else "If still unpaid →"
        steps.append(f"{step}. {prefix} {label}")
        step += 1

    stop_rules = automation_data.get("stop_rules", [])
    stop_labels = {
        "payment_succeeds": "payment succeeds",
        "max_attempts_reached": "maximum retry attempts are reached",
        "permanent_failure": "a permanent failure is detected",
        "non_recoverable": "the customer is non-recoverable",
    }
    if stop_rules:
        conditions_text = " or ".join(stop_labels.get(r, r) for r in stop_rules)
        steps.append(f"{step}. Stop immediately when {conditions_text}")

    return steps
