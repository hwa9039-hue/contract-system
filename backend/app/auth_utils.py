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


def get_auth_admin_password() -> str:
    return os.getenv("AUTH_ADMIN_PASSWORD", "").strip()


def is_auth_disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes")


def normalize_token_role(role: str | None) -> str:
    normalized = (role or "user").strip().lower()
    return normalized if normalized in ("admin", "user") else "user"


def create_access_token(role: str = "user") -> str:
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": "contract-app",
        "role": normalize_token_role(role),
        "exp": expire,
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return jwt.decode(token, secret, algorithms=[ALGORITHM])


def decode_token_allow_expired(token: str) -> dict:
    """로그인 연장(refresh) 시 만료된 JWT 서명만 검증합니다."""
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return jwt.decode(token, secret, algorithms=[ALGORITHM], options={"verify_exp": False})


def verify_shared_password(password: str) -> bool:
    expected = get_auth_shared_password()
    if not expected:
        return False
    return secrets.compare_digest(password.encode("utf-8"), expected.encode("utf-8"))


def verify_login_password(password: str, role: str = "user") -> bool:
    """user → AUTH_SHARED_PASSWORD, admin → AUTH_ADMIN_PASSWORD 만 허용."""
    normalized_role = (role or "user").strip().lower()
    if normalized_role == "admin":
        expected = get_auth_admin_password()
    else:
        expected = get_auth_shared_password()
    if not expected:
        return False
    return secrets.compare_digest(password.encode("utf-8"), expected.encode("utf-8"))
