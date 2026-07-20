"""건축정보·사업공유 → 영업관리대장 이관 API."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.routers.sales_register import insert_sales_row
from app.routers.project_discovery import RETURNING_COLUMNS as DISCOVERY_RETURNING
from app.routers.excluded_projects import RETURNING_COLUMNS as EXCLUDED_RETURNING
from app.sales_transfer_mapping import map_discovery_row_to_sales, map_excluded_row_to_sales
from app.schemas import (
    SalesTransferOut,
    SalesTransferRequest,
    row_to_excluded_project,
    row_to_project_discovery,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sales", tags=["sales-transfer"])


def _normalize_ids(raw_ids: list[Any]) -> list[str]:
    seen: set[str] = set()
    ids: list[str] = []
    for item in raw_ids or []:
        value = str(item).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        ids.append(value)
    return ids


@router.post("/transfer", response_model=SalesTransferOut, status_code=status.HTTP_201_CREATED)
def transfer_to_sales_register(payload: SalesTransferRequest):
    """선택한 건축정보/사업공유 행을 영업관리대장으로 이관(매핑 insert + 원본 delete)."""
    ids = _normalize_ids(payload.ids)
    if not ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이관할 행을 선택해주세요.",
        )

    source = payload.source
    created_rows: list[dict] = []

    with get_connection() as connection:
        try:
            with connection.cursor() as cursor:
                if source == "discovery":
                    cursor.execute(
                        f"""
                        select {DISCOVERY_RETURNING}
                        from project_discovery_rows
                        where id::text = any(%s)
                        """,
                        (ids,),
                    )
                    source_rows = [row_to_project_discovery(row) for row in cursor.fetchall()]
                    mapper = map_discovery_row_to_sales
                    source_table = "project_discovery_rows"
                else:
                    cursor.execute(
                        f"""
                        select {EXCLUDED_RETURNING}
                        from excluded_projects_rows
                        where id::text = any(%s)
                        """,
                        (ids,),
                    )
                    source_rows = [row_to_excluded_project(row) for row in cursor.fetchall()]
                    mapper = map_excluded_row_to_sales
                    source_table = "excluded_projects_rows"

                if not source_rows:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="선택한 원본 데이터를 찾을 수 없습니다.",
                    )

                found_ids = {str(row.get("id") or "").strip() for row in source_rows}
                missing = [item for item in ids if item not in found_ids]
                if missing:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"일부 원본 데이터를 찾을 수 없습니다: {', '.join(missing[:5])}",
                    )

                for source_row in source_rows:
                    sales_row = mapper(source_row)
                    # 이관은 원본 유실 방지가 우선 — varchar(50) truncate 생략 (DB는 text)
                    created = insert_sales_row(cursor, sales_row, truncate=False)
                    created_rows.append(created)

                transferred_ids = [str(row.get("id") or "").strip() for row in source_rows]
                cursor.execute(
                    f"delete from {source_table} where id::text = any(%s)",
                    (transferred_ids,),
                )
                deleted_count = cursor.rowcount

            connection.commit()
        except HTTPException:
            connection.rollback()
            raise
        except Exception as exc:
            connection.rollback()
            logger.exception("sales transfer failed (source=%s, ids=%s)", source, ids)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"이관 처리 중 오류가 발생했습니다: {exc}",
            ) from exc

    return SalesTransferOut(
        transferred=len(created_rows),
        deletedSource=deleted_count,
        rows=created_rows,
    )
