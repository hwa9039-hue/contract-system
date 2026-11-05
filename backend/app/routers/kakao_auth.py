from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth_utils import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    access_claims_for_account,
    account_id_from_login_password,
    create_access_token,
    get_admin_accounts,
    get_manager_accounts,
    is_auth_disabled,
    is_generic_account_label,
)
from app.kakao_auth import KAKAO_PENDING_CODE, build_kakao_authorize_url, kakao_identity_from_code
from app.pin_auth import open_pin
from app.login_accounts import (
    RESTRICTED_ACCOUNT_MESSAGE,
    bind_login_account_kakao_id,
    clear_login_account_kakao_id,
    delete_kakao_pending_user,
    find_login_account_by_kakao_id,
    is_login_account_blocked,
    list_account_pin_seals,
    list_kakao_pending_users,
    list_kakao_rejected_users,
    list_linked_kakao_accounts,
    reject_kakao_pending_user,
    save_kakao_pending_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class KakaoCodeBody(BaseModel):
    code: str
    redirect_uri: str


class KakaoApproveBody(BaseModel):
    kakao_id: str
    account_id: str


class KakaoRejectBody(BaseModel):
    kakao_id: str


class KakaoUnlinkBody(BaseModel):
    account_id: str


def _iso(value) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else ""


def _disabled_payload():
    return {
        "access_token": None,
        "token_type": "bearer",
        "expires_in": 0,
        "auth_disabled": True,
    }


def _require_link_admin(request: Request) -> None:
    """로그인 아이디 hy9039! 는 토큰의 account_id 가 hy9039 다. 역할 값만으로는 구분하지 않는다."""
    account_id = str(getattr(request.state, "auth_account_id", "") or "").strip().lower().rstrip("!")
    display_name = "".join(str(getattr(request.state, "auth_display_name", "") or "").split())
    if account_id == "hy9039" or display_name == "정화영":
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="계정 연동 승인은 최고 관리자만 할 수 있습니다.",
    )


def _employee_session(account_id: str, display_name: str):
    if (
        not (display_name or "").strip()
        or is_generic_account_label(display_name)
        or is_login_account_blocked(account_id, display_name)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=RESTRICTED_ACCOUNT_MESSAGE,
        )
    claims = access_claims_for_account(account_id)
    token = create_access_token("admin", display_name=display_name, **claims)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "auth_disabled": False,
        "role": "admin",
        "role_label": display_name or None,
        **claims,
    }


def _pending_response():
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "code": KAKAO_PENDING_CODE,
            "detail": "관리자 승인 대기 중",
        },
    )


def list_linkable_employees() -> list[dict]:
    """활성 직원만. 비밀번호는 내려주지 않는다."""
    people: dict[str, str] = {}
    for password, label in [*get_admin_accounts(), *get_manager_accounts()]:
        account_id = account_id_from_login_password(password)
        name = str(label or "").strip()
        if not account_id or not name or is_generic_account_label(name):
            continue
        if is_login_account_blocked(account_id, name):
            continue
        people[account_id] = name
    return [
        {"accountId": account_id, "displayName": name}
        for account_id, name in sorted(people.items(), key=lambda item: item[1])
    ]


@router.get("/kakao/authorize")
def kakao_authorize(redirect_uri: str):
    if is_auth_disabled():
        return _disabled_payload()
    return {"url": build_kakao_authorize_url(redirect_uri)}


@router.post("/kakao")
def kakao_login(body: KakaoCodeBody):
    if is_auth_disabled():
        return _disabled_payload()
    kakao_id, nickname = kakao_identity_from_code(body.code, body.redirect_uri)
    account = find_login_account_by_kakao_id(kakao_id)
    if account:
        if account.get("is_active") is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=RESTRICTED_ACCOUNT_MESSAGE,
            )
        delete_kakao_pending_user(kakao_id)
        return _employee_session(
            str(account.get("account_id") or ""),
            str(account.get("display_name") or ""),
        )
    save_kakao_pending_user(kakao_id, nickname)
    return _pending_response()


