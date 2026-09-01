import { API_BASE_URL, getAuthHeaders } from './apiClient.js'

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
  const url = `${getPresenceBaseUrl()}${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`
  const { keepalive, ...rest } = options
  const response = await fetch(url, {
    cache: 'no-store',
    keepalive,
    ...rest,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
      ...getAuthHeaders(),
      ...(rest.method && rest.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (response.status === 204) return null
  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    const error = new Error('presence 응답이 JSON이 아닙니다.')
    error.status = response.status
    throw error
  }
  if (!response.ok) {
    const error = new Error(data?.detail || `presence ${response.status}`)
    error.status = response.status
    throw error
  }
  return data
}

/** 운영 NAS에 아직 presence 라우트가 없으면 false. dev(Vite 미들웨어)는 항상 true. */
export async function isPresenceApiReady() {
  if (import.meta.env.DEV) return true
  try {
    const response = await fetch(`${API_BASE_URL}/api/health?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    const data = await response.json().catch(() => ({}))
    return data?.presence === true
  } catch {
    return false
  }
}

export function pingPresence(displayName, menuTitle = '') {
  return requestJson(`${PRESENCE_API_PATH}/ping`, {
    method: 'POST',
    body: JSON.stringify({
      displayName: displayName || '',
      menuTitle: menuTitle || '',
    }),
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
