import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'

/** 설치사례 API — 백엔드 INSTALL_CASES_API_PATH 와 동일 (복수형 /api/install-cases) */
export const INSTALL_CASES_API_PATH = '/api/install-cases'

function installCasesUrl(suffix = '') {
  return `${API_BASE_URL}${INSTALL_CASES_API_PATH}${suffix}`
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const { headers: optHeaders, ...rest } = options
  const response = await fetch(url, apiFetchInit({
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(optHeaders || {}),
    },
  }))

  if (!response.ok) {
    const message = await response.text()
    if (response.status === 404 && String(path).startsWith(INSTALL_CASES_API_PATH)) {
      throw new Error(
        `설치사례 API(${INSTALL_CASES_API_PATH}) 404. 요청 URL: ${url} — 백엔드를 최신 코드로 재배포해 주세요. ` +
          (message || '')
      )
    }
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const installCasesApi = {
  list() {
    console.log('[install-cases] GET', installCasesUrl())
    return requestJson(INSTALL_CASES_API_PATH)
  },
  create(payload) {
    console.log('[install-cases] POST', installCasesUrl())
    return requestJson(INSTALL_CASES_API_PATH, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    console.log('[install-cases] PATCH', installCasesUrl(`/${id}`))
    return requestJson(`${INSTALL_CASES_API_PATH}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    console.log('[install-cases] DELETE', installCasesUrl(`/${id}`))
    return requestJson(`${INSTALL_CASES_API_PATH}/${id}`, {
      method: 'DELETE',
    })
  },
}
