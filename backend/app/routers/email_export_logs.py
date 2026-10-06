"""견적 · 설계 반출 현황 API.

- GET  /api/emails/export-logs         : 화면 목록 (로그인한 사용자, 읽기 전용)
- POST /api/emails/export-logs/ingest  : Google Apps Script 가 Gmail 에서 읽은 메일 정보를 보내는 수신 API
                                         (사용자 JWT 대신 서버 환경변수 EMAIL_INGEST_TOKEN 과 같은 값을
                                          X-Ingest-Token 헤더로 보낸다. auth_middleware 에서 이 경로만 공개)

메일은 Gmail message id 기준으로 한 번만 저장한다(같은 메일을 다시 보내도 중복되지 않고 내용만 갱신).
"""

import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from psycopg.types.json import Jsonb

from app.database import get_connection

logger = logging.getLogger(__name__)

EMAIL_EXPORT_LOGS_API_PATH = "/api/emails/export-logs"
EMAIL_EXPORT_LOGS_INGEST_PATH = f"{EMAIL_EXPORT_LOGS_API_PATH}/ingest"
INGEST_TOKEN_HEADER = "X-Ingest-Token"

MAX_BATCH_ITEMS = 200
MAX_ATTACHMENTS_PER_MAIL = 100
MAX_MESSAGE_ID_LEN = 200
MAX_SENDER_LEN = 320
MAX_SUBJECT_LEN = 1000
MAX_FILENAME_LEN = 255

KST = timezone(timedelta(hours=9))

router = APIRouter(prefix=EMAIL_EXPORT_LOGS_API_PATH, tags=["email-export-logs"])


# ── 수신 인증 ──────────────────────────────────────────────────────────────────


