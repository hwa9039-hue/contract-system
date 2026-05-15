export const ADMIN_SESSION_KEY = 'contract_manager_admin_session_v1'
export const CONTRACT_SHARED_AUTH_KEY = 'CONTRACT_SHARED_AUTH'
export const CONTRACT_SHARED_EXPIRES_AT_KEY = 'CONTRACT_SHARED_EXPIRES_AT'
export const CONTRACT_SHARED_SESSION_DURATION_MS = 20 * 60 * 1000
export const CONTRACT_SHARED_WARNING_MS = 5 * 60 * 1000

export const SHARED_APP_PASSWORD = import.meta.env.VITE_APP_SHARED_PASSWORD || 'smartdi2026!'
export const ADMIN_PASSWORD = import.meta.env.VITE_APP_ADMIN_PASSWORD || 'admin2026!'

export function readSharedAuthSession() {
  try {
    const isAuthenticated = sessionStorage.getItem(CONTRACT_SHARED_AUTH_KEY) === 'true'
    const expiresAt = Number(sessionStorage.getItem(CONTRACT_SHARED_EXPIRES_AT_KEY) || 0)

    if (isAuthenticated && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return {
        isAuthenticated: true,
        expiresAt,
      }
    }
  } catch {
    /* ignore */
  }

  try {
    sessionStorage.removeItem(CONTRACT_SHARED_AUTH_KEY)
    sessionStorage.removeItem(CONTRACT_SHARED_EXPIRES_AT_KEY)
  } catch {
    /* ignore */
  }

  return {
    isAuthenticated: false,
    expiresAt: 0,
  }
}

export function writeSharedAuthSession(expiresAt) {
  try {
    sessionStorage.setItem(CONTRACT_SHARED_AUTH_KEY, 'true')
    sessionStorage.setItem(CONTRACT_SHARED_EXPIRES_AT_KEY, String(expiresAt))
  } catch {
    /* ignore */
  }
}

export function clearSharedAuthSession() {
  try {
    sessionStorage.removeItem(CONTRACT_SHARED_AUTH_KEY)
    sessionStorage.removeItem(CONTRACT_SHARED_EXPIRES_AT_KEY)
  } catch {
    /* ignore */
  }
}

export function readStoredAdminFlag() {
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeAdminFlag(isAdmin) {
  try {
    if (isAdmin) {
      localStorage.setItem(ADMIN_SESSION_KEY, 'true')
    } else {
      localStorage.removeItem(ADMIN_SESSION_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function clearAdminFlag() {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
