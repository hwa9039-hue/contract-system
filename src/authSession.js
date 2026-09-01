export const ADMIN_SESSION_KEY = 'contract_manager_admin_session_v1'
/** 로그인한 실제 역할('admin' | 'manager' | 'user') 저장 키 — Role 기반 상태 관리의 핵심 */
export const ROLE_SESSION_KEY = 'contract_manager_role_session_v1'
/** 화면 표시용 라벨(부서장 이름 등) 저장 키 */
export const ROLE_LABEL_SESSION_KEY = 'contract_manager_role_label_session_v1'
export const CONTRACT_SHARED_AUTH_KEY = 'CONTRACT_SHARED_AUTH'
export const CONTRACT_SHARED_EXPIRES_AT_KEY = 'CONTRACT_SHARED_EXPIRES_AT'
export const CONTRACT_REMEMBER_ME_FLAG_KEY = 'CONTRACT_REMEMBER_ME'
export const CONTRACT_SAVED_PASSWORD_USER_KEY = 'CONTRACT_SAVED_PASSWORD_USER_V1'
export const CONTRACT_SAVED_PASSWORD_ADMIN_KEY = 'CONTRACT_SAVED_PASSWORD_ADMIN_V1'
/** 로그인 유지(비-기억하기) — 백엔드 ACCESS_TOKEN_EXPIRE_MINUTES(480)와 동일하게 8시간 */
export const CONTRACT_SHARED_SESSION_DURATION_MS = 8 * 60 * 60 * 1000
/** 탭이 열려 있는 동안 주기적 토큰 갱신 간격 */
export const CONTRACT_TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000
export const CONTRACT_PERSISTENT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000
export const CONTRACT_SHARED_WARNING_MS = 5 * 60 * 1000

/** 남은 세션 분 → "8시간", "1시간 30분", "45분" 등 */
export function formatRemainingSessionLabel(minutes) {
  const m = Math.max(0, Math.ceil(Number(minutes) || 0))
  if (m < 60) return `${m}분`
  const hours = Math.floor(m / 60)
  const rest = m % 60
  if (rest === 0) return `${hours}시간`
  return `${hours}시간 ${rest}분`
}

import { AUTH_TOKEN_KEY } from './apiClient.js'
import { hasAdminPrivileges, normalizeRole, ROLE_LABELS, ROLES } from './permissions.js'

export const SHARED_APP_PASSWORD = import.meta.env.VITE_APP_SHARED_PASSWORD || 'smartdi2026!'

function parseAccountsEnv(raw, fallbackLabel) {
  const text = String(raw || '').trim()
  if (!text) return []
  const out = []
  for (const part of text.split(',')) {
    const chunk = part.trim()
    if (!chunk || !chunk.includes(':')) continue
    const idx = chunk.indexOf(':')
    const password = chunk.slice(0, idx).trim()
    const label = chunk.slice(idx + 1).trim() || fallbackLabel
    if (password) out.push({ password, label })
  }
  return out
}

/** 기본 계정 (비밀번호 → 표시명). 전원 동일 권한(admin). */
const DEFAULT_ADMIN_ACCOUNTS = Object.freeze([
  { password: 'hy9039!', label: '정화영' },
  { password: 'jhjoung!', label: '정주희' },
  { password: 'kk2331!', label: '전기웅' },
  { password: 'nov1st!', label: '유영무' },
  { password: 'sskim!', label: '김성수' },
  { password: 'yongja_lee!', label: '이용자' },
  { password: 'pjb9878!', label: '박재범' },
  { password: 'jslee!', label: '이재승' },
  { password: 'wizard1221!', label: '전재우' },
  { password: 'ssj8845!', label: '신상준' },
])

/** 하위 호환. 새 계정은 DEFAULT_ADMIN_ACCOUNTS 에 넣는다. */
const DEFAULT_MANAGER_ACCOUNTS = Object.freeze([])

/**
 * 관리자 계정 목록.
 * VITE_APP_ADMIN_ACCOUNTS=`pwd:라벨,pwd:라벨` 이 있으면 우선.
 */
export const ADMIN_ACCOUNTS = (() => {
  const fromEnv = parseAccountsEnv(import.meta.env.VITE_APP_ADMIN_ACCOUNTS, '관리자')
  if (fromEnv.length > 0) return Object.freeze(fromEnv)
  return DEFAULT_ADMIN_ACCOUNTS
})()

/**
 * 부서장 계정 목록.
 * VITE_APP_MANAGER_ACCOUNTS=`pwd:라벨,pwd:라벨` 이 있으면 우선.
 */
export const MANAGER_ACCOUNTS = (() => {
  const fromEnv = parseAccountsEnv(import.meta.env.VITE_APP_MANAGER_ACCOUNTS, '부서장')
  if (fromEnv.length > 0) return Object.freeze(fromEnv)
  return DEFAULT_MANAGER_ACCOUNTS
})()

