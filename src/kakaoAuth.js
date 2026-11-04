import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'

export const KAKAO_CALLBACK_PATH = '/auth/kakao/callback'

export function kakaoCallbackUri() {
  return `${window.location.origin}${KAKAO_CALLBACK_PATH}`
}

const KAKAO_RETURN_FLAG = 'cms_kakao_return'

/**
 * 콜백 주소의 code 는 한 번만 읽는다.
 * 개발 모드에서 화면이 두 번 마운트되며 첫 실행이 쿼리를 지운 뒤,
 * 두 번째 실행이 빈 주소를 보고 '인증 코드가 없습니다'로 끝나던 문제를 막는다.
 * 운영에서는 /auth/kakao/callback 이 / 로 308 되며 code 만 남는 경우가 있어, 그 주소도 같은 반환으로 본다.
 */
let kakaoCallbackCapture = null
let kakaoReturnActive = false

function readCodePair() {
  const search = new URLSearchParams(window.location.search)
  const hashText = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const hash = new URLSearchParams(hashText)
  return {
    code: String(search.get('code') || hash.get('code') || '').trim(),
    kakaoError: String(search.get('error') || hash.get('error') || '').trim(),
  }
}

function rememberKakaoReturn() {
  try {
    window.sessionStorage.setItem(KAKAO_RETURN_FLAG, '1')
  } catch {
    // 저장이 막혀도 콜백 경로 자체는 그대로 처리한다.
  }
}

function clearKakaoReturnFlag() {
  try {
    window.sessionStorage.removeItem(KAKAO_RETURN_FLAG)
  } catch {
    // 저장소 접근이 막혀 있어도 이번 화면의 처리는 계속한다.
  }
}

function hadKakaoReturnFlag() {
  try {
    return window.sessionStorage.getItem(KAKAO_RETURN_FLAG) === '1'
  } catch {
    return false
  }
}

export function isKakaoCallbackPath(pathname = window.location.pathname) {
  const path = String(pathname || '')
  if (path === KAKAO_CALLBACK_PATH || path === `${KAKAO_CALLBACK_PATH}/`) return true
  return kakaoReturnActive
}

export function leaveKakaoCallback() {
  kakaoReturnActive = false
  kakaoCallbackCapture = null
  clearKakaoReturnFlag()
}

function captureKakaoReturn() {
  if (typeof window === 'undefined') return
  const path = window.location.pathname
  const onCallback = path === KAKAO_CALLBACK_PATH || path === `${KAKAO_CALLBACK_PATH}/`
  const { code, kakaoError } = readCodePair()
  const marked = hadKakaoReturnFlag()
  if (!onCallback && !(marked && (code || kakaoError))) {
    if (marked) clearKakaoReturnFlag()
    return
  }
  kakaoReturnActive = true
  clearKakaoReturnFlag()
  if (!code && !kakaoError) return
  kakaoCallbackCapture = { code, kakaoError }
  window.history.replaceState(null, '', path || '/')
}

captureKakaoReturn()

export function readKakaoCallbackParams() {
  if (kakaoCallbackCapture) return kakaoCallbackCapture
  const { code, kakaoError } = readCodePair()
  if (!code && !kakaoError) return { code: '', kakaoError: '' }
  kakaoCallbackCapture = { code, kakaoError }
  window.history.replaceState(null, '', window.location.pathname || '/')
  return kakaoCallbackCapture
}

function readDetail(data, fallback) {
  const detail = data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (Array.isArray(detail)) {
    const text = detail.map((item) => item?.msg || item).join(', ').trim()
    if (text) return text
  }
  return fallback
}

async function postKakao(path, body) {
  let response
  try {
    response = await apiFetch(
      `${API_BASE_URL}${path}`,
      apiFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
  } catch {
    return {
      ok: false,
      error: '서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.',
    }
  }
  const data = await response.json().catch(() => ({}))
  if (response.status === 202 || data?.code === 'kakao_pending') {
    return {
      ok: false,
      pending: true,
      status: response.status,
      code: data?.code || 'kakao_pending',
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readDetail(data, '카카오 로그인에 실패했습니다.'),
      code: data?.code || '',
      linkToken: data?.link_token || '',
    }
  }
  return { ok: true, data }
}

export async function beginKakaoLogin() {
  const redirectUri = kakaoCallbackUri()
  let response
  try {
    response = await apiFetch(
      `${API_BASE_URL}/api/auth/kakao/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`,
      apiFetchInit({ method: 'GET' })
    )
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.' }
  }
  const data = await response.json().catch(() => ({}))
  if (data?.auth_disabled) return { ok: true, authDisabled: true, data }
  if (!response.ok || !data?.url) {
    return { ok: false, error: readDetail(data, '카카오 로그인을 시작하지 못했습니다.') }
  }
  rememberKakaoReturn()
  window.location.assign(data.url)
  return { ok: true, redirected: true }
}

const kakaoCodeExchanges = new Map()

export function exchangeKakaoCode(code) {
  const key = String(code || '')
  if (!kakaoCodeExchanges.has(key)) {
    kakaoCodeExchanges.set(
      key,
      postKakao('/api/auth/kakao', {
        code: key,
        redirect_uri: kakaoCallbackUri(),
      })
    )
  }
  return kakaoCodeExchanges.get(key)
}

export async function fetchKakaoPending() {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/kakao/pending`,
    apiFetchInit({ method: 'GET', headers: { ...getAuthHeaders() } })
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readDetail(data, '대기 목록을 불러오지 못했습니다.'))
  return Array.isArray(data.items) ? data.items : []
}

export async function fetchKakaoEmployees() {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/kakao/employees`,
    apiFetchInit({ method: 'GET', headers: { ...getAuthHeaders() } })
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readDetail(data, '직원 목록을 불러오지 못했습니다.'))
  return Array.isArray(data.items) ? data.items : []
}

export async function approveKakaoLink(kakaoId, accountId) {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/kakao/approve`,
    apiFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ kakao_id: kakaoId, account_id: accountId }),
    })
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readDetail(data, '연동 승인에 실패했습니다.'))
  return data
}
