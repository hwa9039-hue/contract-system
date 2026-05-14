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

export const projectDiscoveryApi = {
  list() {
    return requestJson('/api/project-discovery')
  },
  create(payload) {
    return requestJson('/api/project-discovery', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/project-discovery/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/project-discovery/${id}`, {
      method: 'DELETE',
    })
  },
  bulkDelete(ids) {
    return requestJson('/api/project-discovery/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  removeAll() {
    return requestJson('/api/project-discovery', {
      method: 'DELETE',
    })
  },
  importRows(rows) {
    console.log('[excel-upload] POST', `${API_BASE_URL}/api/project-discovery/import`, { rowCount: rows.length })
    return requestJson('/api/project-discovery/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    })
  },
}
