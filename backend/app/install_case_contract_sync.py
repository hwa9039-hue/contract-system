"""계약현황 → 설치사례 초안(DRAFT) 자동 연동.

계약분류가 전광판·VMS 계열인 계약이 화면에서 한 건씩 새로 등록될 때,
또는 그렇게 새로 등록된 계약(insertedAt 있음)을 수정할 때만 설치사례 행을 만든다.
기존 계약 전체 스캔·엑셀 일괄 등록·과거 계약 수정으로는 만들지 않는다.
같은 계약(sourceContractId)에 대해 중복 생성하지 않는다.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any

logger = logging.getLogger(__name__)

DRAFT_STATUS = "draft"


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def is_install_case_sync_contract_type(contract_type: Any) -> bool:
    """계약분류가 전광판 또는 VMS 인지 (코드·한글 라벨 혼용)."""
    raw = _safe_text(contract_type)
    if not raw or raw in {"-", "--"}:
        return False
    compact = re.sub(r"[\s,]+", "", raw)
    lower = compact.lower()
    if "vms" in lower:
        return True
    if "전광판" in compact or "디스플레이" in compact:
        return True
    if "55121903" in compact:
        return True
    return False


def _parse_due_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _safe_text(value)
    if not text or text in {"-", "--"}:
        return None
    # YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    m = re.match(r"^(\d{4})[./-](\d{1,2})[./-](\d{1,2})", text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    # YYYYMMDD
    digits = re.sub(r"\D", "", text)
    if len(digits) >= 8:
        try:
            return date(int(digits[0:4]), int(digits[4:6]), int(digits[6:8]))
        except ValueError:
            return None
    return None


def format_install_case_year_from_due(value: Any) -> str:
    """준공일자 → 사업년도 YYYY.MM"""
    due = _parse_due_date(value)
    if not due:
        return ""
    return f"{due.year}.{due.month:02d}"


def format_source_due_date(value: Any) -> str:
    due = _parse_due_date(value)
    return due.isoformat() if due else ""


def format_contract_amount_digits(amount: Any) -> str:
    if amount is None:
        return ""
    digits = re.sub(r"\D", "", str(amount)).lstrip("0")
    return digits


def _contract_mapping_fields(contract_row: dict) -> dict:
    due_raw = contract_row.get("dueDate")
    return {
        "projectName": _safe_text(contract_row.get("projectName")),
        "client": _safe_text(contract_row.get("client")),
        "contractAmount": format_contract_amount_digits(contract_row.get("amount")),
        "year": format_install_case_year_from_due(due_raw),
        "sourceDueDate": format_source_due_date(due_raw),
    }


def _row_has_photo(row: dict | None) -> bool:
    if not row:
        return False
    if _safe_text(row.get("heroImage")):
        return True
    images = row.get("heroImages")
    if isinstance(images, str):
        text = images.strip()
        return bool(text) and text not in {"[]", "null"}
    if isinstance(images, list):
        return any(_safe_text(item) for item in images)
    return False


def collapse_duplicate_contract_install_cases(cursor) -> int:
    """같은 계약(sourceContractId)에 묶인 설치사례가 여러 건이면 사진 없는 중복만 삭제."""
    cursor.execute(
        """
        with ranked as (
          select
            id,
            row_number() over (
              partition by trim("sourceContractId")
              order by
                case when coalesce(trim("heroImage"), '') <> '' then 0 else 1 end,
                "updatedAt" desc nulls last,
                "createdAt" desc nulls last
            ) as rn
          from install_cases_rows
          where coalesce(trim("sourceContractId"), '') <> ''
        )
        delete from install_cases_rows
        where id in (select id from ranked where rn > 1)
          and coalesce(trim("heroImage"), '') = ''
          and (
            "heroImages" is null
            or "heroImages" = '[]'::jsonb
            or "heroImages" = 'null'::jsonb
            or jsonb_typeof("heroImages") = 'null'
            or (
              jsonb_typeof("heroImages") = 'array'
              and jsonb_array_length("heroImages") = 0
            )
          )
        """
    )
    return int(cursor.rowcount or 0)


def sync_install_case_draft_from_contract(cursor, contract_row: dict | None) -> str | None:
    """전광판/VMS 계약이면 설치사례를 sourceContractId 기준으로 upsert.

    같은 계약 건이 이미 있으면 Insert 하지 않고 Update 한다.
    """
    if not contract_row:
        return None
    contract_id = _safe_text(contract_row.get("id"))
    if not contract_id:
        return None
    if not is_install_case_sync_contract_type(contract_row.get("contractType")):
        return None

    fields = _contract_mapping_fields(contract_row)
    cursor.execute(
        """
        select id::text as id, status, "heroImage", "heroImages"
        from install_cases_rows
        where trim("sourceContractId") = %s
        order by
          case when coalesce(trim("heroImage"), '') <> '' then 0 else 1 end,
          "updatedAt" desc nulls last
        """,
        (contract_id,),
    )
    matches = cursor.fetchall() or []
    if matches:
        keeper = matches[0]
        existing_id = _safe_text(keeper.get("id"))
        extra_ids = [
            _safe_text(row.get("id"))
            for row in matches[1:]
            if _safe_text(row.get("id")) and not _row_has_photo(row)
        ]
        if extra_ids:
            cursor.execute(
                "delete from install_cases_rows where id::text = any(%s)",
                (extra_ids,),
            )
        cursor.execute(
            """
            update install_cases_rows
            set
              "projectName" = %(projectName)s,
              client = %(client)s,
              "contractAmount" = %(contractAmount)s,
              year = %(year)s,
              "sourceDueDate" = %(sourceDueDate)s,
              "sourceContractId" = %(sourceContractId)s,
              "updatedAt" = now()
            where id::text = %(id)s
            """,
            {**fields, "sourceContractId": contract_id, "id": existing_id},
        )
        logger.info(
            "install-case draft synced(update) contract_id=%s install_case_id=%s extras=%s",
            contract_id,
            existing_id,
            len(extra_ids),
        )
        return existing_id

    cursor.execute(
        """
        select id::text as id, status, "heroImage", "heroImages", "sourceContractId"
        from install_cases_rows
        where lower(trim("projectName")) = lower(trim(%s))
          and lower(trim(client)) = lower(trim(%s))
          and coalesce(trim("sourceContractId"), '') = ''
        order by
          case when coalesce(trim("heroImage"), '') <> '' then 0 else 1 end,
          "updatedAt" desc nulls last
        limit 1
        """,
        (fields["projectName"], fields["client"]),
    )
    named = cursor.fetchone()
    if named:
        existing_id = _safe_text(named.get("id"))
        cursor.execute(
            """
            update install_cases_rows
            set
              "projectName" = %(projectName)s,
              client = %(client)s,
              "contractAmount" = %(contractAmount)s,
              year = case
                when coalesce(trim(year), '') in ('', '-') then %(year)s
                else year
              end,
              "sourceDueDate" = %(sourceDueDate)s,
              "sourceContractId" = %(sourceContractId)s,
              "updatedAt" = now()
            where id::text = %(id)s
            """,
            {**fields, "sourceContractId": contract_id, "id": existing_id},
        )
        logger.info(
            "install-case draft synced(link-existing) contract_id=%s install_case_id=%s",
            contract_id,
            existing_id,
        )
        return existing_id

    cursor.execute(
        """
        insert into install_cases_rows (
          "projectName", client, "contractAmount", year,
          "sourceContractId", "sourceDueDate", status,
          "shareVisibility", "heroImage", "heroImages", specs
        )
        values (
          %(projectName)s, %(client)s, %(contractAmount)s, %(year)s,
          %(sourceContractId)s, %(sourceDueDate)s, %(status)s,
          'external', '', '[]'::jsonb, '{}'::jsonb
        )
        returning id::text as id
        """,
        {
            **fields,
            "sourceContractId": contract_id,
            "status": DRAFT_STATUS,
        },
    )
    created = cursor.fetchone()
    created_id = _safe_text((created or {}).get("id"))
    logger.info(
        "install-case draft synced(create) contract_id=%s install_case_id=%s",
        contract_id,
        created_id,
    )
    return created_id or None


def sync_install_case_draft_for_new_contract(cursor, contract_row: dict | None) -> str | None:
    """수정 시: 이 기능 이후 등록된 계약(insertedAt 있음)만 연동. 과거 계약 수정은 무시."""
    contract_id = _safe_text((contract_row or {}).get("id"))
    if not contract_id:
        return None
    cursor.execute(
        'select "insertedAt" from contracts_rows where id::text = %s',
        (contract_id,),
    )
    marker = cursor.fetchone()
    if not marker or marker.get("insertedAt") is None:
        return None
    return sync_install_case_draft_from_contract(cursor, contract_row)


def delete_install_case_drafts_for_contracts(cursor, contract_ids: list[str]) -> int:
    ids = [_safe_text(x) for x in contract_ids if _safe_text(x)]
    if not ids:
        return 0
    cursor.execute(
        """
        delete from install_cases_rows
        where "sourceContractId" = any(%s)
          and lower(coalesce(status, '')) = %s
        """,
        (ids, DRAFT_STATUS),
    )
    return int(cursor.rowcount or 0)


def purge_photo_less_contract_sync_drafts(cursor) -> int:
    """계약 연동으로 잘못 쌓인 사진 없는 임시(draft) 설치사례를 일괄 삭제."""
    cursor.execute(
        """
        delete from install_cases_rows
        where lower(coalesce(status, '')) = %s
          and coalesce(trim("sourceContractId"), '') <> ''
          and coalesce(trim("heroImage"), '') = ''
          and (
            "heroImages" is null
            or "heroImages" = '[]'::jsonb
            or "heroImages" = 'null'::jsonb
            or jsonb_typeof("heroImages") = 'null'
            or (
              jsonb_typeof("heroImages") = 'array'
              and jsonb_array_length("heroImages") = 0
            )
          )
        """,
        (DRAFT_STATUS,),
    )
    return int(cursor.rowcount or 0)
