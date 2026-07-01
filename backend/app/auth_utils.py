import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv

load_dotenv()

ALGORITHM = "HS256"
# 프론트 CONTRACT_SHARED_SESSION_DURATION_MS(8h)와 맞춤 — 업무 중 재로그인 최소화
ACCESS_TOKEN_EXPIRE_MINUTES = 480


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "").strip()


def get_auth_shared_password() -> str:
    return os.getenv("AUTH_SHARED_PASSWORD", "").strip()


def get_auth_admin_password() -> str:
    return os.getenv("AUTH_ADMIN_PASSWORD", "").strip()


def get_auth_manager_password() -> str:
    """부서장(MANAGER) 전용 비밀번호."""
    return os.getenv("AUTH_MANAGER_PASSWORD", "").strip()


def is_auth_disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes")


# 시스템에서 허용하는 역할 목록. 역할을 추가/삭제하려면 여기만 고치면 됩니다.
VALID_ROLES = ("admin", "manager", "user")


def normalize_token_role(role: str | None) -> str:
    normalized = (role or "user").strip().lower()
    return normalized if normalized in VALID_ROLES else "user"


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
    """역할별 비밀번호 검증:
    admin   → AUTH_ADMIN_PASSWORD
    manager → AUTH_MANAGER_PASSWORD (부서장)
    user    → AUTH_SHARED_PASSWORD
    """
    normalized_role = normalize_token_role(role)
    if normalized_role == "admin":
        expected = get_auth_admin_password()
    elif normalized_role == "manager":
        expected = get_auth_manager_password()
    else:
        expected = get_auth_shared_password()
    if not expected:
        return False
    return secrets.compare_digest(password.encode("utf-8"), expected.encode("utf-8"))
