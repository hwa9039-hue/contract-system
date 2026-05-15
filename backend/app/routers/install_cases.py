from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    InstallCaseCreate,
    InstallCaseOut,
    InstallCasePatch,
    install_case_to_db_values,
    row_to_install_case,
)


# 경로는 main.py 에서 prefix="/api" 와 합쳐져 POST/GET /api/install-cases 가 됩니다.
router = APIRouter(prefix="/install-cases", tags=["install-cases"])

RETURNING_COLUMNS = """
  id, "projectName", "heroImage", environment, audience, year,
  purpose, client, specs, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_insert_values(row: InstallCaseCreate) -> dict:
    values = install_case_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    return values


@router.get("", response_model=list[InstallCaseOut])
@router.get("/", response_model=list[InstallCaseOut], include_in_schema=False)
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


@router.post("", response_model=InstallCaseOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=InstallCaseOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_install_case_row(row: InstallCaseCreate):
    values = prepare_insert_values(row)
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


@router.patch("/{row_id}", response_model=InstallCaseOut)
def update_install_case_row(row_id: str, patch: InstallCasePatch):
    values = install_case_to_db_values(patch)
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


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_install_case_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from install_cases_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install case not found")
