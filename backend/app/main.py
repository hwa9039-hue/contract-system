from app.middleware import ApiJwtAuthMiddleware
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cors_preflight_middleware import ApiPreflightCorsMiddleware
from app.database import init_db
from app.routers import auth
from app.routers import contracts
from app.routers import document_register
from app.routers import excluded_projects
from app.routers import project_discovery
from app.routers import sales_register
from app.routers import weekly_work_reports


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://contract-system-2ev.pages.dev",
    "https://contract.signtelecom-smartdi.com",
    "https://contract.signtelcom-smartdi.com",
)
# 환경변수에 도메인을 빠뜨려도 회사 프론트(pages.dev·signtelecom-smartdi.com)가 허용되도록 정규식으로 보조합니다.
ALLOW_ORIGIN_REGEX = (
    r"https://(.*\.pages\.dev|([a-zA-Z0-9-]+\.)*(signtelecom|signtelcom)-smartdi\.com)$"
)


def get_cors_origins():
    """CORS_ORIGINS 가 있어도 DEFAULT 를 합쳐서, env 만 넣다가 운영 프론트가 빠지는 실수를 막습니다."""
    raw = os.getenv("CORS_ORIGINS")
    env_list = [o.strip() for o in raw.split(",") if o.strip()] if raw else []
    merged: list[str] = []
    seen: set[str] = set()
    for o in [*env_list, *DEFAULT_CORS_ORIGINS]:
        if o not in seen:
            seen.add(o)
            merged.append(o)
    return merged


logger = logging.getLogger(__name__)

app = FastAPI(title="Contract Management API")

_EFFECTIVE_CORS_ORIGINS = get_cors_origins()

app.add_middleware(ApiJwtAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_EFFECTIVE_CORS_ORIGINS,
    allow_origin_regex=ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 가장 바깥: OPTIONS 프리플라이트에 CORS 헤더를 직접 붙임 (Nginx/프록시와 CORSMiddleware 조합 이슈 완화)
app.add_middleware(
    ApiPreflightCorsMiddleware,
    allow_origins=_EFFECTIVE_CORS_ORIGINS,
    allow_origin_regex=ALLOW_ORIGIN_REGEX,
)

@app.get("/")
def root():
    return {"ok": True}

@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("init_db completed (contracts_rows null id repair runs here and on GET /api/contracts)")
    logger.info("CORS allow_origins count=%s (merged env + defaults)", len(_EFFECTIVE_CORS_ORIGINS))


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(contracts.router)
app.include_router(sales_register.router)
app.include_router(project_discovery.router)
app.include_router(excluded_projects.router)
app.include_router(document_register.router)
app.include_router(weekly_work_reports.router)
