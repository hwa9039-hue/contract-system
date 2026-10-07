import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

logger = logging.getLogger(__name__)

from app.database import get_connection
from app.schemas import (
    WeeklyWorkReportCreate,
    WeeklyWorkReportOut,
    WeeklyWorkReportPatch,
    decode_work_report_wire_content,
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


MEETING_MINUTES_SECTION = "회의록"


def _text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _plain_meeting_content(content) -> str:
    text = _text(decode_work_report_wire_content(content))
    for prefix in ("mm3\n", "mm2\n"):
        if text.startswith(prefix):
            return text[len(prefix) :].strip()
    return text


def _agenda_items(content) -> list[dict]:
    text = _plain_meeting_content(content)
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [{"content": text, "assignee": "", "dueDate": ""}]

    if isinstance(parsed, dict):
        agenda = parsed.get("agenda") or parsed.get("rows") or parsed.get("items")
    elif isinstance(parsed, list):
        agenda = parsed
    else:
        agenda = None
    if not isinstance(agenda, list):
        return [{"content": text, "assignee": "", "dueDate": ""}]

    items = []
    for row in agenda:
        if isinstance(row, dict):
            assignees = row.get("assignees")
            if isinstance(assignees, list):
                assignee = ", ".join(_text(name) for name in assignees if _text(name))
            else:
                assignee = _text(row.get("assignee") or row.get("person"))
            items.append(
                {
                    "content": _text(row.get("content") or row.get("text")),
                    "assignee": assignee,
                    "dueDate": _text(row.get("dueDate") or row.get("due")),
                }
            )
        elif isinstance(row, list):
            items.append(
                {
                    "content": _text(row[0] if row else ""),
                    "assignee": _text(row[1] if len(row) > 1 else ""),
                    "dueDate": _text(row[2] if len(row) > 2 else ""),
                }
            )
    return items


@router.get("/meeting-minutes/search")
def search_meeting_minutes(q: str = Query(default="")):
    """현재 주차가 아니라 저장된 회의록 전체에서 내용·담당자·기한을 찾는다."""
    query = _text(q).lower()
    if not query:
        return []

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from weekly_work_reports_rows
                where section = %(section)s or category = %(section)s
                order by "weekStartDate" desc nulls last, date desc nulls last, order_index asc nulls last
                """,
                {"section": MEETING_MINUTES_SECTION},
            )
            stored_rows = [row_to_weekly_work_report(row) for row in cursor.fetchall()]

    hits = []
    for stored in stored_rows:
        for index, item in enumerate(_agenda_items(stored.get("content")), start=1):
            if not any((item["content"], item["assignee"], item["dueDate"])):
                continue
            haystack = " ".join((item["content"], item["assignee"], item["dueDate"])).lower()
            if query not in haystack:
                continue
            hits.append(
                {
                    "id": f"{stored.get('id')}:{index}",
                    "sourceId": stored.get("id"),
                    "agendaIndex": index,
                    "weekStartDate": _text(stored.get("weekStartDate") or stored.get("date")),
                    "reportYear": stored.get("reportYear") or "",
                    "reportMonth": stored.get("reportMonth") or "",
                    "weekNumber": stored.get("weekNumber") or "",
                    "content": item["content"],
                    "assignee": item["assignee"],
                    "dueDate": item["dueDate"],
                }
            )
    return hits


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
    try:
        return _create_weekly_work_report_row(row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("weekly work report create failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"weekly work report create failed: {exc}",
        ) from exc


def _create_weekly_work_report_row(row: WeeklyWorkReportCreate):
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
    try:
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
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("weekly work report patch failed for id=%s", row_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"weekly work report update failed: {exc}",
        ) from exc


@router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weekly_work_report_row(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from weekly_work_reports_rows where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly work report not found")
