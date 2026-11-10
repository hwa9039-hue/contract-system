import logging

import psycopg

from app.database import get_connection

logger = logging.getLogger(__name__)

RESTRICTED_ACCOUNT_MESSAGE = "퇴사 처리 등 접근이 제한된 계정입니다."
MAX_PIN_FAILS = 5
PIN_LOCK_MINUTES = 15


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
                select kakao_id, nickname, requested_at, updated_at
                from kakao_pending_users
                where status = 'pending'
                order by requested_at asc, kakao_id asc
                """
            )
            rows = cursor.fetchall()
    return [dict(row) for row in rows]


def list_kakao_rejected_users() -> list[dict]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select kakao_id, nickname, requested_at, updated_at
                from kakao_pending_users
                where status = 'rejected'
                order by updated_at desc, kakao_id asc
                """
            )
            rows = cursor.fetchall()
    return [dict(row) for row in rows]


def reject_kakao_pending_user(kakao_id: str) -> bool:
    """대기 중인 요청만 거절한다. 이미 다른 상태면 False."""
    kid = str(kakao_id or "").strip()
    if not kid:
        return False
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update kakao_pending_users
                set status = 'rejected',
                    updated_at = now()
                where kakao_id = %s
                  and status = 'pending'
                """,
                (kid,),
            )
            return cursor.rowcount > 0


def list_linked_kakao_accounts() -> list[dict]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select account_id, display_name, kakao_id, is_active, updated_at
                from app_login_accounts
                where kakao_id is not null
                  and btrim(kakao_id) <> ''
                order by display_name asc, account_id asc
                """
            )
            rows = cursor.fetchall()
    return [dict(row) for row in rows]


def clear_login_account_kakao_id(account_id: str) -> str:
    """연결된 카카오 ID 만 지운다. 직원 행은 남긴다.

    반환: ok | missing | protected
    """
    aid = (account_id or "").strip().lower()
    if not aid:
        return "missing"
    # 정화영 계정은 카카오 연동 해제를 막는다.
    if aid == "hy9039":
        return "protected"
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update app_login_accounts
                set kakao_id = null,
                    updated_at = now()
                where lower(account_id) = lower(%s)
                  and kakao_id is not null
                  and btrim(kakao_id) <> ''
                """,
                (aid,),
            )
            if cursor.rowcount == 0:
                return "missing"
    return "ok"


def get_login_account_pin_state(account_id: str) -> dict | None:
    aid = (account_id or "").strip().lower()
    if not aid:
        return None
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select account_id, display_name, is_active, kakao_id,
                       pin_hash, pin_fail_count, pin_locked_until
                from app_login_accounts
                where lower(account_id) = lower(%s)
                """,
                (aid,),
            )
            row = cursor.fetchone()
    return dict(row) if row else None


def is_kakao_login_approved(account_id: str) -> bool:
    """관리자 승인으로 카카오가 연결되고, 아직 활성인 계정인지."""
    state = get_login_account_pin_state(account_id)
    if not state or state.get("is_active") is False:
        return False
    return bool(str(state.get("kakao_id") or "").strip())


def save_login_account_pin(account_id: str, pin_hash: str, pin_sealed: str) -> bool:
    aid = (account_id or "").strip().lower()
    if not aid or not str(pin_hash or "").strip():
        return False
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update app_login_accounts
                set pin_hash = %s,
                    pin_sealed = %s,
                    pin_fail_count = 0,
                    pin_locked_until = null,
                    updated_at = now()
                where lower(account_id) = lower(%s)
                """,
                (pin_hash, pin_sealed or None, aid),
            )
            return cursor.rowcount > 0


def list_account_pin_seals(account_ids: list[str]) -> dict[str, dict]:
    ids = [str(account_id or "").strip().lower() for account_id in account_ids if str(account_id or "").strip()]
    if not ids:
        return {}
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select lower(account_id) as account_id, pin_hash, pin_sealed
                from app_login_accounts
                where lower(account_id) = any(%s)
                """,
                (ids,),
            )
            rows = cursor.fetchall()
    return {str(row.get("account_id") or ""): dict(row) for row in rows}


def clear_pin_failures(account_id: str) -> None:
    aid = (account_id or "").strip().lower()
    if not aid:
        return
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update app_login_accounts
                set pin_fail_count = 0,
                    pin_locked_until = null,
                    updated_at = now()
                where lower(account_id) = lower(%s)
                """,
                (aid,),
            )


def record_pin_failure(account_id: str) -> str:
    """mismatch | locked"""
    aid = (account_id or "").strip().lower()
    if not aid:
        return "mismatch"
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update app_login_accounts
                set pin_fail_count = case
                      when pin_fail_count + 1 >= %s then 0
                      else pin_fail_count + 1
                    end,
                    pin_locked_until = case
                      when pin_fail_count + 1 >= %s then now() + make_interval(mins => %s)
                      else pin_locked_until
                    end,
                    updated_at = now()
                where lower(account_id) = lower(%s)
                returning pin_locked_until
                """,
                (MAX_PIN_FAILS, MAX_PIN_FAILS, PIN_LOCK_MINUTES, aid),
            )
            row = cursor.fetchone()
    locked_until = (row or {}).get("pin_locked_until") if row else None
    if locked_until is not None and getattr(locked_until, "timestamp", None):
        from datetime import datetime, timezone

        if locked_until > datetime.now(timezone.utc):
            return "locked"
    return "mismatch"


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
