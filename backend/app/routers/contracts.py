import logging
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, HTTPException, Request, status

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

# contracts_rows INSERT numeric/integer 컬럼
CONTRACT_NUMERIC_DB_COLUMNS = frozenset(
    {
        "year",
        "amount",
        "designUnitPrice",
        "unit_price",
    }
)


def _is_empty_numeric_input(value) -> bool:
    if value is None:
        return True
    stripped = str(value).strip()
    return stripped == "" or stripped == "-"


def _coerce_numeric_or_zero(value) -> int:
    """한글 등 변환 불가 값 포함 — 무조건 int, 실패 시 0."""
    if _is_empty_numeric_input(value):
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != value:
            return 0
        return int(value)
    if isinstance(value, Decimal):
        try:
            return int(value)
        except Exception:
            return 0

    raw = str(value).strip().replace(",", "")
    if not raw or raw in ("—", "–"):
        return 0

    try:
        if "." in raw:
            return int(Decimal(raw))
        return int(raw)
    except (InvalidOperation, ValueError, TypeError):
        return 0


def _preprocess_excel_row_dict(row: dict) -> dict:
    """execute 직전 — numeric/integer 컬럼: 빈 문자열·'-' → 0, 그 외 숫자 변환(실패 시 0)."""
    processed = dict(row)
    for key, value in list(processed.items()):
        if key not in CONTRACT_NUMERIC_DB_COLUMNS:
            continue
        if value is None:
            processed[key] = 0
            continue
        if isinstance(value, str) and (value.strip() == "" or value.strip() == "-"):
            processed[key] = 0
        elif isinstance(value, (int, float)):
            continue
        else:
            try:
                processed[key] = float(str(value).replace(",", ""))
            except Exception:
                processed[key] = 0
    return processed


def _sanitize_excel_row_values(values: dict) -> dict:
    """values dict 전체 순회 — numeric/integer 필드는 None·''·'-' → 0, 그 외 비숫자 → 0."""
    sanitized = dict(values)

    for key, value in list(sanitized.items()):
        if key not in CONTRACT_NUMERIC_DB_COLUMNS:
            continue
        if _is_empty_numeric_input(value):
            sanitized[key] = 0
        else:
            sanitized[key] = _coerce_numeric_or_zero(value)

    for key in CONTRACT_NUMERIC_DB_COLUMNS:
        if key not in sanitized:
            sanitized[key] = 0
            continue
        val = sanitized[key]
        if _is_empty_numeric_input(val):
            sanitized[key] = 0
        elif not isinstance(val, int):
            sanitized[key] = _coerce_numeric_or_zero(val)

    if "designUnitPrice" in sanitized:
        sanitized["unit_price"] = sanitized["designUnitPrice"]

    for key in CONTRACT_NUMERIC_DB_COLUMNS:
        if key in sanitized and not isinstance(sanitized[key], int):
            sanitized[key] = 0

    return sanitized


def _build_sanitized_row_values(contract: ContractCreate) -> dict:
    """엑셀 row — DB 변환 → 전처리 루프 → numeric 정화."""
    row = dict(contract_to_db_values(contract))
    row = _preprocess_excel_row_dict(row)
    return _sanitize_excel_row_values(row)


def _execute_contract_row_insert(
    cursor,
    values: dict,
    *,
    returning: bool = False,
):
    """INSERT — cursor.execute 직전: 전처리 + numeric 정화."""
    values = _sanitize_excel_row_values(_preprocess_excel_row_dict(dict(values)))

    columns = list(values.keys())
    placeholders = [f"%({column})s" for column in columns]
    quoted_columns = [quote_identifier(column) for column in columns]

    if returning:
        cursor.execute(
            f"""
            insert into contracts_rows ({", ".join(quoted_columns)})
            values ({", ".join(placeholders)})
            returning {RETURNING_COLUMNS}
            """,
            values,
        )
        return cursor.fetchone()

    cursor.execute(
        f"""
        insert into contracts_rows ({", ".join(quoted_columns)})
        values ({", ".join(placeholders)})
        """,
        values,
    )
    return None


def _format_contract_insert_error(exc: Exception, row_index: int | None = None) -> str:
    message = str(exc).strip()
    row_hint = f"엑셀 {row_index}행" if row_index else "업로드 데이터"
    if "invalid input syntax for type numeric" in message:
        return (
            f"{row_hint} 숫자(금액·단가 등) 칸에 빈 값이거나 잘못된 문자가 있습니다. "
            "해당 칸을 숫자만 입력하도록 수정한 뒤 다시 업로드해 주세요."
        )
    return message or "계약 데이터 저장에 실패했습니다."


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


