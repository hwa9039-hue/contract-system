/**
 * 앱 버전 관리 + 버전이 바뀌면 전원 강제 로그아웃.
 *
 * 대규모 업데이트를 배포할 때는 아래 두 곳의 숫자를 같은 값으로 올린다.
 *   1) 이 파일의 APP_VERSION
 *   2) public/version.json 의 "version"
 *
 * - 접속 시점 검사(enforceAppVersion): 브라우저에 저장된 appVersion 이 없거나 다르면 저장소를 비우고 /login 으로 보낸다.
 * - 실시간 검사(checkRemoteVersion, useAppVersionPolling): 화면을 켜 둔 채로도 version.json 이 바뀌면 같은 처리를 한다.
 */
export const APP_VERSION = 'v1.1.0'

const APP_VERSION_STORAGE_KEY = 'appVersion'
const VERSION_FILE_PATH = '/version.json'
const LOGIN_PATH = '/login'
export const FORCED_LOGOUT_MESSAGE = '새로운 업데이트가 적용되어 자동으로 재로그인합니다.'

/** 'v1.1.0' 과 '1.1.0' 을 같은 버전으로 본다. */
export function normalizeVersion(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/i, '')
}

export function isSameVersion(a, b) {
  const left = normalizeVersion(a)
  return left !== '' && left === normalizeVersion(b)
}

/**
 * @returns {boolean} true 이면 로그인 페이지로 이동시키는 중이므로 앱을 마운트하지 말 것
 */
export function enforceAppVersion() {
  try {
    const storedVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY)
    if (isSameVersion(storedVersion, APP_VERSION)) return false

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

let forcedLogoutInProgress = false

/** 인증 정보를 모두 지우고 안내 후 /login 으로 보낸다. 한 번만 실행된다. */
function forceLogoutForNewVersion(remoteVersion) {
  if (forcedLogoutInProgress) return
  forcedLogoutInProgress = true
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
    // 새 번들이 뜰 때 enforceAppVersion 이 한 번 더 로그아웃시키지 않도록 새 버전을 미리 기록해 둔다.
    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, `v${normalizeVersion(remoteVersion)}`)
  } catch {
    // 저장소 접근이 막혀 있어도 이동은 진행한다.
  }
  window.alert(FORCED_LOGOUT_MESSAGE)
  window.location.href = LOGIN_PATH
}

/**
 * 서버의 /version.json 을 읽어 현재 코드의 APP_VERSION 과 비교한다.
 * 달라지면 즉시 강제 로그아웃. 네트워크 오류·형식 오류는 조용히 무시한다(다음 주기에 다시 확인).
 * 주소 뒤 타임스탬프 + no-store 로 브라우저/CDN 캐시를 피한다.
 */
export async function checkRemoteVersion() {
  if (forcedLogoutInProgress) return
  try {
    const response = await fetch(`${VERSION_FILE_PATH}?t=${new Date().getTime()}`, {
      cache: 'no-store',
      credentials: 'omit',
    })
    if (!response.ok) return
    const data = await response.json()
    const remoteVersion = data?.version
    if (normalizeVersion(remoteVersion) === '') return
    if (!isSameVersion(remoteVersion, APP_VERSION)) {
      forceLogoutForNewVersion(remoteVersion)
    }
  } catch {
    // version.json 이 없거나(HTML 반환) 네트워크가 끊긴 경우: 무시
  }
}
