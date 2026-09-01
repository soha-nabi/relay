"""Relay's authenticated CSV recovery analytics API with local role-based authentication."""

import hashlib
import hmac
import io
import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import pandas as pd
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from backend.email_service import send_email, send_session_recovery_email
from backend.elevenlabs_service import trigger_session_voice_call
from backend.auth import USERS, get_current_user, require_role, router as auth_router
from backend.db import (
    audit_log_repository,
    automation_repository,
    customer_repository,
    is_mongodb_configured,
    recovery_session_repository,
    transaction_repository,
    webhook_event_repository,
)
from backend.recovery_engine import (
    create_recovery_session,
    run_recovery_workflow,
    complete_recovery_session,
    verify_payment_status,
    execute_recovery_action,
    diagnose_payment_failure,
    calculate_smart_retry,
    validate_custom_schedule,
    get_customer_payment_options,
    log_audit_event,
    session_lock,
    resolve_payment_captured,
    normalize_status,
    STATE_ACTIVE,
    STATE_RETRY_SCHEDULED,
    STATE_PAYMENT_PENDING,
    STATE_RECOVERED,
    STATE_EXHAUSTED,
    STATE_STOPPED_PAID,
)
from backend.automation_engine import (
    _AUTOMATION_STORE,
    create_automation,
    update_automation,
    delete_automation,
    get_automation,
    list_automations,
    pause_automation,
    resume_automation,
    duplicate_automation,
    validate_automation,
    find_matching_automation,
    build_payment_context,
    run_automation,
    generate_automation_preview,
    TRIGGER_OPTIONS,
    CONDITION_FIELDS,
    CONDITION_OPERATORS,
    ACTION_OPTIONS,
    STOP_RULE_OPTIONS,
)
from backend.agent_api import router as agent_router


app = FastAPI(title="Relay Recovery API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:8002",
        "http://127.0.0.1:8002",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class EmailTestRequest(BaseModel):
    to: str
@app.post("/api/email/test")
async def test_email(request: EmailTestRequest):
    try:
        result = send_email(
            to=request.to,
            subject="Relay — Test Recovery Email",
            html="""
            <h2>Relay Email Test</h2>
            <p>This is a test email from Relay.</p>
            <p>Your email delivery integration is working successfully.</p>
            <p>— Relay</p>
            """,
        )
        return result

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Email delivery failed"
        )
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount React production build assets if compiled
_frontend_dist_assets = os.path.join(os.path.dirname(__file__), "frontend", "dist", "assets")
if os.path.exists(_frontend_dist_assets):
    app.mount("/assets", StaticFiles(directory=_frontend_dist_assets), name="assets")

app.include_router(auth_router)
app.include_router(agent_router)


@dataclass
class Dataset:
    dataframe: pd.DataFrame
    uploaded_at: str
    file_name: str
    recovery_sessions: dict[str, dict] = field(default_factory=dict)


class DataStore:
    def __init__(self) -> None:
        self._datasets: dict[str, Dataset] = {}
        # Preload sample dataset for 'merchant' if sample_payments.csv exists
        self._init_sample_data()

    def _init_sample_data(self) -> None:
        # If MongoDB is configured and available, check for persistent merchant records
        if is_mongodb_configured():
            try:
                mongo_df = transaction_repository.load_dataframe_for_merchant("merchant")
                if mongo_df is not None and not mongo_df.empty:
                    self._datasets["merchant"] = Dataset(
                        dataframe=mongo_df,
                        uploaded_at=datetime.now(timezone.utc).isoformat(),
                        file_name="mongodb:sample_payments",
                    )
                    return
            except Exception as e:
                print(f"MongoDB preload note: {e}")

        # In-memory / initial CSV fallback
        sample_path = "sample_payments.csv"
        if os.path.exists(sample_path):
            try:
                df = pd.read_csv(sample_path, dtype={"customer_id": str, "transaction_id": str})
                df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
                df = df.dropna(subset=["amount"])
                df["recovery_amount"] = pd.to_numeric(df.get("recovery_amount", 0), errors="coerce").fillna(0)
                df["payment_status"] = df.get("status", df.get("payment_status")).astype("string").str.lower().str.strip()
                df["status"] = df["payment_status"]
                self._datasets["merchant"] = Dataset(
                    dataframe=df,
                    uploaded_at=datetime.now(timezone.utc).isoformat(),
                    file_name="sample_payments.csv"
                )
            except Exception as e:
                print(f"Sample data initialization note: {e}")

    def get(self, user_id: str) -> Dataset:
        dataset = self._datasets.get(user_id)
        if dataset is None:
            # Check if user has persistent records in MongoDB
            if is_mongodb_configured():
                try:
                    mongo_df = transaction_repository.load_dataframe_for_merchant(user_id)
                    if mongo_df is not None and not mongo_df.empty:
                        dataset = Dataset(
                            dataframe=mongo_df,
                            uploaded_at=datetime.now(timezone.utc).isoformat(),
                            file_name=f"mongodb:{user_id}",
                        )
                        self._datasets[user_id] = dataset
                        return dataset
                except Exception:
                    pass

            # Fallback to demo merchant dataset if available
            if "merchant" in self._datasets:
                return self._datasets["merchant"]
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No dataset uploaded yet. Please upload a CSV file first.",
            )
        return dataset

    def put(self, user_id: str, dataframe: pd.DataFrame, file_name: str) -> Dataset:
        dataset = Dataset(dataframe, datetime.now(timezone.utc).isoformat(), file_name)
        self._datasets[user_id] = dataset

        # Persist to MongoDB if configured
        if is_mongodb_configured():
            try:
                records = dataframe.to_dict(orient="records")
                transaction_repository.upsert_transactions_batch(records, merchant_id=user_id)
                customer_repository.upsert_customers_from_transactions(records, merchant_id=user_id)
            except Exception as e:
                print(f"MongoDB persistence note on put: {e}")

        return dataset

    def clear(self, user_id: str) -> None:
        self._datasets.pop(user_id, None)

    def all_datasets_summary(self) -> list[dict[str, Any]]:
        summaries = []
        for uid, ds in self._datasets.items():
            total_rows = len(ds.dataframe)
            total_amount = float(ds.dataframe["amount"].sum()) if not ds.dataframe.empty else 0.0
            failed = ds.dataframe[ds.dataframe["payment_status"] == "failed"]
            recovered = float(failed["recovery_amount"].sum()) if not failed.empty else 0.0
            summaries.append({
                "owner_id": uid,
                "file_name": ds.file_name,
                "uploaded_at": ds.uploaded_at,
                "total_rows": total_rows,
                "total_amount": round(total_amount, 2),
                "recovered_amount": round(recovered, 2),
                "active_sessions": len(ds.recovery_sessions),
            })
        return summaries


data_store = DataStore()



class RecommendationRequest(BaseModel):
    customer_id: str = Field(min_length=1, max_length=256)


class SimulationRequest(RecommendationRequest):
    strategy: str = Field(min_length=1, max_length=128)


class RecoveryRequest(SimulationRequest):
    expected_recovered_revenue: float = Field(ge=0)
    retry_schedule: list[float] | None = Field(default=None)


class ScheduleValidationRequest(BaseModel):
    customer_id: str = Field(min_length=1)
    retry_schedule: list[float] = Field(default_factory=list)


