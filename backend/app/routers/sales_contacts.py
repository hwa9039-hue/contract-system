import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

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
  notes
"""


def insert_sales_contact_row(cursor, row: SalesContactCreate) -> dict:
    values = sales_contact_to_db_values(row)
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
def list_sales_contacts():
    """영업정보 연락처 목록 (GET /api/sales-contacts)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select
                  {SALES_CONTACTS_RETURNING}
                from sales_contacts_rows
                order by sort_order asc nulls last, created_at asc nulls last
                """
            )
            rows = cursor.fetchall() or []

    return [row_to_sales_contact(row) for row in rows]


@router.post("", response_model=SalesContactOut, status_code=status.HTTP_201_CREATED)
def create_sales_contact(body: SalesContactCreate):
    """영업정보 연락처 신규 등록 (POST /api/sales-contacts)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_sales_contact_row(cursor, body)
        connection.commit()

    logger.info("sales_contacts_rows created id=%s", created.get("id"))
    return created


@router.patch("/{row_id}", response_model=SalesContactOut)
def update_sales_contact(row_id: str, patch: SalesContactPatch):
    """영업정보 연락처 행 수정 (PATCH /api/sales-contacts/{id})."""
    values = sales_contact_patch_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values["id"] = row_id
    values["updated_at"] = datetime.now(timezone.utc)
    assignments = [f"{column} = %({column})s" for column in values.keys() if column != "id"]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update sales_contacts_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
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
def bulk_delete_sales_contacts(payload: SalesContactBulkDelete):
    """영업정보 연락처 선택 삭제 (DELETE /api/sales-contacts)."""
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from sales_contacts_rows where id::text = any(%s)",
                (ids,),
            )
            deleted_count = cursor.rowcount
        connection.commit()

    logger.info("sales_contacts_rows bulk deleted count=%s", deleted_count)
    return {"deleted": deleted_count}
