import logging

from fastapi import APIRouter, HTTPException, status

from app.contract_import_backup_xlsx import write_contract_import_excel_backup
from app.database import get_connection, repair_contract_row_ids
from app.excel_import_dedupe import (
    contract_duplicate_key_from_values,
    contract_duplicate_label,
    load_contract_duplicate_keys,
)
from app.schemas import (
    CONTRACT_DB_COLUMNS,
    ContractBulkCreate,
    ContractBulkDelete,
    ContractCreate,
    ContractOut,
    ContractPatch,
    contract_to_db_values,
    row_to_contract,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contracts", tags=["contracts"])

# 단가관리 6컬럼 — camelCase·snake_case 양쪽 DB 컬럼을 COALESCE 로 API camelCase 키에 통일
UNIT_PRICE_SELECT_COLUMNS = """
  COALESCE(NULLIF("costService", ''), cost_service, '') AS "costService",
  COALESCE(NULLIF("itemName", ''), item_name, '') AS "itemName",
  COALESCE(NULLIF("designUnitPrice", 0::numeric), unit_price, 0::numeric) AS "designUnitPrice",
  pitch AS pitch,
  COALESCE(NULLIF("capW", ''), width_w, '') AS "capW",
  COALESCE(NULLIF("capH", ''), height_h, '') AS "capH"
"""

# PATCH 시 camelCase 컬럼과 함께 snake_case 미러 컬럼에도 동일 값 저장
UNIT_PRICE_MIRROR_DB_COLUMNS = {
    "costService": "cost_service",
    "itemName": "item_name",
    "designUnitPrice": "unit_price",
    "capW": "width_w",
    "capH": "height_h",
}

# 단가관리 PATCH — API camelCase 키 → DB camelCase 컬럼 (GET AS alias 와 동일)
UNIT_PRICE_PATCH_DB_KEYS = (
    "costService",
    "itemName",
    "designUnitPrice",
    "pitch",
    "capW",
    "capH",
)

# 프론트 payload 키(camelCase·snake_case) → DB camelCase 컬럼명
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

# id는 항상 문자열(UUID)로 직렬화되어 프론트 `id` 필드와 일치합니다.
RETURNING_COLUMNS = f"""
  id::text as id, year, segment, "refNo", "contractNo", client, department,
  "contractMethod", "contractType", "identNo", "contractDate", "dueDate",
  "projectName", amount, "salesOwner", pm, note,
  {UNIT_PRICE_SELECT_COLUMNS}
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


def _normalize_unit_price_patch_value(api_key: str, value):
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


def _apply_unit_price_patch_updates(
    patch_data: dict,
    values: dict,
    assignments: list[str],
) -> set[str]:
    """단가관리 6컬럼 UPDATE SET — payload(camel/snake) → DB 컬럼 + snake_case 미러."""
    updated_db_cols: set[str] = set()

    for payload_key, db_col in UNIT_PRICE_PAYLOAD_TO_DB.items():
        if payload_key not in patch_data or db_col in updated_db_cols:
            continue

        param_key = f"upd_{db_col}"
        normalized = _normalize_unit_price_patch_value(payload_key, patch_data[payload_key])
        values[param_key] = normalized

        assignments.append(f'{quote_identifier(db_col)} = %({param_key})s')
        mirror_col = UNIT_PRICE_MIRROR_DB_COLUMNS.get(db_col)
        if mirror_col:
            assignments.append(f"{mirror_col} = %({param_key})s")

        updated_db_cols.add(db_col)

    return updated_db_cols


def _append_contract_patch_assignment(
    db_key: str,
    value,
    values: dict,
    assignments: list[str],
    mirrored_db_keys: set[str],
    param_key: str | None = None,
) -> None:
    bind_key = param_key or db_key
    values[bind_key] = value
    assignments.append(f"{quote_identifier(db_key)} = %({bind_key})s")
    mirror_col = UNIT_PRICE_MIRROR_DB_COLUMNS.get(db_key)
    if mirror_col and mirror_col not in mirrored_db_keys:
        assignments.append(f"{mirror_col} = %({bind_key})s")
        mirrored_db_keys.add(mirror_col)


def _build_contract_patch_sql(patch_data: dict) -> tuple[dict, list[str]]:
    values: dict = {}
    assignments: list[str] = []
    mirrored_db_keys: set[str] = set()
    applied_db_keys: set[str] = set()

    unit_price_db_cols = _apply_unit_price_patch_updates(patch_data, values, assignments)
    applied_db_keys.update(unit_price_db_cols)

    for api_key, value in patch_data.items():
        if api_key in UNIT_PRICE_PAYLOAD_TO_DB:
            continue
        db_key = CONTRACT_DB_COLUMNS.get(api_key)
        if not db_key or db_key in applied_db_keys:
            continue
        _append_contract_patch_assignment(db_key, value, values, assignments, mirrored_db_keys)
        applied_db_keys.add(db_key)

    return values, assignments


def _insert_contract_rows(rows: list[ContractCreate]) -> int:
    if not rows:
        return 0

    created = 0
    with get_connection() as connection:
        with connection.cursor() as cursor:
            for contract in rows:
                values = contract_to_db_values(contract)
                columns = list(values.keys())
                placeholders = [f"%({column})s" for column in columns]
                quoted_columns = [quote_identifier(column) for column in columns]
                cursor.execute(
                    f"""
                    insert into contracts_rows ({", ".join(quoted_columns)})
                    values ({", ".join(placeholders)})
                    """,
                    values,
                )
                created += 1
        connection.commit()
    return created


def _import_contract_rows_with_dedupe(rows: list[ContractCreate]) -> dict:
    """중복 건너뛰기 후 INSERT 결과로 엑셀 백업(선택) 및 duplicateItems 반환."""
    duplicate_items: list[str] = []
    inserted_api_rows: list[dict] = []
    skipped_no_key = 0

    with get_connection() as connection:
        filled = repair_contract_row_ids(connection)
        if filled:
            connection.commit()
            logger.warning("contracts_rows: backfilled id on %s row(s) that had null id", filled)

        with connection.cursor() as cursor:
            existing_keys = load_contract_duplicate_keys(cursor)
            seen_batch: set[str] = set()

            for contract in rows:
                values = contract_to_db_values(contract)
                dk = contract_duplicate_key_from_values(values)
                if not dk:
                    skipped_no_key += 1
                    continue
                if dk in existing_keys or dk in seen_batch:
                    duplicate_items.append(contract_duplicate_label(values))
                    continue

                columns = list(values.keys())
                placeholders = [f"%({column})s" for column in columns]
                quoted_columns = [quote_identifier(column) for column in columns]
                cursor.execute(
                    f"""
                    insert into contracts_rows ({", ".join(quoted_columns)})
                    values ({", ".join(placeholders)})
                    returning {RETURNING_COLUMNS}
                    """,
                    values,
                )
                row = cursor.fetchone()
                if row:
                    inserted_api_rows.append(row_to_contract(row))
                seen_batch.add(dk)
                existing_keys.add(dk)

        connection.commit()

    created = len(inserted_api_rows)
    excel_path: str | None = None
    excel_err: str | None = None
    if created > 0:
        excel_path, excel_err = write_contract_import_excel_backup(
            inserted_contract_rows=inserted_api_rows,
            duplicate_items=duplicate_items if duplicate_items else None,
        )

    return {
        "created": created,
        "duplicateItems": duplicate_items,
        "excelBackupPath": excel_path,
        "excelBackupError": excel_err,
        "skippedNoDuplicateKeyRows": skipped_no_key,
    }


@router.get("", response_model=list[ContractOut])
def list_contracts():
    with get_connection() as connection:
        filled = repair_contract_row_ids(connection)
        if filled:
            connection.commit()
            logger.warning("contracts_rows: backfilled id on %s row(s) that had null id", filled)
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from contracts_rows
                order by year desc nulls last, "contractDate" desc nulls last
                """
            )
            rows = cursor.fetchall()
    return [row_to_contract(row) for row in rows]


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def create_contract(contract: ContractCreate):
    values = contract_to_db_values(contract)
    columns = list(values.keys())
    placeholders = [f"%({column})s" for column in columns]
    quoted_columns = [quote_identifier(column) for column in columns]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                insert into contracts_rows ({", ".join(quoted_columns)})
                values ({", ".join(placeholders)})
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            row = cursor.fetchone()
        connection.commit()

    return row_to_contract(row)


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def bulk_create_contracts(payload: ContractBulkCreate):
    try:
        return {"created": _insert_contract_rows(payload.rows)}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"contracts bulk insert failed: {exc}",
        ) from exc


