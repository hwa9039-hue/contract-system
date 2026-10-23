import logging

from app.database import get_connection

logger = logging.getLogger(__name__)

RESTRICTED_ACCOUNT_MESSAGE = "퇴사 처리 등 접근이 제한된 계정입니다."


def is_login_account_blocked(account_id: str = "", display_name: str = "") -> bool:
    """app_login_accounts.is_active 가 false 이면 로그인을 막는다. 행이 없으면 허용한다."""
    aid = (account_id or "").strip().lower()
    name = "".join(str(display_name or "").split())
    if not aid and not name:
        return False
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select is_active
                    from app_login_accounts
                    where (%s <> '' and lower(account_id) = lower(%s))
                       or (%s <> '' and replace(display_name, ' ', '') = %s)
                    """,
                    (aid, aid, name, name),
                )
                rows = cursor.fetchall()
    except Exception:
        logger.exception("app_login_accounts lookup skipped")
        return False
    return any(row.get("is_active") is False for row in rows)
