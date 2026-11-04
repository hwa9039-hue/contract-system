"""카카오 인가 코드를 직원 계정으로만 바꾼다. 카카오 토큰은 저장하지 않는다."""

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from fastapi import HTTPException, status

from app.auth_utils import get_jwt_secret

KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_USER_URL = "https://kapi.kakao.com/v2/user/me"

KAKAO_PENDING_CODE = "kakao_pending"
KAKAO_AUTH_FAILED_MESSAGE = "카카오 인증에 실패했습니다."
KAKAO_BAD_CLIENT_MESSAGE = "카카오 클라이언트 시크릿이 앱과 일치하지 않습니다. 콘솔에서 시크릿을 다시 발급해 주세요."
KAKAO_NOT_CONFIGURED_MESSAGE = "카카오 로그인이 설정되지 않았습니다."

logger = logging.getLogger(__name__)


def _clean(value: str | None) -> str:
    return str(value or "").strip()


def kakao_rest_api_key() -> str:
    return _clean(os.getenv("KAKAO_REST_API_KEY"))


def kakao_client_secret() -> str:
    return _clean(os.getenv("KAKAO_CLIENT_SECRET"))


def allowed_kakao_redirect_uris() -> list[str]:
    raw = os.getenv("KAKAO_REDIRECT_URIS") or ""
    values = [_clean(part) for part in raw.split(",")]
    primary = _clean(os.getenv("KAKAO_REDIRECT_URI"))
    merged: list[str] = []
    seen: set[str] = set()
    for item in [primary, *values]:
        if item and item not in seen:
            seen.add(item)
            merged.append(item)
    return merged


def require_kakao_config() -> str:
    key = kakao_rest_api_key()
    if not key or not allowed_kakao_redirect_uris() or not get_jwt_secret():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=KAKAO_NOT_CONFIGURED_MESSAGE,
        )
    return key


def require_allowed_redirect_uri(redirect_uri: str) -> str:
    candidate = _clean(redirect_uri)
    allowed = allowed_kakao_redirect_uris()
    if not candidate or candidate not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="허용되지 않은 카카오 리다이렉트 주소입니다.",
        )
    return candidate


def build_kakao_authorize_url(redirect_uri: str) -> str:
    key = require_kakao_config()
    uri = require_allowed_redirect_uri(redirect_uri)
    query = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": key,
            "redirect_uri": uri,
            "scope": "profile_nickname",
        }
    )
    return f"{KAKAO_AUTHORIZE_URL}?{query}"


def _kakao_error_detail(body: str) -> str:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    error_code = _clean(payload.get("error_code"))
    error = _clean(payload.get("error"))
    logger.info("kakao token exchange rejected error=%s error_code=%s", error or "-", error_code or "-")
    if error_code == "KOE010" or error == "invalid_client":
        return KAKAO_BAD_CLIENT_MESSAGE
    return KAKAO_AUTH_FAILED_MESSAGE


def _read_json(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> dict:
    request = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = _kakao_error_detail(error.read().decode("utf-8", "replace"))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=KAKAO_AUTH_FAILED_MESSAGE,
        )
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=KAKAO_AUTH_FAILED_MESSAGE,
        )
    return payload


def _profile_nickname(profile: dict) -> str:
    account = profile.get("kakao_account") if isinstance(profile.get("kakao_account"), dict) else {}
    nested = account.get("profile") if isinstance(account.get("profile"), dict) else {}
    props = profile.get("properties") if isinstance(profile.get("properties"), dict) else {}
    for value in (nested.get("nickname"), props.get("nickname")):
        text = _clean(value)
        if text:
            return text[:80]
    return ""


def kakao_identity_from_code(code: str, redirect_uri: str) -> tuple[str, str]:
    """인가 코드를 (카카오 고유 ID, 닉네임)으로 바꾼다. 액세스 토큰은 반환하지 않는다."""
    auth_code = _clean(code)
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=KAKAO_AUTH_FAILED_MESSAGE,
        )
    key = require_kakao_config()
    uri = require_allowed_redirect_uri(redirect_uri)
    form = {
        "grant_type": "authorization_code",
        "client_id": key,
        "redirect_uri": uri,
        "code": auth_code,
    }
    secret = kakao_client_secret()
    if secret:
        form["client_secret"] = secret
    token_payload = _read_json(
        KAKAO_TOKEN_URL,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    access_token = _clean(token_payload.get("access_token"))
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=KAKAO_AUTH_FAILED_MESSAGE,
        )
    profile = _read_json(
        KAKAO_USER_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    user_id = profile.get("id")
    if user_id is None or not str(user_id).strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=KAKAO_AUTH_FAILED_MESSAGE,
        )
    return str(user_id).strip(), _profile_nickname(profile)
