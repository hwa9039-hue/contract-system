import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.database import get_connection

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])

ALLOWED_ACTION_TYPES = frozenset({"LOGIN", "SECURITY_VIOLATION", "DATA_ACTION"})
AUDIT_LOG_VIEWER_NAME = "정화영"
AUDIT_LOG_VIEWER_ID = "hy9039"
_IP_RE = re.compile(r"^[0-9a-fA-F:.]+$")


class AuditLogCreate(BaseModel):
    actionType: str
    description: str = ""
    ipAddress: str = ""
    actorName: str = ""
    actorId: str = ""
    occurredAt: str | None = None


class AuditLogOut(BaseModel):
    id: str
    occurredAt: str
    actorName: str
    actorId: str = ""
    ipAddress: str
    actionType: str
    description: str


def can_view_audit_logs(request: Request) -> bool:
    name = str(getattr(request.state, "auth_display_name", "") or "").strip()
    account_id = str(getattr(request.state, "auth_account_id", "") or "").strip().lower()
    return name == AUDIT_LOG_VIEWER_NAME or account_id == AUDIT_LOG_VIEWER_ID


def _clean_ip(value: str) -> str:
    text = (value or "").strip()
    if text and _IP_RE.fullmatch(text) and len(text) <= 64:
        return text
    return ""


def _row_out(row: dict) -> AuditLogOut:
    occurred = row.get("occurred_at")
    if isinstance(occurred, datetime):
        if occurred.tzinfo is None:
            occurred = occurred.replace(tzinfo=timezone.utc)
        occurred_text = occurred.isoformat()
    else:
        occurred_text = str(occurred or "")
    return AuditLogOut(
        id=str(row.get("id") or ""),
        occurredAt=occurred_text,
        actorName=str(row.get("actor_name") or ""),
        actorId=str(row.get("actor_id") or ""),
        ipAddress=str(row.get("ip_address") or ""),
        actionType=str(row.get("action_type") or ""),
        description=str(row.get("description") or ""),
    )


@router.post("", response_model=AuditLogOut, status_code=status.HTTP_201_CREATED)
def create_audit_log(body: AuditLogCreate, request: Request):
    action = (body.actionType or "").strip().upper()
    if action not in ALLOWED_ACTION_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid actionType")

    actor_name = str(getattr(request.state, "auth_display_name", "") or body.actorName or "").strip()
    actor_id = str(getattr(request.state, "auth_account_id", "") or body.actorId or "").strip()
    ip_address = _clean_ip(body.ipAddress)
    if not ip_address and request.client:
        ip_address = _clean_ip(request.client.host)
    description = (body.description or "").strip()[:500]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into audit_logs (actor_name, actor_id, ip_address, action_type, description)
                values (%s, %s, %s, %s, %s)
                returning id, occurred_at, actor_name, actor_id, ip_address, action_type, description
                """,
                (actor_name, actor_id, ip_address, action, description),
            )
            row = cursor.fetchone()
        connection.commit()
    return _row_out(row)


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    request: Request,
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    name: str = "",
    action_type: str = Query(default="", alias="actionType"),
):
    if not can_view_audit_logs(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    clauses = ["1=1"]
    params: list = []
    if date_from:
        clauses.append("occurred_at >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("occurred_at < (%s::date + interval '1 day')")
        params.append(date_to)
    if name.strip():
        clauses.append("actor_name ilike %s")
        params.append(f"%{name.strip()}%")
    action = action_type.strip().upper()
    if action in ALLOWED_ACTION_TYPES:
        clauses.append("action_type = %s")
        params.append(action)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select id, occurred_at, actor_name, actor_id, ip_address, action_type, description
                from audit_logs
                where {' and '.join(clauses)}
                order by occurred_at desc
                limit 500
                """,
                params,
            )
            rows = cursor.fetchall()
    return [_row_out(row) for row in rows]
