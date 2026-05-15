from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class ContractBase(BaseModel):
    year: Optional[int] = None
    segment: str = ""
    refNo: str = ""
    contractNo: str = ""
    client: str = ""
    department: str = ""
    contractMethod: str = ""
    contractType: str = ""
    identNo: str = ""
    contractDate: Optional[date] = None
    dueDate: Optional[date] = None
    projectName: str = ""
    amount: int = 0
    salesOwner: str = ""
    pm: str = ""
    note: str = ""

    @field_validator("contractDate", "dueDate", mode="before")
    @classmethod
    def empty_string_dates_to_none(cls, value):
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("year", mode="before")
    @classmethod
    def year_normalize(cls, value):
        if value is None or isinstance(value, bool):
            return None
        if isinstance(value, str):
            digits = "".join(c for c in value if c.isdigit())[:4]
            return int(digits, 10) if digits else None
        if isinstance(value, float):
            if value != value:  # NaN
                return None
            return int(value)
        if isinstance(value, int):
            return value
        return None


class ContractCreate(ContractBase):
    pass


class ContractPatch(BaseModel):
    year: Optional[int] = None
    segment: Optional[str] = None
    refNo: Optional[str] = None
    contractNo: Optional[str] = None
    client: Optional[str] = None
    department: Optional[str] = None
    contractMethod: Optional[str] = None
    contractType: Optional[str] = None
    identNo: Optional[str] = None
    contractDate: Optional[date] = None
    dueDate: Optional[date] = None
    projectName: Optional[str] = None
    amount: Optional[int] = None
    salesOwner: Optional[str] = None
    pm: Optional[str] = None
    note: Optional[str] = None


def coerce_contract_api_id(value: Any) -> str:
    """드라이버·Mongo 스타일까지 포함해 API `id` 문자열로 통일 (없으면 빈 문자열)."""
    if value is None:
        return ""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        if "$oid" in value:
            return coerce_contract_api_id(value.get("$oid"))
        if "_id" in value:
            return coerce_contract_api_id(value.get("_id"))
    return str(value).strip()


class ContractOut(BaseModel):
    id: str
    year: Optional[Any] = None
    segment: Optional[Any] = None
    refNo: Optional[Any] = None
    contractNo: Optional[Any] = None
    client: Optional[Any] = None
    department: Optional[Any] = None
    contractMethod: Optional[Any] = None
    contractType: Optional[Any] = None
    identNo: Optional[Any] = None
    contractDate: Optional[Any] = None
    dueDate: Optional[Any] = None
    projectName: Optional[Any] = None
    amount: Optional[Any] = None
    salesOwner: Optional[Any] = None
    pm: Optional[Any] = None
    note: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("id", mode="before")
    @classmethod
    def id_to_str(cls, value: Any) -> str:
        return coerce_contract_api_id(value)


class ContractBulkCreate(BaseModel):
    rows: list[ContractCreate]


class ContractBulkDelete(BaseModel):
    ids: list[Any]


class SalesRegisterBase(BaseModel):
    registerDate: Optional[Any] = None
    client: Optional[Any] = ""
    projectName: Optional[Any] = ""
    projectAmount: Optional[Any] = 0
    projectCategory: Optional[Any] = ""
    projectStage: Optional[Any] = ""
    manager: Optional[Any] = ""
    projectType: Optional[Any] = ""
    department: Optional[Any] = ""
    detail: Optional[Any] = ""
    source: Optional[Any] = ""
    salesNote: Optional[Any] = ""
    actionRequest: Optional[Any] = ""
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class SalesRegisterCreate(SalesRegisterBase):
    pass


