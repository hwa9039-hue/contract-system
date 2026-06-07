import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, field_validator

from app.contract_identity import contract_signature_from_mapping
from app.database import get_connection
from app.schemas import row_to_contract

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/project-management", tags=["project-management"])

CONTRACT_PARENT_SELECT = """
  c.id::text as id,
  c.year,
  c.segment,
  c."refNo",
  c."contractNo",
  c.client,
  c.department,
  c."contractMethod",
  c."contractType",
  c."identNo",
  c."contractDate",
  c."dueDate",
  c."projectName",
  c.amount,
  c."salesOwner",
  c.pm,
  c.note,
  c."commencementCert",
  c."completionCert",
  c."warrantyStart",
  c."warrantyExpiry",
  c."guaranteeRate",
  c."inspectionRequestDate",
  c."taxInvoice"
"""

PROJECT_MANAGEMENT_RETURNING = """
  id::text as id,
  contract_id as "contractId",
  contract_signature as "contractSignature",
  "commencementCert",
  "completionCert",
  "warrantyStart",
  "warrantyExpiry",
  "guaranteeRate",
  "createdAt",
  "updatedAt"
"""

PROJECT_MANAGEMENT_FIELDS = (
    "commencementCert",
    "completionCert",
    "warrantyStart",
    "warrantyExpiry",
    "guaranteeRate",
)


class ProjectManagementPatch(BaseModel):
    commencementCert: date | None = None
    completionCert: date | None = None
    warrantyStart: date | None = None
    warrantyExpiry: date | None = None
    guaranteeRate: str | None = None

    @field_validator("commencementCert", "completionCert", "warrantyStart", "warrantyExpiry", mode="before")
    @classmethod
    def empty_dates_to_none(cls, value: Any):
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            if text in ("", "-", "—", "–", "2000-01-01", "1970-01-01"):
                return None
        return value


def _contract_signature(row: dict) -> str:
    return contract_signature_from_mapping(row)


def _row_to_project_management_item(row: dict | None) -> dict:
    if not row:
        return {}
    return {
        "id": str(row.get("id") or ""),
        "contractId": str(row.get("contractId") or row.get("contract_id") or ""),
        "contractSignature": str(row.get("contractSignature") or row.get("contract_signature") or ""),
        "commencementCert": _date_to_text(row.get("commencementCert")),
        "completionCert": _date_to_text(row.get("completionCert")),
        "warrantyStart": _date_to_text(row.get("warrantyStart")),
        "warrantyExpiry": _date_to_text(row.get("warrantyExpiry")),
        "guaranteeRate": "" if row.get("guaranteeRate") is None else str(row.get("guaranteeRate")),
    }


