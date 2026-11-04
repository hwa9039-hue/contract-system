import logging

import psycopg

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


def find_login_account_by_kakao_id(kakao_id: str) -> dict | None:
    """카카오 고유 ID 가 연결된 직원 행. 없으면 None."""
    kid = str(kakao_id or "").strip()
    if not kid:
        return None
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select account_id, display_name, is_active, kakao_id
                from app_login_accounts
                where kakao_id = %s
                """,
                (kid,),
            )
            row = cursor.fetchone()
    return dict(row) if row else None


def bind_login_account_kakao_id(account_id: str, display_name: str, kakao_id: str) -> str:
    """직원 계정에 카카오 고유 ID 를 한 번 연결한다.

    반환: ok | inactive | taken | already_other
    """
    aid = (account_id or "").strip().lower()
    name = str(display_name or "").strip()
    kid = str(kakao_id or "").strip()
    if not aid or not kid:
        return "inactive"
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select account_id
                    from app_login_accounts
                    where kakao_id = %s
                    """,
                    (kid,),
                )
                owner = cursor.fetchone()
                if owner and str(owner.get("account_id") or "").strip().lower() != aid:
                    return "taken"
                cursor.execute(
                    """
                    select is_active, kakao_id
                    from app_login_accounts
                    where lower(account_id) = lower(%s)
                    """,
                    (aid,),
                )
                current = cursor.fetchone()
                if current and current.get("is_active") is False:
                    return "inactive"
                current_kakao = str((current or {}).get("kakao_id") or "").strip()
                if current_kakao and current_kakao != kid:
                    return "already_other"
                cursor.execute(
                    """
                    insert into app_login_accounts (account_id, display_name, is_active, kakao_id)
                    values (%s, %s, true, %s)
                    on conflict (account_id) do update
                      set display_name = excluded.display_name,
                          kakao_id = excluded.kakao_id,
                          updated_at = now()
                      where app_login_accounts.is_active = true
                        and (
                          app_login_accounts.kakao_id is null
                          or btrim(app_login_accounts.kakao_id) = ''
                          or app_login_accounts.kakao_id = excluded.kakao_id
                        )
                    """,
                    (aid, name, kid),
                )
                if cursor.rowcount == 0:
                    return "inactive"
    except psycopg.errors.UniqueViolation:
        return "taken"
    return "ok"


def save_kakao_pending_user(kakao_id: str, nickname: str) -> None:
    """미연결 카카오 계정을 승인 대기로 남긴다. 같은 ID 가 다시 오면 닉네임만 갱신한다."""
    kid = str(kakao_id or "").strip()
    if not kid:
        return
    name = str(nickname or "").strip()[:80]
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into kakao_pending_users (kakao_id, nickname, status)
                values (%s, %s, 'pending')
                on conflict (kakao_id) do update
                  set nickname = excluded.nickname,
                      status = 'pending',
                      updated_at = now()
                """,
                (kid, name),
            )


def list_kakao_pending_users() -> list[dict]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select kakao_id, nickname, requested_at
                from kakao_pending_users
                where status = 'pending'
                order by requested_at asc, kakao_id asc
                """
            )
            rows = cursor.fetchall()
    return [dict(row) for row in rows]


def delete_kakao_pending_user(kakao_id: str) -> None:
    kid = str(kakao_id or "").strip()
    if not kid:
        return
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from kakao_pending_users where kakao_id = %s",
                (kid,),
            )