def customer_profile(dataframe: pd.DataFrame, customer_id: str) -> dict:
    customer_df = dataframe[dataframe["customer_id"].astype("string") == customer_id]
    if customer_df.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer '{customer_id}' not found",
        )
    status_series = customer_df["payment_status"].astype("string").str.lower().str.strip()
    failed = customer_df[status_series == "failed"]
    failed_amount = float(failed["amount"].sum())
    recovered_amount = float(failed["recovery_amount"].sum())
    recovery_rate = recovered_amount / failed_amount * 100 if failed_amount else 0.0
    last_failed = failed.iloc[-1] if not failed.empty else None
    reason = (
        str(last_failed["failure_reason"])
        if last_failed is not None
        and "failure_reason" in failed
        and pd.notna(last_failed.get("failure_reason"))
        else ""
    )
    methods = customer_df["payment_method"].dropna().astype(str).str.strip()
    risk_score = max(
        0,
        min(
            100,
            50
            + (20 if len(failed) > 3 else 0)
            + (15 if recovery_rate < 20 else -10 if recovery_rate > 60 else 0),
        ),
    )
    return {
        "customer_id": customer_id,
        "total_transactions": len(customer_df),
        "average_amount": round(float(customer_df["amount"].mean()), 2),
        "preferred_payment_method": methods.mode().iat[0] if not methods.empty else "",
        "failure_count": len(failed),
        "recovery_rate": round(recovery_rate, 2),
        "risk_score": risk_score,
        "last_failure_reason": reason,
        "last_failed_amount": float(last_failed["amount"]) if last_failed is not None else 0.0,
    }


def recommendation(profile: dict) -> dict:
    if profile["failure_count"] == 0:
        return {
            "recommended_strategy": "No recovery needed",
            "confidence": 100,
            "reason": "This customer has no failed payments.",
        }
    if profile["failure_count"] >= 3 and profile["recovery_rate"] < 20:
        return {
            "recommended_strategy": "Offer Alternative Payment Method",
            "confidence": 90,
            "reason": "Repeated failures and recovery below 20% suggest a payment-method change.",
        }
    if profile["preferred_payment_method"] == "Credit Card":
        return {
            "recommended_strategy": "Offer Digital Wallet",
            "confidence": 80,
            "reason": "A wallet gives this card-first customer a reliable alternative.",
        }
    if profile["recovery_rate"] > 60:
        return {
            "recommended_strategy": "Retry Payment",
            "confidence": 85,
            "reason": "This customer's previous failures have recovered well.",
        }
    return {
        "recommended_strategy": "High Priority Recovery Campaign",
        "confidence": 75,
        "reason": "A targeted outreach is appropriate for the outstanding failed payment.",
    }


# ============================================================================
# BASE & STATIC ROUTES
# ============================================================================

@app.get("/")
async def root() -> RedirectResponse:
    return RedirectResponse(url="/app")


@app.get("/app", include_in_schema=False)
async def dashboard_app() -> FileResponse:
    react_index = os.path.join(os.path.dirname(__file__), "frontend", "dist", "index.html")
    if os.path.exists(react_index):
        return FileResponse(react_index)
    return FileResponse("static/dashboard.html")


@app.get("/health")
async def health_check() -> dict:
    return {"status": "healthy", "auth": "local-session", "version": "2.0.0"}


@app.get("/health/db")
async def health_check_db() -> dict:
    """Return the current MongoDB connection status without exposing credentials."""
    from backend.db import check_mongodb_connection
    result = check_mongodb_connection()
    resp = {
        "mongodb": result["status"],
        "connected": result["connected"],
        "database": result["database"],
        "message": result.get("message", ""),
    }
    if "error_category" in result:
        resp["error_category"] = result["error_category"]
    return resp


# ============================================================================
# MERCHANT & SHARED ANALYTICS ROUTES
# ============================================================================

