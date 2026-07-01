/** 메뉴·API 권한 — admin / manager / user 역할 기준
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ 이 파일은 "프론트엔드 권한 체계의 단일 진실 공급원(single source of truth)".│
 * │ 역할(Role)을 추가/축소하거나, 특정 메뉴에서 특정 역할을 빼고 싶으면        │
 * │ 여기(ROLES / ADMIN_LEVEL_ROLES / *_MENUS)만 고치면 됩니다.               │
 * └──────────────────────────────────────────────────────────────────────┘
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager', // 부서장 — 중간 관리자 등급
  USER: 'user',
})

/** 로그인 화면·사이드바 배지에 표시할 한글 라벨 */
export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: '관리자',
  [ROLES.MANAGER]: '부서장',
  [ROLES.USER]: '일반 사용자',
})

/**
 * ★★★ 부서장 권한 분기의 핵심 스위치 ★★★
 *
 * "관리자급(admin-level)"으로 취급할 역할 목록.
 * 현재는 부서장(MANAGER)을 관리자(ADMIN)와 100% 동일하게 열어두기 위해
 * 이 집합에 MANAGER 를 포함시켜 둡니다.
 *
 * ▶ 나중에 부서장을 "일반 관리자보다 낮은 등급"으로 바꾸려면:
 *    1) 이 집합에서 ROLES.MANAGER 를 제거하면 → 부서장은 곧바로 일반 사용자와
 *       동일한 권한(뷰어 전용 메뉴는 조회만)으로 강등됩니다.
 *    2) "특정 메뉴만" 부서장을 빼거나 넣고 싶을 때는 이 집합을 건드리지 말고
 *       아래 MENU_ALLOWED_ROLES(메뉴별 화이트리스트)를 사용하세요.
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
 * App 전반에서 쓰이는 boolean `isAdmin` 은 이 함수의 결과와 동일합니다.
 * 즉 "isAdmin === true" 는 정확히 말하면 "관리자급 권한 보유"라는 의미이며,
 * 관리자와 부서장을 동일하게 통과시키는 유일한 지점입니다.
 */
export function hasAdminPrivileges(role) {
  return ADMIN_LEVEL_ROLES.has(normalizeRole(role))
}

/** 접근 불가 — 메뉴 숨김 + API 전체 차단 */
export const ADMIN_ONLY_MENUS = new Set([])

/** 조회 전용 — 관리자급이 아니면 GET만 허용, 편집 UI 숨김 */
export const VIEWER_ONLY_MENUS = new Set([
  'contracts',
  'projectManagement',
  'materialsBoard',
  'installCases',
  'contactsManage',
  'unitPrice',
])

/** 일반 사용자도 조회·편집 가능 */
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
 * (미래 확장용) 메뉴별 접근 허용 역할 화이트리스트.
 *
 * 기본 접근 규칙(canAccessMenu/canEditMenu)만으로 부족할 때,
 * "이 메뉴는 이 역할들만" 처럼 메뉴 단위로 세밀하게 제어하고 싶을 때 사용합니다.
 * 여기에 등록되지 않은 메뉴는 기존 규칙을 그대로 따릅니다.
 *
 * 예) 나중에 "단가관리는 관리자만, 부서장은 제외"로 바꾸려면:
 *   unitPrice: [ROLES.ADMIN],
 * 예) "사업검색이력은 관리자·부서장만":
 *   discovery: [ROLES.ADMIN, ROLES.MANAGER],
 */
export const MENU_ALLOWED_ROLES = Object.freeze({
  // 현재는 비어 있음 — 메뉴별 예외가 필요할 때 채우세요.
})

/**
 * canAccessMenu / canEditMenu 는 하위 호환을 위해 두 번째 인자로
 *   - boolean(isAdmin: 관리자급 여부)  또는
 *   - string(role: 'admin' | 'manager' | 'user')
 * 둘 다 받습니다. 내부적으로는 항상 "관리자급 여부(boolean)"로 환산해 사용합니다.
 */
function toIsPrivileged(isAdminOrRole) {
  if (typeof isAdminOrRole === 'string') return hasAdminPrivileges(isAdminOrRole)
  return Boolean(isAdminOrRole)
}

/** 특정 역할이 해당 메뉴에 접근(열람)할 수 있는지 */
export function canAccessMenu(menuKey, isAdminOrRole) {
  // 메뉴별 화이트리스트가 있으면 그것을 최우선 적용
  const whitelist = MENU_ALLOWED_ROLES[menuKey]
  if (whitelist && typeof isAdminOrRole === 'string') {
    return whitelist.includes(normalizeRole(isAdminOrRole))
  }

  const isPrivileged = toIsPrivileged(isAdminOrRole)
  if (ADMIN_ONLY_MENUS.has(menuKey)) return isPrivileged
  return true
}

/** 특정 역할이 해당 메뉴를 편집(쓰기)할 수 있는지 */
export function canEditMenu(menuKey, isAdminOrRole) {
  const isPrivileged = toIsPrivileged(isAdminOrRole)
  if (isPrivileged) return true // 관리자급(admin·manager)은 전 메뉴 편집 가능
  if (ADMIN_ONLY_MENUS.has(menuKey)) return false
  if (VIEWER_ONLY_MENUS.has(menuKey)) return false
  return true
}

export function filterSidebarMenuItems(items, isAdminOrRole) {
  return items.filter((item) => canAccessMenu(item.key, isAdminOrRole))
}

export function isAdminOnlyMenuPath(pathname) {
  return false
}

export function resolveMenuAccessDeniedRedirect(menuKey, isAdminOrRole) {
  if (canAccessMenu(menuKey, isAdminOrRole)) return null
  return 'dashboard'
}
