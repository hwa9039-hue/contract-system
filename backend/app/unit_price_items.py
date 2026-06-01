"""contract_unit_price_items — 계약 1:N 단가 품목 공통 DB/직렬화."""

from decimal import Decimal

from app.schemas import to_response_value

UNIT_PRICE_ITEM_RETURNING = """
  id::text as id,
  contract_id::text as "contractId",
  sort_order as "sortOrder",
  "costService",
  "itemName",
  "designUnitPrice",
  pitch,
  "capW",
  "capH"
"""

UNIT_PRICE_ITEM_PATCH_KEYS = frozenset(
    {
        "costService",
        "itemName",
        "designUnitPrice",
        "pitch",
        "capW",
        "capH",
        "cost_service",
        "item_name",
        "unit_price",
        "width_w",
        "height_h",
    }
)

UNIT_PRICE_PAYLOAD_TO_DB = {
    "costService": "costService",
    "cost_service": "costService",
    "itemName": "itemName",
    "item_name": "itemName",
    "designUnitPrice": "designUnitPrice",
    "unit_price": "designUnitPrice",
    "pitch": "pitch",
    "capW": "capW",
    "width_w": "capW",
    "capH": "capH",
    "height_h": "capH",
}


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def normalize_unit_price_value(api_key: str, value):
    if api_key not in ("designUnitPrice", "unit_price"):
        if value is None:
            return ""
        return str(value).strip()
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return max(int(value), 0)
    try:
        return max(int(str(value).replace(",", "")), 0)
    except ValueError:
        return 0


def row_to_unit_price_item(row: dict) -> dict:
    return {
        "id": to_response_value(row.get("id")) or "",
        "contractId": to_response_value(row.get("contractId") or row.get("contract_id")) or "",
        "sortOrder": to_response_value(row.get("sortOrder") or row.get("sort_order") or 0),
        "costService": to_response_value(row.get("costService") or row.get("cost_service") or ""),
        "itemName": to_response_value(row.get("itemName") or row.get("item_name") or ""),
        "designUnitPrice": to_response_value(
            row.get("designUnitPrice") or row.get("unit_price") or row.get("design_unit_price") or 0
        ),
        "pitch": to_response_value(row.get("pitch") or ""),
        "capW": to_response_value(row.get("capW") or row.get("width_w") or ""),
        "capH": to_response_value(row.get("capH") or row.get("height_h") or ""),
    }


def extract_unit_price_fields_from_mapping(data: dict) -> dict:
    """ContractCreate/PATCH·DB row 에서 품목 필드만 추출."""
    if not data:
        return {}
    out: dict = {}
    for payload_key, db_col in UNIT_PRICE_PAYLOAD_TO_DB.items():
        if payload_key not in data:
            continue
        if db_col in out:
            continue
        out[db_col] = normalize_unit_price_value(payload_key, data[payload_key])
    return out


def has_unit_price_payload(data: dict) -> bool:
    fields = extract_unit_price_fields_from_mapping(data)
    if not fields:
        return False
    return any(
        (
            bool(fields.get("costService")),
            bool(fields.get("itemName")),
            int(fields.get("designUnitPrice") or 0) != 0,
            bool(fields.get("pitch")),
            bool(fields.get("capW")),
            bool(fields.get("capH")),
        )
    )


def insert_unit_price_item(cursor, contract_id: str, fields: dict, *, sort_order: int = 0):
    values = {
        "contract_id": contract_id,
        "sort_order": sort_order,
        "costService": fields.get("costService", ""),
        "itemName": fields.get("itemName", ""),
        "designUnitPrice": fields.get("designUnitPrice", 0),
        "pitch": fields.get("pitch", ""),
        "capW": fields.get("capW", ""),
        "capH": fields.get("capH", ""),
    }
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
        """,
        values,
    )


def upsert_first_unit_price_item(cursor, contract_id: str, patch_data: dict) -> bool:
    """계약 PATCH 레거시 — 첫 품목이 있으면 UPDATE, 없으면 INSERT."""
    fields = extract_unit_price_fields_from_mapping(patch_data)
    if not fields:
        return False

    cursor.execute(
        f"""
        select id::text as id
        from contract_unit_price_items
        where contract_id = %s
        order by sort_order, "createdAt"
        limit 1
        """,
        (contract_id,),
    )
    existing = cursor.fetchone()
    if existing and existing.get("id"):
        values, assignments = build_item_patch_sql(patch_data)
        if not assignments:
            return False
        values["id"] = existing["id"]
        cursor.execute(
            f"""
            update contract_unit_price_items
            set {", ".join(assignments)}
            where id::text = %(id)s
            """,
            values,
        )
        return True

    if has_unit_price_payload(patch_data):
        insert_unit_price_item(cursor, contract_id, fields)
        return True
    return False


def build_item_patch_sql(patch_data: dict) -> tuple[dict, list[str]]:
    values: dict = {}
    assignments: list[str] = []
    applied: set[str] = set()

    for payload_key, db_col in UNIT_PRICE_PAYLOAD_TO_DB.items():
        if payload_key not in patch_data or db_col in applied:
            continue
        param_key = f"upd_{db_col}"
        values[param_key] = normalize_unit_price_value(payload_key, patch_data[payload_key])
        assignments.append(f'{quote_identifier(db_col)} = %({param_key})s')
        applied.add(db_col)

    if assignments:
        assignments.append('"updatedAt" = now()')

    return values, assignments
