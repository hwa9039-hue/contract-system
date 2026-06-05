from datetime import datetime, timezone
from uuid import uuid4

import logging
import psycopg
from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.excel_import_dedupe import SALES_SIGNATURE_KEYS, import_rows_with_signature_dedupe
from app.schemas import (
    SalesRegisterBulkDelete,
    SalesRegisterCreate,
    SalesRegisterImport,
    SalesRegisterOut,
    SalesRegisterPatch,
    SalesRegisterSummaryUpdate,
    row_to_sales_register,
    sales_register_patch_to_db_values,
    sales_register_to_db_values,
)


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/sales-register", tags=["sales-register"])

RETURNING_COLUMNS = """
  id, "registerDate", client, "projectName", "projectAmount",
  "projectCategory", "projectStage", manager, "projectType",
  department, detail, source, "salesNote", "actionRequest", summary,
  "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


TRUNCATE_TEXT_COLUMNS: set[str] = {
    "client",
    "projectName",
    "projectCategory",
    "projectStage",
    "manager",
    "projectType",
    "department",
    "detail",
    "source",
    "salesNote",
    "actionRequest",
}


def _truncate_text_values(values: dict) -> None:
    """
    Truncate long text values to avoid psycopg StringDataRightTruncation
    when inserting into VARCHAR(50) columns.
    """
    for key in TRUNCATE_TEXT_COLUMNS:
        if key in values and values[key] is not None:
            values[key] = str(values[key])[:50]


def prepare_insert_values(row: SalesRegisterCreate) -> dict:
    values = sales_register_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    _truncate_text_values(values)
    return values


def insert_sales_row(cursor, row: SalesRegisterCreate) -> dict:
    values = prepare_insert_values(row)
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]
    try:
        cursor.execute(
            f"""
            insert into sales_register_rows ({", ".join(quoted_columns)})
            values ({", ".join(placeholders)})
            returning {RETURNING_COLUMNS}
            """,
            values,
        )
    except psycopg.Error as e:
        logger.exception("Failed to insert sales register row (id=%s)", values.get("id"))
        # 프론트엔드에서 행/사유를 보여줄 수 있도록 400 에러로 정리해서 전달
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="데이터 길이가 너무 깁니다. 영업관리대장 텍스트 필드를 50자 이내로 줄여주세요.",
        ) from e
    return row_to_sales_register(cursor.fetchone())


@router.get("", response_model=list[SalesRegisterOut])
def list_sales_register_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from sales_register_rows
                order by "createdAt" asc nulls last, id asc nulls last
                """
            )
            return [row_to_sales_register(row) for row in cursor.fetchall()]


@router.post("", response_model=SalesRegisterOut, status_code=status.HTTP_201_CREATED)
def create_sales_register_row(row: SalesRegisterCreate):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_sales_row(cursor, row)
        connection.commit()

    return created


@router.patch("/{row_id}/summary", response_model=SalesRegisterOut)
def update_sales_register_summary(row_id: str, body: SalesRegisterSummaryUpdate):
    """영업관리대장 요약 전용 — summary 필드만 갱신."""
    summary_value = body.summary if body.summary is not None else None
    values = {
        "id": row_id,
        "summary": summary_value,
        "updatedAt": now_text(),
    }

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update sales_register_rows
                set summary = %(summary)s, "updatedAt" = %(updatedAt)s
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales row not found")

    return row_to_sales_register(updated)


@router.patch("/{row_id}", response_model=SalesRegisterOut)
def update_sales_register_row(row_id: str, patch: SalesRegisterPatch):
    values = sales_register_patch_to_db_values(patch)
    patch_data = patch.model_dump(exclude_unset=True)
    fields_set = getattr(patch, "model_fields_set", None) or set()
    if "summary" in patch_data or "summary" in fields_set:
        values["summary"] = patch_data.get("summary")
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
                update sales_register_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales row not found")

    return row_to_sales_register(updated)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sales_register_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from sales_register_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales row not found")


@router.post("/bulk-delete")
def bulk_delete_sales_register_rows(payload: SalesRegisterBulkDelete):
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from sales_register_rows where id::text = any(%s)", (ids,))
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.delete("")
def delete_all_sales_register_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from sales_register_rows")
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.post("/import", status_code=status.HTTP_201_CREATED)
def import_sales_register_rows(payload: SalesRegisterImport):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created_rows, duplicate_items = import_rows_with_signature_dedupe(
                cursor,
                "sales_register_rows",
                SALES_SIGNATURE_KEYS,
                payload.rows,
                sales_register_to_db_values,
                insert_sales_row,
            )
        connection.commit()

    return {"rows": created_rows, "duplicateItems": duplicate_items}
