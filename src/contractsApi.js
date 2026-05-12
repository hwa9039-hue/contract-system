import { API_BASE_URL, getAuthHeaders } from './apiClient.js'

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

async function formatResponseError(response) {
  const text = await response.text()
  if (!text) return `Request failed with status ${response.status}`
  try {
    const data = JSON.parse(text)
    const detail = data?.detail
    if (typeof detail === 'string') return detail
    if (detail != null) return JSON.stringify(detail)
  } catch {
    // use raw text
  }
  return text
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(await formatResponseError(response))
  }

  return parseResponseBody(response)
}

/**
 * POST /import first (same as other menus). If /import is missing, POST may return 404/405;
 * if the browser throws before a response (network), fall back to /bulk.
 */
async function postContractRowsBulk(rows) {
  const body = JSON.stringify({ rows })
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  }

  const importUrl = `${API_BASE_URL}/api/contracts/import`
  const bulkUrl = `${API_BASE_URL}/api/contracts/bulk`

  let response
  try {
    response = await fetch(importUrl, {
      method: 'POST',
      headers,
      body,
    })
  } catch {
    response = null
  }

  const useBulk =
    response == null ||
    response.status === 405 ||
    response.status === 404 ||
    response.status >= 500

  if (useBulk) {
    try {
      response = await fetch(bulkUrl, {
        method: 'POST',
        headers,
        body,
      })
    } catch {
      throw new Error('네트워크 오류로 엑셀 업로드를 완료하지 못했습니다.')
    }
  }

  if (!response.ok) {
    throw new Error(await formatResponseError(response))
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
