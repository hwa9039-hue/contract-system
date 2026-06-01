import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import ValidationError

from app.database import get_connection
from app.schemas import (
    InstallCaseCreate,
    InstallCaseOut,
    InstallCasePatch,
    install_case_to_db_values,
    row_to_install_case,
)

logger = logging.getLogger(__name__)

INSTALL_CASES_API_PATH = "/api/install-cases"
router = APIRouter(prefix=INSTALL_CASES_API_PATH, tags=["install-cases"])

UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "uploads")).resolve()
INSTALL_CASES_IMAGE_DIR = UPLOAD_ROOT / "install-cases"

ALLOWED_HERO_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
ALLOWED_HERO_VIDEO_TYPES = {
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
}
HERO_MEDIA_EXTENSIONS = ("jpg", "jpeg", "png", "webp", "mp4", "webm", "ogg", "mov")
MAX_HERO_IMAGE_BYTES = 10 * 1024 * 1024
MAX_HERO_VIDEO_BYTES = 100 * 1024 * 1024

RETURNING_COLUMNS = """
  id, "projectName", "heroImage", environment, "middleCategory", audience, year,
  purpose, client, specs, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def hero_image_api_path(row_id: str, ext: str = "jpg") -> str:
    normalized = str(ext or "jpg").lower().lstrip(".")
    if normalized in {"mp4", "webm", "ogg"}:
        return f"{INSTALL_CASES_API_PATH}/{row_id}/hero.{normalized}"
    return f"{INSTALL_CASES_API_PATH}/{row_id}/hero-image"


def hero_media_disk_path(row_id: str, ext: str) -> Path:
    return INSTALL_CASES_IMAGE_DIR / f"{row_id}.{ext.lower().lstrip('.')}"


def hero_image_disk_path(row_id: str) -> Path:
    found = find_hero_media_path(row_id)
    if found:
        return found
    return hero_media_disk_path(row_id, "jpg")


def ensure_install_case_upload_dirs() -> None:
    INSTALL_CASES_IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def _filename_ext(filename: str) -> str:
    suffix = Path(filename).suffix.lower().lstrip(".")
    return suffix


def resolve_hero_media_ext(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").lower()
    filename_ext = _filename_ext(upload.filename or "")

    if content_type in ALLOWED_HERO_VIDEO_TYPES or filename_ext in {"mp4", "webm", "ogg", "mov"}:
        if content_type == "video/quicktime" or filename_ext == "mov":
            return "mov"
        if content_type == "video/webm" or filename_ext == "webm":
            return "webm"
        if content_type == "video/ogg" or filename_ext == "ogg":
            return "ogg"
        return "mp4"

    if content_type in ALLOWED_HERO_IMAGE_TYPES or filename_ext in {"jpg", "jpeg", "png", "webp", "gif"}:
        if filename_ext == "png":
            return "png"
        if filename_ext == "webp":
            return "webp"
        return "jpg"

    if content_type.startswith("video/"):
        return "mp4"
    if content_type.startswith("image/"):
        return "jpg"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only image or video files are allowed (image/*, video/mp4, video/webm, video/ogg)",
    )


def is_hero_video_ext(ext: str) -> bool:
    return str(ext or "").lower().lstrip(".") in {"mp4", "webm", "ogg", "mov"}


def media_type_for_ext(ext: str) -> str:
    normalized = str(ext or "").lower().lstrip(".")
    if normalized == "mp4":
        return "video/mp4"
    if normalized == "webm":
        return "video/webm"
    if normalized == "ogg":
        return "video/ogg"
    if normalized == "mov":
        return "video/quicktime"
    if normalized == "png":
        return "image/png"
    if normalized == "webp":
        return "image/webp"
    return "image/jpeg"


def find_hero_media_path(row_id: str) -> Path | None:
    for ext in HERO_MEDIA_EXTENSIONS:
        path = hero_media_disk_path(row_id, ext)
        if path.is_file():
            return path
    return None


def delete_hero_image_file(row_id: str) -> None:
    for ext in HERO_MEDIA_EXTENSIONS:
        path = hero_media_disk_path(row_id, ext)
        if path.is_file():
            path.unlink(missing_ok=True)


async def save_hero_image_file(row_id: str, upload: UploadFile) -> str:
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Media file is required")

    ext = resolve_hero_media_ext(upload)
    content_type = (upload.content_type or "").lower()
    if content_type:
        allowed = ALLOWED_HERO_IMAGE_TYPES | ALLOWED_HERO_VIDEO_TYPES
        if content_type not in allowed and not content_type.startswith(("image/", "video/")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only image or video files are allowed",
            )

    ensure_install_case_upload_dirs()
    delete_hero_image_file(row_id)
    dest = hero_media_disk_path(row_id, ext)
    temp_dest = dest.with_suffix(f".{ext}.tmp")

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty media file")

    max_bytes = MAX_HERO_VIDEO_BYTES if is_hero_video_ext(ext) else MAX_HERO_IMAGE_BYTES
    if len(content) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large (max {limit_mb}MB)",
        )

    with temp_dest.open("wb") as handle:
        handle.write(content)

    temp_dest.replace(dest)
    return ext


def prepare_insert_values(row: InstallCaseCreate) -> dict:
    values = install_case_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    return values


def sanitize_hero_image_value(value: str | None) -> str:
    text = str(value or "").strip()
    if text.startswith("data:") and len(text) > 200_000:
        return ""
    return text


def adapt_install_case_values_for_db(values: dict) -> dict:
    adapted = dict(values)
    specs = adapted.get("specs")
    if isinstance(specs, dict):
        adapted["specs"] = json.dumps(specs, ensure_ascii=False)
    return adapted


def sql_placeholders(columns: list[str]) -> list[str]:
    placeholders = []
    for column in columns:
        if column == "specs":
            placeholders.append(f"%({column})s::jsonb")
        else:
            placeholders.append(f"%({column})s")
    return placeholders


def sql_assignments(columns: list[str]) -> list[str]:
    assignments = []
    for column in columns:
        if column == "specs":
            assignments.append(f'{quote_identifier(column)} = %({column})s::jsonb')
        else:
            assignments.append(f"{quote_identifier(column)} = %({column})s")
    return assignments


def list_install_case_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from install_cases_rows
                order by "createdAt" desc nulls last, id desc nulls last
                """
            )
            return [row_to_install_case(row) for row in cursor.fetchall()]


