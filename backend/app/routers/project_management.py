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
  c."taxInvoice",
  c."performanceCertStatus"
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
  "performanceCertStatus",
  "createdAt",
  "updatedAt"
"""

PROJECT_MANAGEMENT_FIELDS = (
    "commencementCert",
    "completionCert",
    "warrantyStart",
    "warrantyExpiry",
    "guaranteeRate",
    "performanceCertStatus",
)

PROJECT_MANAGEMENT_TEXT_FIELDS = frozenset({"guaranteeRate", "performanceCertStatus"})


COMMENCEMENT_CERT_OMIT_LABEL = "생략"


class ProjectManagementPatch(BaseModel):
    commencementCert: date | str | None = None
    completionCert: date | None = None
    warrantyStart: date | None = None
    warrantyExpiry: date | None = None
    guaranteeRate: str | None = None
    performanceCertStatus: str | None = None

    @field_validator("commencementCert", mode="before")
    @classmethod
    def normalize_commencement_cert(cls, value: Any):
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            if text in ("", "-", "—", "–", "2000-01-01", "1970-01-01"):
                return None
            if text == COMMENCEMENT_CERT_OMIT_LABEL:
                return COMMENCEMENT_CERT_OMIT_LABEL
        return value

    @field_validator("completionCert", "warrantyStart", "warrantyExpiry", mode="before")
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
        "performanceCertStatus": (
            "" if row.get("performanceCertStatus") is None else str(row.get("performanceCertStatus"))
        ),
    }


def _date_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _normalize_commencement_cert_storage(value: Any) -> str | None:
    text = _date_to_text(value).strip()
    if not text or text in ("-", "—", "–", "2000-01-01", "1970-01-01"):
        return None
    if text == COMMENCEMENT_CERT_OMIT_LABEL:
        return COMMENCEMENT_CERT_OMIT_LABEL
    parsed = _text_to_date(text)
    return parsed.isoformat() if parsed else None


def _text_to_date(value: Any) -> date | None:
    text = _date_to_text(value).strip()
    if not text or text in ("-", "—", "–", "2000-01-01", "1970-01-01"):
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _apply_pm_item_to_contract_row(contract_row: dict, item_row: dict, contract_mapping: dict) -> dict:
    pm_id = str(item_row.get("id") or "").strip()
    if pm_id:
        for key in PROJECT_MANAGEMENT_FIELDS:
            contract_row[key] = item_row.get(key, "")
    else:
        for key in PROJECT_MANAGEMENT_FIELDS:
            if item_row.get(key) not in (None, ""):
                contract_row[key] = item_row[key]
    contract_row["projectManagementId"] = pm_id
    contract_row["contractSignature"] = (
        item_row.get("contractSignature") or _contract_signature(contract_mapping)
    )
    return contract_row


def _build_pm_values(contract_mapping: dict, patch_data: dict) -> dict:
    contract_row = row_to_contract(contract_mapping)
    values = {
        "contract_id": str(contract_mapping.get("id") or contract_row.get("id") or "").strip(),
        "contract_signature": _contract_signature(contract_mapping),
    }
    for key in PROJECT_MANAGEMENT_FIELDS:
        if key in patch_data:
            if key in PROJECT_MANAGEMENT_TEXT_FIELDS:
                values[key] = patch_data[key] or ""
            elif key == "commencementCert":
                values[key] = _normalize_commencement_cert_storage(patch_data[key])
            else:
                values[key] = patch_data[key]
        elif key in PROJECT_MANAGEMENT_TEXT_FIELDS:
            values[key] = contract_row.get(key) or ""
        elif key == "commencementCert":
            values[key] = _normalize_commencement_cert_storage(contract_row.get(key))
        else:
            values[key] = _text_to_date(contract_row.get(key))
    return values


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
        item = _row_to_project_management_item(items_by_contract.get(str(row.get("id") or ""), {}))
        result.append(_apply_pm_item_to_contract_row(row, item, contract))
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

    try:
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

                values = _build_pm_values(contract, patch_data)
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
                        f'"{key}" = %({key})s'
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
                          "guaranteeRate",
                          "performanceCertStatus"
                        )
                        values (
                          %(contract_id)s,
                          %(contract_signature)s,
                          %(commencementCert)s,
                          %(completionCert)s,
                          %(warrantyStart)s,
                          %(warrantyExpiry)s,
                          %(guaranteeRate)s,
                          %(performanceCertStatus)s
                        )
                        returning {PROJECT_MANAGEMENT_RETURNING}
                        """,
                        values,
                    )
                    item = cursor.fetchone()
            connection.commit()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PATCH /api/project-management/contracts/%s failed", contract_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"project-management update failed: {exc}",
        ) from exc

    contract_row = row_to_contract(contract)
    item_row = _row_to_project_management_item(item)
    return _apply_pm_item_to_contract_row(contract_row, item_row, contract)