def _merge_contract_patch_data(raw_body: dict, patch: ContractPatch) -> dict:
    """Pydantic exclude_unset 등으로 빠질 수 있는 단가·계약 필드를 raw JSON 에서 보강."""
    patch_data = patch.model_dump(exclude_unset=True)
    if not isinstance(raw_body, dict):
        return patch_data

    for key in UNIT_PRICE_PAYLOAD_TO_DB:
        if key in raw_body:
            patch_data[key] = raw_body[key]

    for api_key in CONTRACT_DB_COLUMNS:
        if api_key in raw_body and api_key not in patch_data:
            patch_data[api_key] = raw_body[api_key]

    return patch_data


def _unit_price_assignments(assignments: list[str]) -> list[str]:
    return [a for a in assignments if any(col in a for col in UNIT_PRICE_PATCH_DB_KEYS)]


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
            for row_index, contract in enumerate(rows, start=1):
                values = _build_sanitized_row_values(contract)
                try:
                    _execute_contract_row_insert(cursor, values, returning=False)
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=_format_contract_insert_error(exc, row_index),
                    ) from exc
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

            for row_index, contract in enumerate(rows, start=1):
                row = dict(contract_to_db_values(contract))
                for key, value in list(row.items()):
                    if key not in CONTRACT_NUMERIC_DB_COLUMNS:
                        continue
                    if value is None:
                        row[key] = 0
                        continue
                    if isinstance(value, str) and (value.strip() == "" or value.strip() == "-"):
                        row[key] = 0
                    elif isinstance(value, (int, float)):
                        continue
                    else:
                        try:
                            row[key] = float(str(value).replace(",", ""))
                        except Exception:
                            row[key] = 0
                values = _sanitize_excel_row_values(row)

                dk = contract_duplicate_key_from_values(values)
                if not dk:
                    skipped_no_key += 1
                    continue
                if dk in existing_keys or dk in seen_batch:
                    duplicate_items.append(contract_duplicate_label(values))
                    continue

                try:
                    row = _execute_contract_row_insert(cursor, values, returning=True)
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=_format_contract_insert_error(exc, row_index),
                    ) from exc
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
    values = _build_sanitized_row_values(contract)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            try:
                row = _execute_contract_row_insert(cursor, values, returning=True)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=_format_contract_insert_error(exc),
                ) from exc
        connection.commit()

    return row_to_contract(row)


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def bulk_create_contracts(payload: ContractBulkCreate):
    try:
        return {"created": _insert_contract_rows(payload.rows)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_format_contract_insert_error(exc),
        ) from exc


@router.post("/import", status_code=status.HTTP_201_CREATED)
def import_contracts(payload: ContractBulkCreate):
    """중복 건너뛴 뒤 DB 반영 행만 엑셀 백업(환경설정 시). duplicateItems 포함."""
    try:
        return _import_contract_rows_with_dedupe(payload.rows)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_format_contract_insert_error(exc),
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
async def update_contract(contract_id: str, request: Request):
    """행 수정은 DB PK `id`(UUID 문자열)로만 조회합니다."""
    try:
        raw_body = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON body: {exc}",
        ) from exc

    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON object expected")

    patch = ContractPatch.model_validate(raw_body)
    patch_data = _merge_contract_patch_data(raw_body, patch)
    if not patch_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values, assignments = _build_contract_patch_sql(patch_data)
    values["id"] = contract_id

    if not assignments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid fields to update")

    unit_price_in_payload = [key for key in patch_data if key in UNIT_PRICE_PAYLOAD_TO_DB]
    unit_price_assignments = _unit_price_assignments(assignments)
    if unit_price_in_payload and not unit_price_assignments:
        logger.error(
            "contracts patch id=%s unit price keys in payload but SET clause empty: keys=%s patch_data=%s",
            contract_id,
            unit_price_in_payload,
            patch_data,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unit price fields were not applied to UPDATE query",
        )

    logger.info(
        "contracts patch id=%s unit_price_payload_keys=%s unit_price_assignments=%s values=%s",
        contract_id,
        unit_price_in_payload,
        unit_price_assignments,
        {k: v for k, v in values.items() if k.startswith("upd_")},
    )

    update_sql = f"""
                update contracts_rows
                set
                  {", ".join(assignments)}
                where id::text = %(id)s
                returning {RETURNING_COLUMNS}
                """

    with get_connection() as connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute(update_sql, values)
                row = cursor.fetchone()
                if cursor.rowcount != 1:
                    connection.rollback()
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
                connection.commit()
        except HTTPException:
            raise
        except Exception as exc:
            connection.rollback()
            logger.exception("contracts patch id=%s failed", contract_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"contracts patch failed: {exc}",
            ) from exc

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