class SalesRegisterPatch(BaseModel):
    registerDate: Optional[Any] = None
    client: Optional[Any] = None
    projectName: Optional[Any] = None
    projectAmount: Optional[Any] = None
    projectCategory: Optional[Any] = None
    projectStage: Optional[Any] = None
    manager: Optional[Any] = None
    projectType: Optional[Any] = None
    department: Optional[Any] = None
    detail: Optional[Any] = None
    source: Optional[Any] = None
    salesNote: Optional[Any] = None
    actionRequest: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class SalesRegisterOut(SalesRegisterBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class SalesRegisterImport(BaseModel):
    rows: list[SalesRegisterCreate]


class SalesRegisterBulkDelete(BaseModel):
    ids: list[Any]


class BudgetProgressBase(BaseModel):
    registerDate: Optional[Any] = None
    localGov: Optional[Any] = ""
    projectName: Optional[Any] = ""
    budgetAmount: Optional[Any] = 0
    manager: Optional[Any] = ""
    projectStage: Optional[Any] = ""
    department: Optional[Any] = ""
    detail: Optional[Any] = ""
    salesMatch: Optional[Any] = ""
    note: Optional[Any] = ""
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class BudgetProgressCreate(BudgetProgressBase):
    pass


class BudgetProgressPatch(BaseModel):
    registerDate: Optional[Any] = None
    localGov: Optional[Any] = None
    projectName: Optional[Any] = None
    budgetAmount: Optional[Any] = None
    manager: Optional[Any] = None
    projectStage: Optional[Any] = None
    department: Optional[Any] = None
    detail: Optional[Any] = None
    salesMatch: Optional[Any] = None
    note: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class BudgetProgressOut(BudgetProgressBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class BudgetProgressImport(BaseModel):
    rows: list[BudgetProgressCreate]


class BudgetProgressBulkDelete(BaseModel):
    ids: list[Any]


class ProjectDiscoveryBase(BaseModel):
    permitDate: Optional[Any] = None
    checkStatus: Optional[Any] = ""
    salesTarget: Optional[Any] = ""
    projectCategory: Optional[Any] = ""
    localGov: Optional[Any] = ""
    client: Optional[Any] = ""
    projectName: Optional[Any] = ""
    projectAmount: Optional[Any] = 0
    completionPeriod: Optional[Any] = ""
    manager: Optional[Any] = ""
    note: Optional[Any] = ""
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class ProjectDiscoveryCreate(ProjectDiscoveryBase):
    pass


class ProjectDiscoveryPatch(BaseModel):
    permitDate: Optional[Any] = None
    checkStatus: Optional[Any] = None
    salesTarget: Optional[Any] = None
    projectCategory: Optional[Any] = None
    localGov: Optional[Any] = None
    client: Optional[Any] = None
    projectName: Optional[Any] = None
    projectAmount: Optional[Any] = None
    completionPeriod: Optional[Any] = None
    manager: Optional[Any] = None
    note: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class ProjectDiscoveryOut(ProjectDiscoveryBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectDiscoveryImport(BaseModel):
    rows: list[ProjectDiscoveryCreate]


class ProjectDiscoveryBulkDelete(BaseModel):
    ids: list[Any]


class ExcludedProjectBase(BaseModel):
    orderNo: Optional[Any] = ""
    writeDate: Optional[Any] = None
    openDate: Optional[Any] = None
    category: Optional[Any] = ""
    keyword: Optional[Any] = ""
    writer: Optional[Any] = ""
    projectName: Optional[Any] = ""
    client: Optional[Any] = ""
    projectAmount: Optional[Any] = 0
    exclusionReason: Optional[Any] = ""
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class ExcludedProjectCreate(ExcludedProjectBase):
    pass


class ExcludedProjectPatch(BaseModel):
    orderNo: Optional[Any] = None
    writeDate: Optional[Any] = None
    openDate: Optional[Any] = None
    category: Optional[Any] = None
    keyword: Optional[Any] = None
    writer: Optional[Any] = None
    projectName: Optional[Any] = None
    client: Optional[Any] = None
    projectAmount: Optional[Any] = None
    exclusionReason: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class ExcludedProjectOut(ExcludedProjectBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ExcludedProjectImport(BaseModel):
    rows: list[ExcludedProjectCreate]


class ExcludedProjectBulkDelete(BaseModel):
    ids: list[Any]


class DocumentRegisterBase(BaseModel):
    docDate: Optional[Any] = None
    docNo: Optional[Any] = ""
    senderReceiver: Optional[Any] = ""
    title: Optional[Any] = ""
    method: Optional[Any] = ""
    writer: Optional[Any] = ""
    note: Optional[Any] = ""
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class DocumentRegisterCreate(DocumentRegisterBase):
    pass


class DocumentRegisterPatch(BaseModel):
    docDate: Optional[Any] = None
    docNo: Optional[Any] = None
    senderReceiver: Optional[Any] = None
    title: Optional[Any] = None
    method: Optional[Any] = None
    writer: Optional[Any] = None
    note: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class DocumentRegisterOut(DocumentRegisterBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentRegisterImport(BaseModel):
    rows: list[DocumentRegisterCreate]


class DocumentRegisterBulkDelete(BaseModel):
    ids: list[Any]


class WeeklyWorkReportBase(BaseModel):
    date: Optional[Any] = None
    user: Optional[Any] = ""
    section: Optional[Any] = ""
    content: Optional[Any] = ""
    order_index: Optional[Any] = None
    orderIndex: Optional[Any] = None
    reportYear: Optional[Any] = None
    reportMonth: Optional[Any] = None
    weekNumber: Optional[Any] = None
    weekStartDate: Optional[Any] = None
    reportDate: Optional[Any] = None
    assignee: Optional[Any] = None
    team: Optional[Any] = ""
    category: Optional[Any] = ""
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class WeeklyWorkReportCreate(WeeklyWorkReportBase):
    pass


class WeeklyWorkReportPatch(BaseModel):
    date: Optional[Any] = None
    user: Optional[Any] = None
    section: Optional[Any] = None
    content: Optional[Any] = None
    order_index: Optional[Any] = None
    orderIndex: Optional[Any] = None
    reportYear: Optional[Any] = None
    reportMonth: Optional[Any] = None
    weekNumber: Optional[Any] = None
    weekStartDate: Optional[Any] = None
    reportDate: Optional[Any] = None
    assignee: Optional[Any] = None
    team: Optional[Any] = None
    category: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class WeeklyWorkReportOut(WeeklyWorkReportBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class InstallCaseSpecs(BaseModel):
    displayArea: str = ""
    ledPitch: str = ""
    moduleSize: str = ""
    moduleQty: str = ""
    resolution: str = ""
    installType: str = ""


class InstallCaseBase(BaseModel):
    projectName: Optional[Any] = ""
    heroImage: Optional[Any] = ""
    environment: Optional[Any] = "indoor"
    audience: Optional[Any] = "public"
    year: Optional[Any] = ""
    purpose: Optional[Any] = ""
    client: Optional[Any] = ""
    specs: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class InstallCaseCreate(InstallCaseBase):
    pass


class InstallCasePatch(BaseModel):
    projectName: Optional[Any] = None
    heroImage: Optional[Any] = None
    environment: Optional[Any] = None
    audience: Optional[Any] = None
    year: Optional[Any] = None
    purpose: Optional[Any] = None
    client: Optional[Any] = None
    specs: Optional[Any] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None


class InstallCaseOut(InstallCaseBase):
    id: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


def decimal_to_int(value):
    if isinstance(value, Decimal):
        return int(value)
    return value or 0


def to_response_value(value):
    if value is None:
        return None
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(int(value))
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def row_to_contract(row) -> dict:
    raw_id = row.get("id")
    if raw_id is None:
        raw_id = row.get("ID") or row.get("_id")
    id_str: str | None = None
    if raw_id is not None:
        tv = to_response_value(raw_id)
        if tv is not None:
            id_str = str(tv).strip() or None
    if id_str is None:
        id_str = ""
    return {
        "id": id_str,
        "year": to_response_value(row["year"]),
        "segment": to_response_value(row["segment"]),
        "refNo": to_response_value(row["refNo"]),
        "contractNo": to_response_value(row["contractNo"]),
        "client": to_response_value(row["client"]),
        "department": to_response_value(row["department"]),
        "contractMethod": to_response_value(row["contractMethod"]),
        "contractType": to_response_value(row["contractType"]),
        "identNo": to_response_value(row.get("identNo", "")),
        "contractDate": to_response_value(row["contractDate"]),
        "dueDate": to_response_value(row["dueDate"]),
        "projectName": to_response_value(row["projectName"]),
        "amount": to_response_value(row["amount"]),
        "salesOwner": to_response_value(row["salesOwner"]),
        "pm": to_response_value(row["pm"]),
        "note": to_response_value(row["note"]),
    }


def row_to_sales_register(row) -> dict:
    return {
        "id": to_response_value(row["id"]),
        "registerDate": to_response_value(row["registerDate"]),
        "client": to_response_value(row["client"]),
        "projectName": to_response_value(row["projectName"]),
        "projectAmount": to_response_value(row["projectAmount"]),
        "projectCategory": to_response_value(row["projectCategory"]),
        "projectStage": to_response_value(row["projectStage"]),
        "manager": to_response_value(row["manager"]),
        "projectType": to_response_value(row["projectType"]),
        "department": to_response_value(row["department"]),
        "detail": to_response_value(row["detail"]),
        "source": to_response_value(row["source"]),
        "salesNote": to_response_value(row["salesNote"]),
        "actionRequest": to_response_value(row["actionRequest"]),
        "createdAt": to_response_value(row["createdAt"]),
        "updatedAt": to_response_value(row["updatedAt"]),
    }


def row_to_budget_progress(row) -> dict:
    return {
        "id": to_response_value(row["id"]),
        "registerDate": to_response_value(row["registerDate"]),
        "localGov": to_response_value(row["localGov"]),
        "projectName": to_response_value(row["projectName"]),
        "budgetAmount": to_response_value(row["budgetAmount"]),
        "manager": to_response_value(row["manager"]),
        "projectStage": to_response_value(row["projectStage"]),
        "department": to_response_value(row["department"]),
        "detail": to_response_value(row["detail"]),
        "salesMatch": to_response_value(row["salesMatch"]),
        "note": to_response_value(row["note"]),
        "createdAt": to_response_value(row["createdAt"]),
        "updatedAt": to_response_value(row["updatedAt"]),
    }


def row_to_project_discovery(row) -> dict:
    """DB 컬럼명은 database.py 의 quoted camelCase 와 일치 (레거시 소문자 키도 허용)."""
    return {
        "id": to_response_value(row["id"]),
        "permitDate": to_response_value(row.get("permitDate") or row.get("permitdate")),
        "checkStatus": to_response_value(row.get("checkStatus") or row.get("checkstatus")),
        "salesTarget": to_response_value(row.get("salesTarget") or row.get("salestarget")),
        "projectCategory": to_response_value(row.get("projectCategory") or row.get("projectcategory")),
        "localGov": to_response_value(row.get("localGov") or row.get("localgov")),
        "client": to_response_value(row["client"]),
        "projectName": to_response_value(row.get("projectName") or row.get("projectname")),
        "projectAmount": to_response_value(row.get("projectAmount") or row.get("projectamount")),
        "completionPeriod": to_response_value(row.get("completionPeriod") or row.get("completionperiod")),
        "manager": to_response_value(row["manager"]),
        "note": to_response_value(row["note"]),
        "createdAt": to_response_value(row.get("createdAt") or row.get("createdat")),
        "updatedAt": to_response_value(row.get("updatedAt") or row.get("updatedat")),
    }


def row_to_excluded_project(row) -> dict:
    return {
        "id": to_response_value(row["id"]),
        "orderNo": to_response_value(row["orderNo"]),
        "writeDate": to_response_value(row["writeDate"]),
        "openDate": to_response_value(row["openDate"]),
        "category": to_response_value(row["category"]),
        "keyword": to_response_value(row["keyword"]),
        "writer": to_response_value(row["writer"]),
        "projectName": to_response_value(row["projectName"]),
        "client": to_response_value(row["client"]),
        "projectAmount": to_response_value(row["projectAmount"]),
        "exclusionReason": to_response_value(row["exclusionReason"]),
        "createdAt": to_response_value(row["createdAt"]),
        "updatedAt": to_response_value(row["updatedAt"]),
    }


def row_to_document_register(row) -> dict:
    return {
        "id": to_response_value(row["id"]),
        "docDate": to_response_value(row["docDate"]),
        "docNo": to_response_value(row["docNo"]),
        "senderReceiver": to_response_value(row["senderReceiver"]),
        "title": to_response_value(row["title"]),
        "method": to_response_value(row["method"]),
        "writer": to_response_value(row["writer"]),
        "note": to_response_value(row["note"]),
        "createdAt": to_response_value(row["createdAt"]),
        "updatedAt": to_response_value(row["updatedAt"]),
    }


def row_to_weekly_work_report(row) -> dict:
    order_index = to_response_value(row["order_index"])
    return {
        "id": to_response_value(row["id"]),
        "date": to_response_value(row["date"]),
        "user": to_response_value(row["user"]),
        "section": to_response_value(row["section"]),
        "content": to_response_value(row["content"]),
        "order_index": order_index,
        "orderIndex": order_index,
        "reportYear": to_response_value(row["reportYear"]),
        "reportMonth": to_response_value(row["reportMonth"]),
        "weekNumber": to_response_value(row["weekNumber"]),
        "weekStartDate": to_response_value(row["weekStartDate"]),
        "reportDate": to_response_value(row["reportDate"]),
        "assignee": to_response_value(row["assignee"]),
        "team": to_response_value(row["team"]),
        "category": to_response_value(row["category"]),
        "createdAt": to_response_value(row["createdAt"]),
        "updatedAt": to_response_value(row["updatedAt"]),
    }


def _normalize_install_case_specs(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return {
            "displayArea": to_response_value(raw.get("displayArea")) or "",
            "ledPitch": to_response_value(raw.get("ledPitch")) or "",
            "moduleSize": to_response_value(raw.get("moduleSize")) or "",
            "moduleQty": to_response_value(raw.get("moduleQty")) or "",
            "resolution": to_response_value(raw.get("resolution")) or "",
            "installType": to_response_value(raw.get("installType")) or "",
        }
    return {}


def row_to_install_case(row) -> dict:
    return {
        "id": to_response_value(row["id"]),
        "projectName": to_response_value(row["projectName"]),
        "heroImage": to_response_value(row["heroImage"]),
        "environment": to_response_value(row["environment"]),
        "audience": to_response_value(row["audience"]),
        "year": to_response_value(row["year"]),
        "purpose": to_response_value(row["purpose"]),
        "client": to_response_value(row["client"]),
        "specs": _normalize_install_case_specs(row.get("specs")),
        "createdAt": to_response_value(row["createdAt"]),
        "updatedAt": to_response_value(row["updatedAt"]),
    }


CONTRACT_DB_COLUMNS = {
    "year": "year",
    "segment": "segment",
    "refNo": "refNo",
    "contractNo": "contractNo",
    "client": "client",
    "department": "department",
    "contractMethod": "contractMethod",
    "contractType": "contractType",
    "identNo": "identNo",
    "contractDate": "contractDate",
    "dueDate": "dueDate",
    "projectName": "projectName",
    "amount": "amount",
    "salesOwner": "salesOwner",
    "pm": "pm",
    "note": "note",
}

TABLE_COLUMN_MAPPINGS = {
    "contracts_rows": CONTRACT_DB_COLUMNS,
    "sales_register_rows": {
        "registerDate": "registerDate",
        "client": "client",
        "projectName": "projectName",
        "projectAmount": "projectAmount",
        "projectCategory": "projectCategory",
        "projectStage": "projectStage",
        "manager": "manager",
        "projectType": "projectType",
        "department": "department",
        "detail": "detail",
        "source": "source",
        "salesNote": "salesNote",
        "actionRequest": "actionRequest",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
    "budget_progress_rows": {
        "registerDate": "registerDate",
        "localGov": "localGov",
        "projectName": "projectName",
        "budgetAmount": "budgetAmount",
        "manager": "manager",
        "projectStage": "projectStage",
        "department": "department",
        "detail": "detail",
        "salesMatch": "salesMatch",
        "note": "note",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
    "document_register_rows": {
        "docDate": "docDate",
        "docNo": "docNo",
        "senderReceiver": "senderReceiver",
        "title": "title",
        "method": "method",
        "writer": "writer",
        "note": "note",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
    "project_discovery_rows": {
        "permitDate": "permitDate",
        "checkStatus": "checkStatus",
        "salesTarget": "salesTarget",
        "projectCategory": "projectCategory",
        "localGov": "localGov",
        "client": "client",
        "projectName": "projectName",
        "projectAmount": "projectAmount",
        "completionPeriod": "completionPeriod",
        "manager": "manager",
        "note": "note",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
    "excluded_projects_rows": {
        "orderNo": "orderNo",
        "writeDate": "writeDate",
        "openDate": "openDate",
        "category": "category",
        "keyword": "keyword",
        "writer": "writer",
        "projectName": "projectName",
        "client": "client",
        "projectAmount": "projectAmount",
        "exclusionReason": "exclusionReason",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
    "weekly_work_reports_rows": {
        "date": "date",
        "user": "user",
        "section": "section",
        "content": "content",
        "order_index": "order_index",
        "orderIndex": "order_index",
        "reportYear": "reportYear",
        "reportMonth": "reportMonth",
        "weekNumber": "weekNumber",
        "weekStartDate": "weekStartDate",
        "reportDate": "reportDate",
        "assignee": "assignee",
        "team": "team",
        "category": "category",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
    "install_cases_rows": {
        "projectName": "projectName",
        "heroImage": "heroImage",
        "environment": "environment",
        "audience": "audience",
        "year": "year",
        "purpose": "purpose",
        "client": "client",
        "specs": "specs",
        "createdAt": "createdAt",
        "updatedAt": "updatedAt",
    },
}

SALES_REGISTER_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["sales_register_rows"]
BUDGET_PROGRESS_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["budget_progress_rows"]
PROJECT_DISCOVERY_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["project_discovery_rows"]
EXCLUDED_PROJECT_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["excluded_projects_rows"]
DOCUMENT_REGISTER_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["document_register_rows"]
WEEKLY_WORK_REPORT_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["weekly_work_reports_rows"]
INSTALL_CASE_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["install_cases_rows"]


def sales_register_to_db_values(row: SalesRegisterBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    return {
        db_key: data[api_key]
        for api_key, db_key in SALES_REGISTER_DB_COLUMNS.items()
        if api_key in data
    }


def budget_progress_to_db_values(row: BudgetProgressBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    return {
        db_key: data[api_key]
        for api_key, db_key in BUDGET_PROGRESS_DB_COLUMNS.items()
        if api_key in data
    }


def project_discovery_to_db_values(row: ProjectDiscoveryBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    return {
        db_key: data[api_key]
        for api_key, db_key in PROJECT_DISCOVERY_DB_COLUMNS.items()
        if api_key in data
    }


def excluded_project_to_db_values(row: ExcludedProjectBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    return {
        db_key: data[api_key]
        for api_key, db_key in EXCLUDED_PROJECT_DB_COLUMNS.items()
        if api_key in data
    }


def document_register_to_db_values(row: DocumentRegisterBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    return {
        db_key: data[api_key]
        for api_key, db_key in DOCUMENT_REGISTER_DB_COLUMNS.items()
        if api_key in data
    }


def weekly_work_report_to_db_values(row: WeeklyWorkReportBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    values = {}
    for api_key, db_key in WEEKLY_WORK_REPORT_DB_COLUMNS.items():
        if api_key in data:
            values[db_key] = data[api_key]
    return values


def install_case_to_db_values(row: InstallCaseBase) -> dict:
    data = row.model_dump(exclude_unset=True)
    values = {}
    for api_key, db_key in INSTALL_CASE_DB_COLUMNS.items():
        if api_key in data:
            values[db_key] = data[api_key]
    if "specs" in values and values["specs"] is None:
        values["specs"] = {}
    return values


def _sanitize_excel_contract_text(val: Any) -> str:
    """Strip Excel quirks: newlines, leading =, quotes, backslashes, smart quotes."""
    if val is None:
        return ""
    s = str(val).replace("\r\n", "\n").replace("\r", "\n")
    for line in ("\n", "\u2028", "\u2029"):
        s = s.replace(line, "")
    s = s.strip()
    if not s:
        return ""
    if s.startswith("="):
        s = s[1:].strip()
    for ch in '"\'\\\u201c\u201d\u2018\u2019':
        s = s.replace(ch, "")
    return " ".join(s.split())


def _normalize_excel_placeholder_text(val: str) -> str:
    """엑셀에서 '-', 'W-W', '해당없음' 등만 넣은 칸을 빈 문자열로."""
    if not val:
        return ""
    s = val.strip()
    compact = "".join(s.split()).lower()
    if compact in (
        "",
        "-",
        "—",
        "–",
        "−",
        "w-w",
        "n/a",
        "na",
        "x",
        "--",
        "---",
        "해당없음",
        "없음",
        "해당사항없음",
    ):
        return ""
    return s


def _coerce_sql_date(val) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        raw = val.strip()
        if not raw:
            return None
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None
    return None


def contract_to_db_values(contract: ContractBase) -> dict:
    """Normalize types for PostgreSQL / psycopg (Excel payloads may yield datetimes, floats, etc.)."""
    data = contract.model_dump()
    out: dict = {}

    for api_key, db_key in CONTRACT_DB_COLUMNS.items():
        val = data.get(api_key)

        if api_key == "year":
            if val is None:
                out[db_key] = None
            elif isinstance(val, bool):
                out[db_key] = None
            elif isinstance(val, (int, float)):
                out[db_key] = int(val)
            else:
                digits = "".join(c for c in str(val) if c.isdigit())[:4]
                out[db_key] = int(digits) if digits else None
            continue

        if api_key == "amount":
            if val is None:
                out[db_key] = 0
            elif isinstance(val, bool):
                out[db_key] = 0
            elif isinstance(val, (int, float)):
                v = int(val)
                out[db_key] = v if v >= 0 else 0
            elif isinstance(val, Decimal):
                try:
                    out[db_key] = int(val)
                except Exception:
                    out[db_key] = 0
            else:
                try:
                    v = int(Decimal(str(val)))
                    out[db_key] = v if v >= 0 else 0
                except Exception:
                    out[db_key] = 0
            continue

        if api_key in ("contractDate", "dueDate"):
            out[db_key] = _coerce_sql_date(val)
            continue

        if val is None:
            out[db_key] = ""
        elif isinstance(val, str):
            s = (
                _sanitize_excel_contract_text(val)
                if api_key in ("refNo", "contractNo", "identNo")
                else val.strip()
            )
            if api_key in (
                "segment",
                "department",
                "contractMethod",
                "contractType",
                "refNo",
                "contractNo",
                "identNo",
                "client",
                "projectName",
                "note",
                "pm",
                "salesOwner",
            ):
                s = _normalize_excel_placeholder_text(s)
            out[db_key] = s
        else:
            raw = str(val)
            s = (
                _sanitize_excel_contract_text(raw)
                if api_key in ("refNo", "contractNo", "identNo")
                else raw.strip()
            )
            if api_key in (
                "segment",
                "department",
                "contractMethod",
                "contractType",
                "refNo",
                "contractNo",
                "identNo",
                "client",
                "projectName",
                "note",
                "pm",
                "salesOwner",
            ):
                s = _normalize_excel_placeholder_text(s)
            out[db_key] = s

    return out