@router.post("/import", status_code=status.HTTP_201_CREATED)
def import_contracts(payload: ContractBulkCreate):
    """중복 건너뛴 뒤 DB 반영 행만 엑셀 백업(환경설정 시). duplicateItems 포함."""
    try:
        return _import_contract_rows_with_dedupe(payload.rows)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"contracts import failed: {exc}",
        ) from exc


@router.post("/bulk-delete")
def bulk_delete_contracts(payload: ContractBulkDelete):
    if not payload.ids:
        return {"deleted": 0}

    ids = [str(item).strip() for item in payload.ids if item is not None and str(item).strip() != ""]
    if not ids:
        return {"deleted": 0}

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("delete from contracts_rows where id::text = any(%s)", (ids,))
                deleted_count = cursor.rowcount
            connection.commit()

        return {"deleted": deleted_count}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"contracts bulk delete failed: {exc}",
        ) from exc


@router.patch("/{contract_id}", response_model=ContractOut)
def update_contract(contract_id: str, patch: ContractPatch):
    """행 수정은 DB PK `id`(UUID 문자열)로만 조회합니다."""
    patch_data = patch.model_dump(exclude_unset=True)
    if not patch_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values, assignments = _build_contract_patch_sql(patch_data)
    values["id"] = contract_id

    if not assignments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid fields to update")

    unit_price_in_payload = [
        key for key in patch_data if key in UNIT_PRICE_PAYLOAD_TO_DB
    ]
    logger.info(
        "contracts patch id=%s unit_price_payload_keys=%s unit_price_assignments=%s values=%s",
        contract_id,
        unit_price_in_payload,
        [a for a in assignments if any(col in a for col in UNIT_PRICE_PATCH_DB_KEYS)],
        {k: v for k, v in values.items() if k.startswith("upd_")},
    )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update contracts_rows
                set
                  {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """,
                values,
            )
            row = cursor.fetchone()
        connection.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")

    return row_to_contract(row)


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: str):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from contracts_rows where id::text = %s", (contract_id,))
            deleted_count = cursor.rowcount
        connection.commit()

    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
