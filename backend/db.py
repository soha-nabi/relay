"""MongoDB connection management and repository adapter foundation.

Provides lightweight MongoDB access with automatic in-memory fallback.
Phase 2 adds Transaction and Customer repositories for MongoDB persistence.
"""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
from typing import Any
import uuid
import pandas as pd

# ---------------------------------------------------------------------------
# Centralized Environment Configuration
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv

    _root_env = Path(__file__).resolve().parent.parent / ".env"
    if _root_env.is_file() and "PYTEST_CURRENT_TEST" not in os.environ:
        load_dotenv(dotenv_path=_root_env)
except ImportError:
    pass

try:
    from pymongo import MongoClient, UpdateOne
    from pymongo.errors import ConnectionFailure, DuplicateKeyError, PyMongoError
    PYMONGO_AVAILABLE = True
except ImportError:
    MongoClient = None
    UpdateOne = None
    ConnectionFailure = Exception
    DuplicateKeyError = Exception
    PyMongoError = Exception
    PYMONGO_AVAILABLE = False


# ---------------------------------------------------------------------------
# Global Client Singleton
# ---------------------------------------------------------------------------
_mongo_client: Any | None = None


# Collection Name Constants
COLLECTION_TRANSACTIONS = "transactions"
COLLECTION_CUSTOMERS = "customers"
COLLECTION_RECOVERY_SESSIONS = "recovery_sessions"
COLLECTION_AUTOMATIONS = "automations"
COLLECTION_WEBHOOK_EVENTS = "webhook_events"
COLLECTION_USERS = "users"
COLLECTION_AUTH_SESSIONS = "auth_sessions"
COLLECTION_AUDIT_LOGS = "audit_logs"


def now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def get_mongodb_uri() -> str:
    """Retrieve MONGODB_URI from environment variables without exposing secrets."""
    val = os.environ.get("MONGODB_URI", "").strip()
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        val = val[1:-1].strip()
    return val


def get_mongodb_db_name() -> str:
    """Retrieve MONGODB_DB_NAME with default fallback to 'relay'."""
    val = os.environ.get("MONGODB_DB_NAME", "relay").strip()
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        val = val[1:-1].strip()
    return val or "relay"


def is_mongodb_configured() -> bool:
    """Check if a MongoDB connection URI is configured."""
    return bool(get_mongodb_uri())


def get_mongodb_client(force_reconnect: bool = False) -> Any | None:
    """Return a shared PyMongo MongoClient instance or None if not configured/available."""
    global _mongo_client

    if not PYMONGO_AVAILABLE:
        return None

    uri = get_mongodb_uri()
    if not uri:
        return None

    if _mongo_client is None or force_reconnect:
        try:
            _mongo_client = MongoClient(
                uri,
                serverSelectionTimeoutMS=2000,
                connectTimeoutMS=2000,
                socketTimeoutMS=2000,
                appname="Relay-Recovery-Engine",
            )
        except Exception:
            _mongo_client = None

    return _mongo_client


def get_database(db_name: str | None = None) -> Any | None:
    """Return the configured MongoDB database or None if not connected."""
    client = get_mongodb_client()
    if client is None:
        return None
    name = db_name or get_mongodb_db_name()
    try:
        return client[name]
    except Exception:
        return None


def check_mongodb_connection() -> dict[str, Any]:
    """Test the MongoDB connection and return a safe diagnostic status report.

    Possible status values:
    - 'not_configured': MONGODB_URI is empty/absent -> system runs on in-memory DataStore.
    - 'connected': Successfully pinged database.
    - 'unavailable': MONGODB_URI is provided but database host is unreachable.
    """
    db_name = get_mongodb_db_name()

    if not PYMONGO_AVAILABLE:
        return {
            "status": "unavailable",
            "connected": False,
            "database": db_name,
            "error_category": "PyMongoMissing",
            "message": "PyMongo driver is not installed.",
        }

    uri = get_mongodb_uri()
    if not uri:
        return {
            "status": "not_configured",
            "connected": False,
            "database": db_name,
            "message": "MONGODB_URI is not set. Operating on in-memory fallback.",
        }

    try:
        client = get_mongodb_client(force_reconnect=True)
        if client is None:
            return {
                "status": "unavailable",
                "connected": False,
                "database": db_name,
                "error_category": "ClientInitError",
                "message": "Failed to initialize MongoDB client. Operating on in-memory fallback.",
            }

        # Perform ping command to verify connectivity
        client.admin.command("ping")
        return {
            "status": "connected",
            "connected": True,
            "database": db_name,
            "message": f"Connected to MongoDB database '{db_name}'.",
        }
    except Exception as exc:
        err_category = type(exc).__name__
        return {
            "status": "unavailable",
            "connected": False,
            "database": db_name,
            "error_category": err_category,
            "error": str(exc),
            "message": f"MongoDB connection attempt failed ({err_category}). Operating on in-memory fallback.",
        }


# ---------------------------------------------------------------------------
# Data Conversion Helpers
# ---------------------------------------------------------------------------

def to_mongo_doc(data: dict[str, Any]) -> dict[str, Any]:
    """Convert application dictionary to a clean MongoDB-compatible document."""
    doc = dict(data)
    # Ensure _id is not polluted with incompatible types
    if "_id" in doc and doc["_id"] is None:
        doc.pop("_id", None)
    return doc


