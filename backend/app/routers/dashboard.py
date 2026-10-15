"""대시보드 '다가오는 일정': 준공 현황과 수기 캘린더 일정을 날짜순으로 합친다."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter

from app.database import get_connection

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

SEOUL = ZoneInfo("Asia/Seoul")
COMPLETE = "준공완료"


def _text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _text(value)[:10]
    if len(text) < 10:
        return None
    try:
        year, month, day = (int(part) for part in text.split("-"))
        return date(year, month, day)
    except (TypeError, ValueError):
        return None


def _process_status(value) -> str:
    raw = _text(value)
    if raw == "시공중":
        return "진행중"
    if raw == "준공":
        return COMPLETE
    return raw


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _dday_label(due, process: str, today: date) -> str:
    if process == COMPLETE:
        return "준공"
    if process == "준공진행":
        return "준공진행"
    if due is None:
        return ""
    diff = (due - today).days
    if diff < 0:
        return "준공지연"
    if diff == 0:
        return "D-Day"
    return f"D-{diff}"


def _contract_items(today: date) -> list[dict]:
    this_monday = _monday(today)
    last_monday = this_monday - timedelta(days=7)
    last_sunday = this_monday - timedelta(days=1)
    this_sunday = this_monday + timedelta(days=6)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select id, "projectName", client, "salesOwner", pm, "dueDate", "processStatus"
                from contracts_rows
                """
            )
            rows = cursor.fetchall()

    items = []
    for row in rows:
        process = _process_status(row.get("processStatus"))
        if process == COMPLETE:
            continue
        due = _as_date(row.get("dueDate"))
        due_text = due.isoformat() if due else ""
        base = {
            "id": _text(row.get("id")),
            "source": "contract",
            "title": _text(row.get("projectName")),
            "projectName": _text(row.get("projectName")),
            "date": due_text,
            "dateEnd": "",
            "dueDate": due_text,
            "client": _text(row.get("client")),
            "salesManager": _text(row.get("salesOwner")),
            "fieldPM": _text(row.get("pm")),
            "note": "",
            "dday": _dday_label(due, process, today),
            "processStatus": process,
        }
        if not base["id"]:
            continue
        if process == "준공진행":
            items.append({**base, "variant": "inProgress"})
            continue
        if due is None:
            continue
        in_last_week = last_monday <= due <= last_sunday
        in_this_week = this_monday <= due <= this_sunday
        if (in_last_week or in_this_week) and due < today:
            items.append({**base, "variant": "delayed"})
        elif in_this_week and due >= today:
            items.append({**base, "variant": "week"})
    return items


def _calendar_items(today: date) -> list[dict]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select id, "dateStart", "dateEnd", title, owner, pm, note
                from calendar_manual_events
                where coalesce("dateEnd", "dateStart") >= %(today)s
                """,
                {"today": today},
            )
            rows = cursor.fetchall()

    items = []
    for row in rows:
        start = _as_date(row.get("dateStart"))
        end = _as_date(row.get("dateEnd")) or start
        if start is None or end is None or end < today:
            continue
        start_text = start.isoformat()
        end_text = end.isoformat()
        title = _text(row.get("title")) or "일정"
        items.append(
            {
                "id": f"cal-{_text(row.get('id'))}",
                "source": "calendar",
                "variant": "schedule",
                "title": title,
                "projectName": title,
                "date": start_text,
                "dateEnd": end_text,
                "dueDate": start_text,
                "client": "",
                "salesManager": _text(row.get("owner")),
                "fieldPM": _text(row.get("pm")),
                "note": _text(row.get("note")),
                "dday": "",
                "processStatus": "",
            }
        )
    return items


@router.get("/upcoming")
def upcoming_schedule():
    today = datetime.now(SEOUL).date()
    items = _contract_items(today) + _calendar_items(today)
    items.sort(key=lambda row: (row.get("date") or "9999-12-31", row.get("title") or ""))
    return {"items": items}
