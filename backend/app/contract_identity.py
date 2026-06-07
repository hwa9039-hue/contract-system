"""Stable contract identity helpers shared by project/unit management APIs."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any


def _norm_text(value: Any) -> str:
    text = "" if value is None else str(value).strip()
    return re.sub(r"\s+", "", text).lower()


def _norm_date(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()[:10]


def contract_signature_from_mapping(values: dict[str, Any] | None) -> str:
    """Return a stable key that survives contract row id recreation."""
    data = values or {}
    contract_no = _norm_text(data.get("contractNo") or data.get("contractno"))
    if contract_no:
        return f"contract:{contract_no}"

    project = _norm_text(data.get("projectName") or data.get("projectname"))
    client = _norm_text(data.get("client"))
    contract_date = _norm_date(data.get("contractDate") or data.get("contractdate"))
    if project or client or contract_date:
        return f"project:{project}|client:{client}|date:{contract_date}"
    return ""
