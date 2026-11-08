import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  API_BASE_URL,
  apiFetch,
  apiFetchInit,
  clearAuthToken,
  getAuthHeaders,
  getAuthToken,
  registerAuthSessionExpiredHandler,
  refreshAccessTokenFromStorage,
  SESSION_EXPIRED_USER_MESSAGE,
  setAuthToken,
} from './apiClient.js'
import {
  CONTRACT_PERSISTENT_SESSION_DURATION_MS,
  CONTRACT_SHARED_SESSION_DURATION_MS,
  CONTRACT_TOKEN_REFRESH_INTERVAL_MS,
  hydrateAuthSessionFromStorage,
  restoreAuthSessionFromStorages,
  writeRole,
  writeRoleLabel,
  writeAccountId,
  writeSharedAuthSession,
  clearRole,
  clearSharedAuthSession,
  clearAuthProvider,
  clearSavedLoginPassword,
  readAuthProvider,
  writeAuthProvider,
  syncAuthTokenToActiveStorage,
  KAKAO_AUTH_PROVIDER,
} from './authSession.js'
import {
  hasAdminPrivileges,
  writeClientAccessFlags,
  readClientAccessFlagsSnapshot,
  normalizeAccountId,
  normalizeRole,
  ROLE_LABELS,
  ROLES,
  VALID_ROLES,
} from './permissions.js'
import { isGenericAccountLabel } from './PresenceAvatars.jsx'