def from_mongo_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert MongoDB document to an application dictionary, safely sanitizing _id.

    Ensures MongoDB-internal _id does not leak into existing business logic or break JSON serialization.
    """
    if doc is None:
        return None
    res = dict(doc)
    if "_id" in res:
        # Convert ObjectId to string or remove if business ID exists
        res["_id"] = str(res["_id"])
    return res


# ---------------------------------------------------------------------------
# Database Adapter / Repository Foundation
# ---------------------------------------------------------------------------

class MongoAdapter:
    """Lightweight repository adapter interface for MongoDB persistence."""

    def __init__(self, db_name: str | None = None):
        self._db_name = db_name

    @property
    def db_name(self) -> str:
        return self._db_name or get_mongodb_db_name()

    @property
    def db(self) -> Any | None:
        return get_database(self.db_name)

    @property
    def is_available(self) -> bool:
        conn = check_mongodb_connection()
        return conn.get("status") == "connected"

    def get_collection(self, name: str) -> Any | None:
        database = self.db
        if database is not None:
            return database[name]
        return None


# Global adapter instance
mongo_adapter = MongoAdapter()


# ---------------------------------------------------------------------------
# Transaction Repository
# ---------------------------------------------------------------------------

class TransactionRepository:
    """Repository handling persistence, queries, and updates for payment transactions."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_TRANSACTIONS)

    def init_indexes(self) -> None:
        """Create required indexes idempotently."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("transaction_id", 1)], unique=True, name="uniq_transaction_id")
            coll.create_index([("customer_id", 1)], name="idx_customer_id")
            coll.create_index([("merchant_id", 1), ("payment_status", 1)], name="idx_merchant_payment_status")
            coll.create_index([("customer_id", 1), ("payment_status", 1)], name="idx_customer_payment_status")
            self._indexes_initialized = True
        except Exception:
            pass

    def insert_transaction(self, data: dict[str, Any]) -> dict[str, Any] | None:
        """Insert a single transaction into MongoDB."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        doc = to_mongo_doc(data)
        doc.setdefault("created_at", now_iso())
        doc.setdefault("updated_at", now_iso())
        doc.setdefault("merchant_id", "merchant")
        doc.setdefault("recovery_amount", 0.0)

        coll.insert_one(doc)
        return from_mongo_doc(doc)

    def upsert_transaction(self, data: dict[str, Any]) -> dict[str, Any] | None:
        """Upsert transaction by transaction_id."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        txn_id = str(data.get("transaction_id", "")).strip()
        if not txn_id:
            return None

        doc = to_mongo_doc(data)
        doc["transaction_id"] = txn_id
        doc["updated_at"] = now_iso()
        doc.setdefault("merchant_id", "merchant")
        doc.setdefault("recovery_amount", 0.0)

        set_fields = dict(doc)
        set_fields.pop("created_at", None)

        coll.update_one(
            {"transaction_id": txn_id},
            {
                "$set": set_fields,
                "$setOnInsert": {"created_at": doc.get("created_at", now_iso())},
            },
            upsert=True,
        )
        return from_mongo_doc(self.find_by_transaction_id(txn_id))

    def upsert_transactions_batch(self, transactions: list[dict[str, Any]], merchant_id: str = "merchant") -> int:
        """Upsert a batch of transactions from CSV or bulk import."""
        coll = self.collection
        if coll is None or not transactions:
            return 0
        self.init_indexes()

        now = now_iso()
        operations = []

        for row in transactions:
            txn_id = str(row.get("transaction_id", "")).strip()
            if not txn_id:
                continue

            doc = to_mongo_doc(row)
            doc["transaction_id"] = txn_id
            doc["merchant_id"] = str(row.get("merchant_id") or merchant_id).strip()
            doc["customer_id"] = str(row.get("customer_id", "")).strip()
            doc["amount"] = float(row.get("amount", 0.0))
            doc["recovery_amount"] = float(row.get("recovery_amount", 0.0))
            doc["payment_status"] = str(row.get("payment_status") or row.get("status") or "failed").lower().strip()
            doc["status"] = doc["payment_status"]
            doc["payment_method"] = str(row.get("payment_method", "")).strip()
            doc["failure_reason"] = str(row.get("failure_reason", "")).strip()
            doc["updated_at"] = now

            set_fields = dict(doc)
            set_fields.pop("created_at", None)

            if UpdateOne is not None:
                operations.append(
                    UpdateOne(
                        {"transaction_id": txn_id},
                        {
                            "$set": set_fields,
                            "$setOnInsert": {"created_at": row.get("created_at", now)},
                        },
                        upsert=True,
                    )
                )

        upserted_count = 0
        try:
            if UpdateOne is not None and operations:
                res = coll.bulk_write(operations, ordered=False)
                return (res.upserted_count or 0) + (res.modified_count or 0) + (res.matched_count or 0)
        except (TypeError, Exception):
            pass

        # Fallback to direct update_one loop for maximum compatibility
        for row in transactions:
            txn_id = str(row.get("transaction_id", "")).strip()
            if not txn_id:
                continue
            doc = to_mongo_doc(row)
            doc["transaction_id"] = txn_id
            doc["merchant_id"] = str(row.get("merchant_id") or merchant_id).strip()
            doc["customer_id"] = str(row.get("customer_id", "")).strip()
            doc["amount"] = float(row.get("amount", 0.0))
            doc["recovery_amount"] = float(row.get("recovery_amount", 0.0))
            doc["payment_status"] = str(row.get("payment_status") or row.get("status") or "failed").lower().strip()
            doc["status"] = doc["payment_status"]
            doc["payment_method"] = str(row.get("payment_method", "")).strip()
            doc["failure_reason"] = str(row.get("failure_reason", "")).strip()
            doc["updated_at"] = now

            set_fields = dict(doc)
            set_fields.pop("created_at", None)

            coll.update_one(
                {"transaction_id": txn_id},
                {
                    "$set": set_fields,
                    "$setOnInsert": {"created_at": row.get("created_at", now)},
                },
                upsert=True,
            )
            upserted_count += 1

        return upserted_count

    def find_by_transaction_id(self, transaction_id: str) -> dict[str, Any] | None:
        """Retrieve single transaction by transaction_id."""
        coll = self.collection
        if coll is None:
            return None
        doc = coll.find_one({"transaction_id": str(transaction_id).strip()})
        return from_mongo_doc(doc)

    def find_by_customer_id(self, customer_id: str, merchant_id: str | None = None) -> list[dict[str, Any]]:
        """Retrieve all transactions for a given customer."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = {"customer_id": str(customer_id).strip()}
        if merchant_id:
            query["merchant_id"] = str(merchant_id).strip()
        cursor = coll.find(query).sort("created_at", -1)
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def find_by_merchant_id(self, merchant_id: str) -> list[dict[str, Any]]:
        """Retrieve all transactions for a merchant."""
        coll = self.collection
        if coll is None:
            return []
        cursor = coll.find({"merchant_id": str(merchant_id).strip()})
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def update_payment_status(
        self, transaction_id: str, payment_status: str, recovery_amount: float | None = None
    ) -> bool:
        """Update payment status and optionally recovery amount."""
        coll = self.collection
        if coll is None:
            return False
        clean_status = str(payment_status).lower().strip()
        set_data: dict[str, Any] = {
            "payment_status": clean_status,
            "status": clean_status,
            "updated_at": now_iso(),
        }
        if recovery_amount is not None:
            set_data["recovery_amount"] = float(recovery_amount)

        res = coll.update_one(
            {"transaction_id": str(transaction_id).strip()},
            {"$set": set_data},
        )
        return res.matched_count > 0

    def update_recovery_amount(self, transaction_id: str, recovery_amount: float) -> bool:
        """Update recovered revenue amount for a transaction."""
        coll = self.collection
        if coll is None:
            return False
        res = coll.update_one(
            {"transaction_id": str(transaction_id).strip()},
            {
                "$set": {
                    "recovery_amount": float(recovery_amount),
                    "updated_at": now_iso(),
                }
            },
        )
        return res.matched_count > 0

    def list_transactions(self, filter_query: dict[str, Any] | None = None, limit: int = 0) -> list[dict[str, Any]]:
        """List transactions matching filter."""
        coll = self.collection
        if coll is None:
            return []
        cursor = coll.find(filter_query or {})
        if limit > 0:
            cursor = cursor.limit(limit)
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def load_dataframe_for_merchant(self, merchant_id: str = "merchant") -> pd.DataFrame | None:
        """Load all transactions for a merchant into a Pandas DataFrame."""
        transactions = self.find_by_merchant_id(merchant_id)
        if not transactions:
            # If no merchant-scoped records, check for default records
            transactions = self.list_transactions(limit=10000)
            if not transactions:
                return None

        df = pd.DataFrame(transactions)
        # Ensure numeric fields and required columns
        if "amount" in df.columns:
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        if "recovery_amount" in df.columns:
            df["recovery_amount"] = pd.to_numeric(df["recovery_amount"], errors="coerce").fillna(0.0)
        else:
            df["recovery_amount"] = 0.0

        if "payment_status" in df.columns:
            df["payment_status"] = df["payment_status"].astype("string").str.lower().str.strip()
            df["status"] = df["payment_status"]

        if "customer_id" in df.columns:
            df["customer_id"] = df["customer_id"].astype("string")
        if "transaction_id" in df.columns:
            df["transaction_id"] = df["transaction_id"].astype("string")

        return df


