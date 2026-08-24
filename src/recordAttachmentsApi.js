import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders, getAuthToken } from './apiClient.js'
import { ApiRequestError, readApiErrorMessage } from './apiErrors.js'
import { buildAttachmentsFormData } from './recordFileAttachments.js'

async function requestForm(path, formData) {
  const url = `${API_BASE_URL}${path}`
  let response
  try {
    response = await apiFetch(
      url,
      apiFetchInit({
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      })
    )
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

export function recordAttachmentDownloadUrl(apiBasePath, recordId, fileId) {
  const url = new URL(
    `${API_BASE_URL}${apiBasePath}/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(fileId)}`
  )
  const token = getAuthToken()
  if (token) url.searchParams.set('access_token', token)
  return url.toString()
}

export function saveRecordAttachments(apiBasePath, recordId, items) {
  const formData = buildAttachmentsFormData(items)
  return requestForm(`${apiBasePath}/${encodeURIComponent(recordId)}/attachments`, formData)
}
