import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'
import { normalizeRegistryImportResponse } from './excelImportResponse.js'

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
    throw new Error(`서버에 연결할 수 없습니다. (${url}) ${err?.message || err}`)
  }

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response))
  }

  if (response.status === 204) return null
  return response.json()
}

export const salesRegisterApi = {
  list() {
    return requestJson('/api/sales-register')
  },
  create(payload) {
    return requestJson('/api/sales-register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/sales-register/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  /** 영업관리대장 세부내용( detail ) 히스토리 전용 갱신 */
  updateDetail(id, detail) {
    const rowId = String(id ?? '').trim()
    if (!rowId) {
      return Promise.reject(new Error('유효하지 않은 행 ID'))
    }
    const detailValue = detail == null ? '' : String(detail)
    const path = `/api/sales-register/${encodeURIComponent(rowId)}`
    return requestJson(path, {
      method: 'PATCH',
      body: JSON.stringify({ detail: detailValue }),
    })
  },
  remove(id) {
    return requestJson(`/api/sales-register/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  bulkDelete(ids) {
    return requestJson('/api/sales-register/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  removeAll() {
    return requestJson('/api/sales-register', {
      method: 'DELETE',
    })
  },
  importRows(rows) {
    console.log('[excel-upload] POST', `${API_BASE_URL}/api/sales-register/import`, { rowCount: rows.length })
    return requestJson('/api/sales-register/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }).then(normalizeRegistryImportResponse)
  },
}
