from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    WeeklyWorkReportCreate,
    WeeklyWorkReportOut,
    WeeklyWorkReportPatch,
    row_to_weekly_work_report,
    weekly_work_report_to_db_values,
)


router = APIRouter(prefix="/api/weekly-work-reports", tags=["weekly-work-reports"])

RETURNING_COLUMNS = """
  id, "reportYear", "reportMonth", "weekNumber", "weekStartDate",
  "reportDate", assignee, team, category, content,
  "createdAt", "updatedAt", date, "user", section, order_index
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_insert_values(row: WeeklyWorkReportCreate) -> dict:
    values = weekly_work_report_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    return values


@router.get("", response_model=list[WeeklyWorkReportOut])
def list_weekly_work_report_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from weekly_work_reports_rows
                order by date desc nulls last, order_index asc nulls last, "createdAt" asc nulls last
                """
            )
            return [row_to_weekly_work_report(row) for row in cursor.fetchall()]


@router.post("", response_model=WeeklyWorkReportOut, status_code=status.HTTP_201_CREATED)
def create_weekly_work_report_row(row: WeeklyWorkReportCreate):
    values = prepare_insert_values(row)
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                insert into weekly_work_reports_rows ({", ".join(quoted_columns)})
                values ({", ".join(placeholders)})
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            created = cursor.fetchone()
        connection.commit()

    return row_to_weekly_work_report(created)


@router.patch("/{row_id}", response_model=WeeklyWorkReportOut)
def update_weekly_work_report_row(row_id: str, patch: WeeklyWorkReportPatch):
    values = weekly_work_report_to_db_values(patch)
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
                update weekly_work_reports_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly work report not found")

    return row_to_weekly_work_report(updated)


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weekly_work_report_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from weekly_work_reports_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly work report not found")
