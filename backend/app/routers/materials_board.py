import json
import logging
import os
import re
import shutil
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.database import get_connection
from app.schemas import MaterialsBoardOut, row_to_materials_board_post

logger = logging.getLogger(__name__)

MATERIALS_BOARD_API_PATH = "/api/materials-board"
router = APIRouter(prefix=MATERIALS_BOARD_API_PATH, tags=["materials-board"])

UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "uploads")).resolve()
MATERIALS_BOARD_DIR = UPLOAD_ROOT / "materials-board"

RETURNING_COLUMNS = """
  id, title, content, folder, files, "registeredAt", "downloadCount", "createdAt", "updatedAt"
"""

DEFAULT_MATERIALS_BOARD_FOLDER = "기타"


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_date_text() -> str:
    return date.today().isoformat()


def sanitize_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    cleaned = re.sub(r"[^\w.\- ()가-힣]+", "_", base).strip("._")
    return (cleaned or "file")[:200]


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


def post_upload_dir(post_id: str) -> Path:
    return MATERIALS_BOARD_DIR / post_id


def save_upload_file(post_id: str, upload: UploadFile) -> dict:
    file_id = str(uuid4())
    original_name = sanitize_filename(upload.filename or "file")
    stored_name = f"{file_id}_{original_name}"
    target_dir = post_upload_dir(post_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / stored_name

    with dest.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)

    return {
        "id": file_id,
        "name": upload.filename or original_name,
        "size": dest.stat().st_size,
        "storedName": stored_name,
    }


def delete_post_files(post_id: str) -> None:
    target_dir = post_upload_dir(post_id)
    if target_dir.exists():
        shutil.rmtree(target_dir, ignore_errors=True)


def find_file_meta(post_row: dict, file_id: str) -> dict | None:
    for item in normalize_files_json(post_row.get("files")):
        if str(item.get("id")) == str(file_id):
            return item
    return None


def increment_download_count(post_id: str) -> int:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update materials_board_posts
                set "downloadCount" = coalesce("downloadCount", 0) + 1
                where id::text = %s
                returning "downloadCount"
                """,
                (post_id,),
            )
            row = cursor.fetchone()
        connection.commit()
    if not row:
        return 0
    try:
        return int(row.get("downloadCount") or 0)
    except (TypeError, ValueError):
        return 0


def get_post_row(post_id: str) -> dict | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from materials_board_posts
                where id::text = %s
                """,
                (post_id,),
            )
            return cursor.fetchone()


def list_post_rows() -> list[dict]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from materials_board_posts
                order by "registeredAt" desc nulls last, "createdAt" desc nulls last, id desc
                """
            )
            return cursor.fetchall()


@router.get("", response_model=list[MaterialsBoardOut])
def api_list_materials_board_posts():
    return [row_to_materials_board_post(row) for row in list_post_rows()]


@router.post("", response_model=MaterialsBoardOut, status_code=status.HTTP_201_CREATED)
async def api_create_materials_board_post(
    title: str = Form(...),
    content: str = Form(""),
    folder: str = Form(DEFAULT_MATERIALS_BOARD_FOLDER),
    files: list[UploadFile] = File(default=[]),
):
    trimmed_title = (title or "").strip()
    if not trimmed_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    post_id = str(uuid4())
    timestamp = now_text()
    saved_files: list[dict] = []

    for upload in files or []:
        if not upload.filename:
            continue
        try:
            saved_files.append(save_upload_file(post_id, upload))
        except Exception as exc:
            delete_post_files(post_id)
            logger.exception("materials board file save failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save attachment: {exc}",
            ) from exc

    folder_value = (folder or "").strip() or DEFAULT_MATERIALS_BOARD_FOLDER

    values = {
        "id": post_id,
        "title": trimmed_title,
        "content": (content or "").strip(),
        "folder": folder_value,
        "files": json.dumps(saved_files),
        "registeredAt": today_date_text(),
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                insert into materials_board_posts (
                  id, title, content, folder, files, "registeredAt", "createdAt", "updatedAt"
                )
                values (
                  %(id)s, %(title)s, %(content)s, %(folder)s, %(files)s::jsonb,
                  %(registeredAt)s::date, %(createdAt)s, %(updatedAt)s
                )
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            created = cursor.fetchone()
        connection.commit()

    return row_to_materials_board_post(created)


@router.patch("/{post_id}", response_model=MaterialsBoardOut)
async def api_update_materials_board_post(
    post_id: str,
    title: str = Form(...),
    content: str = Form(""),
    folder: str = Form(DEFAULT_MATERIALS_BOARD_FOLDER),
    files: list[UploadFile] = File(default=[]),
):
    existing = get_post_row(post_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    trimmed_title = (title or "").strip()
    if not trimmed_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    current_files = normalize_files_json(existing.get("files"))
    new_files: list[dict] = []

    for upload in files or []:
        if not upload.filename:
            continue
        try:
            new_files.append(save_upload_file(post_id, upload))
        except Exception as exc:
            logger.exception("materials board file save failed during update")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save attachment: {exc}",
            ) from exc

    merged_files = current_files + new_files if new_files else current_files
    timestamp = now_text()

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update materials_board_posts
                set title = %(title)s,
                    content = %(content)s,
                    folder = %(folder)s,
                    files = %(files)s::jsonb,
                    "updatedAt" = %(updatedAt)s
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                {
                    "id": post_id,
                    "title": trimmed_title,
                    "content": (content or "").strip(),
                    "folder": (folder or "").strip() or DEFAULT_MATERIALS_BOARD_FOLDER,
                    "files": json.dumps(merged_files),
                    "updatedAt": timestamp,
                },
            )
            updated = cursor.fetchone()
        connection.commit()

    return row_to_materials_board_post(updated)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_materials_board_post(post_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from materials_board_posts where id::text = %s",
                (post_id,),
            )
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    delete_post_files(post_id)


@router.get("/{post_id}/files/{file_id}")
def api_download_materials_board_file(post_id: str, file_id: str):
    row = get_post_row(post_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    meta = find_file_meta(row, file_id)
    if not meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    stored_name = str(meta.get("storedName") or "").strip()
    if not stored_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    file_path = post_upload_dir(post_id) / stored_name
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    download_name = sanitize_filename(str(meta.get("name") or stored_name))
    download_count = increment_download_count(post_id)
    return FileResponse(
        path=file_path,
        filename=download_name,
        headers={"X-Download-Count": str(download_count)},
    )
