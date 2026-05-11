import { API_BASE_URL, getAuthHeaders } from './apiClient.js'

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
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
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
    return requestJson('/api/contracts/bulk', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    })
  },
  update(id, patch) {
    return requestJson(`/api/contracts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/contracts/${id}`, {
      method: 'DELETE',
    })
  },
}
