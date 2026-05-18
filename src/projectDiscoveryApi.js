import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

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
    return requestJson(`/api/project-discovery/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/project-discovery/${encodeURIComponent(id)}`, {
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
