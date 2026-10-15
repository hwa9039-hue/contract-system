import { API_BASE_URL, apiFetchInit, getAuthHeaders } from '../apiClient.js'
import { ACCOUNT_ID_SESSION_KEY, ROLE_LABEL_SESSION_KEY } from '../authSession.js'

const IP_CACHE_KEY = 'cms_client_public_ip'

function readStored(key) {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export async function getClientPublicIp() {
  try {
    const cached = sessionStorage.getItem(IP_CACHE_KEY)
    if (cached) return cached
  } catch {
    /* ignore */
  }
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    const ip = String(data?.ip || '').trim()
    if (!ip) return ''
    try {
      sessionStorage.setItem(IP_CACHE_KEY, ip)
    } catch {
      /* ignore */
    }
    return ip
  } catch {
    return ''
  }
}

/** 이 브라우저 탭에서 자동 로그인 접속 로그를 이미 남겼는지. F5 로는 지워지지 않고, 탭을 닫으면 사라진다. */
export const SESSION_RESUME_LOG_KEY = 'cms_audit_session_resume_logged'

export function markSessionResumeLogged() {
  try {
    sessionStorage.setItem(SESSION_RESUME_LOG_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function hasSessionResumeLogged() {
  try {
    return sessionStorage.getItem(SESSION_RESUME_LOG_KEY) === '1'
  } catch {
    return false
  }
}

export function clearSessionResumeLogged() {
  try {
    sessionStorage.removeItem(SESSION_RESUME_LOG_KEY)
  } catch {
    /* ignore */
  }
}

async function postJson(path, body) {
  const ipAddress = await Promise.race([
    getClientPublicIp(),
    new Promise((resolve) => {
      window.setTimeout(() => resolve(''), 2000)
    }),
  ])
  await fetch(
    `${API_BASE_URL}${path}`,
    apiFetchInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ ...body, ipAddress }),
    }),
  )
}

/** 로그인 사용자·IP·시각과 함께 감사 로그를 서버로 보낸다. 실패해도 화면 동작은 막지 않는다. */
export function sendAuditLog(actionType, description) {
  const type = String(actionType || '').trim()
  if (!type) return Promise.resolve()
  return postJson('/api/audit-logs', {
    actionType: type,
    description: String(description || '').trim(),
    actorName: readStored(ROLE_LABEL_SESSION_KEY),
    actorId: readStored(ACCOUNT_ID_SESSION_KEY),
    occurredAt: new Date().toISOString(),
  }).catch(() => {
    /* 로그 전송 실패는 무시 */
  })
}

/** 저장된 토큰으로 다시 들어온 접속. 서버가 로그인 로그 문구를 고정한다. */
export function notifySessionResume() {
  return postJson('/api/auth/session-resume', {}).catch(() => {
    /* 로그 전송 실패는 무시 */
  })
}
