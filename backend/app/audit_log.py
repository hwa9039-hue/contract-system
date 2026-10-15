"""시스템 로그 한 건을 남긴다. 실패해도 본 요청은 막지 않는다."""

import logging
import re

from starlette.requests import Request

from app.database import get_connection

logger = logging.getLogger(__name__)

_IP_RE = re.compile(r"^[0-9a-fA-F:.]+$")


def client_ip(request: Request, preferred: str = "") -> str:
    for candidate in (
        preferred,
        (request.headers.get("x-forwarded-for") or "").split(",")[0],
        request.headers.get("x-real-ip") or "",
        request.client.host if request.client else "",
    ):
        text = (candidate or "").strip()
        if text and _IP_RE.fullmatch(text) and len(text) <= 64:
            return text
    return ""


def write_audit_log(
    request: Request,
    action_type: str,
    description: str,
    *,
    ip_address: str = "",
    actor_name: str = "",
    actor_id: str = "",
) -> dict | None:
    action = (action_type or "").strip().upper()
    name = (actor_name or str(getattr(request.state, "auth_display_name", "") or "")).strip()
    account = (actor_id or str(getattr(request.state, "auth_account_id", "") or "")).strip()
    if not name and not account:
        return None
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into audit_logs (actor_name, actor_id, ip_address, action_type, description)
                    values (%s, %s, %s, %s, %s)
                    returning id, occurred_at, actor_name, actor_id, ip_address, action_type, description
                    """,
                    (
                        name[:200],
                        account[:200],
                        client_ip(request, ip_address),
                        action,
                        (description or "").strip()[:500],
                    ),
                )
                row = cursor.fetchone()
            connection.commit()
        return row
    except Exception:
        logger.exception("audit log write failed")
        return None
