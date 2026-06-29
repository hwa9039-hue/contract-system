import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  API_BASE_URL,
  apiFetch,
  apiFetchInit,
  clearAuthToken,
  getAuthHeaders,
  registerAuthSessionExpiredHandler,
  refreshAccessTokenFromStorage,
  SESSION_EXPIRED_USER_MESSAGE,
  setAuthToken,
} from './apiClient.js'
import { logCmsApiLogin } from './cmsApiProbe.js'
import {
  ADMIN_PASSWORD,
  CONTRACT_PERSISTENT_SESSION_DURATION_MS,
  CONTRACT_SHARED_SESSION_DURATION_MS,
  CONTRACT_TOKEN_REFRESH_INTERVAL_MS,
  hydrateAuthSessionFromStorage,
  restoreAuthSessionFromStorages,
  readStoredAdminFlag,
  SHARED_APP_PASSWORD,
  writeAdminFlag,
  writeSharedAuthSession,
  clearAdminFlag,
  clearSharedAuthSession,
  syncAuthTokenToActiveStorage,
} from './authSession.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const hydrated = hydrateAuthSessionFromStorage()
  const [authPersistence, setAuthPersistence] = useState(hydrated.persistence)
  const [isAuthenticated, setIsAuthenticated] = useState(hydrated.isAuthenticated)
  const [isAdmin, setIsAdmin] = useState(hydrated.isAdmin)
  const [sharedSessionExpiresAt, setSharedSessionExpiresAt] = useState(hydrated.expiresAt)
  const [authHydrated, setAuthHydrated] = useState(true)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState('')

  const applyRestoredSession = useCallback((session) => {
    setAuthPersistence(session.persistence)
    setIsAuthenticated(session.isAuthenticated)
    setIsAdmin(session.isAdmin)
    setSharedSessionExpiresAt(session.expiresAt)
    if (session.isAuthenticated) {
      syncAuthTokenToActiveStorage(session.persistence)
    }
  }, [])

  useEffect(() => {
    const session = restoreAuthSessionFromStorages()
    applyRestoredSession(session)
    setAuthHydrated(true)
  }, [applyRestoredSession])

  useEffect(() => {
    registerAuthSessionExpiredHandler((message) => {
      setAuthPersistence('none')
      setIsAuthenticated(false)
      setIsAdmin(false)
      setSharedSessionExpiresAt(0)
      setSessionExpiredNotice(message || SESSION_EXPIRED_USER_MESSAGE)
    })
    return () => registerAuthSessionExpiredHandler(null)
  }, [])

  /** @returns {'ok' | 'auth_fail' | 'network_fail'} */
  const refreshAccessToken = useCallback(async (persistence) => {
    const result = await refreshAccessTokenFromStorage()
    if (result === 'ok' && persistence) {
      syncAuthTokenToActiveStorage(persistence === 'persistent' ? 'persistent' : 'session')
    }
    return result
  }, [])

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return
    let cancelled = false

    const clearSession = () => {
      setAuthPersistence('none')
      setIsAuthenticated(false)
      setIsAdmin(false)
      setSharedSessionExpiresAt(0)
      clearSharedAuthSession()
      clearAdminFlag()
      clearAuthToken()
    }

    ;(async () => {
      try {
        const stored = restoreAuthSessionFromStorages()
        if (!stored.isAuthenticated || stored.expiresAt <= Date.now()) {
          if (!cancelled) clearSession()
          return
        }

        const authHeaders = getAuthHeaders()
        const hadBearerToken = Boolean(authHeaders.Authorization)

        if (hadBearerToken) {
          const refreshResult = await refreshAccessToken(stored.persistence)
          if (cancelled) return
          if (refreshResult === 'network_fail') return
        }

        const res = await apiFetch(
          `${API_BASE_URL}/api/auth/me`,
          apiFetchInit({ headers: { ...getAuthHeaders() } })
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (data.auth_disabled) return

        if (data.valid && (data.role === 'admin' || data.role === 'user')) {
          const roleIsAdmin = data.role === 'admin'
          setIsAdmin(roleIsAdmin)
          writeAdminFlag(roleIsAdmin, stored.persistence)
        }

        if (data.valid) return

        if (!hadBearerToken) return

        const refreshResult = await refreshAccessToken(stored.persistence)
        if (cancelled) return
        if (refreshResult === 'ok') return
        if (refreshResult === 'network_fail') return

        clearSession()
      } catch {
        /* 네트워크 오류 시 기존 세션 유지 */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authHydrated, isAuthenticated, refreshAccessToken])

  const bumpSessionExpiry = useCallback((persistence) => {
    const effectivePersistence = persistence === 'persistent' ? 'persistent' : 'session'
    const duration =
      effectivePersistence === 'persistent'
        ? CONTRACT_PERSISTENT_SESSION_DURATION_MS
        : CONTRACT_SHARED_SESSION_DURATION_MS
    const expiresAt = Date.now() + duration
    if (effectivePersistence === 'persistent' || effectivePersistence === 'session') {
      writeSharedAuthSession(expiresAt, effectivePersistence)
      syncAuthTokenToActiveStorage(effectivePersistence)
    }
    setSharedSessionExpiresAt(expiresAt)
    return expiresAt
  }, [])

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return

    const persistence = authPersistence === 'persistent' ? 'persistent' : 'session'

    const maintainSession = async () => {
      if (document.visibilityState !== 'visible') return
      const result = await refreshAccessToken(persistence)
      if (result === 'ok') {
        bumpSessionExpiry(authPersistence)
      }
    }

    const onTabActive = () => {
      if (document.visibilityState === 'visible') {
        void maintainSession()
      }
    }

    const intervalId = setInterval(() => void maintainSession(), CONTRACT_TOKEN_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onTabActive)
    window.addEventListener('focus', onTabActive)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onTabActive)
      window.removeEventListener('focus', onTabActive)
    }
  }, [
    authHydrated,
    isAuthenticated,
    authPersistence,
    refreshAccessToken,
    bumpSessionExpiry,
  ])

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice('')
  }, [])

  const login = useCallback(async (role, password, rememberMe = false) => {
    setSessionExpiredNotice('')
    const trimmed = String(password).trim()
    const wantsAdmin = role === 'admin'

    if (!trimmed) {
      return { ok: false, error: '비밀번호를 입력해 주세요.' }
    }

    if (wantsAdmin) {
      if (trimmed !== ADMIN_PASSWORD) {
        return { ok: false, error: '관리자 비밀번호가 올바르지 않습니다.' }
      }
    } else if (trimmed !== SHARED_APP_PASSWORD) {
      return { ok: false, error: '공용 비밀번호가 올바르지 않습니다.' }
    }

    logCmsApiLogin('attempt', {
      POST: `${API_BASE_URL}/api/auth/login`,
      role: wantsAdmin ? 'admin' : 'user',
      note: 'password is never logged',
    })

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/login`,
        apiFetchInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: trimmed,
            role: wantsAdmin ? 'admin' : 'user',
          }),
        })
      )
      const data = await response.json().catch(() => ({}))

      logCmsApiLogin('http response', {
        status: response.status,
        ok: response.ok,
        auth_disabled: Boolean(data.auth_disabled),
        has_access_token: Boolean(data.access_token),
      })

      if (data.auth_disabled) {
        if (trimmed !== SHARED_APP_PASSWORD && !(wantsAdmin && trimmed === ADMIN_PASSWORD)) {
          logCmsApiLogin('rejected', { reason: 'client password mismatch (auth_disabled mode)' })
          return { ok: false, error: '비밀번호가 올바르지 않습니다.' }
        }
        clearAuthToken()
      } else if (!response.ok) {
        const detail = data.detail
        const message =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg || item).join(', ')
              : '로그인에 실패했습니다.'
        logCmsApiLogin('rejected', { status: response.status, message })
        return { ok: false, error: message }
      } else if (data.access_token) {
        setAuthToken(data.access_token, { persistent: rememberMe })
      }

      const persistence = rememberMe ? 'persistent' : 'session'
      const sessionDuration = rememberMe
        ? CONTRACT_PERSISTENT_SESSION_DURATION_MS
        : CONTRACT_SHARED_SESSION_DURATION_MS
      const expiresAt = Date.now() + sessionDuration
      writeSharedAuthSession(expiresAt, persistence)
      writeAdminFlag(wantsAdmin, persistence)
      syncAuthTokenToActiveStorage(persistence)

      setAuthPersistence(persistence)
      setIsAuthenticated(true)
      setIsAdmin(wantsAdmin)
      setSharedSessionExpiresAt(expiresAt)

      logCmsApiLogin('success', {
        mode: data.auth_disabled ? 'auth_disabled' : 'jwt',
        api: API_BASE_URL,
        role: wantsAdmin ? 'admin' : 'user',
        persistence,
      })

      return { ok: true, role: wantsAdmin ? 'admin' : 'user', password: trimmed }
    } catch (err) {
      logCmsApiLogin('error', { message: err?.message || String(err) })
      return { ok: false, error: '서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.' }
    }
  }, [])

  const logout = useCallback(() => {
    clearSharedAuthSession()
    clearAdminFlag()
    clearAuthToken()
    setAuthPersistence('none')
    setIsAuthenticated(false)
    setIsAdmin(false)
    setSharedSessionExpiresAt(0)
  }, [])

  const extendLogin = useCallback(async () => {
    const persistence = authPersistence === 'persistent' ? 'persistent' : 'session'
    await refreshAccessToken(persistence)
    return bumpSessionExpiry(authPersistence)
  }, [authPersistence, refreshAccessToken, bumpSessionExpiry])

  const value = useMemo(
    () => ({
      isAuthenticated,
      isAdmin,
      sharedSessionExpiresAt,
      authHydrated,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      login,
      logout,
      extendLogin,
    }),
    [
      isAuthenticated,
      isAdmin,
      sharedSessionExpiresAt,
      authHydrated,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      login,
      logout,
      extendLogin,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
