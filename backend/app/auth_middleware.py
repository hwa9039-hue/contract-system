import os
import re

from jwt.exceptions import InvalidTokenError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.auth_utils import decode_token, get_jwt_secret, is_auth_disabled, normalize_token_role
from app.rbac import is_rbac_allowed

_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://contract-system-2ev.pages.dev",
    "https://contract.signtelecom-smartdi.com",
    "http://contract.signtelecom-smartdi.com",
)
_CORS_ORIGIN_REGEX = (
    r"https://(.*\.pages\.dev|([a-zA-Z0-9-]+\.)*(signtelecom|signtelcom)-smartdi\.com)$"
)


def _cors_headers_for_request(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin") or ""
    if not origin:
        return {}
    env_raw = os.getenv("CORS_ORIGINS") or ""
    allowed = {o.strip() for o in env_raw.split(",") if o.strip()}
    allowed.update(_DEFAULT_CORS_ORIGINS)
    ok = origin in allowed
    if not ok and _CORS_ORIGIN_REGEX:
        try:
            ok = bool(re.fullmatch(_CORS_ORIGIN_REGEX, origin))
        except re.error:
            ok = False
    if not ok:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
    }


def _is_public_api_path(path: str) -> bool:
    if path == "/api/health":
        return True
    if path == "/api/auth/login":
        return True
    if path == "/api/auth/refresh":
        return True
    if path == "/api/auth/me":
        return True
    # 설치사례 hero 미디어는 <img>/<video> 로딩 시 Authorization 헤더를 붙일 수 없어 공개 경로로 둡니다.
    if path.startswith("/api/install-cases/") and (
        "/hero-image" in path or "/hero." in path
    ):
        return True
    return False


class ApiJwtAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        if not path.startswith("/api"):
            return await call_next(request)

        if is_auth_disabled():
            return await call_next(request)

        if _is_public_api_path(path):
            return await call_next(request)

        if not get_jwt_secret():
            return JSONResponse(
                {"detail": "Server authentication is not configured (JWT_SECRET missing)"},
                status_code=503,
                headers=_cors_headers_for_request(request),
            )

        auth_header = request.headers.get("authorization") or ""
        parts = auth_header.split(None, 1)
        token = ""
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
        if not token:
            token = (request.query_params.get("access_token") or "").strip()
        if not token:
            return JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401,
                headers=_cors_headers_for_request(request),
            )

        try:
            payload = decode_token(token)
        except InvalidTokenError:
            return JSONResponse(
                {"detail": "Invalid or expired token"},
                status_code=401,
                headers=_cors_headers_for_request(request),
            )

        role = normalize_token_role(payload.get("role"))
        request.state.auth_role = role

        # RBAC 도입 이전 JWT(role 클레임 없음)는 만료될 때까지 기존과 동일하게 전체 허용
        if "role" in payload and not is_rbac_allowed(path, request.method, role):
            return JSONResponse(
                {"detail": "Forbidden"},
                status_code=403,
                headers=_cors_headers_for_request(request),
            )

        return await call_next(request)
