"""등록·수정·삭제 요청이 성공하면 메뉴 이름으로 시스템 로그를 남긴다."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.audit_log import write_audit_log

# 긴 경로를 먼저 둔다. /api/sales 가 /api/sales-register 를 삼키지 않게.
_MENU_BY_PREFIX = (
    ("/api/sales-integrated", "영업관리(통합)"),
    ("/api/sales-register", "영업관리대장"),
    ("/api/sales-contacts", "연락처"),
    ("/api/sales", "영업관리대장"),
    ("/api/project-discovery", "건축정보"),
    ("/api/excluded-projects", "사업공유"),
    ("/api/document-register", "문서수발신대장"),
    ("/api/install-cases", "설치사례"),
    ("/api/materials-board", "게시판"),
    ("/api/weekly-work-reports", "주간업무보고서"),
    ("/api/calendar-events", "캘린더"),
    ("/api/contracts", "계약현황"),
    ("/api/bit-history", "BIT 이력관리"),
    ("/api/payment-reports", "결제보고"),
    ("/api/contacts-manage", "연락처"),
    ("/api/unit-prices", "단가관리"),
    ("/api/project-management", "사업관리"),
    ("/api/emails/export-logs", "견적 · 설계 반출 현황"),
    ("/api/shared-links", "설치사례"),
)

_SKIP_PREFIXES = (
    "/api/audit-logs",
    "/api/auth",
    "/api/presence",
    "/api/public",
    "/api/health",
)

_MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def menu_label_for_path(path: str) -> str:
    for prefix, label in _MENU_BY_PREFIX:
        if path == prefix or path.startswith(prefix + "/"):
            return label
    return ""


def action_verb(method: str, path: str) -> str:
    lowered = path.lower()
    if method == "DELETE" or "/delete" in lowered or lowered.endswith("/bulk-delete"):
        return "삭제"
    if method in ("PUT", "PATCH"):
        return "수정"
    if method == "POST":
        return "등록"
    return ""


class AuditMutationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if response.status_code >= 400:
            return response
        method = request.method.upper()
        if method not in _MUTATION_METHODS:
            return response
        path = request.url.path
        if any(path == prefix or path.startswith(prefix + "/") for prefix in _SKIP_PREFIXES):
            return response
        if path == "/api/emails/export-logs/ingest":
            return response
        menu = menu_label_for_path(path)
        verb = action_verb(method, path)
        if not menu or not verb:
            return response
        write_audit_log(request, "DATA_ACTION", f"[{menu}] 데이터 {verb}")
        return response
