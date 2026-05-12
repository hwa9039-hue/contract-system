import logging

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection, repair_contract_row_ids
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

# id는 항상 문자열(UUID)로 직렬화되어 프론트 `id` 필드와 일치합니다.
RETURNING_COLUMNS = """
  id::text as id, year, segment, "refNo", "contractNo", client, department,
  "contractMethod", "contractType", "identNo", "contractDate", "dueDate",
  "projectName", amount, "salesOwner", pm, note
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


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


@router.get("", response_model=list[ContractOut])
def list_contracts():
    with get_connection() as connection:
        filled = repair_contract_row_ids(connection)
        if filled:
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
    """Same as /bulk; path matches other registries (/api/*/import)."""
    try:
        return {"created": _insert_contract_rows(payload.rows)}
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
    """행 수정은 DB PK `id`(UUID 문자열)로만 조회합니다. 계약번호만으로 갱신하려면 별도 쿼리·제약(유일성)이 필요합니다."""
    patch_data = patch.model_dump(exclude_unset=True)
    if not patch_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values = {"id": contract_id}
    assignments = []

    for api_key, value in patch_data.items():
        db_key = CONTRACT_DB_COLUMNS.get(api_key)
        if not db_key:
            continue
        values[db_key] = value
        assignments.append(f"{quote_identifier(db_key)} = %({db_key})s")

    if not assignments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid fields to update")

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update contracts_rows
                set {", ".join(assignments)}
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