def _date_to_text(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _fetch_management_items(cursor, contract_rows: list[dict]) -> dict[str, dict]:
    contract_ids = [
        str(row.get("id") or "").strip()
        for row in contract_rows
        if row.get("id") is not None and str(row.get("id")).strip()
    ]
    signatures = [_contract_signature(row) for row in contract_rows]
    signatures = [sig for sig in signatures if sig]
    if not contract_ids and not signatures:
        return {}

    cursor.execute(
        f"""
        select {PROJECT_MANAGEMENT_RETURNING}
        from project_management_items
        where contract_id = any(%s)
           or (contract_signature <> '' and contract_signature = any(%s))
        order by "updatedAt" desc nulls last, "createdAt" desc nulls last
        """,
        (contract_ids, signatures),
    )

    by_contract_id: dict[str, dict] = {}
    by_signature: dict[str, dict] = {}
    for row in cursor.fetchall():
        item = _row_to_project_management_item(row)
        cid = item.get("contractId", "")
        sig = item.get("contractSignature", "")
        if cid and cid not in by_contract_id:
            by_contract_id[cid] = item
        if sig and sig not in by_signature:
            by_signature[sig] = item

    matched: dict[str, dict] = {}
    for contract in contract_rows:
        cid = str(contract.get("id") or "").strip()
        sig = _contract_signature(contract)
        item = by_contract_id.get(cid) or by_signature.get(sig) or {}
        if item and item.get("contractId") != cid:
            cursor.execute(
                """
                update project_management_items
                set contract_id = %s,
                    contract_signature = %s,
                    "updatedAt" = now()
                where id::text = %s
                """,
                (cid, sig, item["id"]),
            )
            item["contractId"] = cid
            item["contractSignature"] = sig
        if cid:
            matched[cid] = item
    return matched


@router.get("")
def list_project_management_rows():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    select {CONTRACT_PARENT_SELECT}
                    from contracts_rows c
                    order by c.year desc nulls last, c."contractDate" desc nulls last
                    """
                )
                contract_rows = cursor.fetchall()
                items_by_contract = _fetch_management_items(cursor, contract_rows)
            connection.commit()
    except Exception as exc:
        logger.exception("GET /api/project-management failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"project-management list failed: {exc}",
        ) from exc

    result = []
    for contract in contract_rows:
        row = row_to_contract(contract)
        item = items_by_contract.get(str(row.get("id") or ""), {})
        pm_id = str(item.get("id") or "").strip()
        if pm_id:
            # 사업관리 전용 행이 있으면 빈 값(삭제)까지 그대로 반영 — contracts_rows 값으로 되돌리지 않음
            for key in PROJECT_MANAGEMENT_FIELDS:
                row[key] = item.get(key, "")
        else:
            for key in PROJECT_MANAGEMENT_FIELDS:
                if item.get(key) not in (None, ""):
                    row[key] = item[key]
        row["projectManagementId"] = pm_id
        row["contractSignature"] = item.get("contractSignature") or _contract_signature(contract)
        result.append(row)
    return result


@router.patch("/contracts/{contract_id}")
async def update_project_management_row(contract_id: str, request: Request):
    try:
        raw_body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON body: {exc}") from exc
    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object expected")

    patch = ProjectManagementPatch.model_validate(raw_body)
    patch_data = patch.model_dump(exclude_unset=True)
    if not patch_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {CONTRACT_PARENT_SELECT}
                from contracts_rows c
                where c.id::text = %s
                """,
                (contract_id,),
            )
            contract = cursor.fetchone()
            if contract is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

            signature = _contract_signature(contract)
            values = {
                "contract_id": contract_id,
                "contract_signature": signature,
                "commencementCert": patch_data.get("commencementCert"),
                "completionCert": patch_data.get("completionCert"),
                "warrantyStart": patch_data.get("warrantyStart"),
                "warrantyExpiry": patch_data.get("warrantyExpiry"),
                "guaranteeRate": patch_data.get("guaranteeRate") or "",
            }
            cursor.execute(
                f"""
                select {PROJECT_MANAGEMENT_RETURNING}
                from project_management_items
                where contract_id = %(contract_id)s
                   or (contract_signature <> '' and contract_signature = %(contract_signature)s)
                order by "updatedAt" desc nulls last, "createdAt" desc nulls last
                limit 1
                """,
                values,
            )
            existing = cursor.fetchone()

            if existing is not None:
                assignments = [
                    f'"{key}" = %({key})s' if key != "guaranteeRate" else f'"{key}" = %({key})s'
                    for key in PROJECT_MANAGEMENT_FIELDS
                    if key in patch_data
                ]
                assignments.extend([
                    "contract_id = %(contract_id)s",
                    "contract_signature = %(contract_signature)s",
                    '"updatedAt" = now()',
                ])
                values["id"] = existing["id"]
                cursor.execute(
                    f"""
                    update project_management_items
                    set {", ".join(assignments)}
                    where id::text = %(id)s
                    returning {PROJECT_MANAGEMENT_RETURNING}
                    """,
                    values,
                )
                item = cursor.fetchone()
            else:
                cursor.execute(
                    f"""
                    insert into project_management_items (
                      contract_id,
                      contract_signature,
                      "commencementCert",
                      "completionCert",
                      "warrantyStart",
                      "warrantyExpiry",
                      "guaranteeRate"
                    )
                    values (
                      %(contract_id)s,
                      %(contract_signature)s,
                      %(commencementCert)s,
                      %(completionCert)s,
                      %(warrantyStart)s,
                      %(warrantyExpiry)s,
                      %(guaranteeRate)s
                    )
                    returning {PROJECT_MANAGEMENT_RETURNING}
                    """,
                    values,
                )
                item = cursor.fetchone()
        connection.commit()

    contract_row = row_to_contract(contract)
    item_row = _row_to_project_management_item(item)
    for key in PROJECT_MANAGEMENT_FIELDS:
        if key in patch_data:
            contract_row[key] = item_row.get(key, "")
    contract_row["projectManagementId"] = item_row.get("id", "")
    contract_row["contractSignature"] = item_row.get("contractSignature", signature)
    return contract_row
