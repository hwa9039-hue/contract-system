/** 메뉴·API 권한 — admin / manager / user 3단계 역할 기준
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ 이 파일은 "프론트엔드 권한 체계의 단일 진실 공급원(single source of truth)".│
 * │ 역할(Role)을 추가/축소하거나, 특정 메뉴에서 특정 역할을 빼고 싶으면        │
 * │ 여기(ROLES / ADMIN_LEVEL_ROLES / *_MENUS / MENU_ALLOWED_ROLES)만 고치면  │
 * │ 됩니다.                                                              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * 확정 권한 요약
 * - 사용자(user): 영업관리의 연락처만 접근(활성만). 결제보고·발주관리는 숨김.
 *               계약현황·게시판·설치사례는 Read-Only
 * - 관리자(admin): 전 메뉴 접근·편집
 * - 부서장(manager): 영업정보·연락처 접근 가능. 계약현황·게시판·설치사례는 Read-Only
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager', // 부서장(영업)
  USER: 'user',
})

/** 로그인 화면·사이드바 배지에 표시할 한글 라벨 */
export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: '관리자',
  [ROLES.MANAGER]: '부서장(영업)',
  [ROLES.USER]: '사용자',
})

/**
 * "관리자급(admin-level)"으로 취급할 역할 목록.
 * 사이드바·일부 게이트에서 admin/manager 를 같이 열 때 사용한다.
 * 조회 전용(VIEWER_ONLY) 메뉴의 편집 권한은 이 집합과 무관하게
 * canEditMenu 에서 admin 만 허용한다.
 */
export const ADMIN_LEVEL_ROLES = new Set([ROLES.ADMIN, ROLES.MANAGER])

export const VALID_ROLES = new Set([ROLES.ADMIN, ROLES.MANAGER, ROLES.USER])

/** 문자열 role 을 안전하게 정규화 (알 수 없는 값 → user) */
export function normalizeRole(role) {
  const normalized = String(role || ROLES.USER).trim().toLowerCase()
  return VALID_ROLES.has(normalized) ? normalized : ROLES.USER
}

/**
 * 해당 역할이 "관리자급 권한"을 갖는가?
 * (admin 또는 manager → true)
 *
 * App 전반의 boolean `isAdmin` 은 이 함수의 결과와 동일합니다.
 * 세밀한 분기(예: 계약현황 편집은 admin만)는 `role` 문자열을
 * canEditMenu / canAccessMenu 에 넘기세요.
 */
export function hasAdminPrivileges(role) {
  return ADMIN_LEVEL_ROLES.has(normalizeRole(role))
}

/** 접근 불가 — 메뉴 숨김 + API 전체 차단 (관리자급만 진입) */
export const ADMIN_ONLY_MENUS = new Set([])

/**
 * 조회 전용 — 관리자(admin)만 등록/수정/삭제 UI 노출.
 * 부서장·사용자는 화면 열람만 가능.
 */
export const VIEWER_ONLY_MENUS = new Set([
  'contracts',
  'materialsBoard',
  'installCases',
  // 사이드바에서 빠진 레거시 메뉴도 동일 정책 유지
  'projectManagement',
  'contactsManage',
  'unitPrice',
])

/** 일반 사용자도 조회·편집 가능 (VIEWER_ONLY / MENU_ALLOWED_ROLES 예외 없음) */
export const FULL_ACCESS_MENUS = new Set([
  'dashboard',
  'workReports',
  'meetingMinutes',
  'calendar',
  'sales',
  'discovery',
  'excluded',
  'documents',
  'naraMarket',
  'newsMonitor',
])

/**
 * 메뉴별 접근 허용 역할 화이트리스트.
 * 등록된 메뉴는 이 목록에 있는 역할만 사이드바·진입이 허용된다.
 */
export const MENU_ALLOWED_ROLES = Object.freeze({
  // 결제보고·발주관리: admin/manager, 연락처(영업관리): 전 역할(비활성은 페이지에서 user 숨김)
  paymentReport: [ROLES.ADMIN, ROLES.MANAGER],
  salesContacts: [ROLES.ADMIN, ROLES.MANAGER, ROLES.USER],
  orderManagement: [ROLES.ADMIN, ROLES.MANAGER],
})

/**
 * canAccessMenu / canEditMenu 는 하위 호환을 위해 두 번째 인자로
 *   - boolean(isAdmin: 관리자급 여부)  또는
 *   - string(role: 'admin' | 'manager' | 'user')
 * 둘 다 받습니다. 역할 구분이 필요한 분기(화이트리스트·VIEWER_ONLY 편집)는
 * 반드시 role 문자열을 넘기세요.
 */
function resolveRole(isAdminOrRole) {
  if (typeof isAdminOrRole === 'string') return normalizeRole(isAdminOrRole)
  // boolean 하위호환: true → admin, false → user (manager 구분 불가)
  return isAdminOrRole ? ROLES.ADMIN : ROLES.USER
}

function toIsPrivileged(isAdminOrRole) {
  if (typeof isAdminOrRole === 'string') return hasAdminPrivileges(isAdminOrRole)
  return Boolean(isAdminOrRole)
}

/** 특정 역할이 해당 메뉴에 접근(열람)할 수 있는지 */
export function canAccessMenu(menuKey, isAdminOrRole) {
  const role = resolveRole(isAdminOrRole)
  const whitelist = MENU_ALLOWED_ROLES[menuKey]
  if (whitelist) {
    return whitelist.includes(role)
  }

  if (ADMIN_ONLY_MENUS.has(menuKey)) return hasAdminPrivileges(role)
  return true
}

/** 특정 역할이 해당 메뉴를 편집(쓰기)할 수 있는지 */
export function canEditMenu(menuKey, isAdminOrRole) {
  const role = resolveRole(isAdminOrRole)

  // 조회 전용: 관리자만 등록/수정/삭제
  if (VIEWER_ONLY_MENUS.has(menuKey)) {
    return role === ROLES.ADMIN
  }

  if (ADMIN_ONLY_MENUS.has(menuKey)) {
    return hasAdminPrivileges(role)
  }

  // 접근 자체가 막힌 메뉴는 편집도 불가
  if (!canAccessMenu(menuKey, role)) return false

  return true
}

export function filterSidebarMenuItems(items, isAdminOrRole) {
  return items.filter((item) => canAccessMenu(item.key, isAdminOrRole))
}

/** 접근 가능한 하위 항목이 하나도 없으면 대분류 그룹 자체를 숨긴다 */
export function filterSidebarMenuGroups(groups, isAdminOrRole) {
  return groups
    .map((group) => ({
      ...group,
      items: filterSidebarMenuItems(group.items, isAdminOrRole),
    }))
    .filter((group) => group.items.length > 0)
}

export function isAdminOnlyMenuPath(pathname) {
  return false
}

export function resolveMenuAccessDeniedRedirect(menuKey, isAdminOrRole) {
  if (canAccessMenu(menuKey, isAdminOrRole)) return null
  return 'dashboard'
}
