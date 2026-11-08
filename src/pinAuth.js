import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'

function readDetail(data, fallback) {
  const detail = data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  return fallback
}

export async function fetchPinStatus() {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/pin`,
    apiFetchInit({ method: 'GET', headers: { ...getAuthHeaders() } }),
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readDetail(data, '간편 비밀번호 상태를 확인하지 못했습니다.'))
  const hasKakaoFlag = data != null && Object.prototype.hasOwnProperty.call(data, 'kakaoLinked')
  return {
    enabled: Boolean(data?.enabled),
    kakaoLinked: hasKakaoFlag ? Boolean(data.kakaoLinked) : undefined,
  }
}

export async function savePin(pin, currentPin = '') {
  const response = await apiFetch(
    `${API_BASE_URL}/api/auth/pin`,
    apiFetchInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ pin, current_pin: currentPin }),
    }),
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(readDetail(data, '간편 비밀번호를 저장하지 못했습니다.'))
  return data
}

export async function verifyPin(accountId, pin) {
  let response
  try {
    response = await apiFetch(
      `${API_BASE_URL}/api/auth/pin/verify`,
      apiFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, pin }),
      }),
    )
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.' }
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { ok: false, error: readDetail(data, '간편 비밀번호가 올바르지 않습니다.') }
  }
  return { ok: true, data }
}
