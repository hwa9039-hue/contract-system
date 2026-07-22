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
from pydantic import ValidationError

from app.database import get_connection
from app.schemas import (
    InstallCaseCreate,
    InstallCaseOut,
    InstallCasePatch,
    _normalize_install_case_hero_images,
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
    "video/x-msvideo",
}
HERO_MEDIA_EXTENSIONS = ("jpg", "jpeg", "png", "webp", "mp4", "webm", "ogg", "mov", "avi")
MAX_HERO_IMAGE_BYTES = 10 * 1024 * 1024
MAX_HERO_VIDEO_BYTES = 100 * 1024 * 1024
MAX_HERO_MEDIA_COUNT = 10

RETURNING_COLUMNS = """
  id, "projectName", "heroImage", "heroImages", environment, "middleCategory", audience, year,
  purpose, client, specs, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def hero_image_api_path(row_id: str, ext: str = "jpg") -> str:
    """레거시 단일 미디어 URL (하위 호환)."""
    normalized = str(ext or "jpg").lower().lstrip(".")
    if normalized in {"mp4", "webm", "ogg", "mov", "avi"}:
        return f"{INSTALL_CASES_API_PATH}/{row_id}/hero.{normalized}"
    return f"{INSTALL_CASES_API_PATH}/{row_id}/hero-image"


def hero_media_api_path(row_id: str, index: int, ext: str) -> str:
    normalized = str(ext or "jpg").lower().lstrip(".")
    return f"{INSTALL_CASES_API_PATH}/{row_id}/media/{int(index)}.{normalized}"


def hero_media_disk_path(row_id: str, ext: str) -> Path:
    return INSTALL_CASES_IMAGE_DIR / f"{row_id}.{ext.lower().lstrip('.')}"


def hero_gallery_dir(row_id: str) -> Path:
    return INSTALL_CASES_IMAGE_DIR / str(row_id)


def hero_gallery_media_path(row_id: str, index: int, ext: str) -> Path:
    return hero_gallery_dir(row_id) / f"{int(index)}.{ext.lower().lstrip('.')}"


def ensure_install_case_upload_dirs() -> None:
    INSTALL_CASES_IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def _filename_ext(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def resolve_hero_media_ext(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").lower()
    filename_ext = _filename_ext(upload.filename or "")

    if content_type in ALLOWED_HERO_VIDEO_TYPES or filename_ext in {"mp4", "webm", "ogg", "mov", "avi"}:
        if content_type == "video/x-msvideo" or filename_ext == "avi":
            return "avi"
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
    return str(ext or "").lower().lstrip(".") in {"mp4", "webm", "ogg", "mov", "avi"}


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
    if normalized == "avi":
        return "video/x-msvideo"
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


def delete_legacy_hero_image_file(row_id: str) -> None:
    for ext in HERO_MEDIA_EXTENSIONS:
        path = hero_media_disk_path(row_id, ext)
        if path.is_file():
            path.unlink(missing_ok=True)


def clear_gallery_dir(row_id: str) -> None:
    gallery = hero_gallery_dir(row_id)
    if gallery.is_dir():
        shutil.rmtree(gallery, ignore_errors=True)


def delete_all_install_case_media(row_id: str) -> None:
    delete_legacy_hero_image_file(row_id)
    clear_gallery_dir(row_id)


def find_gallery_media_path(row_id: str, index: int) -> Path | None:
    gallery = hero_gallery_dir(row_id)
    if not gallery.is_dir():
        return None
    for ext in HERO_MEDIA_EXTENSIONS:
        path = hero_gallery_media_path(row_id, index, ext)
        if path.is_file():
            return path
    # 확장자 미지: index.* 탐색
    matches = sorted(gallery.glob(f"{int(index)}.*"))
    for path in matches:
        if path.is_file() and path.suffix.lower().lstrip(".") in HERO_MEDIA_EXTENSIONS:
            return path
    return None


def resolve_existing_media_path(row_id: str, url: str) -> Path | None:
    text = str(url or "").strip()
    if not text:
        return None

    # /api/install-cases/{id}/media/{n}.{ext}
    media_match = re.search(rf"/install-cases/{re.escape(str(row_id))}/media/(\d+)\.([a-z0-9]+)", text, re.I)
    if media_match:
        idx = int(media_match.group(1))
        ext = media_match.group(2).lower()
        path = hero_gallery_media_path(row_id, idx, ext)
        if path.is_file():
            return path
        return find_gallery_media_path(row_id, idx)

    # legacy hero-image / hero.{ext}
    if f"/install-cases/{row_id}/hero-image" in text or f"/install-cases/{row_id}/hero." in text:
        return find_hero_media_path(row_id)

    return None


def collect_upload_files(
    images: list[UploadFile] | UploadFile | None,
    image: UploadFile | None = None,
) -> list[UploadFile]:
    """FastAPI는 파일 1개일 때 list 대신 단일 UploadFile을 줄 수 있어 정규화한다."""
    uploads: list[UploadFile] = []

    if images is not None:
        if isinstance(images, list):
            for item in images:
                if item and getattr(item, "filename", None):
                    uploads.append(item)
        elif getattr(images, "filename", None):
            uploads.append(images)

    if image and getattr(image, "filename", None):
        if not any(u is image for u in uploads):
            uploads.append(image)

    return uploads[:MAX_HERO_MEDIA_COUNT]


async def read_upload_staged(upload: UploadFile) -> tuple[str, bytes]:
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
    logger.info(
        "install-case media staged: name=%s ext=%s bytes=%s content_type=%s",
        upload.filename,
        ext,
        len(content),
        content_type or "-",
    )
    return ext, content


async def rebuild_hero_media(
    row_id: str,
    keep_urls: list[str],
    new_uploads: list[UploadFile],
) -> list[str]:
    keep = [str(u).strip() for u in (keep_urls or []) if str(u).strip()]
    uploads = [u for u in (new_uploads or []) if u and getattr(u, "filename", None)]
    logger.info(
        "install-case rebuild_hero_media start id=%s keep=%s new_uploads=%s",
        row_id,
        len(keep),
        len(uploads),
    )
    if len(keep) + len(uploads) > MAX_HERO_MEDIA_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"미디어는 최대 {MAX_HERO_MEDIA_COUNT}개까지 등록할 수 있습니다.",
        )

    staged: list[tuple[str, bytes]] = []
    for url in keep:
        path = resolve_existing_media_path(row_id, url)
        if path and path.is_file():
            ext = path.suffix.lower().lstrip(".") or "jpg"
            staged.append((ext, path.read_bytes()))
        else:
            logger.warning("install-case keep url missing on disk id=%s url=%s", row_id, url)

    for upload in uploads:
        staged.append(await read_upload_staged(upload))

    ensure_install_case_upload_dirs()
    # 기존 파일 교체: 스테이징 후 갤러리 재작성
    temp_dir = INSTALL_CASES_IMAGE_DIR / f".tmp-{row_id}-{uuid4().hex[:8]}"
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    urls: list[str] = []
    try:
        for index, (ext, content) in enumerate(staged):
            dest = temp_dir / f"{index}.{ext}"
            dest.write_bytes(content)
            urls.append(hero_media_api_path(row_id, index, ext))

        clear_gallery_dir(row_id)
        delete_legacy_hero_image_file(row_id)
        if urls:
            final_dir = hero_gallery_dir(row_id)
            temp_dir.rename(final_dir)
            logger.info(
                "install-case media saved id=%s dir=%s count=%s urls=%s",
                row_id,
                final_dir,
                len(urls),
                urls,
            )
        else:
            shutil.rmtree(temp_dir, ignore_errors=True)
            logger.info("install-case media cleared id=%s", row_id)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

    return urls


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


def sanitize_hero_images_value(value) -> list[str]:
    return _normalize_install_case_hero_images(value, None)


def adapt_install_case_values_for_db(values: dict) -> dict:
    adapted = dict(values)
    adapted.pop("keepImages", None)
    specs = adapted.get("specs")
    if isinstance(specs, dict):
        adapted["specs"] = json.dumps(specs, ensure_ascii=False)
    if "heroImages" in adapted:
        images = sanitize_hero_images_value(adapted.get("heroImages"))
        adapted["heroImages"] = json.dumps(images, ensure_ascii=False)
        if "heroImage" not in adapted:
            adapted["heroImage"] = images[0] if images else ""
    return adapted


def sql_placeholders(columns: list[str]) -> list[str]:
    placeholders = []
    for column in columns:
        if column in {"specs", "heroImages"}:
            placeholders.append(f"%({column})s::jsonb")
        else:
            placeholders.append(f"%({column})s")
    return placeholders


def sql_assignments(columns: list[str]) -> list[str]:
    assignments = []
    for column in columns:
        if column in {"specs", "heroImages"}:
            assignments.append(f"{quote_identifier(column)} = %({column})s::jsonb")
        else:
            assignments.append(f"{quote_identifier(column)} = %({column})s")
    return assignments


def sync_hero_fields(images: list[str]) -> dict:
    cleaned = sanitize_hero_images_value(images)
    return {
        "heroImages": cleaned,
        "heroImage": cleaned[0] if cleaned else "",
    }


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
    if "heroImages" not in values:
        images = sanitize_hero_images_value(None)
        single = sanitize_hero_image_value(values.get("heroImage"))
        if single:
            images = [single]
        values["heroImages"] = json.dumps(images, ensure_ascii=False)
        values["heroImage"] = images[0] if images else ""
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
    if "heroImages" in values and "heroImage" not in values:
        try:
            parsed = json.loads(values["heroImages"]) if isinstance(values["heroImages"], str) else values["heroImages"]
        except Exception:
            parsed = []
        images = sanitize_hero_images_value(parsed)
        values["heroImage"] = images[0] if images else ""

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


def set_install_case_hero_media(row_id: str, urls: list[str]) -> dict:
    fields = sync_hero_fields(urls)
    logger.info(
        "install-case DB heroImages update id=%s count=%s urls=%s",
        row_id,
        len(fields["heroImages"]),
        fields["heroImages"],
    )
    return update_install_case_row(
        row_id,
        InstallCasePatch(heroImages=fields["heroImages"], heroImage=fields["heroImage"]),
    )


def delete_install_case_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from install_cases_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install case not found")

    delete_all_install_case_media(row_id)


def parse_install_case_payload(raw_payload: str, model_cls):
    try:
        data = json.loads(raw_payload or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload JSON") from exc
    try:
        return model_cls.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


def extract_keep_images(payload_model) -> list[str]:
    raw = getattr(payload_model, "keepImages", None)
    if raw is None and hasattr(payload_model, "model_extra"):
        raw = (payload_model.model_extra or {}).get("keepImages")
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return []


@router.get("", response_model=list[InstallCaseOut])
def api_list_install_cases():
    return list_install_case_rows()


@router.post("", response_model=InstallCaseOut, status_code=status.HTTP_201_CREATED)
def api_create_install_case(row: InstallCaseCreate):
    images = sanitize_hero_images_value(row.heroImages)
    single = sanitize_hero_image_value(row.heroImage)
    if not images and single:
        images = [single]
    row = row.model_copy(update={**sync_hero_fields(images)})
    return create_install_case_row(row)


@router.post("/form", response_model=InstallCaseOut, status_code=status.HTTP_201_CREATED)
async def api_create_install_case_with_image(
    payload: str = Form(...),
    images: list[UploadFile] | UploadFile | None = File(None),
    image: UploadFile | None = File(None),
):
    row_id = None
    try:
        row = parse_install_case_payload(payload, InstallCaseCreate)
        row = row.model_copy(update={"heroImage": "", "heroImages": []})
        created = create_install_case_row(row)
        row_id = str(created["id"])
        uploads = collect_upload_files(images, image)
        logger.info(
            "install-case create/form id=%s upload_count=%s filenames=%s",
            row_id,
            len(uploads),
            [getattr(u, "filename", None) for u in uploads],
        )
        urls = await rebuild_hero_media(row_id, [], uploads)
        return set_install_case_hero_media(row_id, urls)
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
    updates = {}
    if patch.heroImages is not None:
        fields = sync_hero_fields(sanitize_hero_images_value(patch.heroImages))
        updates.update(fields)
    elif patch.heroImage is not None:
        single = sanitize_hero_image_value(patch.heroImage)
        updates.update(sync_hero_fields([single] if single else []))
    if updates:
        patch = patch.model_copy(update=updates)
    return update_install_case_row(row_id, patch)


@router.patch("/{row_id}/form", response_model=InstallCaseOut)
async def api_update_install_case_with_image(
    row_id: str,
    payload: str = Form(...),
    images: list[UploadFile] | UploadFile | None = File(None),
    image: UploadFile | None = File(None),
):
    try:
        raw = json.loads(payload or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload JSON") from exc

    keep_images = []
    if isinstance(raw.get("keepImages"), list):
        keep_images = [str(x).strip() for x in raw["keepImages"] if str(x).strip()]

    try:
        patch = InstallCasePatch.model_validate({k: v for k, v in raw.items() if k != "keepImages"})
        # 미디어는 파일/ keepImages 로만 갱신
        patch = patch.model_copy(update={"heroImage": None, "heroImages": None})
        data = patch.model_dump(exclude_unset=True)
        data.pop("heroImage", None)
        data.pop("heroImages", None)
        data.pop("keepImages", None)
        if data:
            updated = update_install_case_row(row_id, InstallCasePatch.model_validate(data))
        else:
            row = get_install_case_row(row_id)
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install case not found")
            updated = row_to_install_case(row)

        uploads = collect_upload_files(images, image)
        logger.info(
            "install-case update/form id=%s keep=%s upload_count=%s filenames=%s",
            row_id,
            len(keep_images),
            len(uploads),
            [getattr(u, "filename", None) for u in uploads],
        )
        # keep/upload 중 하나라도 있으면 갤러리 재구성 (전부 삭제 포함: keep=[], uploads=[])
        if "keepImages" in raw or uploads:
            if not keep_images and not uploads:
                # 명시적 전체 삭제
                urls = await rebuild_hero_media(row_id, [], [])
            else:
                urls = await rebuild_hero_media(row_id, keep_images, uploads)
            updated = set_install_case_hero_media(row_id, urls)
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
    # 갤러리 0번 우선, 없으면 레거시 단일 파일
    path = find_gallery_media_path(row_id, 0) or find_hero_media_path(row_id)
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
    if normalized not in set(HERO_MEDIA_EXTENSIONS):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    path = find_gallery_media_path(row_id, 0)
    if path and path.suffix.lower().lstrip(".") == normalized:
        return FileResponse(
            path=path,
            media_type=media_type_for_ext(normalized),
            filename=f"{row_id}.{normalized}",
        )
    legacy = hero_media_disk_path(row_id, normalized)
    if not legacy.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return FileResponse(
        path=legacy,
        media_type=media_type_for_ext(normalized),
        filename=f"{row_id}.{normalized}",
    )


@router.get("/{row_id}/media/{filename}")
def api_get_install_case_gallery_media(row_id: str, filename: str):
    match = re.fullmatch(r"(\d+)\.([a-zA-Z0-9]+)", str(filename or ""))
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    index = int(match.group(1))
    ext = match.group(2).lower()
    if ext not in set(HERO_MEDIA_EXTENSIONS):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    path = hero_gallery_media_path(row_id, index, ext)
    if not path.is_file():
        path = find_gallery_media_path(row_id, index)
    if not path or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return FileResponse(
        path=path,
        media_type=media_type_for_ext(path.suffix.lower().lstrip(".") or ext),
        filename=f"{row_id}-{index}.{ext}",
    )


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_install_case(row_id: str):
    delete_install_case_row(row_id)
