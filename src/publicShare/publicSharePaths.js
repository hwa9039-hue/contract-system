/** 외부에 복사해 주는 대표 주소. 뒤에 ?token= 이 붙는다. 로그인 없이 설치사례만 보인다. */
export const PUBLIC_INSTALL_CASES_SHARE_PATH = '/shared/installations'

/**
 * 로그인 없이 열리는 외부 공유 주소. 목록에 없는 경로는 모두 기존처럼 로그인이 필요하다.
 * `/share` 와 `/share/installations` 는 예전에 쓰던 주소다. 토큰이 없으면 만료 안내만 보여 준다.
 */
export const PUBLIC_INSTALL_CASES_PATHS = Object.freeze([
  '/public/install-cases',
  '/share/installations',
  PUBLIC_INSTALL_CASES_SHARE_PATH,
  '/share',
])

export function isPublicSharePath(pathname) {
  const normalized = String(pathname || '')
    .toLowerCase()
    .replace(/\/+$/, '')
  return PUBLIC_INSTALL_CASES_PATHS.includes(normalized)
}
