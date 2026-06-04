import {
  AuthSessionExpiredError,
  isAuthSessionExpiredError,
  isTokenExpiredMessage,
} from './authFetch.js'

/** API 응답 본문에서 사용자에게 보여줄 메시지 추출 */
export async function readApiErrorMessage(response) {
  if (!response) {
    return '서버에 연결할 수 없습니다. API 주소와 네트워크 연결을 확인하세요.'
  }

  const status = response.status
  let text = ''
  try {
    text = await response.text()
  } catch {
    text = ''
  }

  if (!text) {
    return `요청이 실패했습니다. (HTTP ${status})`
  }

  try {
    const data = JSON.parse(text)
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message.trim()
    }
    const detail = data?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim()
    }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const loc = Array.isArray(item.loc) ? item.loc.join('.') : ''
            const msg = item.msg || item.message || JSON.stringify(item)
            return loc ? `${loc}: ${msg}` : String(msg)
          }
          return String(item)
        })
        .filter(Boolean)
      if (parts.length) return parts.join('\n')
    }
    if (detail && typeof detail === 'object') {
      return JSON.stringify(detail)
    }
  } catch {
    // raw text
  }

  const trimmed = text.trim() || `요청이 실패했습니다. (HTTP ${status})`
  if (isAuthHttpStatusForMessage(status) && isTokenExpiredMessage(trimmed)) {
    throw new AuthSessionExpiredError()
  }
  return trimmed
}

function isAuthHttpStatusForMessage(status) {
  return status === 401 || status === 403
}

export function getErrorMessage(error, fallback = '요청 처리 중 오류가 발생했습니다.') {
  if (isAuthSessionExpiredError(error)) return ''
  if (!error) return fallback
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error instanceof Error && error.message?.trim()) return error.message.trim()
  return fallback
}