# ---------------------------------------------------------------------------
# Customer Repository
# ---------------------------------------------------------------------------

class CustomerRepository:
    """Repository handling persistence and queries for customers."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_CUSTOMERS)

    def init_indexes(self) -> None:
        """Create unique index on customer_id + merchant_id."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index(
                [("customer_id", 1), ("merchant_id", 1)],
                unique=True,
                name="uniq_customer_merchant",
            )
            self._indexes_initialized = True
        except Exception:
            pass

    def upsert_customer(self, customer_data: dict[str, Any]) -> dict[str, Any] | None:
        """Upsert a customer record by customer_id and merchant_id."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        cust_id = str(customer_data.get("customer_id", "")).strip()
        merchant_id = str(customer_data.get("merchant_id", "merchant")).strip()
        if not cust_id:
            return None

        doc = to_mongo_doc(customer_data)
        doc["customer_id"] = cust_id
        doc["merchant_id"] = merchant_id
        doc["updated_at"] = now_iso()

        set_fields = dict(doc)
        set_fields.pop("created_at", None)

        coll.update_one(
            {"customer_id": cust_id, "merchant_id": merchant_id},
            {
                "$set": set_fields,
                "$setOnInsert": {"created_at": customer_data.get("created_at", now_iso())},
            },
            upsert=True,
        )
        return self.find_customer(cust_id, merchant_id)

    def upsert_customers_from_transactions(
        self, transactions: list[dict[str, Any]], merchant_id: str = "merchant"
    ) -> int:
        """Extract unique customers from a list of transactions and upsert them."""
        coll = self.collection
        if coll is None or not transactions:
            return 0
        self.init_indexes()

        # Group by customer_id to extract preferred payment method and risk
        customer_txns: dict[str, list[dict[str, Any]]] = {}
        for t in transactions:
            cid = str(t.get("customer_id", "")).strip()
            if cid:
                customer_txns.setdefault(cid, []).append(t)

        now = now_iso()
        operations = []

        for cid, txns in customer_txns.items():
            # Determine most frequent payment method
            methods = [t.get("payment_method") for t in txns if t.get("payment_method")]
            primary_method = max(set(methods), key=methods.count) if methods else "Credit Card"

            # Derive basic risk score if present
            risk_scores = [float(t["risk_score"]) for t in txns if t.get("risk_score") is not None]
            risk_val = round(sum(risk_scores) / len(risk_scores), 1) if risk_scores else None

            doc: dict[str, Any] = {
                "customer_id": cid,
                "merchant_id": merchant_id,
                "primary_payment_method": primary_method,
                "updated_at": now,
            }
            if risk_val is not None:
                doc["risk_score"] = risk_val

            if UpdateOne is not None:
                operations.append(
                    UpdateOne(
                        {"customer_id": cid, "merchant_id": merchant_id},
                        {"$set": doc, "$setOnInsert": {"created_at": now}},
                        upsert=True,
                    )
                )

        upserted_count = 0
        try:
            if UpdateOne is not None and operations:
                res = coll.bulk_write(operations, ordered=False)
                return (res.upserted_count or 0) + (res.modified_count or 0) + (res.matched_count or 0)
        except (TypeError, Exception):
            pass

        # Fallback to direct update_one loop for maximum compatibility
        for cid, txns in customer_txns.items():
            methods = [t.get("payment_method") for t in txns if t.get("payment_method")]
            primary_method = max(set(methods), key=methods.count) if methods else "Credit Card"

            risk_scores = [float(t["risk_score"]) for t in txns if t.get("risk_score") is not None]
            risk_val = round(sum(risk_scores) / len(risk_scores), 1) if risk_scores else None

            doc = {
                "customer_id": cid,
                "merchant_id": merchant_id,
                "primary_payment_method": primary_method,
                "updated_at": now,
            }
            if risk_val is not None:
                doc["risk_score"] = risk_val

            coll.update_one(
                {"customer_id": cid, "merchant_id": merchant_id},
                {"$set": doc, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
            upserted_count += 1

        return upserted_count

    def find_customer(self, customer_id: str, merchant_id: str | None = None) -> dict[str, Any] | None:
        """Find a customer by customer_id and optional merchant_id."""
        coll = self.collection
        if coll is None:
            return None
        query: dict[str, Any] = {"customer_id": str(customer_id).strip()}
        if merchant_id:
            query["merchant_id"] = str(merchant_id).strip()
        doc = coll.find_one(query)
        return from_mongo_doc(doc)

    def list_customers(self, merchant_id: str | None = None) -> list[dict[str, Any]]:
        """List all customers, optionally filtered by merchant."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = {}
        if merchant_id:
            query["merchant_id"] = str(merchant_id).strip()
        cursor = coll.find(query)
        return [from_mongo_doc(d) for d in cursor if d is not None]


