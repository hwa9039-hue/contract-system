"""로컬 전용 접속자 서버 — 계약 API(NAS)와 분리해서 띄운다.

Vite 개발 화면은 계약은 NAS를 보고, ping/online 만 여기(8010)로 보낸다.
시크릿 창 두 개(전재우 / 신상준)로 혼자 테스트할 때 쓴다.

  cd backend
  python -m uvicorn presence_dev:app --host 127.0.0.1 --port 8010
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.presence import router as presence_router

app = FastAPI(title="CMS presence (local dev)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.0.131:5173",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(presence_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "presence": True, "mode": "local-dev"}
