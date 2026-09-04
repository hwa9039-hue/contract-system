import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv

load_dotenv()

ALGORITHM = "HS256"
# 프론트 CONTRACT_SHARED_SESSION_DURATION_MS(8h)와 맞춤 — 업무 중 재로그인 최소화
ACCESS_TOKEN_EXPIRE_MINUTES = 480

# 관리자(admin) 기본 계정 — AUTH_ADMIN_ACCOUNTS 미설정 시 사용
# (password, display_label)
_DEFAULT_ADMIN_ACCOUNTS: tuple[tuple[str, str], ...] = (
    ("hy9039!", "정화영"),
    ("jhjoung!", "정주희"),
    ("kk2331!", "전기웅"),
    ("nov1st!", "유영무"),
    ("sskim!", "김성수"),
    ("yongja_lee!", "이용자"),
    ("pjb9878!", "박재범"),
    ("jslee!", "이재승"),
    ("wizard1221!", "전재우"),
    ("ssj8845!", "신상준"),
)

# 하위 호환. 새 계정은 _DEFAULT_ADMIN_ACCOUNTS 에 넣는다.
_DEFAULT_MANAGER_ACCOUNTS: tuple[tuple[str, str], ...] = ()

# 예전 공용 관리자·사용자 비밀번호. 개인 계정만 로그인 허용.
_RETIRED_LOGIN_PASSWORDS: tuple[str, ...] = ("admin2026!", "smartdi2026!")


def is_retired_login_password(password: str) -> bool:
    trimmed = (password or "").strip()
    if not trimmed:
        return False
    encoded = trimmed.encode("utf-8")
    for retired in _RETIRED_LOGIN_PASSWORDS:
        retired_bytes = retired.encode("utf-8")
        if len(encoded) != len(retired_bytes):
            continue
        if secrets.compare_digest(encoded, retired_bytes):
            return True
    return False


def _without_retired_passwords(accounts: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [(pwd, label) for pwd, label in accounts if pwd and not is_retired_login_password(pwd)]


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "").strip()


def get_auth_shared_password() -> str:
    return os.getenv("AUTH_SHARED_PASSWORD", "").strip()


def get_auth_admin_password() -> str:
    """구버전 단일 관리자 비밀번호(하위 호환)."""
    return os.getenv("AUTH_ADMIN_PASSWORD", "").strip()


def get_auth_manager_password() -> str:
    """구버전 단일 부서장 비밀번호(하위 호환)."""
    return os.getenv("AUTH_MANAGER_PASSWORD", "").strip()


def _parse_accounts_env(raw: str, fallback_label: str) -> list[tuple[str, str]]:
    """`password:라벨,password:라벨` 형식 파싱."""
    accounts: list[tuple[str, str]] = []
    for part in raw.split(","):
        chunk = part.strip()
        if not chunk or ":" not in chunk:
            continue
        password, label = chunk.split(":", 1)
        password = password.strip()
        label = label.strip() or fallback_label
        if password:
            accounts.append((password, label))
    return accounts


def get_admin_accounts() -> list[tuple[str, str]]:
    """관리자 계정 목록 (password, display_label)."""
    raw = os.getenv("AUTH_ADMIN_ACCOUNTS", "").strip()
    if raw:
        parsed = _parse_accounts_env(raw, "관리자")
        if parsed:
            return _without_retired_passwords(parsed)
    return _without_retired_passwords(list(_DEFAULT_ADMIN_ACCOUNTS))


def has_admin_accounts_configured() -> bool:
    return any(pwd for pwd, _ in get_admin_accounts())


def match_admin_account(password: str) -> tuple[str, str] | None:
    """비밀번호가 관리자 계정이면 (password, label) 반환."""
    trimmed = (password or "").strip()
    if not trimmed:
        return None
    for pwd, label in get_admin_accounts():
        if not pwd:
            continue
        if secrets.compare_digest(trimmed.encode("utf-8"), pwd.encode("utf-8")):
            return pwd, label
    return None


def get_manager_accounts() -> list[tuple[str, str]]:
    """부서장 계정 목록 (password, display_label)."""
    raw = os.getenv("AUTH_MANAGER_ACCOUNTS", "").strip()
    if raw:
        parsed = _parse_accounts_env(raw, "부서장")
        if parsed:
            return _without_retired_passwords(parsed)
    return _without_retired_passwords(list(_DEFAULT_MANAGER_ACCOUNTS))


def has_manager_accounts_configured() -> bool:
    return any(pwd for pwd, _ in get_manager_accounts())


def match_manager_account(password: str) -> tuple[str, str] | None:
    """비밀번호가 부서장 계정이면 (password, label) 반환."""
    trimmed = (password or "").strip()
    if not trimmed:
        return None
    for pwd, label in get_manager_accounts():
        if not pwd:
            continue
        if secrets.compare_digest(trimmed.encode("utf-8"), pwd.encode("utf-8")):
            return pwd, label
    return None


def is_auth_disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes")


# 시스템에서 허용하는 역할 목록. 역할을 추가/삭제하려면 여기만 고치면 됩니다.
VALID_ROLES = ("admin", "manager", "user")


def normalize_token_role(role: str | None) -> str:
    normalized = (role or "user").strip().lower()
    return normalized if normalized in VALID_ROLES else "user"


def create_access_token(role: str = "user", display_name: str = "") -> str:
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": "contract-app",
        "role": normalize_token_role(role),
        "exp": expire,
    }
    label = (display_name or "").strip()
    if label:
        payload["display_name"] = label
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


def resolve_login_account(password: str) -> tuple[str, str] | None:
    """비밀번호만으로 (role, display_label) 을 찾는다. 관리자 → 부서장 순."""
    trimmed = (password or "").strip()
    if not trimmed or is_retired_login_password(trimmed):
        return None
    admin = match_admin_account(trimmed)
    if admin:
        return "admin", admin[1]
    manager = match_manager_account(trimmed)
    if manager:
        return "admin", manager[1]
    return None


def verify_login_password(password: str, role: str = "user") -> bool:
    """개인 계정만 통과. 공용 관리자·사용자 비밀번호는 거부한다."""
    trimmed = (password or "").strip()
    if not trimmed or is_retired_login_password(trimmed):
        return False
    if resolve_login_account(trimmed) is not None:
        return True
    normalized_role = normalize_token_role(role)
    if normalized_role == "admin":
        return match_admin_account(trimmed) is not None
    if normalized_role == "manager":
        return match_manager_account(trimmed) is not None
    return False
