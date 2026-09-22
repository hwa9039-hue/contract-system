import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    BitHistoryBulkDelete,
    BitHistoryCreate,
    BitHistoryOut,
    BitHistoryPatch,
    bit_history_extras_to_db_values,
    bit_history_to_db_values,
    contract_snapshot_for_bit,
    is_bit_contract_type,
    join_contract_and_bit_extra,
    row_to_bit_history,
)

logger = logging.getLogger(__name__)

BIT_HISTORY_API_PATH = "/api/bit-history"
router = APIRouter(prefix=BIT_HISTORY_API_PATH, tags=["bit-history"])

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)

BIT_HISTORY_RETURNING = """
  id::text as id,
  sort_order,
  contract_id,
  line_no,
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

CONTRACT_SNAPSHOT_SELECT = """
  id::text as id,
  "refNo",
  client,
  department,
  "contractMethod",
  "contractType",
  "identNo",
  "contractDate",
  "dueDate",
  "projectName",
  amount
"""

BIT_SNAPSHOT_COLUMNS = (
    "seq_no",
    "client",
    "department",
    "contract_method",
    "contract_class",
    "ident_no",
    "contract_date",
    "due_date",
    "project_name",
    "contract_amount",
    "quantity",
    "board_applied",
    "program_item",
    "manufacturing",
    "shipping_inspection",
    "note1",
    "module_item",
    "module_array",
    "module_kind",
    "etc_item",
    "project_complete",
    "defect",
    "note2",
)


def _normalize_contract_id(value: str) -> str:
    text = str(value or "").strip()
    if text.startswith("contract-"):
        return text[len("contract-") :]
    return text


def _fetch_contract_snapshot(cursor, contract_id: str) -> dict | None:
    cursor.execute(
        f"""
        select {CONTRACT_SNAPSHOT_SELECT}
        from contracts_rows
        where id::text = %(id)s
        """,
        {"id": contract_id},
    )
    row = cursor.fetchone()
    return contract_snapshot_for_bit(row) if row else None


def _joined_or_extra(contract: dict | None, extra_row, seq_no: int = 0) -> dict:
    if contract:
        return join_contract_and_bit_extra(contract, extra_row, seq_no)
    return row_to_bit_history(extra_row)


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
          line_no,
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
          %(line_no)s,
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
    contract_id = str(created.get("contract_id") or "").strip()
    contract = _fetch_contract_snapshot(cursor, contract_id) if contract_id else None
    return _joined_or_extra(contract, created)


def upsert_extras_by_contract_id(cursor, contract_id: str, patch: BitHistoryPatch) -> dict:
    """계약 고유 id 로 BIT 추가 필드만 insert 또는 update. 없는 extras 행은 새로 만든다."""
    extras = bit_history_extras_to_db_values(patch)
    now = datetime.now(timezone.utc)
    cursor.execute(
        f"""
        select {BIT_HISTORY_RETURNING}
        from bit_history_rows
        where contract_id = %(contract_id)s
        order by updated_at desc nulls last
        limit 1
        """,
        {"contract_id": contract_id},
    )
    existing = cursor.fetchone()

    if existing:
        if extras:
            extras["updated_at"] = now
            extras["id"] = existing["id"]
            assignments = [f"{column} = %({column})s" for column in extras if column != "id"]
            cursor.execute(
                f"""
                update bit_history_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {BIT_HISTORY_RETURNING}
                """,
                extras,
            )
            extra_row = cursor.fetchone() or existing
        else:
            extra_row = existing
    else:
        values = {column: "" for column in BIT_SNAPSHOT_COLUMNS}
        values.update(extras)
        row_id = str(uuid4())
        cursor.execute(
            f"""
            insert into bit_history_rows (
              id,
              sort_order,
              contract_id,
              line_no,
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
              %(line_no)s,
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
                "sort_order": 0,
                "line_no": int(extras.get("line_no") or 1),
                "contract_id": contract_id,
                "created_at": now,
                "updated_at": now,
            },
        )
        extra_row = cursor.fetchone()
        if not extra_row:
            raise RuntimeError("bit_history_rows extras insert returned no row")

    contract = _fetch_contract_snapshot(cursor, contract_id)
    return _joined_or_extra(contract, extra_row)


