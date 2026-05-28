import logging

from fastapi import APIRouter

from app.database import get_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contacts-manage", tags=["contacts-manage"])


@router.get("")
def list_contacts():
    """연락처 관리 목록.

    - 우선은 GET 뼈대 + 빈 DB면 목업 데이터 반환(프론트 렌더링 확인용)
    """
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                  id::text as id,
                  category,
                  business_content,
                  manager_name,
                  position,
                  phone,
                  email,
                  notes
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

