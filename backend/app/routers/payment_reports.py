import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import (
    PAYMENT_REPORT_DB_COLUMNS,
    PaymentReportBulkDelete,
    PaymentReportCreate,
    PaymentReportOut,
    PaymentReportPatch,
    payment_report_patch_to_db_values,
    payment_report_to_db_values,
    row_to_payment_report,
)

logger = logging.getLogger(__name__)

PAYMENT_REPORTS_API_PATH = "/api/payment-reports"
router = APIRouter(prefix=PAYMENT_REPORTS_API_PATH, tags=["payment-reports"])

PAYMENT_REPORT_COLUMNS = list(PAYMENT_REPORT_DB_COLUMNS.values())
PAYMENT_REPORT_RETURNING = ",\n  ".join(["id::text as id", *PAYMENT_REPORT_COLUMNS])


def insert_payment_report_row(cursor, row: PaymentReportCreate) -> dict:
    values = payment_report_to_db_values(row)
    now = datetime.now(timezone.utc)
    values["id"] = str(uuid4())
    values["created_at"] = now
    values["updated_at"] = now

    columns = [*PAYMENT_REPORT_COLUMNS, "id", "created_at", "updated_at"]
    placeholders = [f"%({column})s" for column in columns]

    cursor.execute(
        f"""
        insert into payment_report_rows ({", ".join(columns)})
        values ({", ".join(placeholders)})
        returning {PAYMENT_REPORT_RETURNING}
        """,
        values,
    )
    created = cursor.fetchone()
    if not created:
        raise RuntimeError("payment_report_rows insert returned no row")
    return row_to_payment_report(created)


@router.get("", response_model=list[PaymentReportOut])
def list_payment_reports():
    """결제보고 목록 (GET /api/payment-reports)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                select
                  {PAYMENT_REPORT_RETURNING}
                from payment_report_rows
                order by payment_month asc nulls last,
                         payment_cycle asc,
                         sort_order asc,
                         created_at asc nulls last
                """
            )
            rows = cursor.fetchall() or []

    return [row_to_payment_report(row) for row in rows]


@router.post("", response_model=PaymentReportOut, status_code=status.HTTP_201_CREATED)
def create_payment_report(body: PaymentReportCreate):
    """결제보고 신규 등록 (POST /api/payment-reports)."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            created = insert_payment_report_row(cursor, body)
        connection.commit()

    logger.info("payment_report_rows created id=%s", created.get("id"))
    return created


@router.patch("/{row_id}", response_model=PaymentReportOut)
def update_payment_report(row_id: str, patch: PaymentReportPatch):
    """결제보고 행 수정 (PATCH /api/payment-reports/{id})."""
    values = payment_report_patch_to_db_values(patch)
    if not values:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values["id"] = row_id
    values["updated_at"] = datetime.now(timezone.utc)
    assignments = [f"{column} = %({column})s" for column in values.keys() if column != "id"]

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update payment_report_rows
                set {", ".join(assignments)}
                where id::text = %(id)s
                returning {PAYMENT_REPORT_RETURNING}
                """,
                values,
            )
            updated = cursor.fetchone()
        connection.commit()

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment report row not found")

    logger.info("payment_report_rows updated id=%s fields=%s", row_id, sorted(values.keys()))
    return row_to_payment_report(updated)


@router.delete("")
def bulk_delete_payment_reports(payload: PaymentReportBulkDelete):
    """결제보고 선택 삭제 (DELETE /api/payment-reports)."""
    ids = [str(item) for item in payload.ids if str(item).strip()]
    if not ids:
        return {"deleted": 0}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from payment_report_rows where id::text = any(%s)",
                (ids,),
            )
            deleted_count = cursor.rowcount
        connection.commit()

    logger.info("payment_report_rows bulk deleted count=%s", deleted_count)
    return {"deleted": deleted_count}
