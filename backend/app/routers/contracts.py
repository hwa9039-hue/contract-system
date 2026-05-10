from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
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


router = APIRouter(prefix="/api/contracts", tags=["contracts"])

RETURNING_COLUMNS = """
  id, year, segment, "refNo", "contractNo", client, department,
  "contractMethod", "contractType", "identNo", "contractDate", "dueDate",
  "projectName", amount, "salesOwner", pm, note
"""


def quote_identifier(identifier: str) -> str:
    return f'"{identifier}"'


@router.get("", response_model=list[ContractOut])
def list_contracts():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {RETURNING_COLUMNS}
                from contracts_rows
                order by year desc nulls last, "contractDate" desc nulls last
                """
            )
            return [row_to_contract(row) for row in cursor.fetchall()]


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


@router.post("/bulk", response_model=list[ContractOut], status_code=status.HTTP_201_CREATED)
def bulk_create_contracts(payload: ContractBulkCreate):
    if not payload.rows:
        return []

    created_rows = []

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for contract in payload.rows:
                values = contract_to_db_values(contract)
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
                created_rows.append(row_to_contract(cursor.fetchone()))
        connection.commit()

    return created_rows


@router.patch("/{contract_id}", response_model=ContractOut)
def update_contract(contract_id: str, patch: ContractPatch):
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


@router.post("/bulk-delete")
def bulk_delete_contracts(payload: ContractBulkDelete):
    if not payload.ids:
        return {"deleted": 0}

    ids = [str(item) for item in payload.ids]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("delete from contracts_rows where id::text = any(%s)", (ids,))
            deleted_count = cursor.rowcount
        connection.commit()

    return {"deleted": deleted_count}