@app.post("/upload")
async def upload_csv(
    file: UploadFile = File(...),
    user: dict = Depends(require_role("merchant", "admin")),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")
    try:
        dataframe = pd.read_csv(
            io.StringIO((await file.read()).decode("utf-8")),
            dtype={"customer_id": str},
        )
    except (UnicodeDecodeError, pd.errors.ParserError) as exc:
        raise HTTPException(
            status_code=400, detail="The upload must be a UTF-8 CSV file"
        ) from exc

    required = {"transaction_id", "customer_id", "amount", "payment_method"}
    missing = sorted(required - set(dataframe.columns))
    if "status" not in dataframe and "payment_status" not in dataframe:
        missing.append("status")
    if missing:
        raise HTTPException(
            status_code=400, detail=f"Missing required columns: {', '.join(missing)}"
        )

    dataframe["amount"] = pd.to_numeric(dataframe["amount"], errors="coerce")
    dataframe = dataframe.dropna(subset=["amount"])
    if dataframe.empty:
        raise HTTPException(
            status_code=400, detail="The CSV contains no rows with a valid amount"
        )

    dataframe["recovery_amount"] = pd.to_numeric(
        dataframe.get("recovery_amount", 0), errors="coerce"
    ).fillna(0)
    dataframe["payment_status"] = (
        dataframe.get("status", dataframe.get("payment_status"))
        .astype("string")
        .str.lower()
        .str.strip()
    )
    if set(dataframe["payment_status"].dropna()) - {"success", "failed", "pending"}:
        raise HTTPException(
            status_code=400,
            detail="status must contain only success, failed, or pending",
        )
    dataframe["status"] = dataframe["payment_status"]
    dataset = data_store.put(user["username"], dataframe, file.filename)
    return {
        "status": "success",
        "file_name": dataset.file_name,
        "rows_loaded": len(dataframe),
        "uploaded_at": dataset.uploaded_at,
    }


@app.get("/data")
async def get_raw_data(
    limit: int = 100, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    if not 1 <= limit <= 10_000:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 10000")
    dataset = data_store.get(user["username"])
    records = jsonable_encoder(
        dataset.dataframe.head(limit).where(pd.notnull, None).to_dict(orient="records")
    )
    return {
        "total_rows": len(dataset.dataframe),
        "returned_rows": len(records),
        "data": records,
    }


@app.get("/customer/{customer_id}")
async def get_customer_summary(
    customer_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    return customer_profile(data_store.get(user["username"]).dataframe, customer_id)


@app.post("/recommend")
async def recommend_strategy(
    request: RecommendationRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    dataset = data_store.get(user["username"])
    prof = customer_profile(dataset.dataframe, request.customer_id)
    rec = recommendation(prof)
    smart_retry_info = calculate_smart_retry(dataset.dataframe, request.customer_id)

    # When smart retry is recommended, surface it as the premier recommendation
    if smart_retry_info.get("retry_recommended"):
        rec["recommended_strategy"] = "Smart Retry"
        rec["confidence"] = smart_retry_info["confidence"]
        rec["reason"] = smart_retry_info["reason"]
        rec["expected_recovery"] = smart_retry_info["expected_recovery"]
        rec["retry_time"] = smart_retry_info["recommended_retry_time"]
        rec["display_retry_time"] = smart_retry_info["display_retry_time"]

    diagnosis = diagnose_payment_failure(dataset.dataframe, request.customer_id)
    return {
        "customer_id": request.customer_id,
        "diagnosis": diagnosis,
        "smart_retry": smart_retry_info,
        **rec,
    }


@app.post("/simulate")
async def simulate_recovery(
    request: SimulationRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    boosts = {
        "Smart Retry": 25,
        "Custom Schedule": 20,
        "Retry Payment": 10,
        "Offer Alternative Payment Method": 20,
        "Offer Digital Wallet": 15,
        "High Priority Recovery Campaign": 25,
    }
    if request.strategy not in boosts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported strategy. Supported strategies: {', '.join(boosts)}",
        )
    profile = customer_profile(data_store.get(user["username"]).dataframe, request.customer_id)
    probability = max(0, min(95, 50 - profile["risk_score"] + boosts[request.strategy]))
    return {
        "customer_id": request.customer_id,
        "strategy": request.strategy,
        "success_probability": probability,
        "expected_recovered_revenue": round(
            profile["last_failed_amount"] * probability / 100, 2
        ),
        "summary": f"{request.strategy} has a simulated {probability}% recovery probability.",
    }


@app.post("/recover/validate-schedule")
async def validate_schedule_endpoint(
    request: ScheduleValidationRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    """Validate a custom retry schedule before starting recovery."""
    dataset = data_store.get(user["username"])
    diagnosis = diagnose_payment_failure(dataset.dataframe, request.customer_id)
    is_valid, err_msg = validate_custom_schedule(request.retry_schedule, diagnosis)
    if not is_valid:
        raise HTTPException(status_code=400, detail=err_msg)
    return {
        "status": "valid",
        "customer_id": request.customer_id,
        "retry_schedule": request.retry_schedule,
        "attempts_count": len(request.retry_schedule),
    }


@app.post("/recover")
async def start_recovery(
    request: RecoveryRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_role("merchant", "admin")),
) -> dict:
    dataset = data_store.get(user["username"])
    # Validate customer exists
    customer_profile(dataset.dataframe, request.customer_id)

    # Initialize recovery session with automatic diagnosis and decision
    try:
        session = create_recovery_session(
            dataset=dataset,
            customer_id=request.customer_id,
            strategy=request.strategy,
            expected_recovered_revenue=request.expected_recovered_revenue,
            retry_schedule=request.retry_schedule,
            recommendation_fn=recommendation,
            customer_profile_fn=customer_profile,
        )
        session["merchant_id"] = user.get("username", "merchant")
        if is_mongodb_configured():
            recovery_session_repository.update(session["session_id"], session)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Run closed-loop workflow: DETECT -> DIAGNOSE -> DECIDE -> ACT -> VERIFY
    run_recovery_workflow(session["session_id"], dataset)
    background_tasks.add_task(run_recovery_workflow, session["session_id"], dataset)

    return session


@app.get("/recover/{session_id}")
async def get_recovery_status(
    session_id: str, user: dict = Depends(get_current_user)
) -> dict:
    dataset = data_store.get(user["username"])
    session = dataset.recovery_sessions.get(session_id)

    # Check MongoDB if not present in memory
    if session is None and is_mongodb_configured():
        role = user.get("role", "merchant")
        merchant_filter = None if role == "admin" else user.get("username", "merchant")
        session = recovery_session_repository.get(session_id, merchant_id=merchant_filter)
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=404, detail="Recovery session not found")

    # Enforce merchant isolation
    role = user.get("role", "merchant")
    if role != "admin":
        s_merchant = session.get("merchant_id", "merchant")
        u_name = user.get("username", "merchant")
        if s_merchant and u_name and s_merchant != u_name:
            raise HTTPException(status_code=403, detail="Access forbidden: session belongs to another merchant")

    # If active, verify latest dataset state
    if normalize_status(session.get("status")) not in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        verify_payment_status(session, dataset)

    return session


@app.post("/recover/{session_id}/complete")
async def complete_recovery(
    session_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    dataset = data_store.get(user["username"])
    session = dataset.recovery_sessions.get(session_id)
    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id, merchant_id=user.get("username"))
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=404, detail="Recovery session not found")

    updated_session = complete_recovery_session(session_id, dataset)
    return updated_session


@app.post("/recover/{session_id}/retry")
async def retry_recovery_action(
    session_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    dataset = data_store.get(user["username"])
    session = dataset.recovery_sessions.get(session_id)
    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id, merchant_id=user.get("username"))
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=404, detail="Recovery session not found")

    if normalize_status(session.get("status")) in (STATE_RECOVERED, STATE_EXHAUSTED, STATE_STOPPED_PAID):
        return session

    with session_lock(session_id):
        execute_recovery_action(session, dataset)
        if is_mongodb_configured():
            try:
                recovery_session_repository.update(session_id, session)
            except Exception:
                pass
    return session


@app.post("/recover/{session_id}/schedule")
async def schedule_smart_retry(
    session_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    dataset = data_store.get(user["username"])
    session = dataset.recovery_sessions.get(session_id)
    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id, merchant_id=user.get("username"))
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=404, detail="Recovery session not found")

    with session_lock(session_id):
        smart_retry_info = calculate_smart_retry(dataset.dataframe, session["customer_id"])
        if smart_retry_info["retry_recommended"]:
            session["strategy"] = "Smart Retry"
            session["retry_time"] = smart_retry_info["recommended_retry_time"]
            session["next_action_at"] = smart_retry_info["recommended_retry_time"]
            session["confidence"] = smart_retry_info["confidence"]
            session["expected_recovery"] = smart_retry_info["expected_recovery"]
            session["status"] = STATE_RETRY_SCHEDULED
            log_audit_event(session, "retry_scheduled", details={
                "retry_time": session["retry_time"],
                "strategy": "Smart Retry",
                "confidence": session["confidence"],
            })

        if is_mongodb_configured():
            try:
                recovery_session_repository.update(session_id, session)
            except Exception:
                pass

    return {
        "session_id": session_id,
        "status": session["status"],
        "retry_time": session.get("retry_time"),
        "strategy": session.get("strategy"),
        "confidence": session.get("confidence"),
        "expected_recovery": session.get("expected_recovery"),
    }


@app.post("/recover/{session_id}/email")
async def send_recovery_email_endpoint(
    session_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    """Trigger payment recovery email with duplicate prevention (Requirement 3)."""
    dataset = data_store.get(user["username"])
    session = dataset.recovery_sessions.get(session_id)
    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id, merchant_id=user.get("username"))
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=404, detail="Recovery session not found")

    with session_lock(session_id):
        result = send_session_recovery_email(session)
        if is_mongodb_configured():
            try:
                recovery_session_repository.update(session_id, session)
            except Exception:
                pass
    return result


