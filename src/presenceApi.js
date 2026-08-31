import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'

export const PRESENCE_API_PATH = '/api/presence'

function trimSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

/**
 * npm run dev: 계약 API는 NAS, 접속자 ping은 로컬 8010.
 * (NAS에는 아직 presence 라우트가 없어서 혼자 두 창 테스트가 안 됨)
 * 운영 빌드: 같은 API 서버를 쓴다.
 */
export function getPresenceBaseUrl() {
  if (import.meta.env.DEV) {
    const fromEnv = import.meta.env.VITE_PRESENCE_BASE_URL
    if (fromEnv != null && String(fromEnv).trim() !== '') {
      return trimSlash(fromEnv)
    }
    return 'http://127.0.0.1:8010'
  }
  return API_BASE_URL
}

async function requestJson(path, options = {}) {
  const url = `${getPresenceBaseUrl()}${path}`
  const { headers: optHeaders, keepalive, ...rest } = options
  const response = await apiFetch(
    url,
    apiFetchInit({
      ...rest,
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    })
  )
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.detail || `presence ${response.status}`)
    error.status = response.status
    throw error
  }
  return data
}

export function pingPresence(displayName) {
  return requestJson(`${PRESENCE_API_PATH}/ping`, {
    method: 'POST',
    body: JSON.stringify({ displayName: displayName || '' }),
  })
}

export function listOnlinePresence() {
  return requestJson(`${PRESENCE_API_PATH}/online`)
}

export function leavePresence(displayName) {
  return requestJson(`${PRESENCE_API_PATH}/leave`, {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify({ displayName: displayName || '' }),
  }).catch(() => null)
}
