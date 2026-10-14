"""견적 · 설계 반출 현황 API.

- GET  /api/emails/export-logs         : 화면 목록 (로그인한 사용자, 읽기 전용)
- POST /api/emails/export-logs/ingest  : Google Apps Script 가 Gmail 에서 읽은 메일 정보를 보내는 수신 API
                                         (사용자 JWT 대신 서버 환경변수 EMAIL_INGEST_TOKEN 과 같은 값을
                                          X-Ingest-Token 헤더로 보낸다. auth_middleware 에서 이 경로만 공개)

메일은 Gmail message id 기준으로 한 번만 저장한다(같은 메일을 다시 보내도 중복되지 않고 내용만 갱신).
"""

import hmac
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import getaddresses, parseaddr
from html import unescape
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

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
MAX_RECIPIENT_LEN = 2000
MAX_BODY_SUMMARY_LEN = 500
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


def _normalize_recipients(value: Any) -> str:
    """수신자 목록('A <a@x.com>, b@y.com' 또는 배열)에서 이메일 주소만 뽑아 '), '로 이어 붙인다."""
    if value is None:
        return ""
    parts = value if isinstance(value, list) else [value]
    raw_parts = [str(part) for part in parts if part is not None and str(part).strip()]
    addresses: list[str] = []
    for _name, address in getaddresses(raw_parts):
        cleaned = address.strip().lower()
        if cleaned and cleaned not in addresses:
            addresses.append(cleaned)
    return ", ".join(addresses)[:MAX_RECIPIENT_LEN]


def _summarize_body(value: Any) -> str:
    """본문 요약: 연속 공백·줄바꿈을 한 칸으로 줄이고 앞부분만 남긴다."""
    text = " ".join(str("" if value is None else value).split())
    return text[:MAX_BODY_SUMMARY_LEN]


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


