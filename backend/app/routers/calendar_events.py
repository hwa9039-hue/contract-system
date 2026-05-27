from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    CalendarManualEventBulkImport,
    CalendarManualEventCreate,
    CalendarManualEventOut,
    CalendarManualEventPatch,
    calendar_manual_event_to_db_values,
    row_to_calendar_manual_event,
)

CALENDAR_EVENTS_API_PATH = "/api/calendar-events"
router = APIRouter(tags=["calendar-events"])

RETURNING_COLUMNS = """
  id, "dateStart", "dateEnd", title, owner, pm, note, "createdAt", "updatedAt"
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def now_text() -> str:
    return datetime.now(timezone.utc).isoformat()


def prepare_insert_values(row: CalendarManualEventCreate) -> dict:
    values = calendar_manual_event_to_db_values(row)
    timestamp = now_text()
    values["id"] = str(uuid4())
    values.setdefault("createdAt", timestamp)
    values.setdefault("updatedAt", timestamp)
    return values


def list_calendar_manual_event_rows():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from calendar_manual_events
                order by "dateStart" desc nulls last, "createdAt" desc nulls last
                """
            )
            return [row_to_calendar_manual_event(row) for row in cursor.fetchall()]


def create_calendar_manual_event_row(row: CalendarManualEventCreate):
    values = prepare_insert_values(row)
    columns = list(values.keys())
    quoted_columns = [quote_identifier(column) for column in columns]
    placeholders = [f"%({column})s" for column in columns]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                insert into calendar_manual_events ({", ".join(quoted_columns)})
                values ({", ".join(placeholders)})
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            created = cursor.fetchone()
        connection.commit()

    return row_to_calendar_manual_event(created)


@router.get(CALENDAR_EVENTS_API_PATH, response_model=list[CalendarManualEventOut])
def api_list_calendar_manual_events():
    return list_calendar_manual_event_rows()


@router.post(CALENDAR_EVENTS_API_PATH, response_model=CalendarManualEventOut, status_code=status.HTTP_201_CREATED)
def api_create_calendar_manual_event(row: CalendarManualEventCreate):
    return create_calendar_manual_event_row(row)


@router.post(f"{CALENDAR_EVENTS_API_PATH}/import", response_model=list[CalendarManualEventOut])
def api_import_calendar_manual_events(body: CalendarManualEventBulkImport):
    if not body.events:
        return list_calendar_manual_event_rows()

    created_rows: list[dict] = []
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for row in body.events:
                values = prepare_insert_values(row)
                columns = list(values.keys())
                quoted_columns = [quote_identifier(column) for column in columns]
                placeholders = [f"%({column})s" for column in columns]
                cursor.execute(
                    f"""
                    insert into calendar_manual_events ({", ".join(quoted_columns)})
                    values ({", ".join(placeholders)})
                    returning {RETURNING_COLUMNS}
                    """,
                    values,
                )
                created = cursor.fetchone()
                if created:
                    created_rows.append(row_to_calendar_manual_event(created))
        connection.commit()

    return created_rows


@router.patch(f"{CALENDAR_EVENTS_API_PATH}/{{row_id}}", response_model=CalendarManualEventOut)
def api_update_calendar_manual_event(row_id: str, patch: CalendarManualEventPatch):
    values = calendar_manual_event_to_db_values(patch)
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
                update calendar_manual_events
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")

    return row_to_calendar_manual_event(updated)


@router.delete(f"{CALENDAR_EVENTS_API_PATH}/{{row_id}}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_calendar_manual_event(row_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from calendar_manual_events where id::text = %s", (row_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
