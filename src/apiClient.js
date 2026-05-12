function trimTrailingSlash(url) {
  return String(url).replace(/\/$/, '')
}

/**
 * HTTPS로 서비스되는 사이트에서 API를 http://192.168... 처럼 넣으면 브라우저가 Mixed Content로
 * 요청 자체를 막습니다. 운영(프로덕션) 빌드에서는 같은 도메인으로 보내고(리버스 프록시 /api),
 * 로컬 개발(PROD 아님)에서는 .env의 HTTP API 주소를 그대로 씁니다.
 */
function sanitizeApiBaseUrlForBrowser(candidate) {
  if (!import.meta.env.PROD || typeof window === 'undefined') {
    return candidate
  }
  try {
    if (window.location.protocol === 'https:' && /^http:\/\//i.test(candidate)) {
      console.warn(
        '[API] HTTPS 사이트에서 API가 HTTP로 설정되어 있습니다. 같은 도메인으로 요청합니다.',
        '설정값:',
        candidate,
        '→',
        window.location.origin,
        '(DSM 로그인 포털 등에서 /api → 백엔드:8000 리버스 프록시 필요)'
      )
      return trimTrailingSlash(window.location.origin)
    }
  } catch {
    // ignore
  }
  return candidate
}

export const API_BASE_URL = (() => {
  let candidate

  if (typeof window !== 'undefined') {
    const runtime = window.__CMS_API_BASE_URL__
    if (runtime != null && String(runtime).trim() !== '') {
      candidate = trimTrailingSlash(String(runtime))
      return sanitizeApiBaseUrlForBrowser(candidate)
    }
  }

  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    candidate = trimTrailingSlash(fromEnv)
    return sanitizeApiBaseUrlForBrowser(candidate)
  }

  if (import.meta.env.PROD && typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin)
  }

  return 'http://localhost:8000'
})()

export const AUTH_TOKEN_KEY = 'cms_api_token'

export function getAuthHeaders() {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    // no-op
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    // no-op
  }
}
