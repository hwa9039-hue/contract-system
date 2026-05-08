import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import (
    budget_progress,
    contracts,
    document_register,
    excluded_projects,
    project_discovery,
    sales_register,
    weekly_work_reports,
)


def get_cors_origins():
    raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


app = FastAPI(title="Contract Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


app.include_router(contracts.router)
app.include_router(sales_register.router)
app.include_router(budget_progress.router)
app.include_router(project_discovery.router)
app.include_router(excluded_projects.router)
app.include_router(document_register.router)
app.include_router(weekly_work_reports.router)