@router.get("/kakao/pending")
def kakao_pending(request: Request):
    _require_link_admin(request)
    rows = []
    for row in list_kakao_pending_users():
        requested = row.get("requested_at")
        rows.append(
            {
                "kakaoId": str(row.get("kakao_id") or ""),
                "nickname": str(row.get("nickname") or ""),
                "requestedAt": _iso(requested),
            }
        )
    return {"items": rows}


@router.get("/kakao/rejected")
def kakao_rejected(request: Request):
    _require_link_admin(request)
    rows = []
    for row in list_kakao_rejected_users():
        rows.append(
            {
                "kakaoId": str(row.get("kakao_id") or ""),
                "nickname": str(row.get("nickname") or ""),
                "requestedAt": _iso(row.get("requested_at")),
                "rejectedAt": _iso(row.get("updated_at")),
            }
        )
    return {"items": rows}


@router.get("/kakao/linked")
def kakao_linked(request: Request):
    _require_link_admin(request)
    linked_rows = list_linked_kakao_accounts()
    seals = list_account_pin_seals([str(row.get("account_id") or "") for row in linked_rows])
    rows = []
    for row in linked_rows:
        account_id = str(row.get("account_id") or "")
        stored = seals.get(account_id.strip().lower()) or {}
        pin = open_pin(str(stored.get("pin_sealed") or ""))
        rows.append(
            {
                "accountId": account_id,
                "displayName": str(row.get("display_name") or ""),
                "kakaoId": str(row.get("kakao_id") or ""),
                "active": row.get("is_active") is not False,
                "linkedAt": _iso(row.get("updated_at")),
                "pin": pin,
                "pinSet": bool(str(stored.get("pin_hash") or "").strip()),
            }
        )
    return {"items": rows}


@router.post("/kakao/reject")
def kakao_reject(body: KakaoRejectBody, request: Request):
    """대기 요청을 지우지 않고 거절 목록으로 옮긴다."""
    _require_link_admin(request)
    kakao_id = str(body.kakao_id or "").strip()
    if not kakao_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="거절할 카카오 계정을 선택해 주세요.")
    if not reject_kakao_pending_user(kakao_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="대기 중인 카카오 계정이 아닙니다.")
    return {"ok": True, "kakaoId": kakao_id}


@router.post("/kakao/unlink")
def kakao_unlink(body: KakaoUnlinkBody, request: Request):
    """직원 행은 남기고 카카오 연결만 끊는다."""
    _require_link_admin(request)
    account_id = str(body.account_id or "").strip().lower()
    if not account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="연동을 해제할 직원을 선택해 주세요.")
    cleared = clear_login_account_kakao_id(account_id)
    if cleared == "protected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="최고 관리자 계정의 카카오 연동은 해제할 수 없습니다.",
        )
    if cleared != "ok":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="연결된 카카오 계정이 없습니다.")
    return {"ok": True, "accountId": account_id}


@router.get("/kakao/employees")
def kakao_employees(request: Request):
    _require_link_admin(request)
    return {"items": list_linkable_employees()}


@router.post("/kakao/approve")
def kakao_approve(body: KakaoApproveBody, request: Request):
    """관리자가 고른 직원 계정에 카카오 고유 ID 를 붙이고 대기열에서 지운다."""
    _require_link_admin(request)
    kakao_id = str(body.kakao_id or "").strip()
    account_id = str(body.account_id or "").strip().lower()
    if not kakao_id or not account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="연동할 계정과 카카오 계정을 선택해 주세요.")

    pending_ids = {str(row.get("kakao_id") or "") for row in list_kakao_pending_users()}
    if kakao_id not in pending_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="대기 중인 카카오 계정이 아닙니다.")

    employees = {item["accountId"]: item["displayName"] for item in list_linkable_employees()}
    display_name = employees.get(account_id)
    if not display_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="선택한 직원 계정을 찾을 수 없습니다.")

    bound = bind_login_account_kakao_id(account_id, display_name, kakao_id)
    if bound == "taken":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 다른 직원 계정에 연결된 카카오 계정입니다.",
        )
    if bound == "already_other":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이 직원 계정은 다른 카카오 계정에 연결되어 있습니다.",
        )
    if bound != "ok":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=RESTRICTED_ACCOUNT_MESSAGE,
        )
    delete_kakao_pending_user(kakao_id)
    return {"ok": True, "accountId": account_id, "displayName": display_name}