/** @deprecated 단일 관리자 비밀번호 — ADMIN_ACCOUNTS[0] 하위 호환 */
export const ADMIN_PASSWORD = ADMIN_ACCOUNTS[0]?.password || 'hy9039!'

/** @deprecated 단일 부서장 비밀번호 — MANAGER_ACCOUNTS[0] 하위 호환 */
export const MANAGER_PASSWORD = MANAGER_ACCOUNTS[0]?.password || 'kk2331!'

export function findAdminAccount(password) {
  const trimmed = String(password || '').trim()
  if (!trimmed) return null
  return ADMIN_ACCOUNTS.find((a) => a.password === trimmed) || null
}

export function findManagerAccount(password) {
  const trimmed = String(password || '').trim()
  if (!trimmed) return null
  return MANAGER_ACCOUNTS.find((a) => a.password === trimmed) || null
}

/**
 * 로그인 role 별로 클라이언트에서 1차 검증할 기대 비밀번호.
 * admin·manager 는 복수 계정이라 findAdminAccount / findManagerAccount 로 검사한다.
 */
export const ROLE_EXPECTED_PASSWORD = Object.freeze({
  [ROLES.USER]: SHARED_APP_PASSWORD,
})

/**
 * 비밀번호만으로 로그인 계정을 찾는다.
 * 관리자 목록을 먼저 보고, 없으면 부서장 목록을 본다.
 */
export function resolveLoginAccount(password) {
  const trimmed = String(password || '').trim()
  if (!trimmed) return null
  const admin = findAdminAccount(trimmed)
  if (admin) return { role: ROLES.ADMIN, label: admin.label, password: admin.password }
  const manager = findManagerAccount(trimmed)
  if (manager) return { role: ROLES.ADMIN, label: manager.label, password: manager.password }
  return null
}

/**
 * ★ 비밀번호 기반 역할 분기 ★
 * 탭 구분 없이 비밀번호가 어느 계정 목록에 있는지 보고 역할을 정한다.
 */
export function resolveEffectiveRole(requestedRole, password) {
  const matched = resolveLoginAccount(password)
  if (matched) return matched.role
  return normalizeRole(requestedRole)
}

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

/**
 * 로그인한 실제 역할('admin' | 'manager' | 'user') 을 스토리지에서 읽습니다.
 * 예전 세션(role 키 없음) 하위 호환: admin 플래그만 있으면 'admin' 으로 간주.
 * @param {'session' | 'persistent'} persistence
 */
export function readStoredRole(persistence = 'session') {
  try {
    const raw =
      persistence === 'persistent'
        ? localStorage.getItem(ROLE_SESSION_KEY) || sessionStorage.getItem(ROLE_SESSION_KEY)
        : sessionStorage.getItem(ROLE_SESSION_KEY)
    if (raw) return normalizeRole(raw)
  } catch {
    /* ignore */
  }
  // 하위 호환: role 키가 없던 이전 세션은 admin 플래그로 판단
  return readStoredAdminFlag(persistence) ? ROLES.ADMIN : ROLES.USER
}

/** @param {'session' | 'persistent'} persistence */
export function writeRole(role, persistence = 'session') {
  const normalized = normalizeRole(role)
  try {
    localStorage.removeItem(ROLE_SESSION_KEY)
    sessionStorage.removeItem(ROLE_SESSION_KEY)

    const primary = persistence === 'persistent' ? localStorage : sessionStorage
    primary.setItem(ROLE_SESSION_KEY, normalized)
    if (persistence === 'persistent') {
      sessionStorage.setItem(ROLE_SESSION_KEY, normalized)
    }
  } catch {
    /* ignore */
  }
  // 관리자급(admin·manager) 여부를 admin 플래그에도 동기화 (기존 코드 하위 호환)
  writeAdminFlag(hasAdminPrivileges(normalized), persistence)
}

export function clearRole() {
  try {
    localStorage.removeItem(ROLE_SESSION_KEY)
    sessionStorage.removeItem(ROLE_SESSION_KEY)
  } catch {
    /* ignore */
  }
  clearAdminFlag()
  clearRoleLabel()
}

/** @param {'session' | 'persistent'} persistence */
export function readStoredRoleLabel(persistence = 'session') {
  try {
    const raw =
      persistence === 'persistent'
        ? localStorage.getItem(ROLE_LABEL_SESSION_KEY) ||
          sessionStorage.getItem(ROLE_LABEL_SESSION_KEY)
        : sessionStorage.getItem(ROLE_LABEL_SESSION_KEY)
    return String(raw || '').trim()
  } catch {
    return ''
  }
}

