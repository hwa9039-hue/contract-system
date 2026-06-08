import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'
import { buildWorkReportWireVariants } from './workReportWire.js'

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

function isRetryableWireWriteError(error) {
  const message = safeString(error?.message)
  return /failed to fetch|networkerror|load failed|500|502|503|504|cloudflare|waf/i.test(message)
}

async function requestJsonWithWireVariants(path, method, payload, options = {}) {
  const variants = options.alreadyWired ? [payload] : buildWorkReportWireVariants(payload)
  let lastError = null

  for (let index = 0; index < variants.length; index += 1) {
    try {
      return await requestJson(path, {
        method,
        body: variants[index],
        ...options,
        alreadyWired: true,
      })
    } catch (error) {
      lastError = error
      if (index < variants.length - 1 && isRetryableWireWriteError(error)) {
        continue
      }
      throw error
    }
  }

  throw lastError || new Error('weekly work report save failed')
}

export const weeklyWorkReportsApi = {
  list() {
    return requestJson('/api/weekly-work-reports')
  },
  create(payload, options = {}) {
    return requestJsonWithWireVariants('/api/weekly-work-reports', 'POST', payload, options)
  },
  update(id, patch, options = {}) {
    return requestJsonWithWireVariants(
      `/api/weekly-work-reports/${encodeURIComponent(String(id))}`,
      'PATCH',
      patch,
      options
    )
  },
  remove(id) {
    return requestJson(`/api/weekly-work-reports/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    })
  },
}
