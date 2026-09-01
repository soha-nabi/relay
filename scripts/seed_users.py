"""Seed script for populating MongoDB with default demo users.

Safe to run repeatedly — operations are idempotent and do not delete existing accounts.
Passwords are always stored hashed with PBKDF2-HMAC-SHA256.
"""

import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.auth import hash_password
from backend.db import check_mongodb_connection, user_repository


DEMO_USERS = [
    {
        "user_id": "usr_admin",
        "username": "admin",
        "email": "admin@relay.io",
        "password": "admin123",
        "role": "admin",
        "name": "Admin",
        "merchant_id": "merchant",
    },
    {
        "user_id": "usr_merchant",
        "username": "merchant",
        "email": "merchant@relay.io",
        "password": "merchant123",
        "role": "merchant",
        "name": "Merchant",
        "merchant_id": "merchant",
    },
    {
        "user_id": "usr_user",
        "username": "user",
        "email": "user@relay.io",
        "password": "user123",
        "role": "user",
        "name": "User",
        "merchant_id": "merchant",
    },
]


def seed_demo_users() -> dict:
    """Idempotently seed demo accounts into MongoDB with hashed credentials."""
    conn = check_mongodb_connection()
    if conn["status"] != "connected":
        print(f"[-] MongoDB is not connected (status: {conn['status']}). Operating in fallback mode.")
        return {"status": "skipped", "reason": conn.get("message", "MongoDB unavailable")}

    print("[*] Initializing user collection indexes...")
    user_repository.init_indexes()

    seeded_count = 0
    updated_count = 0

    for user_spec in DEMO_USERS:
        uname = user_spec["username"]
        existing = user_repository.get_by_username(uname)

        pwd_hash = hash_password(user_spec["password"])

        if existing:
            # Update password hash, role, and active status idempotently
            user_repository.update_user(
                existing["user_id"],
                {
                    "password_hash": pwd_hash,
                    "role": user_spec["role"],
                    "name": user_spec["name"],
                    "merchant_id": user_spec["merchant_id"],
                    "email": user_spec["email"],
                    "is_active": True,
                },
            )
            print(f"[+] Updated demo user '{uname}' (Role: {user_spec['role']})")
            updated_count += 1
        else:
            doc = {
                "user_id": user_spec["user_id"],
                "username": uname,
                "email": user_spec["email"],
                "password_hash": pwd_hash,
                "role": user_spec["role"],
                "name": user_spec["name"],
                "merchant_id": user_spec["merchant_id"],
                "is_active": True,
            }
            user_repository.create_user(doc)
            print(f"[+] Created demo user '{uname}' (Role: {user_spec['role']})")
            seeded_count += 1

    print(f"[+] Demo user seeding complete: {seeded_count} created, {updated_count} refreshed.")
    return {
        "status": "success",
        "created": seeded_count,
        "updated": updated_count,
        "total": len(DEMO_USERS),
    }


if __name__ == "__main__":
    result = seed_demo_users()
    print(result)
