import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'

async function requestJson(path, options = {}) {
  const { headers: optHeaders, ...rest } = options
  const response = await fetch(`${API_BASE_URL}${path}`, apiFetchInit({
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(optHeaders || {}),
    },
  }))

  if (!response.ok) {
    const message = await response.text()
    if (response.status === 404 && path.includes('/api/install-cases')) {
      throw new Error(
        '설치사례 API(/api/install-cases)가 서버에 없습니다. 백엔드 Docker 이미지를 최신 코드로 다시 빌드·재시작한 뒤 시도해 주세요. ' +
          (message || '')
      )
    }
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export const installCasesApi = {
  list() {
    return requestJson('/api/install-cases')
  },
  create(payload) {
    return requestJson('/api/install-cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/install-cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/install-cases/${id}`, {
      method: 'DELETE',
    })
  },
}
