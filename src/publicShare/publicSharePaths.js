/** 로그인 없이 열리는 외부 공유 주소. 목록에 없는 경로는 모두 기존처럼 로그인이 필요하다. */
export const PUBLIC_INSTALL_CASES_PATHS = Object.freeze(['/public/install-cases', '/share/installations'])

export function isPublicSharePath(pathname) {
  const normalized = String(pathname || '')
    .toLowerCase()
    .replace(/\/+$/, '')
  return PUBLIC_INSTALL_CASES_PATHS.includes(normalized)
}
