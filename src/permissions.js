/** 메뉴·API 권한 — admin / user 역할 기준 */

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  USER: 'user',
})

/** 접근 불가 — 메뉴 숨김 + API 전체 차단 */
export const ADMIN_ONLY_MENUS = new Set([])

/** 조회 전용 — GET만 허용, 편집 UI 숨김 */
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

export function canAccessMenu(menuKey, isAdmin) {
  if (ADMIN_ONLY_MENUS.has(menuKey)) return Boolean(isAdmin)
  return true
}

export function canEditMenu(menuKey, isAdmin) {
  if (isAdmin) return true
  if (ADMIN_ONLY_MENUS.has(menuKey)) return false
  if (VIEWER_ONLY_MENUS.has(menuKey)) return false
  return true
}

export function filterSidebarMenuItems(items, isAdmin) {
  return items.filter((item) => canAccessMenu(item.key, isAdmin))
}

export function isAdminOnlyMenuPath(pathname) {
  return false
}

export function resolveMenuAccessDeniedRedirect(menuKey, isAdmin) {
  if (canAccessMenu(menuKey, isAdmin)) return null
  return 'dashboard'
}
