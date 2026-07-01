"""Role-based access control for API routes.

admin   — all endpoints
manager — 부서장. 현재는 admin 과 100% 동일(ADMIN_LEVEL_ROLES 참고)
user    — admin-only menus blocked; viewer-only menus GET-only; rest full access
"""

ADMIN_ONLY_PREFIXES = ()

USER_READ_ONLY_PREFIXES = (
    "/api/contracts",
    "/api/project-management",
    "/api/materials-board",
    "/api/install-cases",
    "/api/contacts-manage",
    "/api/unit-prices",
)

VALID_ROLES = frozenset({"admin", "manager", "user"})

# ★ 부서장 권한 분기의 핵심 스위치 (백엔드) ★
# "관리자급"으로 취급해 모든 API 를 통과시킬 역할 목록.
# 현재는 부서장(manager)을 관리자(admin)와 동일하게 전체 허용합니다.
#
# ▶ 나중에 부서장을 축소하려면:
#    - 전면 강등: 이 집합에서 "manager" 를 빼면 아래 user 규칙이 그대로 적용됩니다.
#    - 특정 API 만 제한: is_rbac_allowed 안에서 path 별로 manager 를 따로 분기하세요.
ADMIN_LEVEL_ROLES = frozenset({"admin", "manager"})


def normalize_role(role: str | None) -> str:
    normalized = (role or "user").strip().lower()
    return normalized if normalized in VALID_ROLES else "user"


def is_rbac_allowed(path: str, method: str, role: str | None) -> bool:
    normalized_role = normalize_role(role)
    # 관리자급(admin·manager)은 전체 허용
    if normalized_role in ADMIN_LEVEL_ROLES:
        return True

    upper_method = (method or "GET").upper()

    for prefix in ADMIN_ONLY_PREFIXES:
        if path.startswith(prefix):
            return False

    if upper_method in ("GET", "HEAD", "OPTIONS"):
        return True

    for prefix in USER_READ_ONLY_PREFIXES:
        if path.startswith(prefix):
            return False

    return True