/** @param {'session' | 'persistent'} persistence */
export function writeRoleLabel(label, persistence = 'session') {
  const text = String(label || '').trim()
  try {
    localStorage.removeItem(ROLE_LABEL_SESSION_KEY)
    sessionStorage.removeItem(ROLE_LABEL_SESSION_KEY)
    if (!text) return
    const primary = persistence === 'persistent' ? localStorage : sessionStorage
    primary.setItem(ROLE_LABEL_SESSION_KEY, text)
    if (persistence === 'persistent') {
      sessionStorage.setItem(ROLE_LABEL_SESSION_KEY, text)
    }
  } catch {
    /* ignore */
  }
}

export function clearRoleLabel() {
  try {
    localStorage.removeItem(ROLE_LABEL_SESSION_KEY)
    sessionStorage.removeItem(ROLE_LABEL_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** localStorage·sessionStorage 중 존재하는 토큰을 활성 스토리지에 복원 */
export function syncAuthTokenToActiveStorage(persistence = 'session') {
  try {
    const token =
      sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) return

    if (persistence === 'persistent') {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    }
  } catch {
    /* ignore */
  }
}

/**
 * 새로고침 시 localStorage·sessionStorage 모두 확인해 세션 복구
 * @returns {{ isAuthenticated: boolean, expiresAt: number, persistence: 'none' | 'session' | 'persistent', isAdmin: boolean, role: 'admin' | 'manager' | 'user', roleLabel: string }}
 */
export function restoreAuthSessionFromStorages() {
  const fromLocal = readAuthFromStorage(localStorage)
  const fromSession = readAuthFromStorage(sessionStorage)

  let chosen = null
  let persistence = 'none'

  if (fromLocal && fromSession) {
    chosen = fromLocal.expiresAt >= fromSession.expiresAt ? fromLocal : fromSession
    persistence =
      fromLocal.expiresAt >= fromSession.expiresAt ? 'persistent' : 'session'
  } else if (fromLocal) {
    chosen = fromLocal
    persistence = 'persistent'
  } else if (fromSession) {
    chosen = fromSession
    persistence = 'session'
  }

  if (!chosen) {
    return {
      isAuthenticated: false,
      expiresAt: 0,
      persistence: 'none',
      isAdmin: false,
      role: ROLES.USER,
      roleLabel: ROLE_LABELS[ROLES.USER],
    }
  }

  syncAuthTokenToActiveStorage(persistence)

  const role = readStoredRole(persistence)
  const storedLabel = readStoredRoleLabel(persistence)
  const roleLabel = storedLabel || ROLE_LABELS[role] || ROLE_LABELS[ROLES.USER]

  return {
    isAuthenticated: true,
    expiresAt: chosen.expiresAt,
    persistence,
    role,
    roleLabel,
    // isAdmin 은 "관리자급 여부" — 부서장(manager)도 true 로 취급 (permissions.js 참고)
    isAdmin: hasAdminPrivileges(role),
  }
}

/**
 * 앱 마운트 시 storage → 상태 복구용 스냅샷
 * @returns {{ isAuthenticated: boolean, expiresAt: number, persistence: 'none' | 'session' | 'persistent', isAdmin: boolean, role: 'admin' | 'manager' | 'user', roleLabel: string }}
 */
export function hydrateAuthSessionFromStorage() {
  return restoreAuthSessionFromStorages()
}

/** 이전에 「자동 로그인」을 켰는지 (로그인 화면 체크박스 기본값) */
export function readRememberMePreference() {
  try {
    return localStorage.getItem(CONTRACT_REMEMBER_ME_FLAG_KEY) === 'true'
  } catch {
    return false
  }
}

function savedPasswordStorageKey(role) {
  return role === 'admin' ? CONTRACT_SAVED_PASSWORD_ADMIN_KEY : CONTRACT_SAVED_PASSWORD_USER_KEY
}

/** 관리자 비밀번호는 저장·자동완성하지 않습니다. */
export function canPersistLoginPassword(role) {
  return role === 'user'
}

/** 자동 로그인 사용 시 저장해 둔 비밀번호 (로그인 화면 자동 채움용) */
export function readSavedLoginPassword(role) {
  if (!canPersistLoginPassword(role)) return ''
  try {
    return localStorage.getItem(savedPasswordStorageKey(role)) || ''
  } catch {
    return ''
  }
}

export function writeSavedLoginPassword(role, password) {
  if (!canPersistLoginPassword(role)) return
  try {
    localStorage.setItem(savedPasswordStorageKey(role), String(password))
  } catch {
    /* ignore */
  }
}

export function clearSavedLoginPassword(role) {
  try {
    localStorage.removeItem(savedPasswordStorageKey(role))
  } catch {
    /* ignore */
  }
}
