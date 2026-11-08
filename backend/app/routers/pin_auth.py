from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.login_accounts import (
    MAX_PIN_FAILS,
    clear_pin_failures,
    get_login_account_pin_state,
    is_kakao_login_approved,
    record_pin_failure,
    save_login_account_pin,
)
from app.pin_auth import hash_pin, pin_is_four_digits, seal_pin, verify_pin_hash
from app.routers.kakao_auth import _employee_session

router = APIRouter(prefix="/api/auth/pin", tags=["auth"])


class PinVerifyBody(BaseModel):
    account_id: str
    pin: str


class PinSaveBody(BaseModel):
    pin: str
    current_pin: str = ""


def _account_id_from_request(request: Request) -> str:
    return str(getattr(request.state, "auth_account_id", "") or "").strip().lower().rstrip("!")


@router.get("")
def pin_status(request: Request):
    account_id = _account_id_from_request(request)
    state = get_login_account_pin_state(account_id)
    linked = is_kakao_login_approved(account_id)
    enabled = bool(linked and state and str(state.get("pin_hash") or "").strip())
    return {"enabled": enabled, "kakaoLinked": linked}


@router.post("")
def pin_save(body: PinSaveBody, request: Request):
    """로그인한 직원이 4자리 간편 비밀번호를 해시로 저장한다."""
    account_id = _account_id_from_request(request)
    if not pin_is_four_digits(body.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="간편 비밀번호는 숫자 4자리입니다.")
    state = get_login_account_pin_state(account_id)
    if not state or not str(state.get("kakao_id") or "").strip():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="카카오 연동 후 간편 비밀번호를 설정할 수 있습니다.")
    if state.get("is_active") is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근이 제한된 계정입니다.")
    current_hash = str(state.get("pin_hash") or "").strip()
    if current_hash:
        if not pin_is_four_digits(body.current_pin) or not verify_pin_hash(body.current_pin, current_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="현재 간편 비밀번호가 올바르지 않습니다.")
    if not save_login_account_pin(account_id, hash_pin(body.pin), seal_pin(body.pin)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="계정을 찾을 수 없습니다.")
    clear_pin_failures(account_id)
    return {"ok": True, "enabled": True}


@router.post("/verify")
def pin_verify(body: PinVerifyBody):
    """이 브라우저에 남아 있는 계정과 4자리가 맞으면 세션을 다시 연다."""
    account_id = str(body.account_id or "").strip().lower().rstrip("!")
    if not account_id or not pin_is_four_digits(body.pin):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="간편 비밀번호는 숫자 4자리입니다.")
    state = get_login_account_pin_state(account_id)
    if not state or not str(state.get("pin_hash") or "").strip() or not str(state.get("kakao_id") or "").strip():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="간편 비밀번호가 설정되지 않았습니다.")
    if state.get("is_active") is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="접근이 제한된 계정입니다.")
    locked_until = state.get("pin_locked_until")
    if locked_until is not None and getattr(locked_until, "timestamp", None):
        from datetime import datetime, timezone

        if locked_until > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"간편 비밀번호를 {MAX_PIN_FAILS}회 틀렸습니다. 잠시 후 다시 시도하거나 카카오 로그인으로 접속해 주세요.",
            )
    if not verify_pin_hash(body.pin, str(state.get("pin_hash") or "")):
        outcome = record_pin_failure(account_id)
        if outcome == "locked":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"간편 비밀번호를 {MAX_PIN_FAILS}회 틀렸습니다. 잠시 후 다시 시도하거나 카카오 로그인으로 접속해 주세요.",
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="간편 비밀번호가 올바르지 않습니다.")
    clear_pin_failures(account_id)
    return _employee_session(account_id, str(state.get("display_name") or ""))
