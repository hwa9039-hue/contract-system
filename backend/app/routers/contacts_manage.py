import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.database import get_connection

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


class ContactsManageCreate(BaseModel):
    category: str = ""
    business_content: str = ""
    manager_name: str = ""
    position: str = ""
    phone: str = ""
    email: str = ""
    notes: str = ""


@router.get("")
def list_contacts():
    """연락처 목록."""
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
        return rows

    return [
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


@router.post("", status_code=status.HTTP_201_CREATED)
def create_contact(body: ContactsManageCreate):
    """연락처 신규 등록."""
    values = body.model_dump()
    contact_id = str(uuid4())
    now = datetime.now(timezone.utc)

    with get_connection() as connection:
        with connection.cursor() as cursor:
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
        connection.commit()

    return created
