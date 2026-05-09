import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv

load_dotenv()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 20


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "").strip()


def get_auth_shared_password() -> str:
    return os.getenv("AUTH_SHARED_PASSWORD", "").strip()


def is_auth_disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes")


def create_access_token() -> str:
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": "contract-app", "exp": expire}
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return jwt.decode(token, secret, algorithms=[ALGORITHM])


def verify_shared_password(password: str) -> bool:
    expected = get_auth_shared_password()
    if not expected:
        return False
    return secrets.compare_digest(password.encode("utf-8"), expected.encode("utf-8"))