def require_ingest_token(request: Request) -> None:
    """서버에 설정한 토큰과 헤더 값이 같을 때만 통과. 토큰이 설정되지 않았다면 수신 기능 자체를 끈다."""
    expected = (os.getenv("EMAIL_INGEST_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email ingest is not configured (EMAIL_INGEST_TOKEN missing)",
        )
    provided = (request.headers.get(INGEST_TOKEN_HEADER) or "").strip()
    # 길이·내용을 노출하지 않도록 상수 시간 비교
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        logger.warning("email export ingest rejected: invalid token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingest token")


# ── 입력 정리 ──────────────────────────────────────────────────────────────────


def _clean_text(value: Any, max_len: int) -> str:
    return str("" if value is None else value).strip()[:max_len]


def _normalize_sender(value: Any) -> str:
    """'"홍길동" <hy9039@gmail.com>' 같은 Gmail From 값에서 이메일 주소만 뽑아 소문자로 맞춘다."""
    raw = _clean_text(value, MAX_SENDER_LEN * 2)
    _name, address = parseaddr(raw)
    return (address or raw).strip().lower()[:MAX_SENDER_LEN]


def _parse_sent_at(value: Any) -> datetime | None:
    """ISO 문자열(2026-10-06T12:00:00+09:00 / ...Z) 또는 epoch(초·밀리초). 시간대가 없으면 한국 시간으로 본다."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("sentAt is invalid")
    if isinstance(value, (int, float)):
        seconds = value / 1000 if abs(value) >= 1e11 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KST)
    return parsed


def _attachment_filename(item: Any) -> str:
    if isinstance(item, str):
        return _clean_text(item, MAX_FILENAME_LEN)
    if isinstance(item, dict):
        return _clean_text(
            item.get("filename") or item.get("fileName") or item.get("name"), MAX_FILENAME_LEN
        )
    return ""


def _normalize_item(raw: Any) -> dict[str, Any]:
    """한 건을 DB 에 넣을 형태로 정리한다. 잘못된 입력은 ValueError."""
    if not isinstance(raw, dict):
        raise ValueError("item must be an object")
    message_id = _clean_text(raw.get("messageId") or raw.get("message_id"), MAX_MESSAGE_ID_LEN)
    if not message_id:
        raise ValueError("messageId is required")

    try:
        sent_at = _parse_sent_at(raw.get("sentAt") if "sentAt" in raw else raw.get("sent_at"))
    except (ValueError, OverflowError, OSError) as exc:
        raise ValueError("sentAt is invalid") from exc

    attachments_raw = raw.get("attachments")
    if attachments_raw is None:
        attachments_raw = []
    if not isinstance(attachments_raw, list):
        raise ValueError("attachments must be an array")
    attachments = [name for name in (_attachment_filename(a) for a in attachments_raw) if name]

    return {
        "message_id": message_id,
        "sent_at": sent_at,
        "sender": _normalize_sender(raw.get("sender") if "sender" in raw else raw.get("from")),
        "subject": _clean_text(raw.get("subject"), MAX_SUBJECT_LEN),
        "attachments": attachments[:MAX_ATTACHMENTS_PER_MAIL],
    }


def _extract_items(body: Any) -> list[Any]:
    """본문은 한 건 객체 / 배열 / {"items": [...]} 모두 허용."""
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        if isinstance(body.get("items"), list):
            return body["items"]
        return [body]
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Body must be an object, an array, or {\"items\": [...]}",
    )


# ── API ───────────────────────────────────────────────────────────────────────


def _row_to_out(row: dict) -> dict[str, Any]:
    sent_at = row.get("sent_at")
    attachments = row.get("attachments")
    return {
        "id": row["id"],
        "sentAt": sent_at.isoformat() if sent_at else "",
        "sender": row.get("sender") or "",
        "subject": row.get("subject") or "",
        "attachments": [str(name) for name in attachments] if isinstance(attachments, list) else [],
    }


@router.get("")
def list_email_export_logs(limit: int = Query(default=1000, ge=1, le=5000)):
    """최신 메일이 먼저. 화면 표시용 형식(camelCase)으로 돌려준다."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select id::text as id, sent_at, sender, subject, attachments
                from email_export_logs
                order by sent_at desc nulls last, created_at desc
                limit %(limit)s
                """,
                {"limit": limit},
            )
            rows = cursor.fetchall()
    return [_row_to_out(row) for row in rows]


@router.post("/ingest", dependencies=[Depends(require_ingest_token)])
def ingest_email_export_logs(body: Any = Body(...)):
    """Apps Script 수신. 한 번에 최대 200건. 잘못된 건은 건너뛰고 rejected 로 알려 준다."""
    items = _extract_items(body)
    if len(items) > MAX_BATCH_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Too many items (max {MAX_BATCH_ITEMS} per request)",
        )

    valid: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for index, raw in enumerate(items):
        try:
            valid.append(_normalize_item(raw))
        except ValueError as exc:
            rejected.append({"index": index, "reason": str(exc)})

    inserted = 0
    updated = 0
    if valid:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                for item in valid:
                    cursor.execute(
                        """
                        insert into email_export_logs (message_id, sent_at, sender, subject, attachments)
                        values (%(message_id)s, %(sent_at)s, %(sender)s, %(subject)s, %(attachments)s)
                        on conflict (message_id) do update set
                          sent_at = excluded.sent_at,
                          sender = excluded.sender,
                          subject = excluded.subject,
                          attachments = excluded.attachments,
                          updated_at = now()
                        returning (xmax = 0) as inserted
                        """,
                        {**item, "attachments": Jsonb(item["attachments"])},
                    )
                    if cursor.fetchone()["inserted"]:
                        inserted += 1
                    else:
                        updated += 1
            connection.commit()

    logger.info(
        "email export ingest: received=%s inserted=%s updated=%s rejected=%s",
        len(items),
        inserted,
        updated,
        len(rejected),
    )
    return {
        "received": len(items),
        "inserted": inserted,
        "updated": updated,
        "rejected": rejected,
    }