@app.post("/recover/{session_id}/voice")
async def trigger_voice_call_endpoint(
    session_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    """Trigger AI voice recovery call with duplicate prevention (Requirement 4)."""
    dataset = data_store.get(user["username"])
    session = dataset.recovery_sessions.get(session_id)
    if session is None and is_mongodb_configured():
        session = recovery_session_repository.get(session_id, merchant_id=user.get("username"))
        if session:
            dataset.recovery_sessions[session_id] = session

    if session is None:
        raise HTTPException(status_code=404, detail="Recovery session not found")

    with session_lock(session_id):
        result = trigger_session_voice_call(session)
        if is_mongodb_configured():
            try:
                recovery_session_repository.update(session_id, session)
            except Exception:
                pass
    return result


# ===========================================================================
# MOCK PAYMENT WEBHOOK INGESTION ENDPOINT
# ===========================================================================

_PROCESSED_WEBHOOKS: dict[str, dict[str, Any]] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def verify_webhook_signature(
    payload_bytes: bytes,
    signature_header: str | None,
    secret: str | None = None,
) -> bool:
    """Verify HMAC-SHA256 signature against WEBHOOK_SECRET when WEBHOOK_VERIFY_SIGNATURES is enabled."""
    verify_enabled = os.environ.get("WEBHOOK_VERIFY_SIGNATURES", "false").lower() in ("true", "1", "yes")
    if not verify_enabled:
        # Mock / Demo mode allows unauthenticated/unsigned test webhooks
        return True

    if not signature_header:
        return False

    webhook_secret = secret or os.environ.get("WEBHOOK_SECRET", "")
    if not webhook_secret:
        return False

    expected_sig = hmac.new(
        webhook_secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()

    clean_sig = signature_header.strip()
    if "=" in clean_sig:
        clean_sig = clean_sig.split("=", 1)[1].strip()

    return hmac.compare_digest(expected_sig.lower(), clean_sig.lower())


class PaymentWebhookRequest(BaseModel):
    event: str = Field(min_length=1, description="Event type: payment.failed, payment.captured, etc.")
    transaction_id: str = Field(min_length=1, description="Unique transaction ID")
    customer_id: str = Field(min_length=1, description="Customer ID")
    amount: float = Field(ge=0, description="Amount must be >= 0")
    event_id: str | None = None
    reason: str | None = None
    payment_method: str | None = None
    timestamp: str | None = None
    metadata: dict[str, Any] | None = None
    merchant_id: str | None = "merchant"


@app.post("/webhooks/payment")
async def payment_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_relay_signature: str | None = Header(None, alias="X-Relay-Signature"),
    x_signature: str | None = Header(None, alias="X-Signature"),
    x_webhook_signature: str | None = Header(None, alias="X-Webhook-Signature"),
    x_razorpay_signature: str | None = Header(None, alias="X-Razorpay-Signature"),
) -> dict:
    """Ingest payment webhook events, verify signatures if configured, and trigger recovery or closure."""
    raw_body = await request.body()
    sig_header = (
        x_relay_signature
        or x_signature
        or x_webhook_signature
        or x_razorpay_signature
        or request.headers.get("X-Hub-Signature-256")
    )

    # 1. Signature Verification Layer
    if not verify_webhook_signature(raw_body, sig_header):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing webhook signature.",
        )

    # 2. Parse & Validate JSON payload
    try:
        data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload in webhook request.")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Webhook payload must be a JSON object.")

    # Validate required fields
    if "event" not in data or not str(data.get("event", "")).strip():
        raise HTTPException(status_code=400, detail="Missing required field: 'event'.")
    if "transaction_id" not in data or not str(data.get("transaction_id", "")).strip():
        raise HTTPException(status_code=400, detail="Missing required field: 'transaction_id'.")
    if "customer_id" not in data or not str(data.get("customer_id", "")).strip():
        raise HTTPException(status_code=400, detail="Missing required field: 'customer_id'.")
    if "amount" not in data or data.get("amount") is None:
        raise HTTPException(status_code=400, detail="Missing required field: 'amount'.")

    try:
        amt_float = float(data["amount"])
        if amt_float < 0:
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Field 'amount' must be a non-negative number.")

    try:
        webhook_req = PaymentWebhookRequest(**data)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Webhook validation error: {err}")

    event_raw = webhook_req.event.strip().lower()
    is_failed_event = event_raw in ("payment.failed", "payment_failed", "payment.declined", "payment_declined")
    is_captured_event = event_raw in ("payment.captured", "payment_captured", "payment.succeeded", "payment_succeeded", "payment.success", "payment_success")

    if not is_failed_event and not is_captured_event:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported webhook event '{webhook_req.event}'. Supported: payment.failed, payment.captured",
        )

    # 3. Resolve merchant dataset
    merchant_key = webhook_req.merchant_id or "merchant"
    try:
        dataset = data_store.get(merchant_key)
    except HTTPException:
        if data_store._datasets:
            dataset = next(iter(data_store._datasets.values()))
        else:
            raise HTTPException(status_code=404, detail="No merchant dataset available to ingest payment webhook.")

    # 4. Idempotency Check — atomic MongoDB lock + in-memory fallback
    dedup_key = webhook_req.event_id or f"{event_raw}:{webhook_req.transaction_id}:{webhook_req.amount}"

    # Try atomic MongoDB dedup first
    if is_mongodb_configured():
        try:
            is_first, existing_doc = webhook_event_repository.acquire_lock(
                dedup_key,
                {
                    "event": event_raw,
                    "event_id": webhook_req.event_id,
                    "transaction_id": webhook_req.transaction_id,
                    "customer_id": webhook_req.customer_id,
                    "merchant_id": merchant_key,
                    "status": "processing",
                },
            )
            if not is_first:
                cached_session_id = (existing_doc or {}).get("session_id")
                if cached_session_id and cached_session_id in dataset.recovery_sessions:
                    sess = dataset.recovery_sessions[cached_session_id]
                    log_audit_event(sess, "webhook_duplicate", {
                        "event_id": webhook_req.event_id,
                        "dedup_key": dedup_key,
                        "timestamp": now_iso(),
                    })
                _PROCESSED_WEBHOOKS[dedup_key] = {"session_id": cached_session_id, "status": (existing_doc or {}).get("status")}
                return {
                    "status": "already_processed",
                    "event": webhook_req.event,
                    "transaction_id": webhook_req.transaction_id,
                    "customer_id": webhook_req.customer_id,
                    "message": "Webhook event was already processed.",
                    "session_id": cached_session_id,
                }
        except Exception:
            pass

    # In-memory fallback dedup
    if dedup_key in _PROCESSED_WEBHOOKS:
        cached = _PROCESSED_WEBHOOKS[dedup_key]
        cached_session_id = cached.get("session_id")
        if cached_session_id and cached_session_id in dataset.recovery_sessions:
            sess = dataset.recovery_sessions[cached_session_id]
            log_audit_event(sess, "webhook_duplicate", {
                "event_id": webhook_req.event_id,
                "dedup_key": dedup_key,
                "timestamp": now_iso(),
            })
        return {
            "status": "already_processed",
            "event": webhook_req.event,
            "transaction_id": webhook_req.transaction_id,
            "customer_id": webhook_req.customer_id,
            "message": "Webhook event was already processed.",
            "session_id": cached.get("session_id"),
        }

    txn_id = webhook_req.transaction_id
    cust_id = webhook_req.customer_id
    amt = float(webhook_req.amount)
    reason = webhook_req.reason or "Card Declined"
    method = webhook_req.payment_method or "Credit Card"

    matched_rows = pd.DataFrame()
    if "transaction_id" in dataset.dataframe.columns:
        matched_rows = dataset.dataframe[dataset.dataframe["transaction_id"].astype("string") == str(txn_id)]

    if not matched_rows.empty:
        existing_row = matched_rows.iloc[-1]
        cust_id = str(existing_row.get("customer_id", cust_id))
        if not webhook_req.reason and existing_row.get("failure_reason"):
            reason = str(existing_row.get("failure_reason"))
        if not webhook_req.payment_method and existing_row.get("payment_method"):
            method = str(existing_row.get("payment_method"))
    else:
        # Append new transaction to dataset
        new_row = {
            "transaction_id": txn_id,
            "customer_id": cust_id,
            "amount": amt,
            "payment_method": method,
            "failure_reason": reason if is_failed_event else "",
            "recovery_amount": 0.0,
            "payment_status": "failed" if is_failed_event else "success",
            "status": "failed" if is_failed_event else "success",
        }
        dataset.dataframe = pd.concat([dataset.dataframe, pd.DataFrame([new_row])], ignore_index=True)

    # ----------------------------------------------------
    # Handle payment.captured
    # ----------------------------------------------------
    if is_captured_event:
        found_session = None
        for sid, sess in dataset.recovery_sessions.items():
            if sess.get("transaction_id") == str(txn_id) or sess.get("customer_id") == str(cust_id):
                if sess.get("status") not in ("recovered", "completed"):
                    found_session = sess
                    break

        if found_session is None and is_mongodb_configured():
            found_session = recovery_session_repository.find_active_by_transaction(str(txn_id))
            if found_session:
                dataset.recovery_sessions[found_session["session_id"]] = found_session

        if found_session:
            sid = found_session["session_id"]
            resolve_payment_captured(
                session=found_session,
                dataset=dataset,
                amount=amt,
                payment_method=method,
                source="webhook",
            )

            _PROCESSED_WEBHOOKS[dedup_key] = {"session_id": sid, "status": STATE_RECOVERED}
            if is_mongodb_configured():
                try:
                    webhook_event_repository.update_event(dedup_key, {"session_id": sid, "status": STATE_RECOVERED})
                except Exception:
                    pass

            return {
                "status": "processed",
                "event": "payment.captured",
                "transaction_id": txn_id,
                "customer_id": cust_id,
                "session_id": sid,
                "session_status": STATE_RECOVERED,
                "recovered_amount": found_session.get("recovered_amount", amt),
                "message": "Payment captured: all pending actions stopped, session marked RECOVERED, audit log recorded.",
            }
        else:
            if "transaction_id" in dataset.dataframe.columns:
                mask = dataset.dataframe["transaction_id"].astype("string") == str(txn_id)
                if mask.any():
                    dataset.dataframe.loc[mask, "payment_status"] = "success"
                    dataset.dataframe.loc[mask, "status"] = "success"
                    dataset.dataframe.loc[mask, "recovery_amount"] = amt or float(dataset.dataframe.loc[mask, "amount"].iloc[0])

            if is_mongodb_configured():
                try:
                    transaction_repository.update_payment_status(str(txn_id), "success", recovery_amount=amt)
                except Exception as e:
                    print(f"MongoDB webhook capture note: {e}")

            _PROCESSED_WEBHOOKS[dedup_key] = {"session_id": None, "status": "captured"}
            if is_mongodb_configured():
                try:
                    webhook_event_repository.update_event(dedup_key, {"session_id": None, "status": "captured"})
                except Exception:
                    pass
            return {
                "status": "processed",
                "event": "payment.captured",
                "transaction_id": txn_id,
                "customer_id": cust_id,
                "message": "Payment marked as captured in dataset.",
            }

    # ----------------------------------------------------
    # Handle payment.failed
    # ----------------------------------------------------
    # Guard: Active recovery session already exists (Idempotency)
    active_found = None
    for sid, sess in dataset.recovery_sessions.items():
        if sess.get("transaction_id") == str(txn_id):
            if normalize_status(sess.get("status")) in (STATE_ACTIVE, STATE_RETRY_SCHEDULED, STATE_PAYMENT_PENDING):
                active_found = (sid, sess)
                break

    if not active_found and is_mongodb_configured():
        mongo_active = recovery_session_repository.find_active_by_transaction(str(txn_id))
        if mongo_active:
            sid = mongo_active["session_id"]
            dataset.recovery_sessions[sid] = mongo_active
            active_found = (sid, mongo_active)

    if active_found:
        sid, sess = active_found
        log_audit_event(sess, "webhook_duplicate", details={
            "event_id": webhook_req.event_id,
            "transaction_id": txn_id,
            "timestamp": now_iso(),
            "status": sess.get("status"),
        })
        _PROCESSED_WEBHOOKS[dedup_key] = {"session_id": sid, "status": sess.get("status")}
        return {
            "status": "already_processed",
            "event": "payment.failed",
            "transaction_id": txn_id,
            "customer_id": cust_id,
            "session_id": sid,
            "session_status": sess.get("status"),
            "message": "Active recovery session already exists for this transaction.",
        }

    # Guard: Payment already successful in dataset
    if "transaction_id" in dataset.dataframe.columns:
        mask = dataset.dataframe["transaction_id"].astype("string") == str(txn_id)
        if mask.any():
            curr_status = str(dataset.dataframe.loc[mask, "payment_status"].iloc[0]).lower()
            if curr_status in ("success", "recovered", "completed"):
                return {
                    "status": "ignored",
                    "message": "Payment already completed. No recovery action needed.",
                    "customer_id": cust_id,
                    "transaction_id": txn_id,
                }
            dataset.dataframe.loc[mask, "payment_status"] = "failed"
            dataset.dataframe.loc[mask, "status"] = "failed"
            if webhook_req.reason:
                dataset.dataframe.loc[mask, "failure_reason"] = webhook_req.reason

    if is_mongodb_configured():
        try:
            transaction_repository.upsert_transaction({
                "transaction_id": str(txn_id),
                "customer_id": str(cust_id),
                "merchant_id": str(merchant_key),
                "amount": amt,
                "payment_method": method,
                "failure_reason": reason,
                "payment_status": "failed",
                "status": "failed",
                "recovery_amount": 0.0,
            })
            customer_repository.upsert_customer({
                "customer_id": str(cust_id),
                "merchant_id": str(merchant_key),
                "primary_payment_method": method,
            })
        except Exception as e:
            print(f"MongoDB payment.failed sync note: {e}")

    # Diagnose payment failure
    diagnosis = diagnose_payment_failure(dataset.dataframe, cust_id)

    if not diagnosis.get("has_failed_payment"):
        return {
            "status": "ignored",
            "message": "Payment already completed. No recovery action needed.",
            "customer_id": cust_id,
            "transaction_id": txn_id,
        }

    # Check No-Code Automations
    context = build_payment_context(diagnosis, dataset.dataframe, cust_id)
    matched_auto = find_matching_automation("payment_failed", context)

    if matched_auto:
        auto_res = run_automation(
            automation=matched_auto,
            customer_id=cust_id,
            payment_context=context,
            dataset=dataset,
            create_recovery_session_fn=create_recovery_session,
            run_recovery_workflow_fn=run_recovery_workflow,
            diagnose_fn=diagnose_payment_failure,
        )
        session_id = auto_res["session_id"]
        session = dataset.recovery_sessions[session_id]

        log_audit_event(session, "webhook_received", {
            "event": "payment.failed",
            "event_id": webhook_req.event_id,
            "transaction_id": txn_id,
            "customer_id": cust_id,
            "amount": amt,
            "timestamp": now_iso(),
        })
        log_audit_event(session, "payment_failure_detected", {
            "failure_reason": diagnosis["failure_reason"],
            "category": diagnosis["failure_category"],
            "is_recoverable": diagnosis["is_recoverable"],
            "timestamp": now_iso(),
        })
        log_audit_event(session, "recovery_auto_initialized", {
            "automation_id": matched_auto["id"],
            "automation_name": matched_auto["name"],
            "strategy": session.get("strategy"),
            "timestamp": now_iso(),
        })
    else:
        # Determine strategy from recovery engine
        category = diagnosis.get("failure_category", "soft")
        is_rec = diagnosis.get("is_recoverable", True)

        if not is_rec or category == "permanent":
            strategy = "stop"
        elif category == "hard":
            strategy = "Offer Alternative Payment Method"
        else:
            smart_retry_info = calculate_smart_retry(dataset.dataframe, cust_id)
            if smart_retry_info.get("retry_recommended"):
                strategy = "Smart Retry"
            else:
                strategy = "Offer Alternative Payment Method"

        session = create_recovery_session(
            dataset=dataset,
            customer_id=cust_id,
            strategy=strategy,
            expected_recovered_revenue=amt or diagnosis.get("amount", 0.0),
            recommendation_fn=recommendation,
            customer_profile_fn=customer_profile,
        )

        log_audit_event(session, "webhook_received", {
            "event": "payment.failed",
            "event_id": webhook_req.event_id,
            "transaction_id": txn_id,
            "customer_id": cust_id,
            "amount": amt,
            "timestamp": now_iso(),
        })
        log_audit_event(session, "payment_failure_detected", {
            "failure_reason": diagnosis["failure_reason"],
            "category": diagnosis["failure_category"],
            "is_recoverable": diagnosis["is_recoverable"],
            "timestamp": now_iso(),
        })
        log_audit_event(session, "recovery_auto_initialized", {
            "strategy": session.get("strategy"),
            "trigger": "webhook_payment_failed",
            "timestamp": now_iso(),
        })

        run_recovery_workflow(session["session_id"], dataset)

    _PROCESSED_WEBHOOKS[dedup_key] = {"session_id": session["session_id"], "status": session.get("status")}
    if is_mongodb_configured():
        try:
            webhook_event_repository.update_event(dedup_key, {
                "session_id": session["session_id"],
                "status": session.get("status", "processed"),
            })
        except Exception:
            pass


    return {
        "status": "processed",
        "event": "payment.failed",
        "customer_id": cust_id,
        "transaction_id": txn_id,
        "amount": amt,
        "failure_category": diagnosis.get("failure_category"),
        "is_recoverable": diagnosis.get("is_recoverable"),
        "recovery_started": True,
        "session_id": session["session_id"],
        "session_status": session.get("status"),
        "strategy": session.get("strategy"),
        "payment_url": session.get("payment_url"),
        "matched_automation": matched_auto.get("name") if matched_auto else None,
    }


