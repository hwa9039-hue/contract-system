from fastapi import APIRouter, HTTPException, Request, status
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel

from app.auth_utils import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_token,
    decode_token_allow_expired,
    get_auth_shared_password,
    get_jwt_secret,
    has_admin_accounts_configured,
    has_manager_accounts_configured,
    is_auth_disabled,
    normalize_token_role,
    resolve_login_account,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str
    role: str | None = "user"


@router.post("/login")
def login(body: LoginBody):
    if is_auth_disabled():
        return {
            "access_token": None,
            "token_type": "bearer",
            "expires_in": 0,
            "auth_disabled": True,
        }

    if not get_jwt_secret():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET is not set on the server",
        )
    if not get_auth_shared_password():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_SHARED_PASSWORD is not set on the server",
        )
    if not has_admin_accounts_configured() and not has_manager_accounts_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_ADMIN_ACCOUNTS / AUTH_MANAGER_ACCOUNTS is not set on the server",
        )

    matched = resolve_login_account(body.password)
    if not matched:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    login_role, display_name = matched

    token = create_access_token(login_role, display_name=display_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "auth_disabled": False,
        "role": login_role,
        "role_label": display_name or None,
    }


@router.post("/refresh")
def refresh(request: Request):
    """화면 세션 연장 시 JWT 를 새로 발급합니다."""
    if is_auth_disabled():
        return {
            "access_token": None,
            "token_type": "bearer",
            "expires_in": 0,
            "auth_disabled": True,
        }

    if not get_jwt_secret():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET is not set on the server",
        )

    auth_header = request.headers.get("authorization") or ""
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = parts[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token_allow_expired(token)
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    role = normalize_token_role(payload.get("role"))
    display_name = str(payload.get("display_name") or "").strip()
    new_token = create_access_token(role, display_name=display_name)
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "auth_disabled": False,
        "role": role,
        "role_label": display_name or None,
    }


@router.get("/me")
def me(request: Request):
    if is_auth_disabled():
        return {"valid": True, "auth_disabled": True}

    auth_header = request.headers.get("authorization") or ""
    parts = auth_header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return {"valid": False, "auth_disabled": False}

    token = parts[1].strip()
    if not token:
        return {"valid": False, "auth_disabled": False}

    try:
        payload = decode_token(token)
        role = normalize_token_role(payload.get("role"))
        display_name = str(payload.get("display_name") or "").strip()
        return {
            "valid": True,
            "auth_disabled": False,
            "role": role,
            "role_label": display_name or None,
        }
    except (InvalidTokenError, RuntimeError):
        return {"valid": False, "auth_disabled": False}
