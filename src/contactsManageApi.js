import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

async function requestJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, apiFetchInit({
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  }))

  if (!response.ok) {
    const message = await readApiErrorMessage(response)
    const error = new Error(message)
    error.status = response.status
    error.response = { status: response.status }
    throw error
  }

  return response.json()
}

export const contactsManageApi = {
  async list() {
    return requestJson('/api/contacts-manage')
  },
}

