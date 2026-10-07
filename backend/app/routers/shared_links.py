"""설치사례 외부 공유 링크.

새 링크는 6자리 코드를 shared_links 에 저장하고, 주소에는 그 코드만 넣는다.
예전에 발급한 JWT 토큰 검증은 public_install_cases 에 남아 있다.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from psycopg.errors import UniqueViolation

from app.database import get_connection

SHARED_LINKS_API_PATH = "/api/shared-links"
SHARE_SUBJECT = "install-cases-share"
SHARE_SCOPE = "install-cases"
SHARE_PAGE_PATH = "/shared/installations"
SHARE_SHORT_PATH = "/shared/s"
_SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
_SHORT_CODE_LENGTH = 6
ALLOWED_SHARE_DAYS = (1, 3, 7, 30)
KST = timezone(timedelta(hours=9))
DEFAULT_SHARE_APP_ORIGIN = "https://contract.signtelecom-smartdi.com"
_ALLOWED_APP_ORIGINS = frozenset(
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://contract.signtelecom-smartdi.com",
        "https://contract.signtelcom-smartdi.com",
        "https://contract.smart-di.com",
        "https://contract-system-2ev.pages.dev",
    }
)

router = APIRouter(prefix=SHARED_LINKS_API_PATH, tags=["shared-links"])


def resolve_share_app_origin(value: object) -> str:
    """공유 링크를 연 사람이 볼 화면 주소. 허용된 프론트 주소만 받는다."""
    origin = str(value or "").strip().rstrip("/")
    if origin in _ALLOWED_APP_ORIGINS:
        return origin
    configured = (os.getenv("PUBLIC_SHARE_APP_ORIGIN") or DEFAULT_SHARE_APP_ORIGIN).strip().rstrip("/")
    return configured or DEFAULT_SHARE_APP_ORIGIN


def format_share_expiry(expires_at: datetime) -> str:
    """한국 시간 YYYY년 MM월 DD일 HH:MM."""
    local = expires_at.astimezone(KST)
    return f"{local.year}년 {local.month:02d}월 {local.day:02d}일 {local.hour:02d}:{local.minute:02d}"


def new_short_code() -> str:
    return "".join(secrets.choice(_SHORT_CODE_ALPHABET) for _ in range(_SHORT_CODE_LENGTH))


def insert_shared_link(expires_at: datetime) -> str:
    """짧은 코드를 저장한다. 같은 코드가 있으면 다시 뽑는다."""
    for _ in range(8):
        code = new_short_code()
        try:
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into shared_links (short_code, expires_at)
                        values (%s, %s)
                        """,
                        (code, expires_at),
                    )
            return code
        except UniqueViolation:
            continue
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not allocate a share code",
    )


def load_active_share_expiry(code: str) -> datetime:
    """코드가 있고 만료 전이면 만료 시각을 돌려준다."""
    raw = str(code or "").strip().upper()
    if len(raw) != _SHORT_CODE_LENGTH or any(char not in _SHORT_CODE_ALPHABET for char in raw):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link")
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "select expires_at from shared_links where short_code = %s",
                (raw,),
            )
            row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link")
    expires_at = row.get("expires_at")
    if not isinstance(expires_at, datetime):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired link")
    return expires_at


@router.post("/generate")
def generate_shared_link(body: dict | None = None):
    """로그인한 사용자만 호출한다. 미들웨어가 로그인 JWT 를 먼저 검사한다."""
    source = body if isinstance(body, dict) else {}
    try:
        days = int(source.get("days"))
    except (TypeError, ValueError):
        days = 0
    if days not in ALLOWED_SHARE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="days must be one of 1, 3, 7, 30",
        )

    expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    code = insert_shared_link(expires_at)
    return {
        "shortCode": code,
        "path": f"{SHARE_SHORT_PATH}/{code}",
        "days": days,
        "expiresAt": expires_at.isoformat(),
    }
