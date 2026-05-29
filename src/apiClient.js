/** 로컬 검증 강제 모드: 프론트의 모든 API 요청을 localhost:8000으로 고정 */
export const API_BASE_URL = 'http://localhost:8000'

if (typeof window !== 'undefined') {
  console.info('[API] 로컬 강제 모드 — 모든 요청:', API_BASE_URL)
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
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export function getAuthToken() {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

/** @param {{ persistent?: boolean }} [options] */
export function setAuthToken(token, options = {}) {
  const persistent = options?.persistent === true
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    if (!token) return
    if (persistent) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    }
  } catch {
    // no-op
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    // no-op
  }
}
