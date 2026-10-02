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

/** 로그인 사용자·IP·시각과 함께 감사 로그를 서버로 보낸다. 실패해도 화면 동작은 막지 않는다. */
export function sendAuditLog(actionType, description) {
  const type = String(actionType || '').trim()
  if (!type) return

  void (async () => {
    const ipAddress = await getClientPublicIp()
    try {
      await fetch(
        `${API_BASE_URL}/api/audit-logs`,
        apiFetchInit({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            actionType: type,
            description: String(description || '').trim(),
            actorName: readStored(ROLE_LABEL_SESSION_KEY),
            actorId: readStored(ACCOUNT_ID_SESSION_KEY),
            ipAddress,
            occurredAt: new Date().toISOString(),
          }),
        }),
      )
    } catch {
      /* 로그 전송 실패는 무시 */
    }
  })()
}
