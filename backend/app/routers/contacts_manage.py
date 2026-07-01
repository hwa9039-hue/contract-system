import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    ContactsManageBulkDelete,
    ContactsManageCreate,
    ContactsManageOut,
    ContactsManagePatch,
    contacts_manage_patch_to_db_values,
    contacts_manage_to_db_values,
    row_to_contacts_manage,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contacts-manage", tags=["contacts-manage"])

CONTACTS_RETURNING = """
  id::text as id,
  category,
  business_content,
  manager_name,
  position,
  phone,
  email,
  notes
"""


def insert_contacts_row(cursor, row: ContactsManageCreate) -> dict:
    values = contacts_manage_to_db_values(row)
    contact_id = str(uuid4())
    now = datetime.now(timezone.utc)
    cursor.execute(
        f"""
        insert into contacts_rows (
          id,
          category,
          business_content,
          manager_name,
          position,
          phone,
          email,
          notes,
          created_at,
          updated_at
        )
        values (
          %(id)s,
          %(category)s,
          %(business_content)s,
          %(manager_name)s,
          %(position)s,
          %(phone)s,
          %(email)s,
          %(notes)s,
          %(created_at)s,
          %(updated_at)s
        )
        returning {CONTACTS_RETURNING}
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
        raise RuntimeError("contacts_rows insert returned no row")
    return row_to_contacts_manage(created)


@router.get("", response_model=list[ContactsManageOut])
def list_contacts():
    """연락처 목록 (GET /api/contacts-manage)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select
                  {CONTACTS_RETURNING}
                from contacts_rows
                order by updated_at desc nulls last, created_at desc nulls last
                """
            )
            rows = cursor.fetchall() or []

    return [row_to_contacts_manage(row) for row in rows]


@router.post("", response_model=ContactsManageOut, status_code=status.HTTP_201_CREATED)
def create_contact(body: ContactsManageCreate):
    """연락처 신규 등록 (POST /api/contacts-manage)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_contacts_row(cursor, body)
        connection.commit()

    logger.info("contacts_rows created id=%s category=%s", created.get("id"), created.get("category"))
    return created


@router.patch("/{row_id}", response_model=ContactsManageOut)
def update_contact(row_id: str, patch: ContactsManagePatch):
    """연락처 행 수정 (PATCH /api/contacts-manage/{id})."""
    values = contacts_manage_patch_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values["id"] = row_id
    values["updated_at"] = datetime.now(timezone.utc)
    assignments = [f"{column} = %({column})s" for column in values.keys() if column != "id"]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update contacts_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {CONTACTS_RETURNING}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact row not found")

    logger.info("contacts_rows updated id=%s fields=%s", row_id, sorted(values.keys()))
    return row_to_contacts_manage(updated)


@router.delete("")
def bulk_delete_contacts(payload: ContactsManageBulkDelete):
    """연락처 선택 삭제 (DELETE /api/contacts-manage)."""
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from contacts_rows where id::text = any(%s)",
                (ids,),
            )
            deleted_count = cursor.rowcount
        connection.commit()

    logger.info("contacts_rows bulk deleted count=%s", deleted_count)
    return {"deleted": deleted_count}
