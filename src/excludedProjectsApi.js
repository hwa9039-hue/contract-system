import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { ApiRequestError, readApiErrorMessage } from './apiErrors.js'
import { sanitizeRegistryImportPayload } from './excelSheetUtils.js'
import { normalizeRegistryImportResponse } from './excelImportResponse.js'

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
    if (err instanceof ApiRequestError) throw err
    throw new ApiRequestError(
      err?.message ? `네트워크 오류: ${err.message}` : '서버에 연결할 수 없습니다.',
      { url, cause: err }
    )
  }

  if (!response.ok) {
    throw new ApiRequestError(await readApiErrorMessage(response), {
      status: response.status,
      url,
    })
  }

  if (response.status === 204) return null
  return response.json()
}

export const excludedProjectsApi = {
  list() {
    return requestJson('/api/excluded-projects')
  },
  create(payload) {
    return requestJson('/api/excluded-projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/excluded-projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/excluded-projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  bulkDelete(ids) {
    return requestJson('/api/excluded-projects/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  removeAll() {
    return requestJson('/api/excluded-projects', {
      method: 'DELETE',
    })
  },
  importRows(rows) {
    const data = sanitizeRegistryImportPayload(rows)
    console.log('Upload Payload:', data)
    console.log('[excel-upload] POST', `${API_BASE_URL}/api/excluded-projects/import`, { rowCount: data.length })
    return requestJson('/api/excluded-projects/import', {
      method: 'POST',
      body: JSON.stringify({ rows: data }),
    }).then(normalizeRegistryImportResponse)
  },
}
