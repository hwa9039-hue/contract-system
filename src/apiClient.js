function trimTrailingSlash(url) {
  return String(url).replace(/\/$/, '')
}

/** npm run dev 에서만 사용 — 항상 로컬 FastAPI */
export const FORCED_DEV_API_BASE_URL = 'http://localhost:8000'

/**
 * HTTPS 운영 사이트에서 HTTP API 주소를 쓰면 Mixed Content 로 차단됩니다.
 * 프로덕션 빌드에서만 적용합니다.
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
        window.location.origin
      )
      return trimTrailingSlash(window.location.origin)
    }
  } catch {
    // ignore
  }
  return candidate
}

function resolveProductionApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const runtimeProd = window.__CMS_API_BASE_URL__
    if (runtimeProd != null && String(runtimeProd).trim() !== '') {
      return sanitizeApiBaseUrlForBrowser(trimTrailingSlash(String(runtimeProd)))
    }

    if (window.__CMS_FORCE_SAME_ORIGIN_API__ === true && window.location?.origin) {
      return trimTrailingSlash(window.location.origin)
    }

    const fromEnv = import.meta.env.VITE_API_BASE_URL
    if (fromEnv != null && String(fromEnv).trim() !== '') {
      return sanitizeApiBaseUrlForBrowser(trimTrailingSlash(fromEnv))
    }

    if (window.location?.origin) {
      return trimTrailingSlash(window.location.origin)
    }
  }

  return FORCED_DEV_API_BASE_URL
}

/**
 * npm run dev → 무조건 http://localhost:8000
 * npm run build → api-config.js / 운영 설정
 */
export const API_BASE_URL = import.meta.env.DEV
  ? FORCED_DEV_API_BASE_URL
  : resolveProductionApiBaseUrl()

if (import.meta.env.DEV) {
  console.info('[API] 개발 모드 강제 — 모든 요청:', API_BASE_URL)
  if (typeof window !== 'undefined' && window.__CMS_API_BASE_URL__) {
    console.warn(
      '[API] api-config.js 운영 URL은 dev 에서 무시됩니다:',
      window.__CMS_API_BASE_URL__
    )
  }
}

export const AUTH_TOKEN_KEY = 'cms_api_token'

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
