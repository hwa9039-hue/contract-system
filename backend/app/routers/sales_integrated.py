"""영업관리(통합) — 영업관리대장·건축정보·사업공유를 상태(중요도)로 모아 본다.

각 테이블의 헤더는 그대로 두고, 목록은 공통 항목만 돌려준다.
상세는 source_key 와 id 로 원본 행의 화면 헤더를 다시 읽는다.
"""

from __future__ import annotations

import re
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.routers.excluded_projects import list_excluded_project_rows
from app.routers.project_discovery import list_project_discovery_rows
from app.routers.sales_register import list_sales_register_rows

router = APIRouter(prefix="/api/sales-integrated", tags=["sales-integrated"])

# 화면 registryImportance.jsx 와 같은 묶음. 쿼리 status 는 이 한글 이름이다.
STATUS_TONES = {
    "검토": "red",
    "대응중": "yellow",
    "보고": "blue",
    "사업공고": "green",
    "종료": "gray",
}

RED_STATUSES = {"확인필요", "보류"}
YELLOW_STATUSES = {"대응중"}
BLUE_STATUSES = {"보고"}
GREEN_STATUSES = {"발주계획", "사전규격", "입찰공고", "정보공개"}
GRAY_STATUSES = {"계약", "마감"}

SOURCES = {
    "sales": "영업관리대장",
    "discovery": "건축정보",
    "excluded": "사업공유",
}


def normalize_status(value: object) -> str:
    text = str(value or "").strip()
    if text == "완료":
        return "마감"
    if text == "대기중":
        return "대응중"
    return text


def classify_status(value: object) -> tuple[str, str]:
    """(status_color, status_label). 네 묶음에 없으면 gray/empty."""
    text = normalize_status(value)
    if not text:
        return "empty", ""
    if text in RED_STATUSES:
        return "red", "검토"
    if text in YELLOW_STATUSES:
        return "yellow", "대응중"
    if text in BLUE_STATUSES:
        return "blue", "보고"
    if text in GREEN_STATUSES:
        return "green", "사업공고"
    if text in GRAY_STATUSES:
        return "gray", "종료"
    return "gray", "기타"


