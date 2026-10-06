import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, status

from app.access_guards import sales_contacts_scope
from app.database import get_connection
from app.schemas import (
    SalesContactBulkDelete,
    SalesContactCreate,
    SalesContactOut,
    SalesContactPatch,
    row_to_sales_contact,
    sales_contact_patch_to_db_values,
    sales_contact_to_db_values,
)

logger = logging.getLogger(__name__)

SALES_CONTACTS_API_PATH = "/api/sales-contacts"
router = APIRouter(prefix=SALES_CONTACTS_API_PATH, tags=["sales-contacts"])

SALES_CONTACTS_RETURNING = """
  id::text as id,
  sort_order,
  manager_name,
  position,
  phone,
  email,
  division,
  company_name,
  department,
  review,
  status,
  linked_project,
  address,
  notes,
  author_id
"""


# 비활성으로 취급하는 값 (화면의 normalizeContactStatus 와 같은 기준)
_INACTIVE_STATUS_SQL = "lower(coalesce(status, '')) in ('inactive', '비활성', '비활성화', 'disabled', 'n', '0')"

# 전체 열람자가 아닐 때 보이는 행: 활성 연락처는 전원 공개 + 내가 등록한 연락처(비활성 포함)
_VISIBLE_TO_MEMBER_SQL = f"(not ({_INACTIVE_STATUS_SQL}) or lower(author_id) = %(scope)s)"


def insert_sales_contact_row(cursor, row: SalesContactCreate, author_id: str | None = None) -> dict:
    values = sales_contact_to_db_values(row)
    # 등록자는 브라우저가 보낸 값이 아니라 로그인한 계정으로 서버가 찍는다.
    if author_id is not None:
        values["author_id"] = author_id
    contact_id = str(uuid4())
    now = datetime.now(timezone.utc)
    cursor.execute(
        f"""
        insert into sales_contacts_rows (
          id,
          sort_order,
          manager_name,
          position,
          phone,
          email,
          division,
          company_name,
          department,
          review,
          status,
          linked_project,
          address,
          notes,
          author_id,
          created_at,
          updated_at
        )
        values (
          %(id)s,
          %(sort_order)s,
          %(manager_name)s,
          %(position)s,
          %(phone)s,
          %(email)s,
          %(division)s,
          %(company_name)s,
          %(department)s,
          %(review)s,
          %(status)s,
          %(linked_project)s,
          %(address)s,
          %(notes)s,
          %(author_id)s,
          %(created_at)s,
          %(updated_at)s
        )
        returning {SALES_CONTACTS_RETURNING}
        """,
        {
            **values,
            "id": contact_id,
            "created_at": now,
            "updated_at": now,
        },
    )
    created = cursor.fetchone()
    if not created:
        raise RuntimeError("sales_contacts_rows insert returned no row")
    return row_to_sales_contact(created)


@router.get("", response_model=list[SalesContactOut])
def list_sales_contacts(request: Request):
    """영업정보 연락처 목록 (GET /api/sales-contacts).

    활성 연락처는 전원 공개. 비활성은 등록자 본인과 전체 열람자(전기웅·정주희·정화영)만 본다.
    """
    scope = sales_contacts_scope(request)
    where_clause = "" if scope is None else f"where {_VISIBLE_TO_MEMBER_SQL}"
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select
                  {SALES_CONTACTS_RETURNING}
                from sales_contacts_rows
                {where_clause}
                order by sort_order asc nulls last, created_at asc nulls last
                """,
                {"scope": scope},
            )
            rows = cursor.fetchall() or []

    return [row_to_sales_contact(row) for row in rows]


@router.post("", response_model=SalesContactOut, status_code=status.HTTP_201_CREATED)
def create_sales_contact(body: SalesContactCreate, request: Request):
    """영업정보 연락처 신규 등록 (POST /api/sales-contacts). 등록자는 로그인 계정으로 기록한다."""
    sales_contacts_scope(request)  # 계정을 알 수 없는 토큰 차단
    author_id = str(getattr(request.state, "auth_account_id", "") or "").strip().lower()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_sales_contact_row(cursor, body, author_id or None)
        connection.commit()

    logger.info("sales_contacts_rows created id=%s", created.get("id"))
    return created


@router.patch("/{row_id}", response_model=SalesContactOut)
def update_sales_contact(row_id: str, patch: SalesContactPatch, request: Request):
    """영업정보 연락처 행 수정 (PATCH /api/sales-contacts/{id}). 볼 수 있는 행만 수정할 수 있다."""
    scope = sales_contacts_scope(request)
    values = sales_contact_patch_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values["id"] = row_id
    values["updated_at"] = datetime.now(timezone.utc)
    assignments = [f"{column} = %({column})s" for column in values.keys() if column != "id"]
    owner_clause = "" if scope is None else f"and {_VISIBLE_TO_MEMBER_SQL}"
    values["scope"] = scope

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update sales_contacts_rows
                set {", ".join(assignments)}
                where id::text = %(id)s {owner_clause}
                returning {SALES_CONTACTS_RETURNING}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sales contact row not found")

    logger.info("sales_contacts_rows updated id=%s fields=%s", row_id, sorted(values.keys()))
    return row_to_sales_contact(updated)


@router.delete("")
def bulk_delete_sales_contacts(payload: SalesContactBulkDelete, request: Request):
    """영업정보 연락처 선택 삭제 (DELETE /api/sales-contacts). 볼 수 있는 행만 삭제할 수 있다."""
    scope = sales_contacts_scope(request)
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            if scope is None:
                cursor.execute(
                    "delete from sales_contacts_rows where id::text = any(%s)",
                    (ids,),
                )
            else:
                cursor.execute(
                    "delete from sales_contacts_rows where id::text = any(%(ids)s) "
                    f"and {_VISIBLE_TO_MEMBER_SQL}",
                    {"ids": ids, "scope": scope},
                )
            deleted_count = cursor.rowcount
        connection.commit()

    logger.info("sales_contacts_rows bulk deleted count=%s", deleted_count)
    return {"deleted": deleted_count}