# ---------------------------------------------------------------------------
# Recovery Session Repository
# ---------------------------------------------------------------------------

class RecoverySessionRepository:
    """Repository handling persistence, queries, updates, and audit trails for recovery sessions."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_RECOVERY_SESSIONS)

    def init_indexes(self) -> None:
        """Create required indexes idempotently."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("session_id", 1)], unique=True, name="uniq_session_id")
            coll.create_index([("transaction_id", 1)], name="idx_transaction_id")
            coll.create_index([("customer_id", 1)], name="idx_customer_id")
            coll.create_index([("merchant_id", 1), ("status", 1)], name="idx_merchant_status")
            coll.create_index([("status", 1), ("next_action_at", 1)], name="idx_status_next_action")
            self._indexes_initialized = True
        except Exception:
            pass

    def create(self, session_data: dict[str, Any]) -> dict[str, Any] | None:
        """Create or persist a recovery session."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        sid = str(session_data.get("session_id", "")).strip()
        if not sid:
            return None

        doc = to_mongo_doc(session_data)
        doc["session_id"] = sid
        doc.setdefault("merchant_id", "merchant")
        doc.setdefault("attempt_count", 0)
        doc.setdefault("max_attempts", 3)
        doc.setdefault("audit_trail", [])
        doc.setdefault("created_at", now_iso())
        doc["updated_at"] = now_iso()

        set_fields = dict(doc)
        set_fields.pop("created_at", None)

        coll.update_one(
            {"session_id": sid},
            {
                "$set": set_fields,
                "$setOnInsert": {"created_at": doc.get("created_at", now_iso())},
            },
            upsert=True,
        )
        return self.get(sid)

    def get(self, session_id: str, merchant_id: str | None = None) -> dict[str, Any] | None:
        """Retrieve a single recovery session, optionally filtered by merchant."""
        coll = self.collection
        if coll is None:
            return None
        query: dict[str, Any] = {"session_id": str(session_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        doc = coll.find_one(query)
        return from_mongo_doc(doc)

    def update(
        self, session_id: str, updates: dict[str, Any], merchant_id: str | None = None
    ) -> dict[str, Any] | None:
        """Update fields of an existing recovery session."""
        coll = self.collection
        if coll is None:
            return None
        query: dict[str, Any] = {"session_id": str(session_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()

        doc = to_mongo_doc(updates)
        doc["updated_at"] = now_iso()
        doc.pop("_id", None)
        doc.pop("created_at", None)

        coll.update_one(query, {"$set": doc})
        return self.get(session_id)

    def delete(self, session_id: str, merchant_id: str | None = None) -> bool:
        """Delete a recovery session by session_id."""
        coll = self.collection
        if coll is None:
            return False
        query: dict[str, Any] = {"session_id": str(session_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        res = coll.delete_one(query)
        return res.deleted_count > 0

    def find_by_transaction(
        self, transaction_id: str, merchant_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Retrieve all recovery sessions for a given transaction ID."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = {"transaction_id": str(transaction_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        cursor = coll.find(query).sort("created_at", -1)
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def find_active_by_transaction(
        self, transaction_id: str, merchant_id: str | None = None
    ) -> dict[str, Any] | None:
        """Find an active (non-completed/exhausted/stopped) recovery session for a transaction."""
        coll = self.collection
        if coll is None:
            return None
        active_statuses = [
            "ACTIVE",
            "RETRY_SCHEDULED",
            "PAYMENT_PENDING",
            "created",
            "diagnosed",
            "action_pending",
            "awaiting_customer",
            "retry_scheduled",
        ]
        query: dict[str, Any] = {
            "transaction_id": str(transaction_id).strip(),
            "status": {"$in": active_statuses},
        }
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        doc = coll.find_one(query)
        return from_mongo_doc(doc)

    def list_by_merchant(
        self, merchant_id: str, status: str | None = None
    ) -> list[dict[str, Any]]:
        """List recovery sessions belonging to a merchant."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = {}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        if status:
            query["status"] = str(status).strip()
        cursor = coll.find(query).sort("created_at", -1)
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def update_status_atomic(
        self,
        session_id: str,
        new_status: str,
        expected_statuses: list[str] | None = None,
        additional_updates: dict[str, Any] | None = None,
    ) -> tuple[bool, dict[str, Any] | None]:
        """Atomically update session status if current status matches expected_statuses."""
        coll = self.collection
        if coll is None:
            return True, None
        query: dict[str, Any] = {"session_id": str(session_id).strip()}
        if expected_statuses:
            query["status"] = {"$in": expected_statuses}

        updates = dict(additional_updates or {})
        updates["status"] = str(new_status).strip()
        updates["updated_at"] = now_iso()
        updates.pop("_id", None)
        updates.pop("session_id", None)
        updates.pop("created_at", None)

        res = coll.update_one(query, {"$set": updates})
        if res.matched_count == 0:
            return False, self.get(session_id)
        return True, self.get(session_id)

    def record_communication_dispatch(
        self, session_id: str, channel: str, message_id: str, metadata: dict[str, Any] | None = None
    ) -> bool:
        """Atomically record dispatched email or voice communication to prevent duplicate sends."""
        coll = self.collection
        if coll is None:
            return True
        dispatch_entry = {
            "channel": str(channel).strip().lower(),
            "message_id": str(message_id).strip(),
            "dispatched_at": now_iso(),
            "metadata": metadata or {},
        }
        res = coll.update_one(
            {"session_id": str(session_id).strip()},
            {
                "$addToSet": {f"dispatched_{channel}s": str(message_id).strip()},
                "$push": {"communication_history": dispatch_entry},
                "$set": {"updated_at": now_iso()},
            },
        )
        return res.matched_count > 0

    def append_audit_event(self, session_id: str, event_data: dict[str, Any]) -> bool:
        """Atomically append an audit event entry to a session document."""
        coll = self.collection
        if coll is None:
            return False
        clean_event = dict(event_data)
        clean_event.setdefault("timestamp", now_iso())
        res = coll.update_one(
            {"session_id": str(session_id).strip()},
            {
                "$push": {"audit_trail": clean_event},
                "$set": {"updated_at": now_iso()},
            },
        )
        return res.matched_count > 0


