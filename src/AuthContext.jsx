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
  CONTRACT_PERSISTENT_SESSION_DURATION_MS,
  CONTRACT_SHARED_SESSION_DURATION_MS,
  CONTRACT_TOKEN_REFRESH_INTERVAL_MS,
  hydrateAuthSessionFromStorage,
  restoreAuthSessionFromStorages,
  isRetiredLoginPassword,
  resolveLoginAccount,
  writeRole,
  writeRoleLabel,
  writeSharedAuthSession,
  clearRole,
  clearSharedAuthSession,
  syncAuthTokenToActiveStorage,
} from './authSession.js'
import {
  hasAdminPrivileges,
  normalizeRole,
  ROLE_LABELS,
  ROLES,
  VALID_ROLES,
} from './permissions.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const hydrated = hydrateAuthSessionFromStorage()
  const [authPersistence, setAuthPersistence] = useState(hydrated.persistence)
  const [isAuthenticated, setIsAuthenticated] = useState(hydrated.isAuthenticated)
  // 실제 로그인 역할('admin' | 'manager' | 'user') — Role 기반 상태 관리의 핵심.
  const [role, setRole] = useState(hydrated.role)
  const [roleLabel, setRoleLabel] = useState(
    hydrated.roleLabel || ROLE_LABELS[hydrated.role] || ROLE_LABELS[ROLES.USER]
  )
  const [sharedSessionExpiresAt, setSharedSessionExpiresAt] = useState(hydrated.expiresAt)
  const [authHydrated, setAuthHydrated] = useState(true)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState('')

  // isAdmin = "관리자급 권한 보유 여부". 부서장(manager)도 현재는 true.
  // 관리자/부서장 통합 취급 스위치는 permissions.js 의 ADMIN_LEVEL_ROLES 하나뿐입니다.
  const isAdmin = hasAdminPrivileges(role)

  const applyRestoredSession = useCallback((session) => {
    setAuthPersistence(session.persistence)
    setIsAuthenticated(session.isAuthenticated)
    setRole(session.role)
    setRoleLabel(session.roleLabel || ROLE_LABELS[session.role] || ROLE_LABELS[ROLES.USER])
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
      setRole(ROLES.USER)
      setRoleLabel(ROLE_LABELS[ROLES.USER])
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
      setRole(ROLES.USER)
      setRoleLabel(ROLE_LABELS[ROLES.USER])
      setSharedSessionExpiresAt(0)
      clearSharedAuthSession()
      clearRole()
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

        // 서버가 알려준 실제 역할(admin·manager·user)로 상태·스토리지를 동기화
        if (data.valid && VALID_ROLES.has(normalizeRole(data.role))) {
          const serverRole = normalizeRole(data.role)
          const serverLabel =
            String(data.role_label || '').trim() ||
            ROLE_LABELS[serverRole] ||
            ROLE_LABELS[ROLES.USER]
          setRole(serverRole)
          setRoleLabel(serverLabel)
          writeRole(serverRole, stored.persistence)
          writeRoleLabel(serverLabel, stored.persistence)
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

  const login = useCallback(async (password, rememberMe = false) => {
    setSessionExpiredNotice('')
    const trimmed = String(password).trim()

    if (!trimmed) {
      return { ok: false, error: '계정을 입력해 주세요.' }
    }

    if (isRetiredLoginPassword(trimmed) || !resolveLoginAccount(trimmed)) {
      return { ok: false, error: '계정이 올바르지 않습니다.' }
    }

    const matched = resolveLoginAccount(trimmed)

    const wantsRole = matched.role

    logCmsApiLogin('attempt', {
      POST: `${API_BASE_URL}/api/auth/login`,
      role: wantsRole,
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
            role: wantsRole,
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
        clearAuthToken()
      } else if (!response.ok) {
        const detail = data.detail
        const raw =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg || item).join(', ')
              : ''
        const message =
          response.status === 401 || /invalid password/i.test(raw)
            ? '계정이 올바르지 않습니다.'
            : raw || '로그인에 실패했습니다.'
        logCmsApiLogin('rejected', { status: response.status, message })
        return { ok: false, error: message }
      } else if (data.access_token) {
        setAuthToken(data.access_token, { persistent: rememberMe })
      }

      // 서버가 확정한 역할을 우선 사용, 없으면 요청 역할로 폴백
      const resolvedRole = data.role ? normalizeRole(data.role) : wantsRole
      const resolvedLabel =
        String(data.role_label || '').trim() ||
        matched.label ||
        ROLE_LABELS[resolvedRole] ||
        ROLE_LABELS[ROLES.USER]

      const persistence = rememberMe ? 'persistent' : 'session'
      const sessionDuration = rememberMe
        ? CONTRACT_PERSISTENT_SESSION_DURATION_MS
        : CONTRACT_SHARED_SESSION_DURATION_MS
      const expiresAt = Date.now() + sessionDuration
      writeSharedAuthSession(expiresAt, persistence)
      writeRole(resolvedRole, persistence)
      writeRoleLabel(resolvedLabel, persistence)
      syncAuthTokenToActiveStorage(persistence)

      setAuthPersistence(persistence)
      setIsAuthenticated(true)
      setRole(resolvedRole)
      setRoleLabel(resolvedLabel)
      setSharedSessionExpiresAt(expiresAt)

      logCmsApiLogin('success', {
        mode: data.auth_disabled ? 'auth_disabled' : 'jwt',
        api: API_BASE_URL,
        role: resolvedRole,
        persistence,
      })

      return { ok: true, role: resolvedRole, password: trimmed }
    } catch (err) {
      logCmsApiLogin('error', { message: err?.message || String(err) })
      return { ok: false, error: '서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.' }
    }
  }, [])

  const logout = useCallback(() => {
    clearSharedAuthSession()
    clearRole()
    clearAuthToken()
    setAuthPersistence('none')
    setIsAuthenticated(false)
    setRole(ROLES.USER)
    setRoleLabel(ROLE_LABELS[ROLES.USER])
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
      // role: 실제 역할 문자열('admin' | 'manager' | 'user') — 세밀한 분기에 사용
      role,
      // roleLabel: 화면 표시용 한글 라벨('관리자' | '전기웅' | '이용자' 등)
      roleLabel,
      // isAdmin: 관리자급 권한 여부(admin·manager 공통) — 기존 코드 하위 호환용
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
      role,
      roleLabel,
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
