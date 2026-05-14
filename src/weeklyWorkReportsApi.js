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

export const weeklyWorkReportsApi = {
  list() {
    return requestJson('/api/weekly-work-reports')
  },
  create(payload) {
    return requestJson('/api/weekly-work-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/weekly-work-reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/weekly-work-reports/${id}`, {
      method: 'DELETE',
    })
  },
}
