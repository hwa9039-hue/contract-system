from datetime import datetime, timezone
from uuid import uuid4

import logging
import psycopg
from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.excel_import_dedupe import DISCOVERY_SIGNATURE_KEYS, import_rows_with_signature_dedupe
from app.schemas import (
    ProjectDiscoveryBulkDelete,
    ProjectDiscoveryCreate,
    ProjectDiscoveryImport,
    ProjectDiscoveryOut,
    ProjectDiscoveryPatch,
    project_discovery_to_db_values,
    row_to_project_discovery,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/project-discovery", tags=["project-discovery"])

RETURNING_COLUMNS = """
  id, "permitDate", "checkStatus", "salesTarget", "projectCategory",
  "localGov", client, "projectName", "projectAmount", "completionPeriod",
  manager, note, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


TRUNCATE_TEXT_COLUMNS: set[str] = {
    "permitDate",
    "checkStatus",
    "salesTarget",
    "projectCategory",
    "localGov",
    "client",
    "projectName",
    "completionPeriod",
    "manager",
    "note",
}


def _truncate_text_values(values: dict) -> None:
    """Guard VARCHAR-limited production schemas from Excel text overflow."""
    for key in TRUNCATE_TEXT_COLUMNS:
        if key in values and values[key] is not None:
            values[key] = str(values[key])[:50]


def prepare_insert_values(row: ProjectDiscoveryCreate) -> dict:
    values = project_discovery_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    _truncate_text_values(values)
    return values


def insert_discovery_row(cursor, row: ProjectDiscoveryCreate) -> dict:
    values = prepare_insert_values(row)
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]
    try:
        cursor.execute(
            f"""
            insert into project_discovery_rows ({", ".join(quoted_columns)})
            values ({", ".join(placeholders)})
            returning {RETURNING_COLUMNS}
            """,
            values,
        )
    except psycopg.Error as e:
        logger.exception("Failed to insert project discovery row (id=%s)", values.get("id"))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="건축정보 데이터 저장 중 오류가 발생했습니다. 텍스트 길이 또는 금액 형식을 확인해주세요.",
        ) from e
    return row_to_project_discovery(cursor.fetchone())


@router.get("", response_model=list[ProjectDiscoveryOut])
def list_project_discovery_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from project_discovery_rows
                order by "createdAt" asc nulls last, id asc nulls last
                """
            )
            return [row_to_project_discovery(row) for row in cursor.fetchall()]


@router.post("", response_model=ProjectDiscoveryOut, status_code=status.HTTP_201_CREATED)
def create_project_discovery_row(row: ProjectDiscoveryCreate):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_discovery_row(cursor, row)
        connection.commit()

    return created


@router.patch("/{row_id}", response_model=ProjectDiscoveryOut)
def update_project_discovery_row(row_id: str, patch: ProjectDiscoveryPatch):
    values = project_discovery_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

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
                update project_discovery_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discovery row not found")

    return row_to_project_discovery(updated)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_discovery_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from project_discovery_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discovery row not found")


@router.post("/bulk-delete")
def bulk_delete_project_discovery_rows(payload: ProjectDiscoveryBulkDelete):
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from project_discovery_rows where id::text = any(%s)", (ids,))
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.delete("")
def delete_all_project_discovery_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from project_discovery_rows")
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.post("/import", status_code=status.HTTP_201_CREATED)
def import_project_discovery_rows(payload: ProjectDiscoveryImport):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created_rows, duplicate_items = import_rows_with_signature_dedupe(
                cursor,
                "project_discovery_rows",
                DISCOVERY_SIGNATURE_KEYS,
                payload.rows,
                project_discovery_to_db_values,
                insert_discovery_row,
            )
        connection.commit()

    return {"rows": created_rows, "duplicateItems": duplicate_items}
