/** 외부에 복사해 주는 대표 주소. 로그인 없이 설치사례만 보인다. */
export const PUBLIC_INSTALL_CASES_SHARE_PATH = '/share/installations'

/**
 * 로그인 없이 열리는 외부 공유 주소. 목록에 없는 경로는 모두 기존처럼 로그인이 필요하다.
 * `/share` 는 예전 share.html 때문에 브라우저가 기억한 308 리다이렉트 목적지다.
 * 그 주소로 열려도 로그인 화면으로 보내지 않는다.
 */
export const PUBLIC_INSTALL_CASES_PATHS = Object.freeze([
  '/public/install-cases',
  PUBLIC_INSTALL_CASES_SHARE_PATH,
  '/share',
])

export function isPublicSharePath(pathname) {
  const normalized = String(pathname || '')
    .toLowerCase()
    .replace(/\/+$/, '')
  return PUBLIC_INSTALL_CASES_PATHS.includes(normalized)
}
