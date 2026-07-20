"""건축정보·사업공유 → 영업관리대장 데이터 매핑.

의미가 100% 동일한 핵심 필드만 1:1로 옮긴다.
스키마가 맞지 않는 원본 필드는 버리고, 세부내용에는 원본 세부내용만 넣는다.
담당자/작성자는 영업담당자와 의미가 다르므로 매핑하지 않는다.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from app.schemas import SalesRegisterCreate


SALES_STAGE_VALUES = frozenset(
    {
        "보고",
        "대응중",
        "확인필요",
        "마감",
        "계약",
        "발주계획",
        "사전규격",
        "입찰공고",
    }
)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _parse_date_only(value: Any) -> Optional[str]:
    """YYYY-MM-DD 로 파싱 가능하면 그 문자열, 아니면 None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    candidate = text[:10]
    try:
        return date.fromisoformat(candidate).isoformat()
    except ValueError:
        return None


def _today_iso() -> str:
    return date.today().isoformat()


def _normalize_stage(value: Any) -> str:
    stage = _as_text(value)
    if stage == "완료":
        return "마감"
    if stage in SALES_STAGE_VALUES:
        return stage
    return ""


def map_discovery_row_to_sales(row: dict[str, Any]) -> SalesRegisterCreate:
    """건축정보 → 영업관리대장 (엄격 1:1, 잉여 필드 Drop)."""
    register_date = _parse_date_only(row.get("permitDate")) or _today_iso()
    summary_text = _as_text(row.get("summary"))

    return SalesRegisterCreate(
        registerDate=register_date,
        client=_as_text(row.get("client")),
        projectName=_as_text(row.get("projectName")),
        projectAmount=row.get("projectAmount") if row.get("projectAmount") is not None else 0,
        projectCategory=_as_text(row.get("projectCategory")),
        projectStage=_normalize_stage(row.get("projectStage")),
        # 건축정보 담당자/영업자 ≠ 영업관리대장 영업담당자 → 비움
        manager="",
        projectType="",
        department="",
        # 원본 세부내용(note)만. 준공시기·확인·지자체 등 병합 금지
        detail=_as_text(row.get("note")),
        source="건축정보",
        salesNote="",
        actionRequest="",
        summary=summary_text or None,
    )


def map_excluded_row_to_sales(row: dict[str, Any]) -> SalesRegisterCreate:
    """사업공유 → 영업관리대장 (엄격 1:1, 잉여 필드 Drop)."""
    register_date = _parse_date_only(row.get("writeDate")) or _today_iso()

    return SalesRegisterCreate(
        registerDate=register_date,
        client=_as_text(row.get("client")),
        projectName=_as_text(row.get("projectName")),
        projectAmount=row.get("projectAmount") if row.get("projectAmount") is not None else 0,
        projectCategory="",
        projectStage=_normalize_stage(row.get("category")),
        # 사업공유 작성자 ≠ 영업관리대장 영업담당자 → 비움
        manager="",
        projectType="",
        department="",
        # 원본 세부내용(exclusionReason)만. 순번·공개일·키워드 등 병합 금지
        detail=_as_text(row.get("exclusionReason")),
        source="사업공유",
        salesNote="",
        actionRequest="",
        summary=None,
    )
