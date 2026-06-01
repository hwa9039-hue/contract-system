import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, status

from app.database import get_connection
from app.schemas import (
    ContactsManageCreate,
    ContactsManageOut,
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

CONTACTS_MOCK_ROWS = [
    {
        "id": "mock-1",
        "category": "전광판",
        "business_content": "관급·민수 전광판 사업",
        "manager_name": "홍길동",
        "position": "과장",
        "phone": "010-1234-5678",
        "email": "hong@example.com",
        "notes": "초기 목업 데이터",
    },
    {
        "id": "mock-2",
        "category": "BIT",
        "business_content": "버스정보안내단말기(BIT) 사업",
        "manager_name": "김영희",
        "position": "대리",
        "phone": "010-2345-6789",
        "email": "kim@example.com",
        "notes": "-",
    },
]


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

    if rows:
        return [row_to_contacts_manage(row) for row in rows]

    return CONTACTS_MOCK_ROWS


@router.post("", response_model=ContactsManageOut, status_code=status.HTTP_201_CREATED)
def create_contact(body: ContactsManageCreate):
    """연락처 신규 등록 (POST /api/contacts-manage)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_contacts_row(cursor, body)
        connection.commit()

    logger.info("contacts_rows created id=%s category=%s", created.get("id"), created.get("category"))
    return created
