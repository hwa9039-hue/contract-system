import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { API_BASE_URL, apiFetchInit, clearAuthToken, getAuthHeaders, setAuthToken } from './apiClient.js'
import { logCmsApiLogin } from './cmsApiProbe.js'
import {
  ADMIN_PASSWORD,
  CONTRACT_PERSISTENT_SESSION_DURATION_MS,
  CONTRACT_SHARED_SESSION_DURATION_MS,
  hydrateAuthSessionFromStorage,
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
  const [authHydrated, setAuthHydrated] = useState(false)

  useEffect(() => {
    const session = hydrateAuthSessionFromStorage()
    setAuthPersistence(session.persistence)
    setIsAuthenticated(session.isAuthenticated)
    setIsAdmin(session.isAdmin)
    setSharedSessionExpiresAt(session.expiresAt)
    setAuthHydrated(true)
  }, [])

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const authHeaders = getAuthHeaders()
        const hadBearerToken = Boolean(authHeaders.Authorization)
        const res = await fetch(
          `${API_BASE_URL}/api/auth/me`,
          apiFetchInit({ headers: { ...authHeaders } })
        )
        const data = await res.json()
        if (cancelled) return
        if (data.auth_disabled) return
        if (data.valid) return

        // JWT가 없는 공유 세션(비활성 모드·클라이언트 세션)은 /me 실패로 지우지 않음
        if (!hadBearerToken) return

        setAuthPersistence('none')
        setIsAuthenticated(false)
        setIsAdmin(false)
        setSharedSessionExpiresAt(0)
        clearSharedAuthSession()
        clearAdminFlag()
        clearAuthToken()
      } catch {
        /* 네트워크 오류 시 기존 세션 유지 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authHydrated, isAuthenticated])

  const login = useCallback(async (role, password, rememberMe = false) => {
    const trimmed = String(password).trim()
    const wantsAdmin = role === 'admin'

    if (!trimmed) {
      return { ok: false, error: '비밀번호를 입력해 주세요.' }
    }

    if (wantsAdmin) {
      if (trimmed !== ADMIN_PASSWORD && trimmed !== SHARED_APP_PASSWORD) {
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
          body: JSON.stringify({ password: trimmed }),
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

      return { ok: true }
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

  const extendLogin = useCallback(() => {
    const duration =
      authPersistence === 'persistent'
        ? CONTRACT_PERSISTENT_SESSION_DURATION_MS
        : CONTRACT_SHARED_SESSION_DURATION_MS
    const expiresAt = Date.now() + duration
    if (authPersistence === 'persistent' || authPersistence === 'session') {
      writeSharedAuthSession(expiresAt, authPersistence)
      syncAuthTokenToActiveStorage(authPersistence)
    }
    setSharedSessionExpiresAt(expiresAt)
    return expiresAt
  }, [authPersistence])

  const value = useMemo(
    () => ({
      isAuthenticated,
      isAdmin,
      sharedSessionExpiresAt,
      authHydrated,
      login,
      logout,
      extendLogin,
    }),
    [isAuthenticated, isAdmin, sharedSessionExpiresAt, authHydrated, login, logout, extendLogin]
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
