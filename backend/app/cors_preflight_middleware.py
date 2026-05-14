"""
브라우저 OPTIONS(프리플라이트)가 Nginx/다른 레이어에서 막히거나,
CORSMiddleware만으로 헤더가 안 붙는 환경을 보완합니다.

가장 마지막에 등록해(Starlette 기준 가장 바깥) /api 로 시작하는 OPTIONS 에
Access-Control-Allow-* 헤더를 즉시 반환합니다.
"""

import re
from typing import Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def _origin_allowed(origin: str, allow_origins: Iterable[str], allow_origin_regex: str | None) -> bool:
    if not origin:
        return False
    if origin in allow_origins:
        return True
    if allow_origin_regex:
        try:
            if re.fullmatch(allow_origin_regex, origin):
                return True
        except re.error:
            pass
    return False


class ApiPreflightCorsMiddleware(BaseHTTPMiddleware):
    """allow_credentials 사용 시 Allow-Headers 는 와일드카드 대신 요청 헤더를 되돌려 주는 편이 안전합니다."""

    def __init__(self, app, allow_origins: list[str], allow_origin_regex: str | None):
        super().__init__(app)
        self._allow_origins = allow_origins
        self._allow_origin_regex = allow_origin_regex

    async def dispatch(self, request: Request, call_next):
        if request.method != "OPTIONS" or not request.url.path.startswith("/api"):
            return await call_next(request)

        origin = request.headers.get("origin") or ""
        if not _origin_allowed(origin, self._allow_origins, self._allow_origin_regex):
            return await call_next(request)

        req_headers = request.headers.get("access-control-request-headers", "")
        allow_headers = req_headers or "authorization,content-type"

        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
                "Access-Control-Allow-Headers": allow_headers,
                "Access-Control-Max-Age": "600",
            },
        )
