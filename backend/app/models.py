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


# project_discovery_rows 전체 컬럼 (API camelCase)
PROJECT_DISCOVERY_ROW_FIELDS = (
    "id",
    "permitDate",
    "checkStatus",
    "projectStage",
    "salesTarget",
    "projectCategory",
    "localGov",
    "client",
    "projectName",
    "projectAmount",
    "completionPeriod",
    "manager",
    "note",
    "summary",
    "reportMarkedAt",
    "isHidden",
    "createdAt",
    "updatedAt",
)


class ProjectDiscoveryRow:
    """건축정보 1행 — 타입 힌트용 (DB 매핑은 schemas.row_to_project_discovery)."""

    id: str
    permit_date: str
    check_status: str
    project_stage: str
    sales_target: str
    project_category: str
    local_gov: str
    client: str
    project_name: str
    project_amount: int
    completion_period: str
    manager: str
    note: str
    summary: str
    report_marked_at: Optional[str]
    is_hidden: bool
    created_at: Optional[str]
    updated_at: Optional[str]


# excluded_projects_rows 전체 컬럼 (API camelCase)
EXCLUDED_PROJECT_ROW_FIELDS = (
    "id",
    "orderNo",
    "writeDate",
    "openDate",
    "category",
    "keyword",
    "shareStatus",
    "writer",
    "projectName",
    "client",
    "projectAmount",
    "exclusionReason",
    "isHidden",
    "createdAt",
    "updatedAt",
)


class ExcludedProjectRow:
    """사업공유 1행 — 타입 힌트용 (DB 매핑은 schemas.row_to_excluded_project)."""

    id: str
    order_no: str
    write_date: Optional[date]
    open_date: Optional[date]
    category: str
    keyword: str
    share_status: str
    writer: str
    project_name: str
    client: str
    project_amount: int
    exclusion_reason: str
    is_hidden: bool
    created_at: Optional[str]
    updated_at: Optional[str]
