export const ADMIN_SESSION_KEY = 'contract_manager_admin_session_v1'
export const CONTRACT_SHARED_AUTH_KEY = 'CONTRACT_SHARED_AUTH'
export const CONTRACT_SHARED_EXPIRES_AT_KEY = 'CONTRACT_SHARED_EXPIRES_AT'
export const CONTRACT_REMEMBER_ME_FLAG_KEY = 'CONTRACT_REMEMBER_ME'
export const CONTRACT_SHARED_SESSION_DURATION_MS = 20 * 60 * 1000
export const CONTRACT_PERSISTENT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000
export const CONTRACT_SHARED_WARNING_MS = 5 * 60 * 1000

export const SHARED_APP_PASSWORD = import.meta.env.VITE_APP_SHARED_PASSWORD || 'smartdi2026!'
export const ADMIN_PASSWORD = import.meta.env.VITE_APP_ADMIN_PASSWORD || 'admin2026!'

function readAuthFromStorage(storage) {
  try {
    const isAuthenticated = storage.getItem(CONTRACT_SHARED_AUTH_KEY) === 'true'
    const expiresAt = Number(storage.getItem(CONTRACT_SHARED_EXPIRES_AT_KEY) || 0)

    if (isAuthenticated && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return { isAuthenticated: true, expiresAt }
    }
  } catch {
    /* ignore */
  }
  return null
}

function clearAuthKeysFromStorage(storage) {
  try {
    storage.removeItem(CONTRACT_SHARED_AUTH_KEY)
    storage.removeItem(CONTRACT_SHARED_EXPIRES_AT_KEY)
  } catch {
    /* ignore */
  }
}

/** @returns {{ isAuthenticated: boolean, expiresAt: number, persistence: 'none' | 'session' | 'persistent' }} */
export function readSharedAuthSession() {
  const persistent = readAuthFromStorage(localStorage)
  if (persistent) {
    return { ...persistent, persistence: 'persistent' }
  }

  const session = readAuthFromStorage(sessionStorage)
  if (session) {
    return { ...session, persistence: 'session' }
  }

  clearSharedAuthSession()

  return {
    isAuthenticated: false,
    expiresAt: 0,
    persistence: 'none',
  }
}

/** @param {'session' | 'persistent'} persistence */
export function writeSharedAuthSession(expiresAt, persistence = 'session') {
  const isPersistent = persistence === 'persistent'
  const primary = isPersistent ? localStorage : sessionStorage
  const secondary = isPersistent ? sessionStorage : localStorage

  clearAuthKeysFromStorage(secondary)

  try {
    primary.setItem(CONTRACT_SHARED_AUTH_KEY, 'true')
    primary.setItem(CONTRACT_SHARED_EXPIRES_AT_KEY, String(expiresAt))
    if (isPersistent) {
      localStorage.setItem(CONTRACT_REMEMBER_ME_FLAG_KEY, 'true')
      sessionStorage.setItem(CONTRACT_SHARED_AUTH_KEY, 'true')
      sessionStorage.setItem(CONTRACT_SHARED_EXPIRES_AT_KEY, String(expiresAt))
    } else {
      localStorage.removeItem(CONTRACT_REMEMBER_ME_FLAG_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function clearSharedAuthSession() {
  clearAuthKeysFromStorage(sessionStorage)
  clearAuthKeysFromStorage(localStorage)
  try {
    localStorage.removeItem(CONTRACT_REMEMBER_ME_FLAG_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {'session' | 'persistent'} persistence */
export function readStoredAdminFlag(persistence = 'session') {
  try {
    if (persistence === 'persistent') {
      return (
        localStorage.getItem(ADMIN_SESSION_KEY) === 'true' ||
        sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'
      )
    }
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

/** @param {'session' | 'persistent'} persistence */
export function writeAdminFlag(isAdmin, persistence = 'session') {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    if (!isAdmin) return

    const primary = persistence === 'persistent' ? localStorage : sessionStorage
    primary.setItem(ADMIN_SESSION_KEY, 'true')
    if (persistence === 'persistent') {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
    }
  } catch {
    /* ignore */
  }
}

export function clearAdminFlag() {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
