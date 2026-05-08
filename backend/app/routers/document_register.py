from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    DocumentRegisterBulkDelete,
    DocumentRegisterCreate,
    DocumentRegisterImport,
    DocumentRegisterOut,
    DocumentRegisterPatch,
    document_register_to_db_values,
    row_to_document_register,
)


router = APIRouter(prefix="/api/document-register", tags=["document-register"])

RETURNING_COLUMNS = """
  id, "docDate", "docNo", "senderReceiver", title,
  method, writer, note, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_insert_values(row: DocumentRegisterCreate) -> dict:
    values = document_register_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    return values


def insert_document_register_row(cursor, row: DocumentRegisterCreate) -> dict:
    values = prepare_insert_values(row)
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]
    cursor.execute(
        f"""
        insert into document_register_rows ({", ".join(quoted_columns)})
        values ({", ".join(placeholders)})
        returning {RETURNING_COLUMNS}
        """,
        values,
    )
    return row_to_document_register(cursor.fetchone())


@router.get("", response_model=list[DocumentRegisterOut])
def list_document_register_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from document_register_rows
                order by "createdAt" asc nulls last, id asc nulls last
                """
            )
            return [row_to_document_register(row) for row in cursor.fetchall()]


@router.post("", response_model=DocumentRegisterOut, status_code=status.HTTP_201_CREATED)
def create_document_register_row(row: DocumentRegisterCreate):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_document_register_row(cursor, row)
        connection.commit()

    return created


@router.patch("/{row_id}", response_model=DocumentRegisterOut)
def update_document_register_row(row_id: str, patch: DocumentRegisterPatch):
    values = document_register_to_db_values(patch)
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
                update document_register_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document row not found")

    return row_to_document_register(updated)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_register_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from document_register_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document row not found")


@router.post("/bulk-delete")
def bulk_delete_document_register_rows(payload: DocumentRegisterBulkDelete):
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from document_register_rows where id::text = any(%s)", (ids,))
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.delete("")
def delete_all_document_register_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from document_register_rows")
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.post("/import", response_model=list[DocumentRegisterOut], status_code=status.HTTP_201_CREATED)
def import_document_register_rows(payload: DocumentRegisterImport):
    created_rows = []

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for row in payload.rows:
                created_rows.append(insert_document_register_row(cursor, row))
        connection.commit()

    return created_rows
