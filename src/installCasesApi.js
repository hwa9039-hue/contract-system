import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'
import { createLocalInstallCaseId } from './installCaseLocal.js'

/** 설치사례 API — 백엔드 INSTALL_CASES_API_PATH 와 동일 (복수형 /api/install-cases) */
export const INSTALL_CASES_API_PATH = '/api/install-cases'

const MOCK_SAVE_DELAY_MS = 1000
const FETCH_TIMEOUT_MS = 15000

function installCasesUrl(suffix = '') {
  return `${API_BASE_URL}${INSTALL_CASES_API_PATH}${suffix}`
}

function mockDelay(ms = MOCK_SAVE_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function mockSaveAfterDelay(payload, existingId = null) {
  await mockDelay()
  return mockInstallCaseRow(payload, existingId)
}

function mockInstallCaseRow(payload, existingId = null) {
  const timestamp = new Date().toISOString()
  return {
    ...payload,
    id: existingId || createLocalInstallCaseId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
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

async function postInstallCase(payload) {
  const url = installCasesUrl()
  try {
    const response = await fetchWithTimeout(
      url,
      apiFetchInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      })
    )

    if (response.status === 404) {
      return mockSaveAfterDelay(payload)
    }

    if (!response.ok) {
      const detail = await readApiErrorMessage(response)
      const err = new Error(detail)
      err.status = response.status
      err.url = url
      throw err
    }

    return response.json()
  } catch (err) {
    if (err?.status && err.status !== 404) {
      throw err
    }
    return mockSaveAfterDelay(payload)
  }
}

async function patchInstallCase(id, patch) {
  const path = `${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`
  const url = `${API_BASE_URL}${path}`
  try {
    const response = await fetchWithTimeout(
      url,
      apiFetchInit({
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(patch),
      })
    )

    if (response.status === 404) {
      return mockSaveAfterDelay({ ...patch, id }, id)
    }

    if (!response.ok) {
      const detail = await readApiErrorMessage(response)
      const err = new Error(detail)
      err.status = response.status
      err.url = url
      throw err
    }

    return response.json()
  } catch (err) {
    if (err?.status && err.status !== 404) {
      throw err
    }
    return mockSaveAfterDelay({ ...patch, id }, id)
  }
}

export const installCasesApi = {
  /** GET 목록 — 라우트 미배포(404) 등이면 빈 배열 */
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
    return postInstallCase(payload)
  },

  update(id, patch) {
    return patchInstallCase(id, patch)
  },

  remove(id) {
    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
