"""설치사례 외부 공유 링크 토큰.

DB 에 링크를 저장하지 않는다. 선택한 기간을 JWT exp 에 넣어 서명만 한다.
이 토큰은 로그인 세션(sub=contract-app)과 다르다.
"""

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from app.auth_utils import ALGORITHM, get_jwt_secret
from jwt import encode as jwt_encode

SHARED_LINKS_API_PATH = "/api/shared-links"
SHARE_SUBJECT = "install-cases-share"
SHARE_SCOPE = "install-cases"
SHARE_PAGE_PATH = "/shared/installations"
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

    secret = get_jwt_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET is not set on the server",
        )

    expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    app_origin = resolve_share_app_origin(source.get("appOrigin"))
    token = jwt_encode(
        {
            "sub": SHARE_SUBJECT,
            "scope": SHARE_SCOPE,
            "days": days,
            "app": app_origin,
            "exp": expires_at,
        },
        secret,
        algorithm=ALGORITHM,
    )
    return {
        "token": token,
        "days": days,
        "expiresAt": expires_at.isoformat(),
    }