export const RESTRICTED_LOGIN_MESSAGE = '퇴사 처리 등 접근이 제한된 계정입니다.'
import {
  clearSessionResumeLogged,
  hasSessionResumeLogged,
  markSessionResumeLogged,
  notifySessionResume,
  sendAuditLog,
} from './utils/logger.js'
import { useIdleLogout } from './useIdleLogout.js'
import { isKakaoCallbackPath } from './kakaoAuth.js'
import { fetchPinStatus } from './pinAuth.js'
import {
  clearPinPassed,
  clearPinProfile,
  hasPinPassed,
  hasSkippedPinSetup,
  markPinPassed,
  readPinProfile,
  skipPinSetup,
  writePinProfile,
} from './pinProfile.js'

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
  const [accountId, setAccountId] = useState(hydrated.accountId || '')
  const [sharedSessionExpiresAt, setSharedSessionExpiresAt] = useState(hydrated.expiresAt)
  const [authHydrated, setAuthHydrated] = useState(true)
  const [accessGranted, setAccessGranted] = useState(false)
  const [accessFlagsVersion, setAccessFlagsVersion] = useState(0)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState('')
  const [pinProfileVersion, setPinProfileVersion] = useState(0)
  const [pinBypass, setPinBypass] = useState(false)
  const [pinSetupOpen, setPinSetupOpen] = useState(false)
  const [pinSetupDismissed, setPinSetupDismissed] = useState(() => hasSkippedPinSetup())
  const [pinStatusReady, setPinStatusReady] = useState(false)
  const [kakaoLinkStatus, setKakaoLinkStatus] = useState(() =>
    hydrated.isAuthenticated ? 'pending' : 'anonymous',
  )
  const pinProfile = useMemo(() => readPinProfile(), [pinProfileVersion])
  const pinLockActive = Boolean(
    pinProfile?.pinEnabled &&
      pinProfile?.accountId &&
      !hasPinPassed() &&
      !pinBypass &&
      !isKakaoCallbackPath() &&
      (!accountId || accountId === pinProfile.accountId),
  )

  // isAdmin = "관리자급 권한 보유 여부". 부서장(manager)도 현재는 true.
  // 관리자/부서장 통합 취급 스위치는 permissions.js 의 ADMIN_LEVEL_ROLES 하나뿐입니다.
  const isAdmin = hasAdminPrivileges(role)

  const applyRestoredSession = useCallback((session) => {
    setAuthPersistence(session.persistence)
    setIsAuthenticated(session.isAuthenticated)
    setRole(session.role)
    setRoleLabel(session.roleLabel || ROLE_LABELS[session.role] || ROLE_LABELS[ROLES.USER])
    setAccountId(session.accountId || '')
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
      setAccessGranted(false)
      setRole(ROLES.USER)
      setRoleLabel(ROLE_LABELS[ROLES.USER])
      setAccountId('')
      setSharedSessionExpiresAt(0)
      clearPinPassed()
      setPinBypass(false)
      setPinProfileVersion((version) => version + 1)
      setSessionExpiredNotice(message || SESSION_EXPIRED_USER_MESSAGE)
    })
    return () => registerAuthSessionExpiredHandler(null)
  }, [])

  /** @returns {'ok' | 'auth_fail' | 'network_fail'} */
  const refreshAccessToken = useCallback(async (persistence) => {
    const flagsBefore = readClientAccessFlagsSnapshot()
    const result = await refreshAccessTokenFromStorage()
    if (result === 'ok' && persistence) {
      syncAuthTokenToActiveStorage(persistence === 'persistent' ? 'persistent' : 'session')
    }
    // 새로 받은 메뉴 권한이 달라졌을 때만 화면을 다시 그린다.
    if (result === 'ok' && readClientAccessFlagsSnapshot() !== flagsBefore) {
      setAccessFlagsVersion((version) => version + 1)
    }
    return result
  }, [])

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) {
      setAccessGranted(false)
      return
    }
    let cancelled = false

    const clearSession = () => {
      setAuthPersistence('none')
      setIsAuthenticated(false)
      setAccessGranted(false)
      setRole(ROLES.USER)
      setRoleLabel(ROLE_LABELS[ROLES.USER])
      setAccountId('')
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
        if (!hadBearerToken) {
          if (!cancelled) clearSession()
          return
        }

        const refreshResult = await refreshAccessToken(stored.persistence)
        if (cancelled) return
        if (refreshResult === 'network_fail') {
          setAccessGranted(true)
          return
        }

        const res = await apiFetch(
          `${API_BASE_URL}/api/auth/me`,
          apiFetchInit({ headers: { ...getAuthHeaders() } })
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (data.auth_disabled) {
          setAccessGranted(true)
          return
        }

        // 서버가 알려준 실제 역할(admin·manager·user)로 상태·스토리지를 동기화
        if (data.valid && VALID_ROLES.has(normalizeRole(data.role))) {
          const serverRole = normalizeRole(data.role)
          const serverLabel =
            String(data.role_label || '').trim() ||
            ROLE_LABELS[serverRole] ||
            ROLE_LABELS[ROLES.USER]
          if (isGenericAccountLabel(serverLabel) || isGenericAccountLabel(data.role_label)) {
            clearSession()
            return
          }
          setRole(serverRole)
          setRoleLabel(serverLabel)
          writeRole(serverRole, stored.persistence)
          writeRoleLabel(serverLabel, stored.persistence)
        }

        if (data.valid) {
          setAccessGranted(true)
          return
        }

        const retryResult = await refreshAccessToken(stored.persistence)
        if (cancelled) return
        if (retryResult === 'ok' || retryResult === 'network_fail') {
          setAccessGranted(true)
          return
        }

        clearSession()
      } catch {
        if (!cancelled) setAccessGranted(true)
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

  const applyAuthenticatedSession = useCallback((data, rememberMe) => {
    const resolvedRole = data.role ? normalizeRole(data.role) : ROLES.ADMIN
    const resolvedLabel =
      String(data.role_label || '').trim() ||
      ROLE_LABELS[resolvedRole] ||
      ROLE_LABELS[ROLES.USER]

    if (!data.auth_disabled && isGenericAccountLabel(resolvedLabel)) {
      clearAuthToken()
      return { ok: false, error: '계정이 올바르지 않습니다.' }
    }

    const resolvedAccountId = normalizeAccountId(data.account_id)
    const persistence = rememberMe ? 'persistent' : 'session'
    const sessionDuration = rememberMe
      ? CONTRACT_PERSISTENT_SESSION_DURATION_MS
      : CONTRACT_SHARED_SESSION_DURATION_MS
    const expiresAt = Date.now() + sessionDuration
    writeSharedAuthSession(expiresAt, persistence)
    writeRole(resolvedRole, persistence)
    writeRoleLabel(resolvedLabel, persistence)
    writeAccountId(resolvedAccountId, persistence)
    writeClientAccessFlags(
      {
        canAccessBitHistory: Boolean(data.can_access_bit_history),
        canViewAllInactiveContacts: Boolean(data.can_view_all_inactive_contacts),
      },
      persistence,
    )
    syncAuthTokenToActiveStorage(persistence)

    setAuthPersistence(persistence)
    setIsAuthenticated(true)
    setRole(resolvedRole)
    setRoleLabel(resolvedLabel)
    setAccountId(resolvedAccountId)
    setAccessGranted(true)
    setSharedSessionExpiresAt(expiresAt)
    markSessionResumeLogged()
    sendAuditLog('LOGIN', '시스템 로그인')

    return { ok: true, role: resolvedRole }
  }, [])

  const acceptKakaoSession = useCallback((data, rememberMe = false) => {
    if (data?.access_token) {
      setAuthToken(data.access_token, { persistent: rememberMe })
    } else if (!data?.auth_disabled) {
      return { ok: false, error: '로그인에 실패했습니다.' }
    }
    const applied = applyAuthenticatedSession(data, rememberMe)
    if (!applied.ok) return applied
    writeAuthProvider(KAKAO_AUTH_PROVIDER, rememberMe ? 'persistent' : 'session')
    setKakaoLinkStatus('approved')
    const account = normalizeAccountId(data.account_id)
    const previous = readPinProfile()
    writePinProfile({
      accountId: account,
      displayName: String(data.role_label || previous?.displayName || '').trim(),
      pinEnabled: previous?.accountId === account ? previous.pinEnabled : false,
    })
    markPinPassed()
    setPinBypass(false)
    setPinProfileVersion((version) => version + 1)
    return applied
  }, [applyAuthenticatedSession])

  const markPinEnabled = useCallback((enabled) => {
    const profile = readPinProfile()
    const account = profile?.accountId || accountId
    if (!account) return
    const nextEnabled = Boolean(enabled)
    const displayName = profile?.displayName || roleLabel || ''
    if (
      profile &&
      profile.accountId === account &&
      profile.displayName === displayName &&
      profile.pinEnabled === nextEnabled
    ) {
      return
    }
    writePinProfile({ accountId: account, displayName, pinEnabled: nextEnabled })
    setPinProfileVersion((version) => version + 1)
  }, [accountId, roleLabel])

  const logout = useCallback((options = {}) => {
    clearSessionResumeLogged()
    clearPinPassed()
    if (options.clearPinProfile) clearPinProfile()
    setPinBypass(false)
    setPinProfileVersion((version) => version + 1)
    clearSharedAuthSession()
    clearRole()
    clearAuthToken()
    setAuthPersistence('none')
    setIsAuthenticated(false)
    setAccessGranted(false)
    setRole(ROLES.USER)
    setRoleLabel(ROLE_LABELS[ROLES.USER])
    setAccountId('')
    setSharedSessionExpiresAt(0)
    setKakaoLinkStatus('anonymous')
  }, [])

  const rejectUnapprovedKakaoSession = useCallback(() => {
    clearAuthProvider()
    clearSavedLoginPassword('user')
    clearSavedLoginPassword('admin')
    clearPinPassed()
    try {
      navigator.credentials?.preventSilentAccess?.()
    } catch {
      /* 브라우저 자격 증명이 없어도 세션 삭제는 계속한다. */
    }
    logout()
    setPinBypass(true)
    if (typeof window !== 'undefined' && window.location.pathname !== '/login' && !isKakaoCallbackPath()) {
      window.history.replaceState(null, '', '/login')
    }
  }, [logout])

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return undefined
    const tokenAtStart = getAuthToken()
    let cancelled = false

    const finish = (approved) => {
      if (cancelled || getAuthToken() !== tokenAtStart) return
      if (approved) {
        setKakaoLinkStatus('approved')
        return
      }
      rejectUnapprovedKakaoSession()
    }

    ;(async () => {
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/api/auth/me`,
          apiFetchInit({ headers: { ...getAuthHeaders() } }),
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled || getAuthToken() !== tokenAtStart) return
        if (data?.kakao_linked === true) {
          writeAuthProvider(
            KAKAO_AUTH_PROVIDER,
            authPersistence === 'persistent' ? 'persistent' : 'session',
          )
          finish(true)
          return
        }
        if (data?.kakao_linked === false) {
          finish(false)
          return
        }
        finish(readAuthProvider() === KAKAO_AUTH_PROVIDER)
      } catch {
        finish(readAuthProvider() === KAKAO_AUTH_PROVIDER)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authHydrated, isAuthenticated, authPersistence, rejectUnapprovedKakaoSession])

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return
    if (isGenericAccountLabel(roleLabel)) {
      logout()
    }
  }, [authHydrated, isAuthenticated, roleLabel, logout])

  useEffect(() => {
    if (!authHydrated || !accessGranted) return
    if (hasSessionResumeLogged()) return
    markSessionResumeLogged()
    void notifySessionResume()
  }, [authHydrated, accessGranted])

  const logoutForIdle = useCallback(async () => {
    const message = '보안을 위해 장시간 활동이 없어 자동 로그아웃 되었습니다.'
    await sendAuditLog('SECURITY_VIOLATION', '장시간 미사용 자동 로그아웃')
    logout({ keepPinProfile: true })
    setSessionExpiredNotice(message)
    window.alert(message)
  }, [logout])

  useIdleLogout({
    enabled: authHydrated && isAuthenticated && accessGranted,
    onIdle: logoutForIdle,
  })

  const preferKakaoLogin = useCallback(() => {
    logout({ keepPinProfile: true })
    setPinBypass(true)
  }, [logout])

  useEffect(() => {
    if (!authHydrated || !accessGranted || !accountId || kakaoLinkStatus !== 'approved') return undefined
    if (!hasPinPassed()) markPinPassed()
    let cancelled = false
    fetchPinStatus()
      .then((status) => {
        if (cancelled) return
        if (status.kakaoLinked === false) {
          rejectUnapprovedKakaoSession()
          return
        }
        markPinEnabled(status.enabled)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPinStatusReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [authHydrated, accessGranted, accountId, kakaoLinkStatus, pinProfileVersion, markPinEnabled, rejectUnapprovedKakaoSession])

  const dismissPinSetup = useCallback(() => {
    skipPinSetup()
    setPinSetupDismissed(true)
    setPinSetupOpen(false)
  }, [])

  const pinEnabled = Boolean(pinProfile?.pinEnabled)
  const kakaoLinkPending = isAuthenticated && kakaoLinkStatus === 'pending'
  const pinSetupRequired = Boolean(
    kakaoLinkStatus === 'approved' &&
      accessGranted &&
      pinStatusReady &&
      !pinEnabled &&
      !pinSetupDismissed &&
      !pinLockActive,
  )
  const pinStatusPending = Boolean(
    isAuthenticated && accessGranted && !pinStatusReady && !pinEnabled && !pinSetupDismissed && !pinLockActive,
  )

  const extendLogin = useCallback(async () => {
    const persistence = authPersistence === 'persistent' ? 'persistent' : 'session'
    await refreshAccessToken(persistence)
    return bumpSessionExpiry(authPersistence)
  }, [authPersistence, refreshAccessToken, bumpSessionExpiry])

  const value = useMemo(
    () => ({
      isAuthenticated,
      accessGranted,
      // role: 실제 역할 문자열('admin' | 'manager' | 'user') — 세밀한 분기에 사용
      role,
      // roleLabel: 화면 표시용 한글 라벨('관리자' | '전기웅' | '이용자' 등)
      roleLabel,
      accountId,
      // 메뉴 권한 플래그가 서버 값으로 갱신되면 올라가는 값 — 구독한 화면이 다시 그려지게 한다
      accessFlagsVersion,
      // isAdmin: 관리자급 권한 여부(admin·manager 공통) — 기존 코드 하위 호환용
      isAdmin,
      sharedSessionExpiresAt,
      authHydrated,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      acceptKakaoSession,
      logout,
      extendLogin,
      pinLockActive,
      pinEnabled,
      pinSetupRequired,
      pinStatusPending,
      kakaoLinkPending,
      pinSetupOpen,
      openPinSetup: () => setPinSetupOpen(true),
      closePinSetup: () => setPinSetupOpen(false),
      dismissPinSetup,
      preferKakaoLogin,
      markPinEnabled,
    }),
    [
      isAuthenticated,
      accessGranted,
      role,
      roleLabel,
      accountId,
      accessFlagsVersion,
      isAdmin,
      sharedSessionExpiresAt,
      authHydrated,
      sessionExpiredNotice,
      clearSessionExpiredNotice,
      acceptKakaoSession,
      logout,
      extendLogin,
      pinLockActive,
      pinEnabled,
      pinSetupRequired,
      pinStatusPending,
      kakaoLinkPending,
      pinProfile,
      pinSetupOpen,
      dismissPinSetup,
      preferKakaoLogin,
      markPinEnabled,
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