# Gmail 은 25MB 를 넘는 첨부를 MIME 첨부가 아니라 본문 HTML 의 드라이브 링크로 넣는다.
_ANCHOR_RE = re.compile(r"<a\b(?P<attrs>[^>]*)>(?P<label>.*?)</a>", re.IGNORECASE | re.DOTALL)
_ATTR_RE = re.compile(r"""\b(?P<name>href|download|aria-label|title)\s*=\s*(?P<q>['"])(?P<value>.*?)\2""", re.IGNORECASE | re.DOTALL)
_DRIVE_URL_RE = re.compile(r"https?://(?:drive|docs)\.google\.com/[^\s<>\"']+", re.IGNORECASE)
_DRIVE_ID_RE = re.compile(
    r"(?:/(?:file|document|spreadsheets|presentation|drawings)/d/|[?&]id=)([A-Za-z0-9_-]{10,})",
    re.IGNORECASE,
)
_FILE_NAME_RE = re.compile(
    r"([^\s/\\<>\"']{1,180}\.(?:pdf|hwp|hwpx|doc|docx|xls|xlsx|xlsm|ppt|pptx|dwg|dxf|zip|jpe?g|png|gif|tiff?|csv|txt|rvt|skp|ifc|mp4|7z|rar|bmp|webp|svg|xml|msg|eml))",
    re.IGNORECASE,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _looks_like_filename(text: str) -> bool:
    """본문에서 파일명을 추정할 때만 쓴다. 일반 첨부 이름을 거를 때는 쓰지 않는다."""
    return bool(_FILE_NAME_RE.fullmatch(text.strip()))


def _plain_label(value: str) -> str:
    return unescape(re.sub(r"\s+", " ", _TAG_RE.sub(" ", value or ""))).strip()


def _unwrap_drive_url(url: str) -> str:
    """구글 리다이렉트(google.com/url?q=)를 풀고 드라이브 주소만 남긴다."""
    cleaned = unescape(unquote(url or "")).strip().rstrip(").,;")
    if not cleaned:
        return ""
    parsed = urlparse(cleaned)
    if "google." in parsed.netloc and parsed.path.rstrip("/").endswith("/url"):
        target = parse_qs(parsed.query).get("q", [""])[0]
        if target:
            cleaned = unescape(unquote(target)).strip().rstrip(").,;")
    if not _DRIVE_URL_RE.match(cleaned):
        return ""
    return cleaned


def _drive_identity(url: str) -> str:
    match = _DRIVE_ID_RE.search(url)
    if match:
        return f"id:{match.group(1)}"
    return url.lower()


def _attachment_name_from_url(url: str) -> str:
    path = urlparse(url).path
    match = _FILE_NAME_RE.search(unquote(path))
    if match:
        return _clean_text(match.group(1), MAX_FILENAME_LEN)
    return "대용량 첨부"


def _http_url(url: str) -> str:
    cleaned = _clean_text(unescape(url), 2000)
    if cleaned.lower().startswith(("http://", "https://")):
        return cleaned
    return ""


def _explicit_attachment(name: str, url: str = "") -> dict[str, str] | None:
    """메일에서 받은 첨부 이름·주소. 확장자나 공백으로 이름을 버리지 않는다.

    확장자 화이트리스트는 본문에서 파일명을 추정할 때만 쓴다.
    일반 MIME 첨부(url 없음)는 예전에 보이던 파일명을 그대로 남긴다.
    """
    raw_url = _clean_text(url, 2000)
    cleaned_url = _unwrap_drive_url(raw_url) or _http_url(raw_url)
    cleaned_name = _clean_text(_plain_label(str(name or "")), MAX_FILENAME_LEN)
    if cleaned_name and not cleaned_url and _DRIVE_URL_RE.match(cleaned_name):
        cleaned_url = _unwrap_drive_url(cleaned_name) or _http_url(cleaned_name)
        cleaned_name = _attachment_name_from_url(cleaned_url) if cleaned_url else ""
        if cleaned_name == "대용량 첨부":
            cleaned_name = ""
    if cleaned_url and not cleaned_name:
        guessed = _attachment_name_from_url(cleaned_url)
        cleaned_name = "" if guessed == "대용량 첨부" else guessed
    if not cleaned_name and not cleaned_url:
        return None
    record = {"name": cleaned_name or "대용량 첨부"}
    if cleaned_url:
        record["url"] = cleaned_url
    return record


def _attachment_from_item(item: Any) -> dict[str, str] | None:
    if isinstance(item, str):
        return _explicit_attachment(item)
    if not isinstance(item, dict):
        return None
    name = item.get("filename") or item.get("fileName") or item.get("name") or item.get("title") or ""
    url = (
        item.get("url")
        or item.get("link")
        or item.get("href")
        or item.get("downloadUrl")
        or item.get("driveUrl")
        or ""
    )
    return _explicit_attachment(str(name), str(url))


def _anchor_attrs(attrs: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for match in _ATTR_RE.finditer(attrs or ""):
        found[match.group("name").lower()] = unescape(match.group("value") or "")
    return found


def _nearby_filename(text: str, end: int) -> str:
    before = _plain_label(text[max(0, end - 220):end])
    names = _FILE_NAME_RE.findall(before)
    return names[-1] if names else ""


def _drive_links_from_text(text: str) -> list[dict[str, str]]:
    """본문 HTML에서 대용량 파일용 드라이브 다운로드 링크와 파일명을 뽑는다.

    일반 MIME 첨부가 없어도 링크만 있으면 첨부 항목이 된다.
    """
    if not text:
        return []
    found: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(name: str, url: str) -> None:
        cleaned_url = _unwrap_drive_url(url)
        if not cleaned_url:
            return
        identity = _drive_identity(cleaned_url)
        if identity in seen:
            return
        label = _plain_label(name)
        if not _looks_like_filename(label):
            label = ""
        record = _explicit_attachment(label, cleaned_url)
        if not record:
            return
        seen.add(identity)
        found.append(record)

    for match in _ANCHOR_RE.finditer(text):
        attrs = _anchor_attrs(match.group("attrs") or "")
        href = attrs.get("href") or ""
        if not _unwrap_drive_url(href):
            continue
        label = attrs.get("download") or attrs.get("aria-label") or attrs.get("title") or match.group("label") or ""
        if not _looks_like_filename(_plain_label(label)):
            nearby = _nearby_filename(text, match.start())
            if nearby:
                label = nearby
        add(label, href)

    plain = _plain_label(text)
    for match in _DRIVE_URL_RE.finditer(plain):
        add(_nearby_filename(plain, match.start()), match.group(0))
    return found


def _merge_attachments(*groups: list[dict[str, str]] | None) -> list[dict[str, str]]:
    """일반 첨부 배열과 대용량 링크 배열을 한 목록으로 합친다.

    어느 쪽이 None 이거나 빈 배열이어도 나머지를 그대로 남긴다.
    같은 드라이브 파일은 한 번만 넣고, 파일명이 같은 일반 첨부에 링크만 나중에 붙인다.
    """
    merged: list[dict[str, str]] = []
    index_by_name: dict[str, int] = {}
    seen_urls: set[str] = set()
    for group in groups:
        if not group:
            continue
        for item in group:
            if not isinstance(item, dict):
                continue
            url = (item.get("url") or "").strip()
            name = (item.get("name") or "").strip()
            if not name and not url:
                continue
            if not name:
                name = "대용량 첨부"
            url_key = _drive_identity(url) if url else ""
            name_key = name.lower()
            if url_key and url_key in seen_urls:
                continue
            if url and name_key in index_by_name:
                existing = merged[index_by_name[name_key]]
                if not existing.get("url"):
                    existing["url"] = url
                    seen_urls.add(url_key)
                    continue
            if not url and name_key in index_by_name:
                continue
            record = {"name": name}
            if url:
                record["url"] = url
                seen_urls.add(url_key)
            merged.append(record)
            index_by_name.setdefault(name_key, len(merged) - 1)
            if len(merged) >= MAX_ATTACHMENTS_PER_MAIL:
                return merged
    return merged


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
        attachments_raw = raw.get("files") or raw.get("largeAttachments") or raw.get("driveLinks") or []
    if isinstance(attachments_raw, str):
        text = attachments_raw.strip()
        if text.startswith("["):
            try:
                attachments_raw = json.loads(text)
            except json.JSONDecodeError:
                attachments_raw = [text] if text else []
        else:
            attachments_raw = [text] if text else []
    if not isinstance(attachments_raw, list):
        raise ValueError("attachments must be an array")
    named = [item for item in (_attachment_from_item(entry) for entry in attachments_raw) if item]
    body_sources = [
        raw.get("bodyHtml"),
        raw.get("htmlBody"),
        raw.get("html"),
        raw.get("body"),
        raw.get("rawBody"),
        raw.get("bodySummary") if "bodySummary" in raw else raw.get("body_summary"),
    ]
    linked = _drive_links_from_text("\n".join(str(part) for part in body_sources if part))

    return {
        "message_id": message_id,
        "sent_at": sent_at,
        "sender": _normalize_sender(raw.get("sender") if "sender" in raw else raw.get("from")),
        "recipient": _normalize_recipients(
            raw.get("recipient") if "recipient" in raw else raw.get("to")
        ),
        "subject": _clean_text(raw.get("subject"), MAX_SUBJECT_LEN),
        "body_summary": _summarize_body(
            raw.get("bodySummary") if "bodySummary" in raw else raw.get("body_summary") or raw.get("body")
        ),
        "attachments": _merge_attachments(named, linked),
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


def _stored_attachments(value: Any) -> list[dict[str, str]]:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                value = json.loads(text)
            except json.JSONDecodeError:
                return [item for item in (_attachment_from_item(text),) if item]
        else:
            value = [text]
    if not isinstance(value, list):
        return []
    return [item for item in (_attachment_from_item(entry) for entry in value) if item]


def _row_to_out(row: dict) -> dict[str, Any]:
    sent_at = row.get("sent_at")
    named = _stored_attachments(row.get("attachments"))
    # 이미 저장된 메일도 본문 요약에 드라이브 링크가 남아 있으면 첨부 목록에 다시 붙인다.
    linked = _drive_links_from_text(str(row.get("body_summary") or ""))
    return {
        "id": row["id"],
        "sentAt": sent_at.isoformat() if sent_at else "",
        "sender": row.get("sender") or "",
        "recipient": row.get("recipient") or "",
        "subject": row.get("subject") or "",
        "bodySummary": row.get("body_summary") or "",
        "attachments": _merge_attachments(named, linked),
    }


@router.get("")
def list_email_export_logs(limit: int = Query(default=1000, ge=1, le=5000)):
    """최신 메일이 먼저. 화면 표시용 형식(camelCase)으로 돌려준다."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select id::text as id, sent_at, sender, recipient, subject, body_summary, attachments
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
                        select attachments
                        from email_export_logs
                        where message_id = %(message_id)s
                        """,
                        {"message_id": item["message_id"]},
                    )
                    existing = cursor.fetchone()
                    # 다시 수집한 목록이 짧아도, 이미 저장된 일반 첨부 이름은 지우지 않는다.
                    stored = _stored_attachments(existing.get("attachments") if existing else [])
                    item["attachments"] = _merge_attachments(stored, item["attachments"])
                    cursor.execute(
                        """
                        insert into email_export_logs
                          (message_id, sent_at, sender, recipient, subject, body_summary, attachments)
                        values
                          (%(message_id)s, %(sent_at)s, %(sender)s, %(recipient)s, %(subject)s,
                           %(body_summary)s, %(attachments)s)
                        on conflict (message_id) do update set
                          sent_at = excluded.sent_at,
                          sender = excluded.sender,
                          -- 옛 스크립트가 수신자·본문을 안 보내도(빈 값) 이미 저장된 값을 지우지 않는다
                          recipient = case when excluded.recipient <> ''
                            then excluded.recipient else email_export_logs.recipient end,
                          subject = excluded.subject,
                          body_summary = case when excluded.body_summary <> ''
                            then excluded.body_summary else email_export_logs.body_summary end,
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