# Global repository instances
transaction_repository = TransactionRepository(mongo_adapter)
customer_repository = CustomerRepository(mongo_adapter)
recovery_session_repository = RecoverySessionRepository(mongo_adapter)


# ---------------------------------------------------------------------------
# User Repository (Phase A Auth Migration)
# ---------------------------------------------------------------------------

class UserRepository:
    """Repository handling persistence, indexes, and queries for users in MongoDB."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_USERS)

    def init_indexes(self) -> None:
        """Create required unique indexes idempotently."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("user_id", 1)], unique=True, name="uniq_user_id")
            coll.create_index([("username", 1)], unique=True, name="uniq_username")
            coll.create_index([("email", 1)], unique=True, sparse=True, name="uniq_email")
            self._indexes_initialized = True
        except Exception:
            pass

    def create_user(self, user_data: dict[str, Any]) -> dict[str, Any] | None:
        """Persist a new user document to MongoDB.
        
        Raises DuplicateKeyError or ValueError if username or email already exists.
        """
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        username = str(user_data.get("username", "")).strip()
        if not username:
            raise ValueError("Username cannot be empty")

        # Duplicate pre-checks
        if self.get_by_username(username) is not None:
            raise ValueError(f"Username '{username}' is already taken")

        email = user_data.get("email")
        if email:
            email = str(email).strip().lower()
            if self.get_by_email(email) is not None:
                raise ValueError(f"Email '{email}' is already registered")
        else:
            email = None

        user_id = str(user_data.get("user_id") or f"usr_{uuid.uuid4().hex[:12]}").strip()
        doc = {
            "user_id": user_id,
            "username": username,
            "password_hash": str(user_data.get("password_hash", "")).strip(),
            "role": str(user_data.get("role", "user")).strip().lower(),
            "name": str(user_data.get("name") or username).strip(),
            "merchant_id": str(user_data.get("merchant_id", "merchant")).strip(),
            "is_active": bool(user_data.get("is_active", True)),
            "created_at": user_data.get("created_at") or now_iso(),
            "updated_at": user_data.get("updated_at") or now_iso(),
        }
        if email:
            doc["email"] = email

        coll.insert_one(doc)
        return from_mongo_doc(doc)

    def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        """Retrieve user document by unique user_id."""
        coll = self.collection
        if coll is None:
            return None
        doc = coll.find_one({"user_id": str(user_id).strip()})
        return from_mongo_doc(doc)

    def get_by_username(self, username: str) -> dict[str, Any] | None:
        """Retrieve user document by username (case-insensitive)."""
        coll = self.collection
        if coll is None:
            return None
        clean_name = str(username).strip()
        if not clean_name:
            return None
        doc = coll.find_one({"username": {"$regex": f"^{re.escape(clean_name)}$", "$options": "i"}})
        return from_mongo_doc(doc)

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        """Retrieve user document by email (case-insensitive)."""
        coll = self.collection
        if coll is None:
            return None
        clean_email = str(email).strip()
        if not clean_email:
            return None
        doc = coll.find_one({"email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}})
        return from_mongo_doc(doc)

    def update_user(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        """Update existing user record fields."""
        coll = self.collection
        if coll is None:
            return None
        doc = to_mongo_doc(updates)
        doc["updated_at"] = now_iso()
        doc.pop("_id", None)
        doc.pop("user_id", None)
        doc.pop("created_at", None)

        coll.update_one({"user_id": str(user_id).strip()}, {"$set": doc})
        return self.get_by_id(user_id)

    def deactivate_user(self, user_id: str) -> bool:
        """Deactivate user account by setting is_active to False."""
        coll = self.collection
        if coll is None:
            return False
        res = coll.update_one(
            {"user_id": str(user_id).strip()},
            {"$set": {"is_active": False, "updated_at": now_iso()}},
        )
        return res.matched_count > 0

    def list_users(self, filter_query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """List user records matching filter."""
        coll = self.collection
        if coll is None:
            return []
        cursor = coll.find(filter_query or {}).sort("created_at", -1)
        return [from_mongo_doc(d) for d in cursor if d is not None]


user_repository = UserRepository(mongo_adapter)


# ---------------------------------------------------------------------------
# Auth Session Repository (Phase B Persistent Sessions)
# ---------------------------------------------------------------------------

class AuthSessionRepository:
    """Repository handling persistence, TTL expiration, and lifecycle for auth sessions in MongoDB."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_AUTH_SESSIONS)

    def init_indexes(self) -> None:
        """Create required unique and TTL indexes idempotently."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("session_id", 1)], unique=True, name="uniq_session_id")
            coll.create_index([("expires_at", 1)], expireAfterSeconds=0, name="ttl_session_expires")
            coll.create_index([("user_id", 1), ("is_active", 1)], name="idx_user_active_session")
            self._indexes_initialized = True
        except Exception:
            pass

    def create_session(
        self, session_data: dict[str, Any], ttl_seconds: int = 86400
    ) -> dict[str, Any] | None:
        """Persist a new active authentication session to MongoDB with TTL expiration."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        sid = str(session_data.get("session_id") or uuid.uuid4().hex).strip()
        now_dt = datetime.now(timezone.utc)

        # Calculate expires_at
        expires_at_val = session_data.get("expires_at")
        if isinstance(expires_at_val, datetime):
            exp_dt = expires_at_val
        elif isinstance(expires_at_val, str):
            try:
                exp_dt = datetime.fromisoformat(expires_at_val.replace("Z", "+00:00"))
            except Exception:
                exp_dt = now_dt + timedelta(seconds=ttl_seconds)
        else:
            exp_dt = now_dt + timedelta(seconds=ttl_seconds)

        doc = {
            "session_id": sid,
            "user_id": str(session_data.get("user_id", "")).strip(),
            "username": str(session_data.get("username", "")).strip(),
            "role": str(session_data.get("role", "user")).strip().lower(),
            "name": str(session_data.get("name", "")).strip(),
            "merchant_id": str(session_data.get("merchant_id", "merchant")).strip(),
            "is_active": bool(session_data.get("is_active", True)),
            "created_at": session_data.get("created_at") or now_dt.isoformat(),
            "last_seen": now_dt.isoformat(),
            "expires_at": exp_dt,
        }
        if session_data.get("email"):
            doc["email"] = str(session_data["email"]).strip().lower()

        # Never persist passwords or hashes in auth_sessions
        doc.pop("password", None)
        doc.pop("password_hash", None)

        coll.update_one(
            {"session_id": sid},
            {"$set": doc},
            upsert=True,
        )
        return self.get_session(sid)

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        """Retrieve active, non-expired session by session_id."""
        coll = self.collection
        if coll is None:
            return None
        clean_sid = str(session_id).strip()
        if not clean_sid:
            return None
        doc = coll.find_one({"session_id": clean_sid})
        if not doc:
            return None

        # Check is_active
        if not doc.get("is_active", True):
            return None

        # Check expiration against current UTC time
        exp = doc.get("expires_at")
        now_dt = datetime.now(timezone.utc)
        if exp is not None:
            if isinstance(exp, str):
                try:
                    exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                except Exception:
                    pass
            if isinstance(exp, datetime):
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp <= now_dt:
                    return None

        # Update last_seen
        try:
            coll.update_one(
                {"session_id": clean_sid},
                {"$set": {"last_seen": now_dt.isoformat()}},
            )
        except Exception:
            pass

        return from_mongo_doc(doc)

    def invalidate_session(self, session_id: str) -> bool:
        """Mark session as inactive (logged out)."""
        coll = self.collection
        if coll is None:
            return False
        clean_sid = str(session_id).strip()
        if not clean_sid:
            return False
        res = coll.update_one(
            {"session_id": clean_sid},
            {"$set": {"is_active": False, "updated_at": now_iso()}},
        )
        return res.matched_count > 0

    def update_last_seen(self, session_id: str) -> bool:
        """Update last_seen timestamp for active session."""
        coll = self.collection
        if coll is None:
            return False
        clean_sid = str(session_id).strip()
        if not clean_sid:
            return False
        res = coll.update_one(
            {"session_id": clean_sid},
            {"$set": {"last_seen": now_iso()}},
        )
        return res.matched_count > 0

    def delete_expired_sessions(self) -> int:
        """Manually purge expired or deactivated sessions."""
        coll = self.collection
        if coll is None:
            return 0
        now_dt = datetime.now(timezone.utc)
        res = coll.delete_many({
            "$or": [
                {"expires_at": {"$lte": now_dt}},
                {"is_active": False},
            ]
        })
        return res.deleted_count


auth_session_repository = AuthSessionRepository(mongo_adapter)


# ---------------------------------------------------------------------------
# Automation Repository (Phase 4 Persistent Automations)
# ---------------------------------------------------------------------------

class AutomationRepository:
    """Repository handling persistence, indexes, and queries for No-Code Automations in MongoDB."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_AUTOMATIONS)

    def init_indexes(self) -> None:
        """Create required indexes idempotently."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("id", 1)], unique=True, name="uniq_automation_id")
            coll.create_index([("merchant_id", 1), ("status", 1)], name="idx_merchant_status")
            coll.create_index(
                [("merchant_id", 1), ("trigger", 1), ("status", 1)],
                name="idx_merchant_trigger_status",
            )
            self._indexes_initialized = True
        except Exception:
            pass

    def create(self, data: dict[str, Any]) -> dict[str, Any] | None:
        """Persist a new automation definition to MongoDB."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        auto_id = str(data.get("id") or uuid.uuid4()).strip()
        doc = to_mongo_doc(data)
        doc["id"] = auto_id
        doc.setdefault("merchant_id", "merchant")
        doc.setdefault("status", "active")
        doc.setdefault("execution_count", 0)
        doc.setdefault("times_triggered", 0)
        doc.setdefault("customers_affected", 0)
        doc.setdefault("last_executed_at", None)
        doc.setdefault("last_triggered", None)
        doc.setdefault("created_at", now_iso())
        doc.setdefault("updated_at", now_iso())

        set_fields = dict(doc)
        set_fields.pop("created_at", None)

        coll.update_one(
            {"id": auto_id},
            {
                "$set": set_fields,
                "$setOnInsert": {"created_at": doc.get("created_at", now_iso())},
            },
            upsert=True,
        )
        return self.get(auto_id)

    def get(self, automation_id: str, merchant_id: str | None = None) -> dict[str, Any] | None:
        """Retrieve a single automation by ID, optionally scoped to a merchant."""
        coll = self.collection
        if coll is None:
            return None
        query: dict[str, Any] = {"id": str(automation_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        doc = coll.find_one(query)
        return from_mongo_doc(doc)

    def update(
        self, automation_id: str, updates: dict[str, Any], merchant_id: str | None = None
    ) -> dict[str, Any] | None:
        """Update an existing automation definition."""
        coll = self.collection
        if coll is None:
            return None
        query: dict[str, Any] = {"id": str(automation_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()

        doc = to_mongo_doc(updates)
        doc["updated_at"] = now_iso()
        doc.pop("_id", None)
        doc.pop("id", None)
        doc.pop("created_at", None)

        res = coll.update_one(query, {"$set": doc})
        if res.matched_count == 0:
            return None
        return self.get(automation_id)

    def delete(self, automation_id: str, merchant_id: str | None = None) -> bool:
        """Delete an automation by ID."""
        coll = self.collection
        if coll is None:
            return False
        query: dict[str, Any] = {"id": str(automation_id).strip()}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        res = coll.delete_one(query)
        return res.deleted_count > 0

    def list_by_merchant(
        self, merchant_id: str | None = None, status: str | None = None
    ) -> list[dict[str, Any]]:
        """List all automations, optionally filtered by merchant and status."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = {}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        if status:
            query["status"] = str(status).strip()
        cursor = coll.find(query).sort("created_at", -1)
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def find_matching(self, trigger: str, merchant_id: str | None = None) -> list[dict[str, Any]]:
        """Find active automations matching the specified trigger."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = {"trigger": str(trigger).strip(), "status": "active"}
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        cursor = coll.find(query).sort("created_at", 1)
        return [from_mongo_doc(d) for d in cursor if d is not None]

    def increment_execution(
        self, automation_id: str, customers_affected_increment: int = 1
    ) -> bool:
        """Increment execution count and timestamps for an automation."""
        coll = self.collection
        if coll is None:
            return False
        now = now_iso()
        res = coll.update_one(
            {"id": str(automation_id).strip()},
            {
                "$inc": {
                    "execution_count": 1,
                    "times_triggered": 1,
                    "customers_affected": int(customers_affected_increment),
                },
                "$set": {
                    "last_executed_at": now,
                    "last_triggered": now,
                    "updated_at": now,
                },
            },
        )
        return res.matched_count > 0


# ---------------------------------------------------------------------------
# Webhook Event Repository (Phase 4 Atomic Idempotency)
# ---------------------------------------------------------------------------

class WebhookEventRepository:
    """Repository handling atomic deduplication and 7-day TTL persistence for webhook events."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_WEBHOOK_EVENTS)

    def init_indexes(self) -> None:
        """Create unique dedup_key index, sparse event_id index, and 7-day TTL index."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("dedup_key", 1)], unique=True, name="uniq_dedup_key")
            coll.create_index([("event_id", 1)], unique=True, sparse=True, name="uniq_event_id")
            coll.create_index(
                [("created_at", 1)],
                expireAfterSeconds=7 * 24 * 3600,
                name="ttl_webhook_events_7d",
            )
            self._indexes_initialized = True
        except Exception:
            pass

    def acquire_lock(
        self, dedup_key: str, event_data: dict[str, Any]
    ) -> tuple[bool, dict[str, Any] | None]:
        """Atomically attempt to acquire the lock for a webhook event.
        
        Returns:
            (True, doc) if this is the FIRST time the event is received.
            (False, existing_doc) if the event is a DUPLICATE or concurrently processing.
        """
        coll = self.collection
        if coll is None:
            return True, None
        self.init_indexes()

        clean_dedup = str(dedup_key).strip()
        event_id = event_data.get("event_id")
        event_id_clean = str(event_id).strip() if event_id else None

        now_dt = datetime.now(timezone.utc)
        doc: dict[str, Any] = {
            "dedup_key": clean_dedup,
            "event": str(event_data.get("event", "payment.failed")),
            "transaction_id": str(event_data.get("transaction_id", "")),
            "customer_id": str(event_data.get("customer_id", "")),
            "merchant_id": str(event_data.get("merchant_id", "merchant")),
            "session_id": event_data.get("session_id"),
            "status": str(event_data.get("status", "processing")),
            "created_at": now_dt,
            "updated_at": now_dt,
        }
        if event_id_clean:
            doc["event_id"] = event_id_clean

        try:
            coll.insert_one(doc)
            return True, from_mongo_doc(doc)
        except (DuplicateKeyError, Exception) as exc:
            err_str = str(exc).lower()
            if "duplicate key" in err_str or "e11000" in err_str or isinstance(exc, DuplicateKeyError):
                query: dict[str, Any] = {"dedup_key": clean_dedup}
                if event_id_clean:
                    query = {"$or": [{"dedup_key": clean_dedup}, {"event_id": event_id_clean}]}
                existing = coll.find_one(query)
                return False, from_mongo_doc(existing)
            raise exc

    def update_event(self, dedup_key: str, updates: dict[str, Any]) -> bool:
        """Update status and metadata for a processed webhook event."""
        coll = self.collection
        if coll is None:
            return False
        clean_dedup = str(dedup_key).strip()
        doc = to_mongo_doc(updates)
        doc["updated_at"] = datetime.now(timezone.utc)
        doc.pop("_id", None)
        doc.pop("dedup_key", None)
        doc.pop("created_at", None)

        res = coll.update_one({"dedup_key": clean_dedup}, {"$set": doc})
        return res.matched_count > 0

    def get_event(self, dedup_key: str) -> dict[str, Any] | None:
        """Retrieve a webhook event document by dedup_key."""
        coll = self.collection
        if coll is None:
            return None
        clean_dedup = str(dedup_key).strip()
        doc = coll.find_one({"dedup_key": clean_dedup})
        return from_mongo_doc(doc)



# ---------------------------------------------------------------------------
# Audit Log Repository (Enterprise Audit Trails in MongoDB)
# ---------------------------------------------------------------------------

class AuditLogRepository:
    """Repository handling persistence, indexing, and querying for platform audit trails in MongoDB."""

    def __init__(self, adapter: MongoAdapter | None = None) -> None:
        self.adapter = adapter or mongo_adapter
        self._indexes_initialized = False

    @property
    def collection(self) -> Any | None:
        return self.adapter.get_collection(COLLECTION_AUDIT_LOGS)

    def init_indexes(self) -> None:
        """Create query and TTL indexes for audit logs."""
        coll = self.collection
        if coll is None:
            return
        try:
            coll.create_index([("audit_id", 1)], unique=True, name="uniq_audit_id")
            coll.create_index([("session_id", 1)], name="idx_audit_session_id")
            coll.create_index([("transaction_id", 1)], name="idx_audit_transaction_id")
            coll.create_index([("customer_id", 1)], name="idx_audit_customer_id")
            coll.create_index([("merchant_id", 1), ("created_at", -1)], name="idx_audit_merchant_time")
            coll.create_index([("event", 1)], name="idx_audit_event")
            coll.create_index([("created_at", -1)], name="idx_audit_created_at")
            self._indexes_initialized = True
        except Exception:
            pass

    def log_event(
        self,
        event: str,
        session_id: str | None = None,
        transaction_id: str | None = None,
        customer_id: str | None = None,
        merchant_id: str = "merchant",
        action: str | None = None,
        actor: str = "system",
        details: dict[str, Any] | None = None,
        timestamp: str | None = None,
    ) -> dict[str, Any] | None:
        """Record an audit trail event directly into MongoDB audit_logs collection."""
        coll = self.collection
        if coll is None:
            return None
        self.init_indexes()

        audit_id = str(uuid.uuid4())
        now = timestamp or now_iso()
        doc: dict[str, Any] = {
            "audit_id": audit_id,
            "event": str(event).strip(),
            "session_id": str(session_id).strip() if session_id else None,
            "transaction_id": str(transaction_id).strip() if transaction_id else None,
            "customer_id": str(customer_id).strip() if customer_id else None,
            "merchant_id": str(merchant_id).strip() if merchant_id else "merchant",
            "action": str(action).strip() if action else None,
            "actor": str(actor).strip() if actor else "system",
            "details": details or {},
            "timestamp": now,
            "created_at": now,
        }

        try:
            coll.insert_one(to_mongo_doc(doc))
            return doc
        except Exception as exc:
            return doc

    def list_logs(
        self,
        filter_query: dict[str, Any] | None = None,
        merchant_id: str | None = None,
        session_id: str | None = None,
        transaction_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List audit trail logs matching filters."""
        coll = self.collection
        if coll is None:
            return []
        query: dict[str, Any] = dict(filter_query or {})
        if merchant_id and merchant_id != "admin":
            query["merchant_id"] = str(merchant_id).strip()
        if session_id:
            query["session_id"] = str(session_id).strip()
        if transaction_id:
            query["transaction_id"] = str(transaction_id).strip()

        cursor = coll.find(query).sort("created_at", -1)
        if limit > 0:
            cursor = cursor.limit(limit)
        return [from_mongo_doc(d) for d in cursor if d is not None]


automation_repository = AutomationRepository(mongo_adapter)
webhook_event_repository = WebhookEventRepository(mongo_adapter)
audit_log_repository = AuditLogRepository(mongo_adapter)




