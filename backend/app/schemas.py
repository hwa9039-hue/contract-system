from datetime import date
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ContractBase(BaseModel):
    year: Optional[int] = None
    segment: str = ""
    refNo: str = ""
    contractNo: str = ""
    client: str = ""
    department: str = ""
    contractMethod: str = ""
    contractType: str = ""
    contractDate: Optional[date] = None
    dueDate: Optional[date] = None
    projectName: str = ""
    amount: int = 0
    salesOwner: str = ""
    pm: str = ""
    note: str = ""


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
    contractDate: Optional[date] = None
    dueDate: Optional[date] = None
    projectName: Optional[str] = None
    amount: Optional[int] = None
    salesOwner: Optional[str] = None
    pm: Optional[str] = None
    note: Optional[str] = None


class ContractOut(BaseModel):
    id: Optional[Any] = None
    year: Optional[Any] = None
    segment: Optional[Any] = None
    refNo: Optional[Any] = None
    contractNo: Optional[Any] = None
    client: Optional[Any] = None
    department: Optional[Any] = None
    contractMethod: Optional[Any] = None
    contractType: Optional[Any] = None
    contractDate: Optional[Any] = None
    dueDate: Optional[Any] = None
    projectName: Optional[Any] = None
    amount: Optional[Any] = None
    salesOwner: Optional[Any] = None
    pm: Optional[Any] = None
    note: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


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


def decimal_to_int(value):
    if isinstance(value, Decimal):
        return int(value)
    return value or 0


def to_response_value(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(int(value))
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def row_to_contract(row) -> dict:
    return {
        "id": to_response_value(row["id"]),
        "year": to_response_value(row["year"]),
        "segment": to_response_value(row["segment"]),
        "refNo": to_response_value(row["refNo"]),
        "contractNo": to_response_value(row["contractNo"]),
        "client": to_response_value(row["client"]),
        "department": to_response_value(row["department"]),
        "contractMethod": to_response_value(row["contractMethod"]),
        "contractType": to_response_value(row["contractType"]),
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
    return {
        "id": to_response_value(row["id"]),
        "permitDate": to_response_value(row["permitdate"]),
        "checkStatus": to_response_value(row["checkstatus"]),
        "salesTarget": to_response_value(row["salestarget"]),
        "projectCategory": to_response_value(row["projectcategory"]),
        "localGov": to_response_value(row["localgov"]),
        "client": to_response_value(row["client"]),
        "projectName": to_response_value(row["projectname"]),
        "projectAmount": to_response_value(row["projectamount"]),
        "completionPeriod": to_response_value(row["completionperiod"]),
        "manager": to_response_value(row["manager"]),
        "note": to_response_value(row["note"]),
        "createdAt": to_response_value(row["createdat"]),
        "updatedAt": to_response_value(row["updatedat"]),
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


CONTRACT_DB_COLUMNS = {
    "year": "year",
    "segment": "segment",
    "refNo": "refNo",
    "contractNo": "contractNo",
    "client": "client",
    "department": "department",
    "contractMethod": "contractMethod",
    "contractType": "contractType",
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
        "permitDate": "permitdate",
        "checkStatus": "checkstatus",
        "salesTarget": "salestarget",
        "projectCategory": "projectcategory",
        "localGov": "localgov",
        "client": "client",
        "projectName": "projectname",
        "projectAmount": "projectamount",
        "completionPeriod": "completionperiod",
        "manager": "manager",
        "note": "note",
        "createdAt": "createdat",
        "updatedAt": "updatedat",
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
}

SALES_REGISTER_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["sales_register_rows"]
BUDGET_PROGRESS_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["budget_progress_rows"]
PROJECT_DISCOVERY_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["project_discovery_rows"]
EXCLUDED_PROJECT_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["excluded_projects_rows"]
DOCUMENT_REGISTER_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["document_register_rows"]
WEEKLY_WORK_REPORT_DB_COLUMNS = TABLE_COLUMN_MAPPINGS["weekly_work_reports_rows"]


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


def contract_to_db_values(contract: ContractBase) -> dict:
    data = contract.model_dump()
    return {db_key: data[api_key] for api_key, db_key in CONTRACT_DB_COLUMNS.items()}
