import json
import logging
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

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

RETURNING_COLUMNS = """
  id, "projectName", "heroImage", environment, "middleCategory", audience, year,
  purpose, client, specs, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def hero_image_api_path(row_id: str) -> str:
    return f"{INSTALL_CASES_API_PATH}/{row_id}/hero-image"


def hero_image_disk_path(row_id: str) -> Path:
    return INSTALL_CASES_IMAGE_DIR / f"{row_id}.jpg"


def save_hero_image_file(row_id: str, upload: UploadFile) -> None:
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image file is required")

    content_type = (upload.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are allowed")

    INSTALL_CASES_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = hero_image_disk_path(row_id)
    temp_dest = dest.with_suffix(".jpg.tmp")

    with temp_dest.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)

    temp_dest.replace(dest)


def delete_hero_image_file(row_id: str) -> None:
    path = hero_image_disk_path(row_id)
    if path.is_file():
        path.unlink(missing_ok=True)


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
    values = prepare_insert_values(row)
    if "heroImage" in values:
        values["heroImage"] = sanitize_hero_image_value(values.get("heroImage"))
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]

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
    values = install_case_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    if "heroImage" in values:
        values["heroImage"] = sanitize_hero_image_value(values.get("heroImage"))

    values["id"] = row_id
    values["updatedAt"] = now_text()
    assignments = [
        f"{quote_identifier(column)} = %({column})s"
        for column in values.keys()
        if column != "id"
    ]

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


def set_install_case_hero_image_path(row_id: str) -> dict:
    return update_install_case_row(
        row_id,
        InstallCasePatch(heroImage=hero_image_api_path(row_id)),
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
    return model_cls.model_validate(data)


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
    row = parse_install_case_payload(payload, InstallCaseCreate)
    row = row.model_copy(update={"heroImage": ""})
    created = create_install_case_row(row)
    row_id = str(created["id"])
    try:
        save_hero_image_file(row_id, image)
        return set_install_case_hero_image_path(row_id)
    except Exception as exc:
        delete_install_case_row(row_id)
        logger.exception("install case image save failed during create")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save image: {exc}",
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
    patch = parse_install_case_payload(payload, InstallCasePatch)
    patch = patch.model_copy(update={"heroImage": None})
    updated = update_install_case_row(row_id, patch)
    if image and image.filename:
        save_hero_image_file(row_id, image)
        updated = set_install_case_hero_image_path(row_id)
    return updated


@router.get("/{row_id}/hero-image")
def api_get_install_case_hero_image(row_id: str):
    path = hero_image_disk_path(row_id)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return FileResponse(path=path, media_type="image/jpeg", filename=f"{row_id}.jpg")


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_install_case(row_id: str):
    delete_install_case_row(row_id)
