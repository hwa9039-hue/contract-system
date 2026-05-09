import os

from jwt.exceptions import InvalidTokenError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.auth_utils import decode_token, get_jwt_secret, is_auth_disabled


def _is_public_api_path(path: str) -> bool:
    if path == "/api/health":
        return True
    if path == "/api/auth/login":
        return True
    if path == "/api/auth/me":
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
            )

        auth_header = request.headers.get("authorization") or ""
        parts = auth_header.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        token = parts[1].strip()
        if not token:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        try:
            decode_token(token)
        except InvalidTokenError:
            return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)

        return await call_next(request)
