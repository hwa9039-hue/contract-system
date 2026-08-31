"""접속 생존 신고(heartbeat) 저장소.

현재는 프로세스 메모리 dict. 단일 uvicorn 워커면 충분하다.
NAS에서 워커를 여러 개 띄우면 ping/online이 워커마다 갈라지므로
그때는 Redis(또는 DB)로 바꾸면 된다.

키: 표시 이름(JWT display_name). 같은 이름으로 두 탭이면 한 칸으로 합쳐진다.
값: 마지막 ping 시각(UTC).
"""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

# 프론트는 30초마다 ping. 한두 번 놓쳐도 남아 있게 2분.
ONLINE_WINDOW = timedelta(seconds=120)

_lock = threading.Lock()
_last_active: dict[str, datetime] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def record_ping(user_id: str, display_name: str) -> dict:
    key = (user_id or display_name or "").strip()
    name = (display_name or user_id or "").strip()
    if not key:
        raise ValueError("empty presence id")
    now = _utcnow()
    with _lock:
        _last_active[key] = now
    return {"id": key, "displayName": name, "lastActiveAt": now.isoformat()}


def list_online() -> list[dict]:
    cutoff = _utcnow() - ONLINE_WINDOW
    with _lock:
        stale = [key for key, ts in _last_active.items() if ts < cutoff]
        for key in stale:
            _last_active.pop(key, None)
        items = [
            {"id": key, "displayName": key, "lastActiveAt": ts.isoformat()}
            for key, ts in _last_active.items()
        ]
    items.sort(key=lambda row: row["displayName"])
    return items


def leave(user_id: str) -> None:
    key = (user_id or "").strip()
    if not key:
        return
    with _lock:
        _last_active.pop(key, None)
