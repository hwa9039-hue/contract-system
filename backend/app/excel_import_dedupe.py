"""Excel import duplicate detection (aligned with frontend registry row signatures)."""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from datetime import date, datetime
from typing import Any

# Column key order must match `src/App.jsx` SALES_COLUMNS / DISCOVERY_COLUMNS / EXCLUDED_COLUMNS / DOCUMENT_COLUMNS
SALES_SIGNATURE_KEYS: tuple[str, ...] = (
    "registerDate",
    "client",
    "projectName",
    "projectAmount",
    "projectCategory",
    "projectStage",
    "manager",
    "department",
    "detail",
    "source",
    "salesNote",
    "actionRequest",
)
DISCOVERY_SIGNATURE_KEYS: tuple[str, ...] = (
    "permitDate",
    "checkStatus",
    "salesTarget",
    "projectCategory",
    "localGov",
    "client",
    "projectName",
    "projectAmount",
    "completionPeriod",
    "manager",
    "note",
)
EXCLUDED_SIGNATURE_KEYS: tuple[str, ...] = (
    "writeDate",
    "openDate",
    "category",
    "keyword",
    "writer",
    "projectName",
    "client",
    "projectAmount",
    "exclusionReason",
)
DOCUMENT_SIGNATURE_KEYS: tuple[str, ...] = (
    "docDate",
    "docNo",
    "senderReceiver",
    "title",
    "method",
    "writer",
    "note",
)

_REGISTRY_TABLES = frozenset(
    {
        "sales_register_rows",
        "project_discovery_rows",
        "excluded_projects_rows",
        "document_register_rows",
    }
)


def _digits_only(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"\D", "", str(val))


def _norm_key_text(val: Any) -> str:
    s = "" if val is None else str(val).strip()
    return re.sub(r"\s+", "", s).lower()


def contract_duplicate_key_from_values(values: dict[str, Any]) -> str:
    """Match frontend getContractDuplicateKey (projectName first, else contractNo)."""
    pk = _norm_key_text(values.get("projectName"))
    if pk:
        return f"project:{pk}"
    ck = _norm_key_text(values.get("contractNo"))
    if ck:
        return f"contract:{ck}"
    return ""


def contract_duplicate_label(values: dict[str, Any]) -> str:
    cno = "" if values.get("contractNo") is None else str(values.get("contractNo")).strip()
    pname = "" if values.get("projectName") is None else str(values.get("projectName")).strip()
    if cno:
        return cno
    if pname:
        return pname[:200]
    return "미식별"


def _sig_date(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.date().isoformat()
    if isinstance(val, date):
        return val.isoformat()
    s = str(val).strip()
    return s[:10] if s else ""


def _sig_amount(val: Any) -> str:
    return _digits_only(val)


def _sig_text(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def _registry_signature(values: dict[str, Any], column_keys: Sequence[str]) -> str:
    parts: list[str] = []
    for key in column_keys:
        v = values.get(key)
        if key in ("projectAmount", "budgetAmount"):
            parts.append(f"{key}:{_sig_amount(v)}")
        elif key in (
            "registerDate",
            "permitDate",
            "writeDate",
            "openDate",
            "docDate",
            "dueDate",
            "contractDate",
        ):
            parts.append(f"{key}:{_sig_date(v)}")
        else:
            parts.append(f"{key}:{_sig_text(v)}")
    return "|".join(parts)


def registry_duplicate_label(table: str, values: dict[str, Any]) -> str:
    pname = _sig_text(values.get("projectName"))
    if pname:
        return pname[:200]
    if table == "document_register_rows":
        doc_no = _sig_text(values.get("docNo"))
        title = _sig_text(values.get("title"))[:80]
        if doc_no and title:
            return f"{doc_no} / {title}"
        return doc_no or title or "미식별"
    client = _sig_text(values.get("client"))
    if client:
        return client[:200]
    return "미식별"


def load_contract_duplicate_keys(cursor) -> set[str]:
    cursor.execute(
        """
        select "projectName", "contractNo"
        from contracts_rows
        """
    )
    keys: set[str] = set()
    for row in cursor.fetchall() or []:
        keys.add(
            contract_duplicate_key_from_values(
                {"projectName": row.get("projectName"), "contractNo": row.get("contractNo")}
            )
        )
    keys.discard("")
    return keys


def load_registry_signatures(cursor, table: str, column_keys: Sequence[str]) -> set[str]:
    if table not in _REGISTRY_TABLES:
        raise ValueError(f"unsupported table for registry dedupe: {table}")
    cols_sql = ", ".join(f'"{k}"' for k in column_keys)
    cursor.execute(f"select {cols_sql} from {table}")
    sigs: set[str] = set()
    for row in cursor.fetchall() or []:
        sigs.add(_registry_signature(row, tuple(column_keys)))
    return sigs


def import_rows_with_signature_dedupe(
    cursor,
    table: str,
    column_keys: Sequence[str],
    rows: list[Any],
    to_values: Callable[[Any], dict[str, Any]],
    insert_row: Callable[[Any, Any], Any],
) -> tuple[list[Any], list[str]]:
    """Insert rows skipping duplicates vs DB and within the same batch. Returns (created, duplicate_labels)."""
    existing = load_registry_signatures(cursor, table, column_keys)
    seen: set[str] = set()
    created: list[Any] = []
    duplicate_items: list[str] = []

    for row in rows:
        values = to_values(row)
        sig = _registry_signature(values, column_keys)
        if sig in existing or sig in seen:
            duplicate_items.append(registry_duplicate_label(table, values))
            continue
        created.append(insert_row(cursor, row))
        seen.add(sig)
        existing.add(sig)

    return created, duplicate_items
