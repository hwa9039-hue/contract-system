import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { API_BASE_URL, apiFetchInit, clearAuthToken, getAuthHeaders, setAuthToken } from './apiClient.js'
import { logCmsApiLogin } from './cmsApiProbe.js'
import {
  ADMIN_PASSWORD,
  CONTRACT_SHARED_SESSION_DURATION_MS,
  readSharedAuthSession,
  readStoredAdminFlag,
  SHARED_APP_PASSWORD,
  writeAdminFlag,
  writeSharedAuthSession,
  clearAdminFlag,
  clearSharedAuthSession,
} from './authSession.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const initialSession = readSharedAuthSession()
  const [isAuthenticated, setIsAuthenticated] = useState(initialSession.isAuthenticated)
  const [isAdmin, setIsAdmin] = useState(
    () => initialSession.isAuthenticated && readStoredAdminFlag()
  )
  const [sharedSessionExpiresAt, setSharedSessionExpiresAt] = useState(initialSession.expiresAt)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, apiFetchInit({ headers: { ...getAuthHeaders() } }))
        const data = await res.json()
        if (cancelled) return
        if (data.auth_disabled) return
        if (!data.valid) {
          setIsAuthenticated(false)
          setIsAdmin(false)
          setSharedSessionExpiresAt(0)
          clearSharedAuthSession()
          clearAdminFlag()
          clearAuthToken()
        }
      } catch {
        /* 네트워크 오류 시 기존 세션 유지 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const login = useCallback(async (role, password) => {
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
        setAuthToken(data.access_token)
      }

      const expiresAt = Date.now() + CONTRACT_SHARED_SESSION_DURATION_MS
      writeSharedAuthSession(expiresAt)
      writeAdminFlag(wantsAdmin)

      setIsAuthenticated(true)
      setIsAdmin(wantsAdmin)
      setSharedSessionExpiresAt(expiresAt)

      logCmsApiLogin('success', {
        mode: data.auth_disabled ? 'auth_disabled' : 'jwt',
        api: API_BASE_URL,
        role: wantsAdmin ? 'admin' : 'user',
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
    setIsAuthenticated(false)
    setIsAdmin(false)
    setSharedSessionExpiresAt(0)
  }, [])

  const extendLogin = useCallback(() => {
    const expiresAt = Date.now() + CONTRACT_SHARED_SESSION_DURATION_MS
    writeSharedAuthSession(expiresAt)
    setSharedSessionExpiresAt(expiresAt)
    return expiresAt
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated,
      isAdmin,
      sharedSessionExpiresAt,
      login,
      logout,
      extendLogin,
    }),
    [isAuthenticated, isAdmin, sharedSessionExpiresAt, login, logout, extendLogin]
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
