import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    BitHistoryBulkDelete,
    BitHistoryCreate,
    BitHistoryOut,
    BitHistoryPatch,
    bit_history_patch_to_db_values,
    bit_history_to_db_values,
    row_to_bit_history,
)

logger = logging.getLogger(__name__)

BIT_HISTORY_API_PATH = "/api/bit-history"
router = APIRouter(prefix=BIT_HISTORY_API_PATH, tags=["bit-history"])

BIT_HISTORY_RETURNING = """
  id::text as id,
  sort_order,
  contract_id,
  seq_no,
  client,
  department,
  contract_method,
  contract_class,
  ident_no,
  contract_date,
  due_date,
  project_name,
  contract_amount,
  quantity,
  board_applied,
  program_item,
  manufacturing,
  shipping_inspection,
  note1,
  module_item,
  module_array,
  module_kind,
  etc_item,
  project_complete,
  defect,
  note2,
  created_at,
  updated_at
"""


def insert_bit_history_row(cursor, row: BitHistoryCreate) -> dict:
    values = bit_history_to_db_values(row)
    row_id = str(uuid4())
    now = datetime.now(timezone.utc)
    cursor.execute(
        f"""
        insert into bit_history_rows (
          id,
          sort_order,
          contract_id,
          seq_no,
          client,
          department,
          contract_method,
          contract_class,
          ident_no,
          contract_date,
          due_date,
          project_name,
          contract_amount,
          quantity,
          board_applied,
          program_item,
          manufacturing,
          shipping_inspection,
          note1,
          module_item,
          module_array,
          module_kind,
          etc_item,
          project_complete,
          defect,
          note2,
          created_at,
          updated_at
        )
        values (
          %(id)s,
          %(sort_order)s,
          %(contract_id)s,
          %(seq_no)s,
          %(client)s,
          %(department)s,
          %(contract_method)s,
          %(contract_class)s,
          %(ident_no)s,
          %(contract_date)s,
          %(due_date)s,
          %(project_name)s,
          %(contract_amount)s,
          %(quantity)s,
          %(board_applied)s,
          %(program_item)s,
          %(manufacturing)s,
          %(shipping_inspection)s,
          %(note1)s,
          %(module_item)s,
          %(module_array)s,
          %(module_kind)s,
          %(etc_item)s,
          %(project_complete)s,
          %(defect)s,
          %(note2)s,
          %(created_at)s,
          %(updated_at)s
        )
        returning {BIT_HISTORY_RETURNING}
        """,
        {
            **values,
            "id": row_id,
            "created_at": now,
            "updated_at": now,
        },
    )
    created = cursor.fetchone()
    if not created:
        raise RuntimeError("bit_history_rows insert returned no row")
    return row_to_bit_history(created)


@router.get("", response_model=list[BitHistoryOut])
def list_bit_history():
    """BIT 이력관리 목록 (GET /api/bit-history)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select
                  {BIT_HISTORY_RETURNING}
                from bit_history_rows
                order by contract_date desc nulls last, created_at desc nulls last
                """
            )
            rows = cursor.fetchall() or []

    return [row_to_bit_history(row) for row in rows]


@router.post("", response_model=BitHistoryOut, status_code=status.HTTP_201_CREATED)
def create_bit_history(body: BitHistoryCreate):
    """BIT 이력관리 신규 등록 (POST /api/bit-history)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_bit_history_row(cursor, body)
        connection.commit()

    logger.info("bit_history_rows created id=%s", created.get("id"))
    return created


@router.patch("/{row_id}", response_model=BitHistoryOut)
def update_bit_history(row_id: str, patch: BitHistoryPatch):
    """BIT 이력관리 행 수정 (PATCH /api/bit-history/{id})."""
    values = bit_history_patch_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values["id"] = row_id
    values["updated_at"] = datetime.now(timezone.utc)
    assignments = [f"{column} = %({column})s" for column in values.keys() if column != "id"]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update bit_history_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {BIT_HISTORY_RETURNING}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BIT history row not found")

    logger.info("bit_history_rows updated id=%s fields=%s", row_id, sorted(values.keys()))
    return row_to_bit_history(updated)


@router.delete("")
def bulk_delete_bit_history(payload: BitHistoryBulkDelete):
    """BIT 이력관리 선택 삭제 (DELETE /api/bit-history)."""
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from bit_history_rows where id::text = any(%s)",
                (ids,),
            )
            deleted_count = cursor.rowcount
        connection.commit()

    logger.info("bit_history_rows bulk deleted count=%s", deleted_count)
    return {"deleted": deleted_count}
