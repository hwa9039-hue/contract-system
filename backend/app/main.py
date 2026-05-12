import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth_middleware import ApiJwtAuthMiddleware
from app.database import init_db
from app.routers import (
    auth,
    budget_progress,
    contracts,
    document_register,
    excluded_projects,
    project_discovery,
    sales_register,
    weekly_work_reports,
)


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://contract-system-2ev.pages.dev",
    "https://contract.signtelecom-smartdi.com",
)
# 환경변수에 도메인을 빠뜨려도 회사 프론트(pages.dev·signtelecom-smartdi.com)가 허용되도록 정규식으로 보조합니다.
ALLOW_ORIGIN_REGEX = (
    r"https://(.*\.pages\.dev|([a-zA-Z0-9-]+\.)*signtelecom-smartdi\.com)$"
)


def get_cors_origins():
    raw_origins = os.getenv("CORS_ORIGINS")
    if raw_origins:
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return list(DEFAULT_CORS_ORIGINS)


logger = logging.getLogger(__name__)

app = FastAPI(title="Contract Management API")

app.add_middleware(ApiJwtAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"ok": True}

@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("init_db completed (contracts_rows null id repair runs here and on GET /api/contracts)")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(contracts.router)
app.include_router(sales_register.router)
app.include_router(budget_progress.router)
app.include_router(project_discovery.router)
app.include_router(excluded_projects.router)
app.include_router(document_register.router)
app.include_router(weekly_work_reports.router)
