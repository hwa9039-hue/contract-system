import {
  API_BASE_URL,
  apiFetchInit,
  clearAuthToken,
  getAuthHeaders,
  setAuthToken,
} from './apiClient.js'
import {
  clearAdminFlag,
  clearSharedAuthSession,
  restoreAuthSessionFromStorages,
  syncAuthTokenToActiveStorage,
} from './authSession.js'

export const SESSION_EXPIRED_USER_MESSAGE = '안전을 위해 로그인이 만료되었습니다.'

export class AuthSessionExpiredError extends Error {
  constructor(message = SESSION_EXPIRED_USER_MESSAGE) {
    super(message)
    this.name = 'AuthSessionExpiredError'
  }
}

export function isAuthSessionExpiredError(error) {
  return error instanceof AuthSessionExpiredError
}

let refreshInFlight = null
let onSessionExpiredHandler = null

export function registerAuthSessionExpiredHandler(handler) {
  onSessionExpiredHandler = typeof handler === 'function' ? handler : null
}

function isAuthHttpStatus(status) {
  return status === 401 || status === 403
}

export function isTokenExpiredMessage(text) {
  const normalized = String(text || '').toLowerCase()
  return (
    normalized.includes('invalid or expired token') ||
    normalized.includes('expired token') ||
    normalized.includes('token expired') ||
    normalized.includes('not authenticated') ||
    normalized.includes('could not validate credentials')
  )
}

function isAuthExemptUrl(url) {
  const path = String(url || '')
    .replace(API_BASE_URL, '')
    .split('?')[0]
  return path === '/api/auth/login' || path === '/api/auth/refresh'
}

async function readResponseSnippet(response) {
  try {
    return await response.clone().text()
  } catch {
    return ''
  }
}

export async function responseIndicatesAuthExpired(response) {
  if (!response || !isAuthHttpStatus(response.status)) return false
  const snippet = await readResponseSnippet(response)
  return response.status === 401 || isTokenExpiredMessage(snippet)
}

/** @returns {'ok' | 'auth_fail' | 'network_fail'} */
export async function refreshAccessTokenFromStorage() {
  const stored = restoreAuthSessionFromStorages()
  if (!stored.isAuthenticated) return 'auth_fail'

  const persistence = stored.persistence === 'persistent' ? 'persistent' : 'session'

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/auth/refresh`,
      apiFetchInit({
        method: 'POST',
        headers: { ...getAuthHeaders() },
      })
    )
    if (!res.ok) {
      return res.status === 401 || res.status === 403 ? 'auth_fail' : 'network_fail'
    }
    const data = await res.json().catch(() => ({}))
    if (data.auth_disabled) return 'ok'
    if (data.access_token) {
      setAuthToken(data.access_token, { persistent: persistence === 'persistent' })
      syncAuthTokenToActiveStorage(persistence)
      return 'ok'
    }
    return 'auth_fail'
  } catch {
    return 'network_fail'
  }
}

function runRefreshOnce() {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessTokenFromStorage().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

function forceSessionExpiredLogout() {
  clearSharedAuthSession()
  clearAdminFlag()
  clearAuthToken()
  onSessionExpiredHandler?.(SESSION_EXPIRED_USER_MESSAGE)
}

/**
 * fetch 래퍼 — 401/토큰 만료 시 refresh 후 1회 재시도, 완전 만료 시 로그아웃
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} attempt
 */
export async function apiFetch(url, init = {}, attempt = 0) {
  const response = await fetch(url, apiFetchInit(init))

  if (attempt > 0 || isAuthExemptUrl(url)) {
    return response
  }

  if (!(await responseIndicatesAuthExpired(response))) {
    return response
  }

  const refreshResult = await runRefreshOnce()
  if (refreshResult === 'ok') {
    return apiFetch(url, init, attempt + 1)
  }

  if (refreshResult === 'auth_fail') {
    forceSessionExpiredLogout()
    throw new AuthSessionExpiredError()
  }

  return response
}
