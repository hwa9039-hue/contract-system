from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    BudgetProgressBulkDelete,
    BudgetProgressCreate,
    BudgetProgressImport,
    BudgetProgressOut,
    BudgetProgressPatch,
    budget_progress_to_db_values,
    row_to_budget_progress,
)


router = APIRouter(prefix="/api/budget-progress", tags=["budget-progress"])

RETURNING_COLUMNS = """
  id, "registerDate", "localGov", "projectName", "budgetAmount",
  manager, "projectStage", department, detail, "salesMatch",
  note, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_insert_values(row: BudgetProgressCreate) -> dict:
    values = budget_progress_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    return values


def insert_budget_row(cursor, row: BudgetProgressCreate) -> dict:
    values = prepare_insert_values(row)
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]
    cursor.execute(
        f"""
        insert into budget_progress_rows ({", ".join(quoted_columns)})
        values ({", ".join(placeholders)})
        returning {RETURNING_COLUMNS}
        """,
        values,
    )
    return row_to_budget_progress(cursor.fetchone())


@router.get("", response_model=list[BudgetProgressOut])
def list_budget_progress_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from budget_progress_rows
                order by "createdAt" asc nulls last, id asc nulls last
                """
            )
            return [row_to_budget_progress(row) for row in cursor.fetchall()]


@router.post("", response_model=BudgetProgressOut, status_code=status.HTTP_201_CREATED)
def create_budget_progress_row(row: BudgetProgressCreate):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_budget_row(cursor, row)
        connection.commit()

    return created


@router.patch("/{row_id}", response_model=BudgetProgressOut)
def update_budget_progress_row(row_id: str, patch: BudgetProgressPatch):
    values = budget_progress_to_db_values(patch)
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
                update budget_progress_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget row not found")

    return row_to_budget_progress(updated)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_progress_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from budget_progress_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget row not found")


@router.post("/bulk-delete")
def bulk_delete_budget_progress_rows(payload: BudgetProgressBulkDelete):
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from budget_progress_rows where id::text = any(%s)", (ids,))
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.delete("")
def delete_all_budget_progress_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from budget_progress_rows")
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}


@router.post("/import", response_model=list[BudgetProgressOut], status_code=status.HTTP_201_CREATED)
def import_budget_progress_rows(payload: BudgetProgressImport):
    created_rows = []

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for row in payload.rows:
                created_rows.append(insert_budget_row(cursor, row))
        connection.commit()

    return created_rows
