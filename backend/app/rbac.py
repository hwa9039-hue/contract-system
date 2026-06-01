"""Role-based access control for API routes.

admin  — all endpoints
user   — admin-only menus blocked; viewer-only menus GET-only; rest full access
"""

ADMIN_ONLY_PREFIXES = (
    "/api/contacts-manage",
    "/api/unit-prices",
)

USER_READ_ONLY_PREFIXES = (
    "/api/contracts",
    "/api/materials-board",
    "/api/install-cases",
)

VALID_ROLES = frozenset({"admin", "user"})


def normalize_role(role: str | None) -> str:
    normalized = (role or "user").strip().lower()
    return normalized if normalized in VALID_ROLES else "user"


def is_rbac_allowed(path: str, method: str, role: str | None) -> bool:
    normalized_role = normalize_role(role)
    if normalized_role == "admin":
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
