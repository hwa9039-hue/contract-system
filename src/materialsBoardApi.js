import { API_BASE_URL, apiFetchInit, getAuthHeaders } from './apiClient.js'

export const MATERIALS_BOARD_API_PATH = '/api/materials-board'

function buildFormData({ title, content, files = [] }) {
  const form = new FormData()
  form.append('title', title)
  form.append('content', content || '')
  for (const entry of files) {
    const file = entry?.file
    if (file instanceof File) {
      form.append('files', file, file.name)
    }
  }
  return form
}

async function requestForm(path, { method = 'POST', formData } = {}) {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    apiFetchInit({
      method,
      headers: {
        ...getAuthHeaders(),
      },
      body: formData,
    })
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

async function requestJson(path, options = {}) {
  const { headers: optHeaders, ...rest } = options
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    apiFetchInit({
      ...rest,
      headers: {
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    })
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export function materialsBoardFileUrl(postId, fileId) {
  return `${API_BASE_URL}${MATERIALS_BOARD_API_PATH}/${encodeURIComponent(postId)}/files/${encodeURIComponent(fileId)}`
}

export async function downloadMaterialsBoardFile(postId, fileId, fileName) {
  const response = await fetch(materialsBoardFileUrl(postId, fileId), apiFetchInit({
    headers: {
      ...getAuthHeaders(),
    },
  }))

  if (!response.ok) {
    throw new Error(`다운로드 실패 (${response.status})`)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'download'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export const materialsBoardApi = {
  list() {
    return requestJson(MATERIALS_BOARD_API_PATH, {
      headers: { 'Content-Type': 'application/json' },
    }).then((data) => (Array.isArray(data) ? data : []))
  },

  create({ title, content, files }) {
    return requestForm(MATERIALS_BOARD_API_PATH, {
      method: 'POST',
      formData: buildFormData({ title, content, files }),
    })
  },

  update(id, { title, content, files }) {
    return requestForm(`${MATERIALS_BOARD_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      formData: buildFormData({ title, content, files }),
    })
  },

  remove(id) {
    return requestJson(`${MATERIALS_BOARD_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  downloadFile: downloadMaterialsBoardFile,
}
