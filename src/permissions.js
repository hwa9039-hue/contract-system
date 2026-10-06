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
 * - 모든 로그인 계정은 동일 권한(admin). 전 메뉴 접근·편집.
 * - manager / user 역할 코드는 옛 세션 호환용으로만 남긴다.
 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager', // 부서장(영업)
  USER: 'user',
})

/** 로그인 화면·사이드바 배지에 표시할 한글 라벨 */
export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: '관리자',
  [ROLES.MANAGER]: '전기웅',
  [ROLES.USER]: '이용자',
})

/**
 * "관리자급(admin-level)"으로 취급할 역할 목록.
 * 사이드바·일부 게이트에서 admin/manager 를 같이 열 때 사용한다.
 * 조회 전용(VIEWER_ONLY) 메뉴의 편집 권한은 이 집합과 무관하게
 * canEditMenu 에서 admin 만 허용한다.
 */
export const ADMIN_LEVEL_ROLES = new Set([ROLES.ADMIN, ROLES.MANAGER])

export const VALID_ROLES = new Set([ROLES.ADMIN, ROLES.MANAGER, ROLES.USER])

export const BIT_HISTORY_MENU_KEY = 'bitHistory'

/** 로그인 응답으로만 켜지는 권한. 계정 목록은 브라우저 번들에 두지 않는다. */
const BIT_HISTORY_ACCESS_KEY = 'contract_manager_bit_history_access_v1'
const INACTIVE_CONTACTS_ACCESS_KEY = 'contract_manager_inactive_contacts_access_v1'

function readAccessFlag(key) {
  try {
    return sessionStorage.getItem(key) === '1' || localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeAccessFlag(key, enabled, persistence = 'session') {
  const primary = persistence === 'persistent' ? localStorage : sessionStorage
  const secondary = persistence === 'persistent' ? sessionStorage : localStorage
  secondary.removeItem(key)
  primary.setItem(key, enabled ? '1' : '0')
  if (persistence === 'persistent') {
    sessionStorage.setItem(key, enabled ? '1' : '0')
  }
}

export function writeClientAccessFlags(flags, persistence = 'session') {
  try {
    writeAccessFlag(BIT_HISTORY_ACCESS_KEY, Boolean(flags?.canAccessBitHistory), persistence)
    writeAccessFlag(
      INACTIVE_CONTACTS_ACCESS_KEY,
      Boolean(flags?.canViewAllInactiveContacts),
      persistence,
    )
  } catch {
    /* ignore */
  }
}

/** 저장된 메뉴 권한 플래그의 현재 값 (바뀌었는지 비교해 화면을 다시 그릴 때 쓴다) */
export function readClientAccessFlagsSnapshot() {
  return `${readAccessFlag(BIT_HISTORY_ACCESS_KEY) ? 1 : 0}${readAccessFlag(INACTIVE_CONTACTS_ACCESS_KEY) ? 1 : 0}`
}

export function clearClientAccessFlags() {
  try {
    for (const key of [BIT_HISTORY_ACCESS_KEY, INACTIVE_CONTACTS_ACCESS_KEY]) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

export function normalizeAccountId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/!+$/g, '')
}

/**
 * BIT 이력관리를 볼 수 있는 사람(표시 이름). 이름은 비밀이 아니라 화면에 이미 보이는 값이다.
 * 서버가 내려준 권한 플래그(로그인 응답)와 이 이름 목록을 둘 다 만족해야 열린다.
 */
export const BIT_HISTORY_ALLOWED_NAMES = Object.freeze([
  '전기웅',
  '유영무',
  '김성수',
  '정주희',
  '정화영',
])

/** authSession.js 의 ROLE_LABEL_SESSION_KEY 와 같은 값 (순환 import 를 피하려고 문자열을 둔다) */
const ROLE_LABEL_STORAGE_KEY = 'contract_manager_role_label_session_v1'

function readStoredDisplayName() {
  try {
    return String(
      sessionStorage.getItem(ROLE_LABEL_STORAGE_KEY) ||
        localStorage.getItem(ROLE_LABEL_STORAGE_KEY) ||
        '',
    ).trim()
  } catch {
    return ''
  }
}

export function canAccessBitHistory() {
  if (!readAccessFlag(BIT_HISTORY_ACCESS_KEY)) return false
  return BIT_HISTORY_ALLOWED_NAMES.includes(readStoredDisplayName())
}

/**
 * 비활성 연락처까지 전체 열람(전기웅·정주희·정화영). 서버가 로그인 응답으로 내려준 플래그다.
 * 이 플래그가 없어도 활성 연락처는 모두 보이고, 비활성은 본인이 등록한 것만 보인다.
 */
export function canViewAllContacts() {
  return readAccessFlag(INACTIVE_CONTACTS_ACCESS_KEY)
}

/** @deprecated canViewAllContacts 로 바꿔 쓴다 (하위 호환) */
export function canViewAllInactiveContacts() {
  return canViewAllContacts()
}

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
 * 조회 전용 — 지금은 비움. 볼 수 있는 메뉴는 편집도 같다.
 */
export const VIEWER_ONLY_MENUS = new Set([])

/** 일반 사용자도 조회·편집 가능 (VIEWER_ONLY / MENU_ALLOWED_ROLES 예외 없음) */
export const FULL_ACCESS_MENUS = new Set([
  'dashboard',
  'workReports',
  'meetingMinutes',
  'calendar',
  'salesIntegrated',
  'sales',
  'quoteDesignDocs',
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
export function canAccessMenu(menuKey, isAdminOrRole, accountId) {
  if (menuKey === BIT_HISTORY_MENU_KEY) {
    return canAccessBitHistory(accountId)
  }

  const role = resolveRole(isAdminOrRole)
  const whitelist = MENU_ALLOWED_ROLES[menuKey]
  if (whitelist) {
    return whitelist.includes(role)
  }

  if (ADMIN_ONLY_MENUS.has(menuKey)) return hasAdminPrivileges(role)
  return true
}

/** 특정 역할이 해당 메뉴를 편집(쓰기)할 수 있는지 */
export function canEditMenu(menuKey, isAdminOrRole, accountId) {
  const role = resolveRole(isAdminOrRole)

  // 조회 전용: 관리자만 등록/수정/삭제
  if (VIEWER_ONLY_MENUS.has(menuKey)) {
    return role === ROLES.ADMIN
  }

  if (ADMIN_ONLY_MENUS.has(menuKey)) {
    return hasAdminPrivileges(role)
  }

  // 접근 자체가 막힌 메뉴는 편집도 불가
  if (!canAccessMenu(menuKey, role, accountId)) return false

  return true
}

export function filterSidebarMenuItems(items, isAdminOrRole, accountId) {
  return items.filter((item) => canAccessMenu(item.key, isAdminOrRole, accountId))
}

/** 접근 가능한 하위 항목이 하나도 없으면 대분류 그룹 자체를 숨긴다 */
export function filterSidebarMenuGroups(groups, isAdminOrRole, accountId) {
  return groups
    .map((group) => ({
      ...group,
      items: filterSidebarMenuItems(group.items, isAdminOrRole, accountId),
    }))
    .filter((group) => group.items.length > 0)
}

export function isAdminOnlyMenuPath(pathname) {
  return false
}

export function resolveMenuAccessDeniedRedirect(menuKey, isAdminOrRole, accountId) {
  if (canAccessMenu(menuKey, isAdminOrRole, accountId)) return null
  return 'dashboard'
}
