import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

/** PATCH/DELETE 경로 세그먼트 (계약번호·UUID 등 특수문자 안전) */
function encodeContractPathId(id) {
  const s = String(id == null ? '' : id).trim()
  if (!s) {
    throw new Error('계약 id가 비어 있습니다.')
  }
  return encodeURIComponent(s)
}

async function parseResponseBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function requestJson(path, options = {}) {
  const { headers: optHeaders, ...rest } = options
  const response = await fetch(`${API_BASE_URL}${path}`, apiFetchInit({
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(optHeaders || {}),
    },
  }))

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response))
  }

  return parseResponseBody(response)
}

/**
 * POST /import first (same as other menus). If /import is missing, POST may return 404/405;
 * if the browser throws before a response (network), fall back to /bulk.
 */
async function postContractRowsBulk(rows) {
  const importUrl = `${API_BASE_URL}/api/contracts/import`
  const bulkUrl = `${API_BASE_URL}/api/contracts/bulk`
  const body = JSON.stringify({ rows })
  const postInit = apiFetchInit({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body,
  })

  let response
  let networkError = null
  try {
    response = await fetch(importUrl, postInit)
  } catch (err) {
    networkError = err
    response = null
  }

  const useBulk =
    response == null ||
    response.status === 405 ||
    response.status === 404 ||
    response.status >= 500

  if (useBulk) {
    try {
      response = await fetch(bulkUrl, postInit)
      networkError = null
    } catch (err) {
      networkError = err
      response = null
    }
  }

  if (response == null) {
    const hint = networkError?.message ? `\n(${networkError.message})` : ''
    throw new Error(
      `서버에 연결할 수 없습니다. API 주소(${API_BASE_URL})와 네트워크 연결을 확인하세요.${hint}`
    )
  }

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response))
  }

  return parseResponseBody(response)
}

export const contractsApi = {
  list() {
    return requestJson('/api/contracts')
  },
  create(payload) {
    return requestJson('/api/contracts', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  bulkCreate(rows) {
    return postContractRowsBulk(rows)
  },
  update(id, patch) {
    const pathId = encodeContractPathId(id)
    return requestJson(`/api/contracts/${pathId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    const pathId = encodeContractPathId(id)
    return requestJson(`/api/contracts/${pathId}`, {
      method: 'DELETE',
    })
  },
  bulkRemove(ids) {
    const clean = (Array.isArray(ids) ? ids : [])
      .map((x) => (x === null || x === undefined ? '' : String(x).trim()))
      .filter((s) => s !== '')
    return requestJson('/api/contracts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: clean }),
    })
  },
}