def _text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _date_text(value: object) -> str:
    text = _text(value)
    matched = re.match(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})", text)
    if not matched:
        return text[:10] if len(text) >= 10 and text[4:5] == "-" else text
    year, month, day = (int(part) for part in matched.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return text


def _amount_text(value: object) -> str:
    digits = re.sub(r"[^\d]", "", _text(value))
    if not digits or int(digits) == 0:
        return ""
    return f"{int(digits):,}원"


def _column(label: str, value: object, *, amount: bool = False) -> dict:
    shown = _amount_text(value) if amount else _text(value)
    return {"label": label, "value": shown}


def _sales_columns(row: dict, tone_label: str) -> list[dict]:
    return [
        _column("중요도", tone_label),
        _column("등록일", row.get("registerDate")),
        _column("발주처", row.get("client")),
        _column("사업명", row.get("projectName")),
        _column("상태", normalize_status(row.get("projectStage"))),
        _column("사업금액", row.get("projectAmount"), amount=True),
        _column("담당자", row.get("manager")),
        _column("세부내용", row.get("detail")),
        _column("담당부서", row.get("department")),
        _column("출처", row.get("source")),
    ]


def _discovery_columns(row: dict, tone_label: str) -> list[dict]:
    return [
        _column("중요도", tone_label),
        _column("등록일", row.get("permitDate")),
        _column("발주처", row.get("client")),
        _column("사업명", row.get("projectName")),
        _column("상태", normalize_status(row.get("projectStage"))),
        _column("사업금액", row.get("projectAmount"), amount=True),
        _column("세부내용", row.get("note")),
        _column("사업구분", row.get("projectCategory")),
        _column("준공시기", row.get("completionPeriod")),
        _column("담당자", row.get("manager")),
    ]


def _excluded_columns(row: dict, tone_label: str) -> list[dict]:
    return [
        _column("중요도", tone_label),
        _column("등록일", row.get("writeDate")),
        _column("발주처", row.get("client")),
        _column("사업명", row.get("projectName")),
        _column("상태", normalize_status(row.get("category"))),
        _column("사업금액", row.get("projectAmount"), amount=True),
        _column("세부내용", row.get("exclusionReason")),
        _column("작성자", row.get("writer")),
        _column("공유", row.get("shareStatus")),
    ]


def _item(
    *,
    source_key: str,
    row: dict,
    raw_status: object,
    date_value: object,
    title: object,
    client: object,
    amount: object,
    manager: object,
) -> dict | None:
    status_color, status_label = classify_status(raw_status)
    item = {
        "id": _text(row.get("id")),
        "status_color": status_color,
        "status_label": status_label,
        "source_menu": SOURCES[source_key],
        "source_key": source_key,
        "date": _date_text(date_value),
        "client": _text(client),
        "title": _text(title),
        "amount": _amount_text(amount),
        "manager": _text(manager),
    }
    if not item["id"]:
        return None
    if not any(
        (
            item["title"],
            item["client"],
            item["amount"],
            item["date"],
            item["manager"],
            normalize_status(raw_status),
        )
    ):
        return None
    return item


def _collect_rows() -> list[dict]:
    rows: list[dict] = []
    for row in list_sales_register_rows():
        item = _item(
            source_key="sales",
            row=row,
            raw_status=row.get("projectStage"),
            date_value=row.get("registerDate"),
            title=row.get("projectName"),
            client=row.get("client"),
            amount=row.get("projectAmount"),
            manager=row.get("manager"),
        )
        if item:
            rows.append(item)
    for row in list_project_discovery_rows():
        if row.get("isHidden"):
            continue
        item = _item(
            source_key="discovery",
            row=row,
            raw_status=row.get("projectStage"),
            date_value=row.get("permitDate"),
            title=row.get("projectName"),
            client=row.get("client"),
            amount=row.get("projectAmount"),
            manager=row.get("manager"),
        )
        if item:
            rows.append(item)
    for row in list_excluded_project_rows():
        if row.get("isHidden"):
            continue
        item = _item(
            source_key="excluded",
            row=row,
            raw_status=row.get("category"),
            date_value=row.get("writeDate"),
            title=row.get("projectName"),
            client=row.get("client"),
            amount=row.get("projectAmount"),
            manager=row.get("writer"),
        )
        if item:
            rows.append(item)
    # 날짜 최신순. 같은 날짜는 사업명 가나다순. 날짜가 없는 행은 맨 뒤.
    dated = [row for row in rows if row["date"]]
    undated = [row for row in rows if not row["date"]]
    dated.sort(key=lambda row: row["title"])
    dated.sort(key=lambda row: row["date"], reverse=True)
    undated.sort(key=lambda row: row["title"])
    return dated + undated


def _find_source_row(source_key: str, row_id: str) -> dict | None:
    target = _text(row_id)
    if source_key == "sales":
        pool = list_sales_register_rows()
    elif source_key == "discovery":
        pool = list_project_discovery_rows()
    elif source_key == "excluded":
        pool = list_excluded_project_rows()
    else:
        return None
    for row in pool:
        if _text(row.get("id")) == target:
            return row
    return None


@router.get("")
def list_sales_integrated(status_name: str = Query(default="", alias="status")):
    """status 가 비어 있거나 all 이면 전체. 검토·대응중·보고·사업공고·종료 만 묶음 필터다."""
    requested = str(status_name or "").strip()
    if requested in ("", "all", "전체", "전체보기"):
        label = ""
    elif requested in STATUS_TONES:
        label = requested
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be 검토, 대응중, 보고, 사업공고, 종료, or all",
        )
    rows = _collect_rows()
    if label:
        rows = [row for row in rows if row["status_label"] == label]
    return rows


@router.get("/{source_key}/{row_id}")
def get_sales_integrated_detail(source_key: str, row_id: str):
    """원본 메뉴의 화면 헤더 순서대로 한 행을 돌려준다."""
    if source_key not in SOURCES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown source menu")
    row = _find_source_row(source_key, row_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Row not found")

    if source_key == "sales":
        raw_status = row.get("projectStage")
        columns = _sales_columns
    elif source_key == "discovery":
        raw_status = row.get("projectStage")
        columns = _discovery_columns
    else:
        raw_status = row.get("category")
        columns = _excluded_columns

    status_color, status_label = classify_status(raw_status)
    return {
        "id": _text(row.get("id")),
        "source_key": source_key,
        "source_menu": SOURCES[source_key],
        "status_color": status_color,
        "status_label": status_label,
        "columns": columns(row, status_label),
    }
