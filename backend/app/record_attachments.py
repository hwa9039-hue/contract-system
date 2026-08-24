"""사업 건 상세 화면의 무제한 다중 파일 첨부.

운영 시 주의 (개발자 안내):
- FastAPI/Starlette UploadFile 은 기본적으로 일정 크기 이상은 디스크 스풀로 내린다.
  저장 시 반드시 shutil.copyfileobj 처럼 청크 단위로 읽어 메모리 폭주를 피한다.
- 앞단 Nginx/리버스 프록시를 쓰면 client_max_body_size 를 충분히 키우거나 해제해야
  대용량·다건 첨부가 413 으로 끊기지 않는다. 예: client_max_body_size 0;
- uvicorn 자체 요청 크기 제한이 있으면 함께 확인한다.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.database import get_connection

logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "uploads")).resolve()
ATTACHMENTS_ROOT = UPLOAD_ROOT / "record-attachments"


@dataclass(frozen=True)
class RecordAttachmentKind:
    table: str
    files_column: str
    updated_column: str
    select_row_sql: str


KIND_SALES = RecordAttachmentKind(
    table="sales_register_rows",
    files_column="files",
    updated_column='"updatedAt"',
    select_row_sql='select id::text as id, files from sales_register_rows where id::text = %(id)s',
)
KIND_EXCLUDED = RecordAttachmentKind(
    table="excluded_projects_rows",
    files_column="files",
    updated_column='"updatedAt"',
    select_row_sql='select id::text as id, files from excluded_projects_rows where id::text = %(id)s',
)
KIND_PAYMENT = RecordAttachmentKind(
    table="payment_report_rows",
    files_column="files",
    updated_column="updated_at",
    select_row_sql="select id::text as id, files from payment_report_rows where id::text = %(id)s",
)


def normalize_files_json(raw) -> list[dict]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except json.JSONDecodeError:
            return []
    return []


def sanitize_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    cleaned = re.sub(r"[^\w.\- ()가-힣]+", "_", base).strip("._")
    return (cleaned or "file")[:200]


def record_dir(kind_key: str, record_id: str) -> Path:
    return ATTACHMENTS_ROOT / kind_key / record_id


def save_upload_file(kind_key: str, record_id: str, upload) -> dict:
    file_id = str(uuid4())
    original_name = sanitize_filename(getattr(upload, "filename", None) or "file")
    stored_name = f"{file_id}_{original_name}"
    target_dir = record_dir(kind_key, record_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / stored_name

    # 청크 복사: 대용량 파일을 한 번에 read() 하지 않는다.
    with dest.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)

    return {
        "id": file_id,
        "name": getattr(upload, "filename", None) or original_name,
        "size": dest.stat().st_size,
        "storedName": stored_name,
    }


def delete_record_files(kind_key: str, record_id: str) -> None:
    target = record_dir(kind_key, record_id)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


def delete_kind_root(kind_key: str) -> None:
    target = ATTACHMENTS_ROOT / kind_key
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


def delete_detached_files(kind_key: str, record_id: str, detached: list[dict]) -> None:
    target_dir = record_dir(kind_key, record_id)
    for item in detached:
        stored_name = str(item.get("storedName") or "").strip()
        if not stored_name:
            continue
        path = target_dir / stored_name
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            logger.warning("attachment delete failed kind=%s id=%s file=%s", kind_key, record_id, stored_name)


def parse_keep_file_ids(form) -> list[str]:
    raw = form.get("keepFileIds")
    if not isinstance(raw, str):
        payload_raw = form.get("payload")
        if isinstance(payload_raw, str):
            try:
                data = json.loads(payload_raw)
                if isinstance(data, dict) and isinstance(data.get("keepFileIds"), list):
                    return [str(item).strip() for item in data["keepFileIds"] if str(item).strip()]
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


def collect_uploads(form) -> list:
    uploads = []
    for value in form.getlist("files"):
        if isinstance(value, (UploadFile, StarletteUploadFile)) and getattr(value, "filename", None):
            uploads.append(value)
    return uploads


def get_record_row(kind: RecordAttachmentKind, record_id: str) -> dict | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(kind.select_row_sql, {"id": record_id})
            return cursor.fetchone()


async def replace_attachments(kind_key: str, kind: RecordAttachmentKind, record_id: str, request: Request) -> list[dict]:
    form = await request.form()
    keep_ids = set(parse_keep_file_ids(form))
    uploads = collect_uploads(form)

    row = get_record_row(kind, record_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    previous = normalize_files_json(row.get("files"))
    kept = [item for item in previous if str(item.get("id") or "") in keep_ids]
    detached = [item for item in previous if str(item.get("id") or "") not in keep_ids]

    saved: list[dict] = []
    for upload in uploads:
        saved.append(save_upload_file(kind_key, record_id, upload))

    next_files = [*kept, *saved]
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update {kind.table}
                set {kind.files_column} = %(files)s::jsonb,
                    {kind.updated_column} = now()
                where id::text = %(id)s
                """,
                {"files": json.dumps(next_files, ensure_ascii=False), "id": record_id},
            )
        connection.commit()

    delete_detached_files(kind_key, record_id, detached)
    return next_files


def download_attachment(kind_key: str, kind: RecordAttachmentKind, record_id: str, file_id: str):
    row = get_record_row(kind, record_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    meta = next((item for item in normalize_files_json(row.get("files")) if str(item.get("id")) == str(file_id)), None)
    if not meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    stored_name = str(meta.get("storedName") or "").strip()
    path = record_dir(kind_key, record_id) / stored_name
    if not stored_name or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")
    filename = str(meta.get("name") or stored_name)
    return FileResponse(path, filename=filename)
