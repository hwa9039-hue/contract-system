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
    throw new Error(await readApiErrorMessage(response))
  }

  return response.json()
}

export const contactsManageApi = {
  async list() {
    return requestJson('/api/contacts-manage')
  },
}

