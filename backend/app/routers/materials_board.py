import json
import logging
import os
import re
import shutil
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from app.database import get_connection
from app.schemas import MaterialsBoardOut, row_to_materials_board_post

logger = logging.getLogger(__name__)

MATERIALS_BOARD_API_PATH = "/api/materials-board"
MATERIALS_BOARD_FOLDER_API_VERSION = 2
router = APIRouter(prefix=MATERIALS_BOARD_API_PATH, tags=["materials-board"])

UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "uploads")).resolve()
MATERIALS_BOARD_DIR = UPLOAD_ROOT / "materials-board"

RETURNING_COLUMNS = """
  id, title, content, folder, files, "registeredAt", "downloadCount", "createdAt", "updatedAt"
"""

DEFAULT_MATERIALS_BOARD_FOLDER = "기타"


def _str(value) -> str:
    """문자열이 아닌 값(UploadFile 포함)은 빈 문자열로 변환합니다."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    # UploadFile 등 파일 객체는 무시
    if hasattr(value, "filename"):
        return ""
    return str(value).strip()


def _resolve_folder(request: Request, form) -> str:
    """
    folder 값 우선순위:
    1) URL 쿼리 ?folder=xxx / ?folderId=xxx  (프론트가 항상 붙여 보냄 — 가장 신뢰)
    2) multipart payload JSON  { folder: xxx, folderId: xxx }
    3) multipart 텍스트 필드   folder / folderId
    4) 기본값 '기타'
    """
    # 1) 쿼리 파라미터
    for key in ("folder", "folderId"):
        qf = _str(request.query_params.get(key))
        if qf:
            logger.info("folder from query %r: %r", key, qf)
            return qf

    # 2) JSON payload 필드
    payload_raw = form.get("payload")
    if payload_raw is not None and isinstance(payload_raw, str):
        try:
            data = json.loads(payload_raw)
            if isinstance(data, dict):
                pf = _str(data.get("folder")) or _str(data.get("folderId"))
                if pf:
                    logger.info("folder from payload JSON: %r", pf)
                    return pf
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    # 3) 개별 form 텍스트 필드 (UploadFile 이 아닌 것만)
    for key in ("folder", "folderId"):
        raw = form.get(key)
        ff = _str(raw)
        if ff:
            logger.info("folder from form field %r: %r", key, ff)
            return ff

    logger.warning("folder not found in request — falling back to default")
    return DEFAULT_MATERIALS_BOARD_FOLDER


def parse_materials_board_submit(request: Request, form) -> tuple[str, str, str]:
    """title, content, folder 반환."""
    # payload JSON 에서 title 읽기 시도
    payload_raw = form.get("payload")
    if payload_raw is not None and isinstance(payload_raw, str):
        try:
            data = json.loads(payload_raw)
            if isinstance(data, dict) and _str(data.get("title")):
                title = _str(data.get("title"))
                content = _str(data.get("content"))
                folder = _resolve_folder(request, form)
                return title, content, folder
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    title = _str(form.get("title"))
    content = _str(form.get("content"))
    folder = _resolve_folder(request, form)
    return title, content, folder


def materials_board_out(row: dict | None, folder_hint: str | None = None) -> dict:
    """응답 JSON 에 folder 가 항상 포함되도록 보장합니다."""
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Save failed")
    result = row_to_materials_board_post(row)
    # DB 반환값 우선 → folder_hint(저장 시 사용한 값) → 기본값
    db_folder = _str(row.get("folder"))
    result["folder"] = db_folder or _str(folder_hint) or DEFAULT_MATERIALS_BOARD_FOLDER
    return result


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


def parse_keep_file_ids(form) -> list[str] | None:
    """
    수정 시 유지할 첨부 id 목록.

    None 은 "클라이언트가 목록을 보내지 않음"을 뜻하며, 이 경우 구버전 호환을 위해
    기존 첨부를 건드리지 않는다. 빈 리스트([])는 "전부 삭제"라는 명시적 지시다.
    """
    raw = form.get("keepFileIds")
    if not isinstance(raw, str):
        raw = None

    if raw is None:
        payload_raw = form.get("payload")
        if isinstance(payload_raw, str):
            try:
                data = json.loads(payload_raw)
                if isinstance(data, dict) and "keepFileIds" in data:
                    parsed = data.get("keepFileIds")
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    return [str(item).strip() for item in parsed if str(item).strip()]


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


def delete_detached_files(post_id: str, detached: list[dict]) -> None:
    """DB 목록에서 빠진 첨부의 실제 파일도 디스크에서 지운다 (고아 파일 방지)."""
    target_dir = post_upload_dir(post_id)
    for item in detached:
        stored_name = str(item.get("storedName") or "").strip()
        if not stored_name:
            continue
        path = target_dir / stored_name
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            logger.warning(
                "materials board detached file delete failed post_id=%s file=%s",
                post_id,
                stored_name,
            )


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
    return [materials_board_out(row) for row in list_post_rows()]


@router.post("", response_model=MaterialsBoardOut, status_code=status.HTTP_201_CREATED)
async def api_create_materials_board_post(request: Request):
    form = await request.form()
    trimmed_title, content_value, folder_value = parse_materials_board_submit(request, form)
    if not trimmed_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    uploads = form.getlist("files")

    logger.info(
        "materials board create: folder=%r title=%r",
        folder_value,
        trimmed_title,
    )

    post_id = str(uuid4())
    timestamp = now_text()
    saved_files: list[dict] = []

    for upload in uploads:
        if not getattr(upload, "filename", None):
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

    values = {
        "id": post_id,
        "title": trimmed_title,
        "content": content_value,
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

    return materials_board_out(created, folder_hint=folder_value)


@router.patch("/{post_id}", response_model=MaterialsBoardOut)
async def api_update_materials_board_post(post_id: str, request: Request):
    existing = get_post_row(post_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    form = await request.form()
    trimmed_title, content_value, folder_value = parse_materials_board_submit(request, form)
    if not trimmed_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")

    uploads = form.getlist("files")

    logger.info(
        "materials board update: post_id=%s folder=%r title=%r",
        post_id,
        folder_value,
        trimmed_title,
    )

    current_files = normalize_files_json(existing.get("files"))
    keep_ids = parse_keep_file_ids(form)

    if keep_ids is None:
        # 구버전 클라이언트 — 유지 목록이 없으면 기존 첨부를 그대로 둔다
        kept_files = current_files
        detached_files: list[dict] = []
    else:
        keep_set = set(keep_ids)
        kept_files = [f for f in current_files if str(f.get("id") or "") in keep_set]
        detached_files = [f for f in current_files if str(f.get("id") or "") not in keep_set]

    new_files: list[dict] = []

    for upload in uploads:
        if not getattr(upload, "filename", None):
            continue
        try:
            new_files.append(save_upload_file(post_id, upload))
        except Exception as exc:
            logger.exception("materials board file save failed during update")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save attachment: {exc}",
            ) from exc

    # 유지 목록 + 신규 업로드로 재구성한다. 예전처럼 기존 목록에 덧붙이지 않는다.
    merged_files = kept_files + new_files
    logger.info(
        "materials board update files post_id=%s current=%s keep=%s new=%s detached=%s",
        post_id,
        len(current_files),
        len(kept_files),
        len(new_files),
        len(detached_files),
    )
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
                    "content": content_value,
                    "folder": folder_value,
                    "files": json.dumps(merged_files),
                    "updatedAt": timestamp,
                },
            )
            updated = cursor.fetchone()
        connection.commit()

    # DB 반영이 끝난 뒤에 디스크를 정리해야 저장 실패 시 파일이 사라지지 않는다
    if detached_files:
        delete_detached_files(post_id, detached_files)

    return materials_board_out(updated, folder_hint=folder_value)


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
