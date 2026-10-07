"""외부 공유용 설치사례 조회 API (로그인 없이 GET 만).

관리자 API(/api/install-cases)와 분리해 두고, 화면에 보여 줄 필드만 골라서 내보낸다.
등록·수정·삭제 경로는 여기에 없다.

/share 는 카카오톡 같은 크롤러가 자바스크립트 없이 읽는 미리보기 HTML 이다.
사람은 같은 주소에서 설치사례 화면으로 넘어간다.
"""

import json
from datetime import datetime, timezone
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse
from jwt.exceptions import InvalidTokenError

from app.auth_utils import decode_token
from app.routers.install_cases import list_install_case_rows
from app.routers.shared_links import (
    SHARE_PAGE_PATH,
    SHARE_SCOPE,
    SHARE_SUBJECT,
    format_share_expiry,
    resolve_share_app_origin,
)

_SHARE_PAGE_TITLE = "(주)싸인텔레콤 설치사례"
_EXPIRED_SHARE_MESSAGE = "이 공유 링크는 유효 기간이 만료되었거나 잘못된 접근입니다."

PUBLIC_INSTALL_CASES_API_PATH = "/api/public/install-cases"
router = APIRouter(prefix=PUBLIC_INSTALL_CASES_API_PATH, tags=["public-install-cases"])

# 외부에 내보내는 필드. 작성·수정 시각 같은 내부 값은 뺀다.
_PUBLIC_FIELDS = (
    "id",
    "projectName",
    "heroImage",
    "heroImages",
    "environment",
    "middleCategory",
    "audience",
    "year",
    "purpose",
    "client",
    "specs",
)


def _verified_share_payload(token: str) -> dict:
    raw = (token or "").strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    try:
        payload = decode_token(raw)
    except InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if payload.get("sub") != SHARE_SUBJECT or payload.get("scope") != SHARE_SCOPE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return payload


def _share_preview_description(token: str) -> tuple[str, str]:
    """크롤러용 설명과, 사람이 넘어갈 화면 주소를 만든다. 만료돼도 HTML 은 200 으로 남긴다."""
    raw = (token or "").strip()
    app_origin = resolve_share_app_origin(None)
    description = _EXPIRED_SHARE_MESSAGE
    if not raw:
        return description, app_origin
    try:
        payload = decode_token(raw)
    except (InvalidTokenError, RuntimeError):
        return description, app_origin
    if payload.get("sub") != SHARE_SUBJECT or payload.get("scope") != SHARE_SCOPE:
        return description, app_origin
    app_origin = resolve_share_app_origin(payload.get("app"))
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(int(exp), tz=timezone.utc)
        description = f"열람 만료일: {format_share_expiry(expires_at)}"
    return description, app_origin


def _share_preview_html(token: str) -> str:
    raw = (token or "").strip()
    description, app_origin = _share_preview_description(raw)
    next_url = f"{app_origin}{SHARE_PAGE_PATH}"
    if raw:
        next_url = f"{next_url}?token={quote(raw, safe='')}"
    safe_title = escape(_SHARE_PAGE_TITLE, quote=True)
    safe_description = escape(description, quote=True)
    safe_next = escape(next_url, quote=True)
    next_js = json.dumps(next_url)
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>{safe_title}</title>
  <meta property="og:title" content="{safe_title}" />
  <meta property="og:description" content="{safe_description}" />
  <meta property="og:type" content="website" />
</head>
<body>
  <p>{safe_description}</p>
  <p><a href="{safe_next}">설치사례 보기</a></p>
  <script>location.replace({next_js})</script>
</body>
</html>
"""


@router.get("/share", response_class=HTMLResponse)
def public_install_cases_share_preview(token: str = Query(default="")):
    """카카오톡 미리보기용 HTML. HTTP 리다이렉트는 쓰지 않는다.

    크롤러는 이 응답의 og:description 만 읽고, 브라우저는 스크립트로 설치사례 화면으로 넘어간다.
    """
    return HTMLResponse(_share_preview_html(token))


@router.get("")
def list_public_install_cases(response: Response, token: str = Query(default="")):
    """공유 링크의 token 이 서명이 맞고 만료 전일 때만 목록을 준다."""
    payload = _verified_share_payload(token)
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        response.headers["X-Share-Expires-At"] = str(int(exp))
    return [{key: row.get(key) for key in _PUBLIC_FIELDS} for row in list_install_case_rows()]
