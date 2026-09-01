"""Local and MongoDB role-based authentication, persistent sessions, and user management."""

import hashlib
import hmac
import secrets
from typing import Any, Callable
import uuid

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from backend.db import (
    auth_session_repository,
    is_mongodb_configured,
    user_repository,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password with PBKDF2-HMAC-SHA256 and a random salt."""
    salt = secrets.token_hex(16)
    iterations = 100000
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return f"pbkdf2_sha256${iterations}${salt}${derived}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against stored hash with backward compatibility for plain/legacy text."""
    if not hashed or not password:
        return False
    if hashed.startswith("pbkdf2_sha256$"):
        parts = hashed.split("$")
        if len(parts) == 4:
            _, iter_str, salt, target_hash = parts
            try:
                iterations = int(iter_str)
                derived = hashlib.pbkdf2_hmac(
                    "sha256",
                    password.encode("utf-8"),
                    salt.encode("utf-8"),
                    iterations,
                ).hex()
                return hmac.compare_digest(derived, target_hash)
            except Exception:
                return False
    # Legacy / plain string fallback for unseeded in-memory compatibility
    return hmac.compare_digest(password, hashed)


USERS: list[dict[str, Any]] = [
    {
        "user_id": "usr_admin",
        "username": "admin",
        "password": "admin123",
        "password_hash": hash_password("admin123"),
        "role": "admin",
        "name": "Admin",
        "merchant_id": "merchant",
        "is_active": True,
    },
    {
        "user_id": "usr_merchant",
        "username": "merchant",
        "password": "merchant123",
        "password_hash": hash_password("merchant123"),
        "role": "merchant",
        "name": "Merchant",
        "merchant_id": "merchant",
        "is_active": True,
    },
    {
        "user_id": "usr_user",
        "username": "user",
        "password": "user123",
        "password_hash": hash_password("user123"),
        "role": "user",
        "name": "User",
        "merchant_id": "merchant",
        "is_active": True,
    },
]

# In-memory session store: session_id -> user_dict (used for fallback & cache)
SESSION_STORE: dict[str, dict[str, Any]] = {}

router = APIRouter(prefix="/auth", tags=["authentication"])


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class SignupRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    name: str | None = Field(default=None)
    email: str | None = Field(default=None)
    role: str = Field(default="user")


def find_user(username: str) -> dict[str, Any] | None:
    """Look up user from MongoDB repository when configured, or fallback to in-memory store."""
    clean_username = str(username).strip()
    if is_mongodb_configured():
        try:
            user = user_repository.get_by_username(clean_username)
            if user:
                return user
        except Exception:
            pass
    # In-memory fallback
    for u in USERS:
        if u["username"].strip().lower() == clean_username.lower():
            return u
    return None


def get_current_user(
    auth_cookie: str | None = Cookie(default=None, alias="session_id"),
    authorization: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None, alias="x-session-id"),
) -> dict[str, Any]:
    """Validate active session from cookie, Bearer header, or X-Session-ID header against MongoDB."""
    token = auth_cookie or x_session_id
    if not token and authorization:
        if authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ").strip()
        elif authorization.startswith("Session "):
            token = authorization.removeprefix("Session ").strip()
        else:
            token = authorization.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please sign in.",
        )

    # 1. MongoDB Persistent Session Validation
    if is_mongodb_configured():
        try:
            session_doc = auth_session_repository.get_session(token)
            if session_doc:
                user_info = {
                    "id": session_doc.get("user_id") or session_doc["username"],
                    "user_id": session_doc.get("user_id") or session_doc["username"],
                    "username": session_doc["username"],
                    "role": session_doc.get("role", "user"),
                    "name": session_doc.get("name") or session_doc["username"],
                    "merchant_id": session_doc.get("merchant_id", "merchant"),
                    "email": session_doc.get("email"),
                }
                SESSION_STORE[token] = user_info
                return user_info
        except Exception:
            pass

    # 2. In-Memory Session Fallback
    if token in SESSION_STORE:
        return SESSION_STORE[token]

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please sign in.",
    )


def require_role(*allowed_roles: str) -> Callable:
    """Dependency factory ensuring user has one of the allowed roles."""
    def role_checker(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: required role in {allowed_roles}",
            )
        return user

    return role_checker


