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
      `서버에 연결할 수 없습니다. (${installCasesUrl(options.method === 'POST' && !path.includes('/') ? '' : path || '')}) ${err?.message || err}`
    )
  }

  if (!response.ok) {
    const detail = await readApiErrorMessage(response)
    const err = new Error(
      response.status === 404 && String(path).startsWith(INSTALL_CASES_API_PATH)
        ? `설치사례 API(${path})를 찾을 수 없습니다 (404).\n요청 URL: ${url}\n` +
          `백엔드를 최신 코드로 재시작한 뒤 GET /api/health 에서 installCases: true 인지 확인하세요.\n\n${detail}`
        : detail
    )
    err.status = response.status
    err.url = url
    throw err
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
    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    console.log('[install-cases] DELETE', installCasesUrl(`/${id}`))
    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
