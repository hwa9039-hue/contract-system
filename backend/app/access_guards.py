"""계정 단위 접근 제어 (라우터 의존성). 화면에서 메뉴를 숨기는 것과 별개로 서버가 직접 막는다."""

from fastapi import HTTPException, Request, status

from app.auth_utils import (
    can_access_bit_history_account,
    can_view_all_contacts_account,
    is_auth_disabled,
)


def _request_account_id(request: Request) -> str:
    return str(getattr(request.state, "auth_account_id", "") or "").strip().lower()


def require_bit_history_access(request: Request) -> None:
    """BIT 이력관리 API — 허용된 5명만. 로컬 개발에서 인증을 끈 경우에는 통과시킨다."""
    if is_auth_disabled():
        return
    if not can_access_bit_history_account(_request_account_id(request)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def sales_contacts_scope(request: Request) -> str | None:
    """연락처 행 범위.

    - None: 비활성 포함 전체 열람(전기웅·정주희·정화영, 또는 인증을 끈 로컬 개발)
    - 문자열: 활성 연락처 전체 + 그 계정이 등록한 연락처(비활성 포함)
    계정을 알 수 없는 토큰은 아무 것도 못 보게 막는다(빈 값이 빈 작성자와 맞아떨어지는 사고 방지).
    """
    if is_auth_disabled():
        return None
    account_id = _request_account_id(request)
    if not account_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if can_view_all_contacts_account(account_id):
        return None
    return account_id
