import logging

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.database import get_connection
from app.unit_price_items import (
    UNIT_PRICE_ITEM_RETURNING,
    UNIT_PRICE_ITEM_PATCH_KEYS,
    build_item_patch_sql,
    build_items_summary,
    extract_unit_price_fields_from_mapping,
    has_unit_price_payload,
    row_to_unit_price_item,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/unit-prices", tags=["unit-prices"])

CONTRACT_TYPE_FILTER_DEFAULT = "55121903"
EXCLUDED_CONTRACT_METHOD = "민간"

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
  c.note
"""


class UnitPriceItemPatch(BaseModel):
    model_config = ConfigDict(extra="allow")

    costService: str | None = None
    itemName: str | None = None
    designUnitPrice: int | None = None
    pitch: str | None = None
    capW: str | None = None
    capH: str | None = None
    sortOrder: int | None = Field(default=None, alias="sortOrder")


class UnitPriceItemCreate(BaseModel):
    model_config = ConfigDict(extra="allow")

    costService: str = ""
    itemName: str = ""
    designUnitPrice: int = 0
    pitch: str = ""
    capW: str = ""
    capH: str = ""
    sortOrder: int | None = None


def _row_to_contract_parent(row: dict) -> dict:
    from app.schemas import row_to_contract

    base = row_to_contract(row)
    for key in (
        "costService",
        "itemName",
        "designUnitPrice",
        "pitch",
        "capW",
        "capH",
    ):
        base.pop(key, None)
    return base


def _fetch_items_by_contract_ids(cursor, contract_ids: list[str]) -> dict[str, list[dict]]:
    if not contract_ids:
        return {}
    cursor.execute(
        f"""
        select {UNIT_PRICE_ITEM_RETURNING}
        from contract_unit_price_items
        where contract_id::text = any(%s)
        order by contract_id, sort_order, "createdAt"
        """,
        (contract_ids,),
    )
    grouped: dict[str, list[dict]] = {}
    for row in cursor.fetchall():
        item = row_to_unit_price_item(row)
        cid = str(item.get("contractId") or "").strip()
        if not cid:
            continue
        grouped.setdefault(cid, []).append(item)
    return grouped


@router.get("", summary="단가관리 Tree — 계약 + nested items[]")
def list_unit_prices_tree(contractType: str = CONTRACT_TYPE_FILTER_DEFAULT):
    """계약(Parent) + 품목(Child) nested 구조 — 단가관리 Tree Grid 용."""
    contract_type = (contractType or "").strip() or CONTRACT_TYPE_FILTER_DEFAULT

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    select {CONTRACT_PARENT_SELECT}
                    from contracts_rows c
                    where trim(c."contractType") = %s
                      and trim(coalesce(c."contractMethod", '')) <> %s
                    order by c.year desc nulls last, c."contractDate" desc nulls last
                    """,
                    (contract_type, EXCLUDED_CONTRACT_METHOD),
                )
                contract_rows = cursor.fetchall()

                contract_ids = [
                    str(r.get("id") or "").strip()
                    for r in contract_rows
                    if r.get("id") is not None and str(r.get("id")).strip()
                ]
                items_by_contract = _fetch_items_by_contract_ids(cursor, contract_ids)

        result = []
        for row in contract_rows:
            parent = _row_to_contract_parent(row)
            cid = parent.get("id") or ""
            items = items_by_contract.get(cid, [])
            parent["items"] = items
            parent["itemsSummary"] = build_items_summary(items)
            result.append(parent)

        return result
    except Exception as exc:
        logger.exception("GET /api/unit-prices failed contractType=%s", contract_type)
        message = str(exc).strip()
        if "contract_unit_price_items" in message and "does not exist" in message:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="contract_unit_price_items 테이블이 없습니다. migrate_contract_unit_price_items.sql 을 실행하세요.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"unit-prices list failed: {exc}",
        ) from exc


@router.post("/contracts/{contract_id}/items", status_code=status.HTTP_201_CREATED)
def create_unit_price_item(contract_id: str, body: UnitPriceItemCreate):
    fields = extract_unit_price_fields_from_mapping(body.model_dump())
    sort_order = body.sortOrder
    if sort_order is None:
        sort_order = 0

    values = {
        "contract_id": contract_id,
        "sort_order": sort_order,
        **{k: fields.get(k, "" if k != "designUnitPrice" else 0) for k in (
            "costService",
            "itemName",
            "designUnitPrice",
            "pitch",
            "capW",
            "capH",
        )},
    }

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                'select 1 from contracts_rows where id::text = %s',
                (contract_id,),
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

            cursor.execute(
                f"""
                insert into contract_unit_price_items (
                  contract_id,
                  sort_order,
                  "costService",
                  "itemName",
                  "designUnitPrice",
                  pitch,
                  "capW",
                  "capH"
                )
                values (
                  %(contract_id)s,
                  %(sort_order)s,
                  %(costService)s,
                  %(itemName)s,
                  %(designUnitPrice)s,
                  %(pitch)s,
                  %(capW)s,
                  %(capH)s
                )
                returning {UNIT_PRICE_ITEM_RETURNING}
                """,
                values,
            )
            row = cursor.fetchone()
        connection.commit()

    return row_to_unit_price_item(row)


@router.patch("/items/{item_id}")
async def update_unit_price_item(item_id: str, request: Request):
    try:
        raw_body = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON body: {exc}",
        ) from exc

    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object expected")

    patch = UnitPriceItemPatch.model_validate(raw_body)
    patch_data = patch.model_dump(exclude_unset=True)
    for key in UNIT_PRICE_ITEM_PATCH_KEYS:
        if key in raw_body:
            patch_data[key] = raw_body[key]

    if not patch_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values, assignments = build_item_patch_sql(patch_data)
    if not assignments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid fields to update")

    if patch.sortOrder is not None:
        values["sort_order"] = int(patch.sortOrder)
        assignments.insert(0, "sort_order = %(sort_order)s")

    values["id"] = item_id

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update contract_unit_price_items
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {UNIT_PRICE_ITEM_RETURNING}
                """,
                values,
            )
            row = cursor.fetchone()
            if row is None:
                connection.rollback()
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        connection.commit()

    return row_to_unit_price_item(row)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unit_price_item(item_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from contract_unit_price_items where id::text = %s",
                (item_id,),
            )
            deleted = cursor.rowcount
        connection.commit()

    if deleted == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
