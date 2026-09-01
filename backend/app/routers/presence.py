"""온라인 접속자 heartbeat.

프론트 `usePresence` 가 30초마다 ping 하고, 같은 주기로 online 목록을 받는다.

백엔드 가이드:
- ping 시 JWT(또는 body.displayName)로 사용자를 식별해 last_active_time 을 기록한다.
- online 은 지금으로부터 1~2분(여기선 120초) 안에 ping 한 사람만 돌려준다.
- 지금은 메모리 dict. 다중 워커면 Redis 등으로 바꾸면 된다.
"""

import re

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.presence_store import leave as store_leave
from app.presence_store import list_online, record_ping

router = APIRouter(prefix="/api/presence", tags=["presence"])


class PresencePingBody(BaseModel):
    displayName: str | None = Field(default=None, max_length=80)
    menuTitle: str | None = Field(default=None, max_length=40)


def _normalize_presence_name(name: str) -> str:
    compact = re.sub(r"\s+", "", str(name or ""))
    compact = re.sub(r"\([^)]*\)", "", compact)
    if compact == "사용자":
        compact = "이용자"
    return compact[:3] if compact else ""


def _identity_from_request(request: Request, body_name: str | None) -> tuple[str, str]:
    jwt_name = str(getattr(request.state, "auth_display_name", "") or "").strip()
    fallback = str(body_name or "").strip()
    name = _normalize_presence_name(jwt_name or fallback)
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="displayName is required for presence ping",
        )
    return name, name


@router.post("/ping")
def ping(request: Request, body: PresencePingBody | None = None):
    display_name = body.displayName if body else None
    menu_title = body.menuTitle if body else None
    user_id, name = _identity_from_request(request, display_name)
    return record_ping(user_id, name, menu_title or "")


@router.get("/online")
def online():
    return {"users": list_online()}


@router.post("/leave")
def leave(request: Request, body: PresencePingBody | None = None):
    display_name = body.displayName if body else None
    try:
        user_id, _ = _identity_from_request(request, display_name)
    except HTTPException:
        return {"ok": True}
    store_leave(user_id)
    return {"ok": True}