def get_install_case_row(row_id: str) -> dict | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from install_cases_rows
                where id::text = %s
                """,
                (row_id,),
            )
            return cursor.fetchone()


def create_install_case_row(row: InstallCaseCreate):
    values = adapt_install_case_values_for_db(prepare_insert_values(row))
    if "heroImage" in values:
        values["heroImage"] = sanitize_hero_image_value(values.get("heroImage"))
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = sql_placeholders(columns)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                insert into install_cases_rows ({", ".join(quoted_columns)})
                values ({", ".join(placeholders)})
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            created = cursor.fetchone()
        connection.commit()

    return row_to_install_case(created)


def update_install_case_row(row_id: str, patch: InstallCasePatch):
    values = adapt_install_case_values_for_db(install_case_to_db_values(patch))
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    if "heroImage" in values:
        values["heroImage"] = sanitize_hero_image_value(values.get("heroImage"))

    values["id"] = row_id
    values["updatedAt"] = now_text()
    assignments = sql_assignments([column for column in values.keys() if column != "id"])

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update install_cases_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install case not found")

    return row_to_install_case(updated)


def set_install_case_hero_image_path(row_id: str, ext: str = "jpg") -> dict:
    return update_install_case_row(
        row_id,
        InstallCasePatch(heroImage=hero_image_api_path(row_id, ext)),
    )


def delete_install_case_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from install_cases_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install case not found")

    delete_hero_image_file(row_id)


def parse_install_case_payload(raw_payload: str, model_cls):
    try:
        data = json.loads(raw_payload or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload JSON") from exc
    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


@router.get("", response_model=list[InstallCaseOut])
def api_list_install_cases():
    return list_install_case_rows()


@router.post("", response_model=InstallCaseOut, status_code=status.HTTP_201_CREATED)
def api_create_install_case(row: InstallCaseCreate):
    if row.heroImage:
        row = row.model_copy(update={"heroImage": sanitize_hero_image_value(row.heroImage)})
    return create_install_case_row(row)


@router.post("/form", response_model=InstallCaseOut, status_code=status.HTTP_201_CREATED)
async def api_create_install_case_with_image(
    payload: str = Form(...),
    image: UploadFile = File(...),
):
    row_id = None
    try:
        row = parse_install_case_payload(payload, InstallCaseCreate)
        row = row.model_copy(update={"heroImage": ""})
        created = create_install_case_row(row)
        row_id = str(created["id"])
        saved_ext = await save_hero_image_file(row_id, image)
        return set_install_case_hero_image_path(row_id, saved_ext)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("install case create with image failed")
        if row_id:
            try:
                delete_install_case_row(row_id)
            except Exception:
                logger.exception("install case rollback delete failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Install case save failed: {exc}",
        ) from exc


@router.patch("/{row_id}", response_model=InstallCaseOut)
def api_update_install_case(row_id: str, patch: InstallCasePatch):
    if patch.heroImage is not None:
        patch = patch.model_copy(update={"heroImage": sanitize_hero_image_value(patch.heroImage)})
    return update_install_case_row(row_id, patch)


@router.patch("/{row_id}/form", response_model=InstallCaseOut)
async def api_update_install_case_with_image(
    row_id: str,
    payload: str = Form(...),
    image: UploadFile | None = File(None),
):
    try:
        patch = parse_install_case_payload(payload, InstallCasePatch)
        patch = patch.model_copy(update={"heroImage": None})
        updated = update_install_case_row(row_id, patch)
        if image and image.filename:
            saved_ext = await save_hero_image_file(row_id, image)
            updated = set_install_case_hero_image_path(row_id, saved_ext)
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("install case update with image failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Install case update failed: {exc}",
        ) from exc


def serve_install_case_hero_media(row_id: str):
    path = find_hero_media_path(row_id)
    if not path or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    ext = path.suffix.lower().lstrip(".")
    return FileResponse(
        path=path,
        media_type=media_type_for_ext(ext),
        filename=f"{row_id}.{ext or 'jpg'}",
    )


@router.get("/{row_id}/hero-image")
def api_get_install_case_hero_image(row_id: str):
    return serve_install_case_hero_media(row_id)


@router.get("/{row_id}/hero.{ext}")
def api_get_install_case_hero_media(row_id: str, ext: str):
    normalized = str(ext or "").lower().lstrip(".")
    if normalized not in {"jpg", "jpeg", "png", "webp", "mp4", "webm", "ogg"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    path = hero_media_disk_path(row_id, normalized)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return FileResponse(
        path=path,
        media_type=media_type_for_ext(normalized),
        filename=f"{row_id}.{normalized}",
    )


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_install_case(row_id: str):
    delete_install_case_row(row_id)