@router.post("/login")
async def login(request: LoginRequest, response: Response) -> dict[str, Any]:
    """Authenticate with username and password, persisting active session in MongoDB."""
    user = find_user(request.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if user.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated. Please contact support.",
        )

    pwd_hash = user.get("password_hash") or user.get("password", "")
    if not verify_password(request.password, pwd_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Generate session token and user payload
    token = uuid.uuid4().hex
    user_id = str(user.get("user_id") or user["username"])
    user_info = {
        "id": user_id,
        "user_id": user_id,
        "username": user["username"],
        "role": user.get("role", "user"),
        "name": user.get("name") or user["username"],
        "merchant_id": user.get("merchant_id", "merchant"),
        "email": user.get("email"),
    }

    # Persist session in MongoDB
    if is_mongodb_configured():
        try:
            auth_session_repository.create_session({
                "session_id": token,
                "user_id": user_id,
                "username": user["username"],
                "role": user_info["role"],
                "name": user_info["name"],
                "merchant_id": user_info["merchant_id"],
                "email": user_info["email"],
                "is_active": True,
            }, ttl_seconds=86400)
        except Exception:
            pass

    SESSION_STORE[token] = user_info

    response.set_cookie(
        key="session_id",
        value=token,
        httponly=False,
        samesite="lax",
        max_age=86400,
        path="/",
    )

    return {
        "status": "success",
        "message": f"Welcome {user_info['name']}",
        "session_id": token,
        "user": user_info,
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest, response: Response) -> dict[str, Any]:
    """Register a new user account and establish a persistent MongoDB session."""
    clean_username = request.username.strip()
    clean_email = request.email.strip().lower() if request.email else None
    clean_name = (request.name or clean_username).strip()
    requested_role = (request.role or "user").strip().lower()

    # Disallow privilege escalation via public signup
    if requested_role in ("admin", "superuser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be created via public signup.",
        )

    assigned_role = "user" if requested_role not in ("merchant", "user") else requested_role

    # Check for existing username or email
    if is_mongodb_configured():
        try:
            if user_repository.get_by_username(clean_username):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username '{clean_username}' is already taken.",
                )
            if clean_email and user_repository.get_by_email(clean_email):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email '{clean_email}' is already registered.",
                )

            hashed_pwd = hash_password(request.password)
            user_doc = {
                "user_id": f"usr_{uuid.uuid4().hex[:12]}",
                "username": clean_username,
                "email": clean_email,
                "password_hash": hashed_pwd,
                "role": assigned_role,
                "name": clean_name,
                "merchant_id": clean_username if assigned_role == "merchant" else "merchant",
                "is_active": True,
            }
            created_user = user_repository.create_user(user_doc)
            user_data = created_user or user_doc
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create user: {e}",
            )
    else:
        # In-memory fallback
        for u in USERS:
            if u["username"].strip().lower() == clean_username.lower():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username '{clean_username}' is already taken.",
                )
            if clean_email and u.get("email", "").strip().lower() == clean_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email '{clean_email}' is already registered.",
                )
        hashed_pwd = hash_password(request.password)
        user_data = {
            "user_id": f"usr_{uuid.uuid4().hex[:12]}",
            "username": clean_username,
            "email": clean_email,
            "password_hash": hashed_pwd,
            "role": assigned_role,
            "name": clean_name,
            "merchant_id": "merchant",
            "is_active": True,
        }
        USERS.append(user_data)

    # Establish persistent session
    token = uuid.uuid4().hex
    user_id = str(user_data.get("user_id") or user_data["username"])
    user_info = {
        "id": user_id,
        "user_id": user_id,
        "username": user_data["username"],
        "role": user_data["role"],
        "name": user_data["name"],
        "merchant_id": user_data.get("merchant_id", "merchant"),
        "email": user_data.get("email"),
    }

    if is_mongodb_configured():
        try:
            auth_session_repository.create_session({
                "session_id": token,
                "user_id": user_id,
                "username": user_data["username"],
                "role": user_info["role"],
                "name": user_info["name"],
                "merchant_id": user_info["merchant_id"],
                "email": user_info["email"],
                "is_active": True,
            }, ttl_seconds=86400)
        except Exception:
            pass

    SESSION_STORE[token] = user_info

    response.set_cookie(
        key="session_id",
        value=token,
        httponly=False,
        samesite="lax",
        max_age=86400,
        path="/",
    )

    return {
        "status": "success",
        "message": f"Account created successfully for {user_info['name']}",
        "session_id": token,
        "user": user_info,
    }


@router.post("/logout")
async def logout(
    response: Response,
    auth_cookie: str | None = Cookie(default=None, alias="session_id"),
    authorization: str | None = Header(default=None),
    x_session_id: str | None = Header(default=None, alias="x-session-id"),
) -> dict[str, str]:
    """Terminate session in MongoDB and clear browser cookie."""
    token = auth_cookie or x_session_id
    if not token and authorization:
        token = authorization.removeprefix("Bearer ").removeprefix("Session ").strip()

    if token:
        if is_mongodb_configured():
            try:
                auth_session_repository.invalidate_session(token)
            except Exception:
                pass
        SESSION_STORE.pop(token, None)

    response.delete_cookie(key="session_id", path="/")
    return {"status": "success", "message": "Signed out successfully"}


@router.get("/me")
async def get_me(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Return the profile and role of the currently authenticated user."""
    return {"status": "success", "user": user}
