import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

/** 백엔드 router: GET/POST /api/install-cases, PATCH/DELETE /api/install-cases/{id} */
export const INSTALL_CASES_API_PATH = '/api/install-cases'

const FETCH_TIMEOUT_MS = 5000

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutError = new Error(
        `서버 응답 시간이 초과되었습니다. (${FETCH_TIMEOUT_MS / 1000}초) API 주소와 백엔드 실행 여부를 확인하세요.`
      )
      timeoutError.code = 'TIMEOUT'
      throw timeoutError
    }
    throw new Error(`서버에 연결할 수 없습니다. ${err?.message || err}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const { headers: optHeaders, ...rest } = options
  const response = await fetchWithTimeout(
    url,
    apiFetchInit({
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    })
  )

  if (!response.ok) {
    const detail = await readApiErrorMessage(response)
    const err = new Error(
      response.status === 404
        ? `설치사례 API(${path})를 찾을 수 없습니다 (404).\n` +
            `백엔드를 최신 코드로 재시작한 뒤 GET /api/health 에서 installCases: true 인지 확인하세요.\n\n${detail}`
        : detail
    )
    err.status = response.status
    err.url = url
    throw err
  }

  if (response.status === 204) return null

  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const installCasesApi = {
  list() {
    return requestJson(INSTALL_CASES_API_PATH)
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
