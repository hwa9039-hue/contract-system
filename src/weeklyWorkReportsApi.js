import { API_BASE_URL, apiFetchInit, getAuthHeaders, setAuthToken } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'
import { toWeeklyWorkReportWirePayload } from './workReportWire.js'

async function tryRefreshAccessToken() {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/auth/refresh`,
      apiFetchInit({
        method: 'POST',
        headers: { ...getAuthHeaders() },
      })
    )
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    if (data?.access_token) {
      setAuthToken(data.access_token, { persistent: true })
      return true
    }
    return Boolean(data?.auth_disabled)
  } catch {
    return false
  }
}

async function requestJson(path, options = {}, attempt = 0) {
  const { headers: optHeaders, body: rawBody, ...rest } = options
  let body = rawBody
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(
      `${API_BASE_URL}${path}`,
      apiFetchInit({
        ...rest,
        body,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...(optHeaders || {}),
        },
      })
    )
  } catch (error) {
    if (attempt < 1 && /failed to fetch|networkerror|load failed/i.test(safeString(error?.message))) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      return requestJson(path, options, attempt + 1)
    }
    throw error
  }

  if (response.status === 401 && attempt < 1) {
    const refreshed = await tryRefreshAccessToken()
    if (refreshed) {
      return requestJson(path, options, attempt + 1)
    }
  }

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response))
  }

  if (response.status === 204) return null
  return response.json()
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function wireWritePayload(payload) {
  return toWeeklyWorkReportWirePayload(payload)
}

export const weeklyWorkReportsApi = {
  list() {
    return requestJson('/api/weekly-work-reports')
  },
  create(payload) {
    return requestJson('/api/weekly-work-reports', {
      method: 'POST',
      body: wireWritePayload(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/weekly-work-reports/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: wireWritePayload(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/weekly-work-reports/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    })
  },
}