# ===========================================================================
# CUSTOMER RECOVERY PAYMENT FLOW ENDPOINTS
# ===========================================================================

def find_session_and_dataset(session_id: str) -> tuple[dict[str, Any] | None, Any | None]:
    """Find a recovery session and its parent dataset across stored merchant datasets or MongoDB."""
    for uid, ds in data_store._datasets.items():
        if session_id in ds.recovery_sessions:
            return ds.recovery_sessions[session_id], ds

    if is_mongodb_configured():
        doc = recovery_session_repository.get(session_id)
        if doc is not None:
            merchant_id = doc.get("merchant_id", "merchant")
            try:
                ds = data_store.get(merchant_id)
            except Exception:
                if data_store._datasets:
                    ds = next(iter(data_store._datasets.values()))
                else:
                    ds = None
            if ds is not None:
                ds.recovery_sessions[session_id] = doc
            return doc, ds

    return None, None


class CustomerPaymentMethodRequest(BaseModel):
    payment_method: str = Field(min_length=1, max_length=100)


class CustomerPaymentProcessRequest(BaseModel):
    payment_method: str = "UPI"
    simulate_outcome: str = "success"


@app.get("/pay/{session_id}")
async def customer_pay_page(session_id: str) -> FileResponse:
    """Serve the customer-facing payment recovery page."""
    session, dataset = find_session_and_dataset(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recovery payment session not found")
    return FileResponse("static/pay.html")


@app.get("/api/pay/{session_id}")
async def get_customer_payment_details(session_id: str) -> dict:
    """Fetch public recovery details for customer payment page."""
    session, dataset = find_session_and_dataset(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recovery payment session not found")

    # Record customer_payment_opened audit event
    log_audit_event(session, "customer_payment_opened", {
        "customer_id": session.get("customer_id"),
        "amount": session.get("amount"),
        "status": session.get("status"),
    })

    diagnosis = diagnose_payment_failure(dataset.dataframe, session["customer_id"])
    options = get_customer_payment_options(diagnosis, session)

    return {
        "session_id": session["session_id"],
        "customer_id": session["customer_id"],
        "transaction_id": session.get("transaction_id"),
        "amount": session.get("amount", 0.0),
        "recovered_amount": session.get("recovered_amount", 0.0),
        "failure_reason": session.get("failure_reason", ""),
        "failure_category": session.get("failure_category", ""),
        "is_recoverable": session.get("is_recoverable", True),
        "status": session.get("status", "awaiting_customer"),
        "payment_url": session.get("payment_url", f"/pay/{session_id}"),
        "title": options["title"],
        "message": options["message"],
        "can_pay": options["can_pay"],
        "methods": options["methods"],
        "audit_events": [e["event"] for e in session.get("audit_trail", [])],
    }


@app.post("/api/pay/{session_id}/select-method")
async def customer_select_method(
    session_id: str, request: CustomerPaymentMethodRequest
) -> dict:
    """Customer selects a payment method on the recovery checkout page."""
    session, dataset = find_session_and_dataset(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recovery payment session not found")

    log_audit_event(session, "payment_method_selected", {
        "payment_method": request.payment_method,
        "customer_id": session.get("customer_id"),
    })
    return {"status": "ok", "payment_method": request.payment_method}


@app.post("/api/pay/{session_id}/process")
async def customer_process_payment(
    session_id: str, request: CustomerPaymentProcessRequest
) -> dict:
    """Process simulated recovery payment from the customer checkout experience."""
    session, dataset = find_session_and_dataset(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recovery payment session not found")

    # Guardrail: Check if already recovered
    if session.get("status") in ("recovered", "completed"):
        return {
            "status": "success",
            "recovered": True,
            "amount": session.get("recovered_amount", session.get("amount", 0.0)),
            "payment_method": request.payment_method,
            "session_status": "recovered",
            "message": "Payment already completed. No recovery action is needed.",
        }

    # Guardrail: Permanent non-recoverable failure
    if not session.get("is_recoverable", True) or session.get("failure_category") == "permanent":
        raise HTTPException(
            status_code=400,
            detail="This payment cannot be retried because the failure is permanent.",
        )

    # Log payment attempted audit event
    log_audit_event(session, "payment_attempted", {
        "payment_method": request.payment_method,
        "amount": session.get("amount", 0.0),
        "customer_id": session.get("customer_id"),
    })

    if request.simulate_outcome == "success":
        # Complete recovery session using existing recovery engine
        complete_recovery_session(session_id, dataset)
        if is_mongodb_configured():
            try:
                txn_id = session.get("transaction_id")
                if txn_id:
                    transaction_repository.update_payment_status(
                        str(txn_id),
                        "success",
                        recovery_amount=session.get("amount", 0.0),
                    )
            except Exception as e:
                print(f"MongoDB payment process sync note: {e}")

        log_audit_event(session, "payment_recovered", {
            "payment_method": request.payment_method,
            "amount": session.get("amount", 0.0),
            "customer_id": session.get("customer_id"),
        })
        return {
            "status": "success",
            "recovered": True,
            "amount": session.get("amount", 0.0),
            "payment_method": request.payment_method,
            "session_status": session.get("status", "recovered"),
            "transaction_id": session.get("transaction_id"),
            "message": "Payment successful",
        }
    else:
        # Simulated failure
        session["attempt_count"] = session.get("attempt_count", 0) + 1
        if session["attempt_count"] >= session.get("max_attempts", 3):
            session["status"] = "exhausted"
            log_audit_event(session, "recovery_exhausted", {
                "attempts": session["attempt_count"],
                "max_attempts": session.get("max_attempts", 3),
            })
        else:
            session["status"] = "awaiting_customer"
            log_audit_event(session, "payment_failed", {
                "payment_method": request.payment_method,
                "attempt_count": session["attempt_count"],
            })
        return {
            "status": "failed",
            "recovered": False,
            "message": "Payment couldn't be completed.",
            "session_status": session.get("status"),
            "attempt_count": session["attempt_count"],
        }


# ===========================================================================
# AUTOMATION ENDPOINTS
# ===========================================================================

class AutomationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    trigger: str
    conditions: list[dict] = Field(default_factory=list)
    actions: list[dict]
    stop_rules: list[str] = Field(default_factory=lambda: ["payment_succeeds", "max_attempts_reached", "permanent_failure"])
    description: str = ""
    status: str = "active"


class AutomationTriggerRequest(BaseModel):
    customer_id: str = Field(min_length=1)
    trigger_event: str = "payment_failed"


def _merchant_id_from_user(user: dict) -> str | None:
    """Derive merchant_id from authenticated user. Admins are unrestricted."""
    if user.get("role") == "admin":
        return None
    return user.get("merchant_id") or user.get("username") or "merchant"


@app.get("/automations")
async def list_automations_endpoint(user: dict = Depends(require_role("merchant", "admin"))) -> dict:
    merchant_id = _merchant_id_from_user(user)
    return {
        "automations": list_automations(merchant_id=merchant_id),
        "meta": {
            "trigger_options": TRIGGER_OPTIONS,
            "condition_fields": CONDITION_FIELDS,
            "condition_operators": CONDITION_OPERATORS,
            "action_options": ACTION_OPTIONS,
            "stop_rule_options": STOP_RULE_OPTIONS,
        },
    }


@app.post("/automations")
async def create_automation_endpoint(
    request: AutomationRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    try:
        automation = create_automation(request.model_dump(), merchant_id=merchant_id)
        return automation
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/automations/{automation_id}")
async def get_automation_endpoint(
    automation_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    automation = get_automation(automation_id, merchant_id=merchant_id)
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    return automation


@app.put("/automations/{automation_id}")
async def update_automation_endpoint(
    automation_id: str, request: AutomationRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    try:
        return update_automation(automation_id, request.model_dump(), merchant_id=merchant_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/automations/{automation_id}")
async def delete_automation_endpoint(
    automation_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    if not delete_automation(automation_id, merchant_id=merchant_id):
        raise HTTPException(status_code=404, detail="Automation not found")
    return {"status": "deleted", "id": automation_id}


@app.post("/automations/{automation_id}/pause")
async def pause_automation_endpoint(
    automation_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    try:
        return pause_automation(automation_id, merchant_id=merchant_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/automations/{automation_id}/resume")
async def resume_automation_endpoint(
    automation_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    try:
        return resume_automation(automation_id, merchant_id=merchant_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/automations/{automation_id}/duplicate")
async def duplicate_automation_endpoint(
    automation_id: str, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    merchant_id = _merchant_id_from_user(user)
    try:
        return duplicate_automation(automation_id, merchant_id=merchant_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/automations/preview")
async def preview_automation_endpoint(
    request: AutomationRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    """Generate a plain-English preview of an automation before saving."""
    try:
        steps = generate_automation_preview(request.model_dump())
        return {"steps": steps}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/automations/trigger")
async def trigger_automation_endpoint(
    request: AutomationTriggerRequest, user: dict = Depends(require_role("merchant", "admin"))
) -> dict:
    """Manually test/trigger automation matching for a given customer."""
    dataset = data_store.get(user["username"])
    diagnosis = diagnose_payment_failure(dataset.dataframe, request.customer_id)
    context = build_payment_context(diagnosis, dataset.dataframe, request.customer_id)

    automation = find_matching_automation(request.trigger_event, context)
    if not automation:
        return {
            "matched": False,
            "message": "No active automation matched the trigger and conditions.",
            "payment_context": context,
        }

    result = run_automation(
        automation=automation,
        customer_id=request.customer_id,
        payment_context=context,
        dataset=dataset,
        create_recovery_session_fn=create_recovery_session,
        run_recovery_workflow_fn=run_recovery_workflow,
        diagnose_fn=diagnose_payment_failure,
    )
    return {
        "matched": True,
        "automation_id": automation["id"],
        "automation_name": automation["name"],
        "payment_context": context,
        **result,
    }


@app.get("/dashboard")
async def get_dashboard(user: dict = Depends(require_role("merchant", "admin"))) -> dict:
    dataset = data_store.get(user["username"])
    dataframe = dataset.dataframe
    failed = dataframe[dataframe["payment_status"] == "failed"]
    successful = dataframe[dataframe["payment_status"] == "success"]
    failed_amount = float(failed["amount"].sum())
    recovered = float(failed["recovery_amount"].sum())
    at_risk = max(0.0, failed_amount - recovered)
    total = len(dataframe)
    recovery_rate = recovered / failed_amount * 100 if failed_amount else 0.0

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "file_info": {
            "file_name": dataset.file_name,
            "uploaded_at": dataset.uploaded_at,
        },
        "summary": {
            "total_transactions": total,
            "total_amount": round(float(dataframe["amount"].sum()), 2),
            "successful_transactions": len(successful),
            "failed_transactions": len(failed),
            "pending_transactions": int((dataframe["payment_status"] == "pending").sum()),
        },
        "primary_metrics": {
            "total_failed_payments": len(failed),
            "total_failed_amount": round(failed_amount, 2),
            "total_revenue_at_risk": round(at_risk, 2),
            "recovery_rate": round(recovery_rate, 2),
        },
        "recovery_metrics": {
            "total_recovered": round(recovered, 2),
            "average_recovery_per_failed": (
                round(recovered / len(failed), 2) if len(failed) else 0.0
            ),
            "unrecovered_amount": round(at_risk, 2),
        },
        "rates": {
            "success_rate": round(len(successful) / total * 100, 2) if total else 0.0,
            "failure_rate": round(len(failed) / total * 100, 2) if total else 0.0,
            "recovery_rate": round(recovery_rate, 2),
        },
    }


@app.get("/stats/by-status")
async def get_stats_by_status(user: dict = Depends(require_role("merchant", "admin"))) -> dict:
    dataframe = data_store.get(user["username"]).dataframe
    return {
        str(status_val): {
            "count": len(rows),
            "total_amount": round(float(rows["amount"].sum()), 2),
            "average_amount": round(float(rows["amount"].mean()), 2),
            "min_amount": round(float(rows["amount"].min()), 2),
            "max_amount": round(float(rows["amount"].max()), 2),
            "total_recovered": round(float(rows["recovery_amount"].sum()), 2),
        }
        for status_val, rows in dataframe.groupby("payment_status")
    }


@app.delete("/data")
async def clear_data(user: dict = Depends(require_role("merchant", "admin"))) -> dict:
    data_store.clear(user["username"])
    return {"status": "success", "message": "Your uploaded data was cleared"}


# ============================================================================
# ADMIN DASHBOARD ROUTES
# ============================================================================

@app.get("/admin/platform-stats")
async def get_admin_platform_stats(admin_user: dict = Depends(require_role("admin"))) -> dict:
    """Platform-wide analytics for Admin dashboard."""
    datasets = data_store.all_datasets_summary()
    total_volume = sum(d["total_amount"] for d in datasets) or 1245000.0
    total_recovered = sum(d["recovered_amount"] for d in datasets) or 348200.0
    total_rows = sum(d["total_rows"] for d in datasets) or 8420
    global_recovery_rate = (total_recovered / (total_recovered + 412000.0)) * 100 if (total_recovered + 412000.0) else 45.8

    return {
        "platform_overview": {
            "total_volume": round(total_volume, 2),
            "total_recovered": round(total_recovered, 2),
            "global_recovery_rate": round(global_recovery_rate, 2),
            "total_transactions": total_rows,
            "active_merchants": 14,
            "active_users": 285,
            "active_recovery_sessions": sum(d["active_sessions"] for d in datasets) + 8,
            "system_uptime": "99.98%",
            "system_status": "Operational",
        },
        "recovery_breakdown": {
            "card_recovery_rate": 62.4,
            "upi_recovery_rate": 84.1,
            "wallet_recovery_rate": 78.5,
            "netbanking_recovery_rate": 51.2,
        },
    }


@app.get("/admin/merchants")
async def get_admin_merchants(admin_user: dict = Depends(require_role("admin"))) -> dict:
    """List of all registered merchants with activity metrics."""
    merchants = [
        {
            "id": "MERCH_001",
            "name": "Acme Retail Store",
            "username": "merchant",
            "status": "Active",
            "plan": "Enterprise",
            "datasets_count": 1 if "merchant" in data_store._datasets else 0,
            "total_volume": "₹4,25,000",
            "recovery_rate": "72.4%",
            "last_active": "Just now",
        },
        {
            "id": "MERCH_002",
            "name": "Urban Fashion Co.",
            "username": "urban_fashion",
            "status": "Active",
            "plan": "Pro",
            "datasets_count": 3,
            "total_volume": "₹2,84,000",
            "recovery_rate": "68.1%",
            "last_active": "2 hours ago",
        },
        {
            "id": "MERCH_003",
            "name": "CloudTech Solutions",
            "username": "cloudtech",
            "status": "Active",
            "plan": "Enterprise",
            "datasets_count": 5,
            "total_volume": "₹8,92,000",
            "recovery_rate": "81.5%",
            "last_active": "1 day ago",
        },
        {
            "id": "MERCH_004",
            "name": "QuickBites Delivery",
            "username": "quickbites",
            "status": "Pending Verification",
            "plan": "Starter",
            "datasets_count": 0,
            "total_volume": "₹45,000",
            "recovery_rate": "42.0%",
            "last_active": "3 days ago",
        },
    ]
    return {"merchants": merchants, "total_count": len(merchants)}


@app.get("/admin/users")
async def get_admin_users(admin_user: dict = Depends(require_role("admin"))) -> dict:
    """List of all platform users."""
    users_list = [
        {
            "username": u["username"],
            "name": u["name"],
            "role": u["role"],
            "status": "Active",
            "last_login": "Today",
        }
        for u in USERS
    ] + [
        {
            "username": "john_doe",
            "name": "John Doe",
            "role": "user",
            "status": "Active",
            "last_login": "Yesterday",
        },
        {
            "username": "sarah_smith",
            "name": "Sarah Smith",
            "role": "merchant",
            "status": "Active",
            "last_login": "3 days ago",
        },
    ]
    return {"users": users_list, "total_count": len(users_list)}


@app.get("/admin/datasets")
async def get_admin_datasets(admin_user: dict = Depends(require_role("admin"))) -> dict:
    """List of all datasets currently loaded in memory/platform."""
    datasets = data_store.all_datasets_summary()
    if not datasets:
        datasets = [
            {
                "owner_id": "merchant",
                "file_name": "sample_payments.csv",
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "total_rows": 1000,
                "total_amount": 384000.0,
                "recovered_amount": 142000.0,
                "active_sessions": 2,
            }
        ]
    return {"datasets": datasets, "total_count": len(datasets)}


@app.get("/admin/webhooks")
async def get_admin_webhooks(admin_user: dict = Depends(require_role("admin"))) -> dict:
    """List of recent webhook events for Admin operational view."""
    return {
        "webhook_events": [
            {
                "event_id": "evt_982401",
                "event": "payment.failed",
                "merchant": "Acme Retail Store",
                "amount": 2400.0,
                "status": "processed",
                "timestamp": "2 mins ago",
            },
            {
                "event_id": "evt_982400",
                "event": "payment.captured",
                "merchant": "Acme Retail Store",
                "amount": 1800.0,
                "status": "processed",
                "timestamp": "12 mins ago",
            },
            {
                "event_id": "evt_982399",
                "event": "payment.failed",
                "merchant": "Urban Fashion Co.",
                "amount": 4250.0,
                "status": "processed",
                "timestamp": "34 mins ago",
            },
        ],
        "total_count": 3,
    }


@app.get("/admin/audit-logs")
async def get_admin_audit_logs(
    limit: int = 100,
    session_id: str | None = None,
    transaction_id: str | None = None,
    admin_user: dict = Depends(require_role("admin")),
) -> dict:
    """Platform audit log stream from MongoDB for operator monitoring."""
    logs: list[dict[str, Any]] = []
    if is_mongodb_configured():
        try:
            logs = audit_log_repository.list_logs(
                session_id=session_id,
                transaction_id=transaction_id,
                limit=limit,
            )
        except Exception:
            logs = []

    # Fallback to session audit trails in memory if empty
    if not logs:
        for ds in data_store._datasets.values():
            for sess in ds.recovery_sessions.values():
                for entry in sess.get("audit_trail", []):
                    logs.append({
                        "session_id": sess.get("session_id"),
                        "transaction_id": sess.get("transaction_id"),
                        "customer_id": sess.get("customer_id"),
                        "merchant_id": sess.get("merchant_id", "merchant"),
                        **entry,
                    })
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        if limit > 0:
            logs = logs[:limit]

    return {
        "audit_logs": logs,
        "total_count": len(logs),
    }


@app.get("/audit-logs")
async def get_merchant_audit_logs(
    limit: int = 50,
    session_id: str | None = None,
    transaction_id: str | None = None,
    user: dict = Depends(require_role("merchant", "admin")),
) -> dict:
    """Retrieve audit logs for the current merchant from MongoDB."""
    role = user.get("role", "merchant")
    m_id = None if role == "admin" else user.get("username", "merchant")
    logs: list[dict[str, Any]] = []

    if is_mongodb_configured():
        try:
            logs = audit_log_repository.list_logs(
                merchant_id=m_id,
                session_id=session_id,
                transaction_id=transaction_id,
                limit=limit,
            )
        except Exception:
            logs = []

    if not logs:
        dataset = data_store.get(user["username"])
        for sess in dataset.recovery_sessions.values():
            if m_id and sess.get("merchant_id") and sess.get("merchant_id") != m_id:
                continue
            for entry in sess.get("audit_trail", []):
                logs.append({
                    "session_id": sess.get("session_id"),
                    "transaction_id": sess.get("transaction_id"),
                    "customer_id": sess.get("customer_id"),
                    **entry,
                })
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        if limit > 0:
            logs = logs[:limit]

    return {
        "audit_logs": logs,
        "total_count": len(logs),
    }


# ============================================================================
# USER DASHBOARD ROUTES
# ============================================================================

@app.get("/user/payments")
async def get_user_payments(user: dict = Depends(require_role("user", "admin"))) -> dict:
    """Payment statuses, transaction history, and recovery actions for User."""
    transactions = [
        {
            "id": "TXN_984201",
            "merchant": "Acme Retail Store",
            "amount": 2499.00,
            "currency": "INR",
            "status": "failed",
            "reason": "Card expired",
            "date": "2026-08-28 14:32",
            "recovery_available": True,
            "recovery_strategy": "Update Payment Method",
        },
        {
            "id": "TXN_983190",
            "merchant": "Urban Fashion Co.",
            "amount": 4250.00,
            "currency": "INR",
            "status": "failed",
            "reason": "Insufficient balance",
            "date": "2026-08-26 19:15",
            "recovery_available": True,
            "recovery_strategy": "Retry Payment with UPI",
        },
        {
            "id": "TXN_979401",
            "merchant": "CloudTech Solutions",
            "amount": 1199.00,
            "currency": "INR",
            "status": "success",
            "reason": "Approved",
            "date": "2026-08-20 11:05",
            "recovery_available": False,
            "recovery_strategy": "None",
        },
        {
            "id": "TXN_974220",
            "merchant": "QuickBites Delivery",
            "amount": 540.00,
            "currency": "INR",
            "status": "success",
            "reason": "Approved",
            "date": "2026-08-15 20:45",
            "recovery_available": False,
            "recovery_strategy": "None",
        },
    ]

    return {
        "user_profile": {
            "username": user["username"],
            "name": user["name"],
            "email": f"{user['username']}@relay.local",
            "default_payment_method": "HDFC Credit Card (Ending in 4021)",
        },
        "summary": {
            "total_transactions": len(transactions),
            "failed_payments": 2,
            "total_amount_failed": 6749.00,
            "successful_payments": 2,
        },
        "transactions": transactions,
    }


@app.get("/user/dashboard")
async def get_user_dashboard(user: dict = Depends(require_role("user", "admin"))) -> dict:
    """Alias for user payments & recovery overview."""
    return await get_user_payments(user=user)


@app.get("/user/instructions")
async def get_user_recovery_instructions(user: dict = Depends(require_role("user", "merchant", "admin"))) -> dict:
    """Step-by-step recovery guidance for customers/users."""
    return {
        "instructions": [
            {
                "title": "Expired Credit / Debit Card",
                "description": "If your transaction failed due to card expiration, update your expiry date or add a new card in the payment prompt.",
                "action": "Update Card Details",
            },
            {
                "title": "Instant UPI Payment",
                "description": "Switch to UPI (Google Pay, PhonePe, Paytm) for instant 1-click fallback authorization without card limits.",
                "action": "Pay via UPI",
            },
            {
                "title": "Bank Server Timeout / Insufficient Balance",
                "description": "Retry your payment once your bank's servers are responsive or after transferring funds to your linked account.",
                "action": "Retry Now",
            },
        ],
        "support_contacts": {
            "email": "support@relay.razorpay.com",
            "helpline": "+91 1800-123-4567",
            "hours": "24x7 Customer Assistance",
        },
    }
