import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

/** GET list · POST create 공통 경로 (fetchContactsManageRows 와 동일) */
export const CONTACTS_MANAGE_API_PATH = '/api/contacts-manage'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** POST body — GET 응답 키(category, business_content, …)와 100% 동일 */
export function buildContactsManageCreatePayload(form) {
  const source = form && typeof form === 'object' ? form : {}
  return {
    category: safeString(source.category).trim(),
    business_content: safeString(source.business_content).trim(),
    manager_name: safeString(source.manager_name).trim(),
    position: safeString(source.position).trim(),
    phone: safeString(source.phone).trim(),
    email: safeString(source.email).trim(),
    notes: safeString(source.notes).trim(),
  }
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const { headers: optHeaders, ...rest } = options
  let response
  try {
    response = await apiFetch(url, apiFetchInit({
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
    const message = await readApiErrorMessage(response)
    const error = new Error(message)
    error.status = response.status
    error.response = { status: response.status }
    throw error
  }

  if (response.status === 204) return null
  return response.json()
}

export const contactsManageApi = {
  list() {
    return requestJson(CONTACTS_MANAGE_API_PATH, { method: 'GET' })
  },
  create(formOrPayload) {
    const payload = buildContactsManageCreatePayload(formOrPayload)
    return requestJson(CONTACTS_MANAGE_API_PATH, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  bulkDelete(ids) {
    return requestJson(CONTACTS_MANAGE_API_PATH, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  },
}
