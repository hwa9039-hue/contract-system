/**
 * 앱 버전 관리 + 버전이 바뀌면 전원 강제 로그아웃.
 *
 * 대규모 업데이트를 배포할 때 아래 APP_VERSION 만 올리면 된다.
 * 접속자 브라우저에 저장된 appVersion 이 없거나 다르면
 *   1) localStorage / sessionStorage 를 전부 비우고(= 로그인 상태 삭제)
 *   2) 새 버전을 기록한 뒤
 *   3) /login 으로 이동(전체 새로고침)한다.
 */
export const APP_VERSION = 'v1.1.0'

const APP_VERSION_STORAGE_KEY = 'appVersion'
const LOGIN_PATH = '/login'

/**
 * @returns {boolean} true 이면 로그인 페이지로 이동시키는 중이므로 앱을 마운트하지 말 것
 */
export function enforceAppVersion() {
  try {
    const storedVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY)
    if (storedVersion === APP_VERSION) return false

    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION)

    // 저장이 실제로 되었을 때만 이동한다(저장 불가 브라우저에서 무한 새로고침 방지).
    if (window.localStorage.getItem(APP_VERSION_STORAGE_KEY) !== APP_VERSION) return false

    window.location.href = LOGIN_PATH
    return true
  } catch {
    return false
  }
}