@router.get("", response_model=list[BitHistoryOut])
def list_bit_history():
    """계약현황에서 계약분류=BIT 인 행을 가져오고, extras 를 contract_id 로 LEFT JOIN."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select {CONTRACT_SNAPSHOT_SELECT}
                from contracts_rows
                """
            )
            contract_rows = cursor.fetchall() or []
            try:
                cursor.execute(f"select {BIT_HISTORY_RETURNING} from bit_history_rows")
                extra_rows = cursor.fetchall() or []
            except Exception:
                logger.exception("bit_history_rows list failed — extras empty")
                extra_rows = []

    extras_by_contract_id = {}
    manual_extras = []
    for extra in extra_rows:
        contract_id = str(extra.get("contract_id") or "").strip()
        if contract_id:
            extras_by_contract_id.setdefault(contract_id, []).append(extra)
        else:
            manual_extras.append(extra)

    for items in extras_by_contract_id.values():
        items.sort(key=lambda item: (int(item.get("line_no") or 1), str(item.get("created_at") or "")))

    bit_contracts = []
    for row in contract_rows:
        snapshot = contract_snapshot_for_bit(row)
        if not snapshot.get("id"):
            continue
        if is_bit_contract_type(snapshot.get("contractType")):
            bit_contracts.append(snapshot)

    bit_contracts.sort(key=lambda item: (str(item.get("contractDate") or ""), str(item.get("id") or "")))

    out = []
    seq_no = 1
    for extra in manual_extras:
        manual = row_to_bit_history(extra)
        manual["seqNo"] = str(seq_no)
        if not manual.get("lineNo"):
            manual["lineNo"] = "1"
        out.append(manual)
        seq_no += 1

    for contract in bit_contracts:
        extras = extras_by_contract_id.get(contract["id"]) or [None]
        for extra in extras:
            out.append(join_contract_and_bit_extra(contract, extra, seq_no))
            seq_no += 1
    return out


@router.post("", response_model=BitHistoryOut, status_code=status.HTTP_201_CREATED)
def create_bit_history(body: BitHistoryCreate):
    """수기등록 또는 같은 계약의 추가 차수(줄) — 항상 새 extras 행을 INSERT."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_bit_history_row(cursor, body)
        connection.commit()

    logger.info("bit_history row created id=%s contract_id=%s", created.get("id"), created.get("contractId"))
    return created


@router.patch("/{row_id}", response_model=BitHistoryOut)
def update_bit_history(row_id: str, patch: BitHistoryPatch):
    """BIT 추가 필드만 저장. extras 행이 없어도 contract_id 로 upsert 해서 404 를 내지 않는다."""
    patch_contract_id = ""
    if patch.contractId is not None:
        patch_contract_id = _normalize_contract_id(str(patch.contractId))
    path_id = _normalize_contract_id(row_id)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            if UUID_RE.match(row_id):
                cursor.execute(
                    f"""
                    select {BIT_HISTORY_RETURNING}
                    from bit_history_rows
                    where id::text = %(id)s
                    """,
                    {"id": row_id},
                )
                found = cursor.fetchone()
                if found:
                    contract_id = str(found.get("contract_id") or "").strip() or patch_contract_id
                    if not contract_id:
                        extras = bit_history_extras_to_db_values(patch)
                        if not extras:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail="No BIT extra fields to update",
                            )
                        extras["updated_at"] = datetime.now(timezone.utc)
                        extras["id"] = row_id
                        assignments = [f"{column} = %({column})s" for column in extras if column != "id"]
                        cursor.execute(
                            f"""
                            update bit_history_rows
                            set {", ".join(assignments)}
                            where id::text = %(id)s
                            returning {BIT_HISTORY_RETURNING}
                            """,
                            extras,
                        )
                        updated = cursor.fetchone()
                        connection.commit()
                        return row_to_bit_history(updated)
                    result = upsert_extras_by_contract_id(cursor, contract_id, patch)
                    connection.commit()
                    return result

            target_contract_id = patch_contract_id or path_id
            if not target_contract_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="contract_id is required to save BIT extras",
                )
            result = upsert_extras_by_contract_id(cursor, target_contract_id, patch)
        connection.commit()

    logger.info("bit_history extras upserted contract_id=%s", target_contract_id)
    return result


@router.delete("")
def bulk_delete_bit_history(payload: BitHistoryBulkDelete):
    """BIT 추가 이력만 지운다. 계약현황 행은 그대로 둔다."""
    ids = [_normalize_contract_id(str(item)) for item in payload.ids if str(item).strip()]
    ids = [item for item in ids if item]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                delete from bit_history_rows
                where id::text = any(%s) or contract_id = any(%s)
                """,
                (ids, ids),
            )
            deleted_count = cursor.rowcount
        connection.commit()

    logger.info("bit_history extras bulk deleted count=%s", deleted_count)
    return {"deleted": deleted_count}
