from fastapi import APIRouter, HTTPException, Request, status
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel

from app.auth_utils import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_token,
    get_auth_shared_password,
    get_jwt_secret,
    is_auth_disabled,
    verify_shared_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


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

    if not verify_shared_password(body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")

    token = create_access_token()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "auth_disabled": False,
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
        decode_token(token)
        return {"valid": True, "auth_disabled": False}
    except (InvalidTokenError, RuntimeError):
        return {"valid": False, "auth_disabled": False}
