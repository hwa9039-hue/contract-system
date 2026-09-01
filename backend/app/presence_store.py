"""접속 생존 신고(heartbeat) 저장소.

워커가 여러 개여도 같은 파일을 보도록 UPLOAD_DIR(공유 볼륨)에 기록한다.
값은 예전처럼 시각 문자열이거나 {ts, menuTitle} 객체다.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

ONLINE_WINDOW = timedelta(seconds=120)

_lock = threading.Lock()


def _store_path() -> Path:
    raw = (os.getenv("PRESENCE_STORE_PATH") or "").strip()
    if raw:
        return Path(raw)
    upload_dir = (os.getenv("UPLOAD_DIR") or "uploads").strip() or "uploads"
    return Path(upload_dir) / "presence-online.json"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _read() -> dict:
    path = _store_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write(data: dict) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _parse_entry(raw) -> tuple[datetime | None, str]:
    if isinstance(raw, dict):
        raw_ts = raw.get("ts") or raw.get("lastActiveAt") or ""
        menu_title = str(raw.get("menuTitle") or "").strip()
    else:
        raw_ts = raw
        menu_title = ""
    try:
        ts = datetime.fromisoformat(str(raw_ts))
    except ValueError:
        return None, ""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts, menu_title


def record_ping(user_id: str, display_name: str, menu_title: str = "") -> dict:
    key = (user_id or display_name or "").strip()
    name = (display_name or user_id or "").strip()
    if not key:
        raise ValueError("empty presence id")
    now = _utcnow()
    title = str(menu_title or "").strip()[:40]
    with _lock:
        data = _read()
        data[key] = {"ts": now.isoformat(), "menuTitle": title}
        _write(data)
    return {
        "id": key,
        "displayName": name,
        "lastActiveAt": now.isoformat(),
        "menuTitle": title,
        "users": list_online(),
    }


def list_online() -> list[dict]:
    cutoff = _utcnow() - ONLINE_WINDOW
    with _lock:
        data = _read()
        kept: dict = {}
        items: list[dict] = []
        for key, raw in data.items():
            ts, menu_title = _parse_entry(raw)
            if ts is None or ts < cutoff:
                continue
            kept[key] = {"ts": ts.isoformat(), "menuTitle": menu_title}
            items.append(
                {
                    "id": key,
                    "displayName": key,
                    "lastActiveAt": ts.isoformat(),
                    "menuTitle": menu_title,
                }
            )
        if kept != data:
            _write(kept)
    items.sort(key=lambda row: row["displayName"])
    return items


def leave(user_id: str) -> None:
    # 창 전환·HMR 에서 상대가 사라지지 않게 leave 는 무시한다. TTL 로만 정리.
    return
