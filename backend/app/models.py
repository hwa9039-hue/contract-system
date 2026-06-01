"""contracts_rows 테이블 필드 정의 (ORM 미사용 — schemas.py·database.py 와 동기)."""

from datetime import date
from typing import Optional

# 사업관리 화면에서 편집하는 계약 필드
PROJECT_MANAGEMENT_DATE_FIELDS = (
    "commencementCert",
    "completionCert",
    "warrantyStart",
    "warrantyExpiry",
    "inspectionRequestDate",
)

PROJECT_MANAGEMENT_TEXT_FIELDS = (
    "guaranteeRate",
    "taxInvoice",
)

# contracts_rows 전체 컬럼 (API camelCase)
CONTRACT_ROW_FIELDS = (
    "id",
    "year",
    "segment",
    "refNo",
    "contractNo",
    "client",
    "department",
    "contractMethod",
    "contractType",
    "identNo",
    "contractDate",
    "dueDate",
    "projectName",
    "amount",
    "salesOwner",
    "pm",
    "note",
    *PROJECT_MANAGEMENT_DATE_FIELDS,
    *PROJECT_MANAGEMENT_TEXT_FIELDS,
)


class ContractRow:
    """계약 1행 — 타입 힌트용 (DB 매핑은 schemas.row_to_contract)."""

    id: str
    year: Optional[int]
    segment: str
    ref_no: str
    contract_no: str
    client: str
    department: str
    contract_method: str
    contract_type: str
    ident_no: str
    contract_date: Optional[date]
    due_date: Optional[date]
    project_name: str
    amount: int
    sales_owner: str
    pm: str
    note: str
    commencement_cert: Optional[date]
    completion_cert: Optional[date]
    warranty_start: Optional[date]
    warranty_expiry: Optional[date]
    guarantee_rate: str
    inspection_request_date: Optional[date]
    tax_invoice: str
