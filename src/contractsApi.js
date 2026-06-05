import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
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
  const response = await apiFetch(`${API_BASE_URL}${path}`, apiFetchInit({
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

/** 계약 엑셀 일괄 등록 — 중복 검사 없이 모든 행을 /bulk 로 추가 */
async function postContractRowsBulk(rows) {
  const response = await apiFetch(`${API_BASE_URL}/api/contracts/bulk`, apiFetchInit({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ rows }),
  }))

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response))
  }

  const data = await parseResponseBody(response)
  const created = typeof data?.created === 'number' ? data.created : 0
  return { created }
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
