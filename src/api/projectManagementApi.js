import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from '../apiClient.js'
import { readApiErrorMessage } from '../apiErrors.js'

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

function encodePathId(id) {
  const s = String(id == null ? '' : id).trim()
  if (!s) throw new Error('계약 ID가 비어 있습니다.')
  return encodeURIComponent(s)
}

export const projectManagementApi = {
  list() {
    return requestJson('/api/project-management')
  },

  update(contractId, patch) {
    return requestJson(`/api/project-management/contracts/${encodePathId(contractId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
}
