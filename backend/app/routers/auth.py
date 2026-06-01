from fastapi import APIRouter, HTTPException, Request, status
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel

from app.auth_utils import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_token,
    decode_token_allow_expired,
    get_auth_admin_password,
    get_auth_shared_password,
    get_jwt_secret,
    is_auth_disabled,
    normalize_token_role,
    verify_login_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str
    role: str | None = "user"


@router.post("/login")
def login(body: LoginBody):
    login_role = (body.role or "user").strip().lower()
    if login_role not in ("admin", "user"):
        login_role = "user"
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
    if login_role == "admin" and not get_auth_admin_password():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AUTH_ADMIN_PASSWORD is not set on the server",
        )

    if not verify_login_password(body.password, login_role):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    token = create_access_token(login_role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "auth_disabled": False,
        "role": login_role,
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
    new_token = create_access_token(role)
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "auth_disabled": False,
        "role": role,
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
        return {"valid": True, "auth_disabled": False, "role": role}
    except (InvalidTokenError, RuntimeError):
        return {"valid": False, "auth_disabled": False}
