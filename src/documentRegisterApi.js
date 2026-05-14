import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'

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
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const documentRegisterApi = {
  list() {
    return requestJson('/api/document-register')
  },
  create(payload) {
    return requestJson('/api/document-register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/document-register/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/document-register/${id}`, {
      method: 'DELETE',
    })
  },
  bulkDelete(ids) {
    return requestJson('/api/document-register/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  removeAll() {
    return requestJson('/api/document-register', {
      method: 'DELETE',
    })
  },
  importRows(rows) {
    console.log('[excel-upload] POST', `${API_BASE_URL}/api/document-register/import`, { rowCount: rows.length })
    return requestJson('/api/document-register/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    })
  },
}
