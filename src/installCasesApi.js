import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

/** 설치사례 API — 백엔드 INSTALL_CASES_API_PATH 와 동일 (복수형 /api/install-cases) */
export const INSTALL_CASES_API_PATH = '/api/install-cases'

function installCasesUrl(suffix = '') {
  return `${API_BASE_URL}${INSTALL_CASES_API_PATH}${suffix}`
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const { headers: optHeaders, ...rest } = options
  let response
  try {
    response = await fetch(url, apiFetchInit({
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    }))
  } catch (err) {
    throw new Error(
      `서버에 연결할 수 없습니다. (${installCasesUrl()}) ${err?.message || err}`
    )
  }

  if (!response.ok) {
    const detail = await readApiErrorMessage(response)
    const err = new Error(detail)
    err.status = response.status
    err.url = url
    throw err
  }

  if (response.status === 204) return null
  return response.json()
}

export const installCasesApi = {
  /** GET 목록 — 라우트 미배포(404) 등이면 빈 배열, 콘솔 에러 없음 */
  async list() {
    const url = installCasesUrl()
    try {
      const response = await fetch(
        url,
        apiFetchInit({
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
        })
      )

      if (response.status === 404) {
        return []
      }

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  },

  create(payload) {
    return requestJson(INSTALL_CASES_API_PATH, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  update(id, patch) {
    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  remove(id) {
    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
