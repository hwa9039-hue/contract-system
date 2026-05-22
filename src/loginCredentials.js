import {
  canPersistLoginPassword,
  clearSavedLoginPassword,
  readSavedLoginPassword,
  writeSavedLoginPassword,
} from './authSession.js'

export const LOGIN_CREDENTIAL_IDS = {
  user: 'contract-user',
  admin: 'contract-admin',
}

/** 저장된 비밀번호 불러오기 — 사용자만 (관리자는 저장·자동완성 안 함) */
export async function loadStoredLoginPassword(role) {
  if (!canPersistLoginPassword(role)) return null

  const fromLocal = readSavedLoginPassword(role)
  if (fromLocal) return fromLocal

  if (typeof window === 'undefined' || !window.PasswordCredential || !navigator.credentials?.get) {
    return null
  }

  try {
    const credential = await navigator.credentials.get({
      password: true,
      mediation: 'optional',
    })
    if (!credential?.password) return null

    const expectedId = LOGIN_CREDENTIAL_IDS[role]
    if (credential.id && credential.id !== expectedId) return null

    return String(credential.password)
  } catch {
    return null
  }
}

/** 로그인 성공 후 비밀번호 저장 — 사용자만 */
export async function saveLoginPassword(role, password, remember = true) {
  if (!canPersistLoginPassword(role)) {
    clearSavedLoginPassword(role)
    return
  }

  if (remember) {
    writeSavedLoginPassword(role, password)
  } else {
    clearSavedLoginPassword(role)
  }

  if (typeof window === 'undefined' || !window.PasswordCredential || !navigator.credentials?.store) {
    return
  }

  try {
    const credential = new PasswordCredential({
      id: LOGIN_CREDENTIAL_IDS[role],
      password: String(password),
      name: '스마트DI 사용자',
    })
    await navigator.credentials.store(credential)
  } catch {
    /* 브라우저 저장 실패해도 localStorage 는 이미 저장됨 */
  }
}

/** 예전에 저장된 관리자 비밀번호 제거 */
export function purgeSavedAdminPassword() {
  clearSavedLoginPassword('admin')
}
