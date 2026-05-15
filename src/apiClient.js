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

  /**
   * 운영(PROD): `public/api-config.js`의 `__CMS_API_BASE_URL__`을 최우선.
   * 정적 호스팅만 있고 동일 출처 `/api` 프록시가 없으면 FORCE_SAME_ORIGIN만 켜면 405가 나므로,
   * 명시 URL이 있으면 `__CMS_FORCE_SAME_ORIGIN_API__`보다 먼저 적용한다.
   */
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const runtimeProd = window.__CMS_API_BASE_URL__
    if (runtimeProd != null && String(runtimeProd).trim() !== '') {
      candidate = trimTrailingSlash(String(runtimeProd))
      return sanitizeApiBaseUrlForBrowser(candidate)
    }
  }

  /** 운영에서 contract 도메인 + Nginx가 `/api` → 백엔드로 넘길 때만. `public/api-config.js` */
  if (
    typeof window !== 'undefined' &&
    window.__CMS_FORCE_SAME_ORIGIN_API__ === true &&
    import.meta.env.PROD &&
    window.location?.origin
  ) {
    return trimTrailingSlash(window.location.origin)
  }

  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    candidate = trimTrailingSlash(fromEnv)
    return sanitizeApiBaseUrlForBrowser(candidate)
  }

  /**
   * 로컬 dev(Vite): api-config.js 의 운영 API(NAS)보다 로컬 백엔드(8000)를 기본 사용.
   * 운영 API로 붙이려면 .env 에 VITE_API_BASE_URL=https://api.... 를 명시하세요.
   */
  if (!import.meta.env.PROD && typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000'
    }
    const runtimeDev = window.__CMS_API_BASE_URL__
    if (runtimeDev != null && String(runtimeDev).trim() !== '') {
      return trimTrailingSlash(String(runtimeDev))
    }
  }

  if (import.meta.env.PROD && typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin)
  }

  return 'http://localhost:8000'
})()

export const AUTH_TOKEN_KEY = 'cms_api_token'

/** 브라우저·프록시가 API 응답을 오래 캐시하지 않도록 요청마다 부여 */
export const API_NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

/**
 * @param {RequestInit} init
 * @returns {RequestInit}
 */
export function apiFetchInit(init = {}) {
  const { headers: rawHeaders, ...rest } = init
  const merged =
    rawHeaders && typeof rawHeaders === 'object' && !(rawHeaders instanceof Headers)
      ? { ...API_NO_CACHE_HEADERS, ...rawHeaders }
      : { ...API_NO_CACHE_HEADERS }

  return {
    ...rest,
    cache: 'no-store',
    headers: merged,
  }
}

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
