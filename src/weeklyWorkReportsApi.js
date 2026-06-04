import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'
import { toWeeklyWorkReportWirePayload } from './workReportWire.js'

async function requestJson(path, options = {}, attempt = 0) {
  const { headers: optHeaders, body: rawBody, ...rest } = options
  let body = rawBody
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    body = JSON.stringify(body)
  }

  let response
  try {
    response = await apiFetch(
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
  create(payload, options = {}) {
    return requestJson('/api/weekly-work-reports', {
      method: 'POST',
      body: options.alreadyWired ? payload : wireWritePayload(payload),
    })
  },
  update(id, patch, options = {}) {
    return requestJson(`/api/weekly-work-reports/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: options.alreadyWired ? patch : wireWritePayload(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/weekly-work-reports/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    })
  },
}
