import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'

export const PRESENCE_API_PATH = '/api/presence'

function trimSlash(url) {
  return String(url || '').replace(/\/$/, '')
}

/**
 * npm run dev: 같은 Vite 서버(`/api/presence`)에 ping 해서
 * 일반 창·시크릿 창이 한 목록을 나눈다. 계약 API는 NAS를 그대로 쓴다.
 * 운영 빌드: FastAPI 와 같은 API_BASE_URL.
 */
export function getPresenceBaseUrl() {
  if (import.meta.env.DEV) {
    const fromEnv = import.meta.env.VITE_PRESENCE_BASE_URL
    if (fromEnv != null && String(fromEnv).trim() !== '') {
      return trimSlash(fromEnv)
    }
    return ''
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
