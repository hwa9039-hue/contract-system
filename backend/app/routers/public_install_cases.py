"""외부 공유용 설치사례 조회 API (로그인 없이 GET 만).

관리자 API(/api/install-cases)와 분리해 두고, 화면에 보여 줄 필드만 골라서 내보낸다.
등록·수정·삭제 경로는 여기에 없다.
"""

from fastapi import APIRouter

from app.routers.install_cases import list_install_case_rows

PUBLIC_INSTALL_CASES_API_PATH = "/api/public/install-cases"
router = APIRouter(prefix=PUBLIC_INSTALL_CASES_API_PATH, tags=["public-install-cases"])

# 외부에 내보내는 필드. 작성·수정 시각 같은 내부 값은 뺀다.
_PUBLIC_FIELDS = (
    "id",
    "projectName",
    "heroImage",
    "heroImages",
    "environment",
    "middleCategory",
    "audience",
    "year",
    "purpose",
    "client",
    "specs",
)


@router.get("")
def list_public_install_cases():
    return [{key: row.get(key) for key in _PUBLIC_FIELDS} for row in list_install_case_rows()]
