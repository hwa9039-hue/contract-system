import { API_BASE_URL, getAuthHeaders } from './apiClient.js'

async function parseResponseBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return parseResponseBody(response)
}

/**
 * POST /import first (same as other menus). If the server has no /import route,
 * the segment "import" may match PATCH /{contract_id} and POST returns 405 — then retry /bulk.
 */
async function postContractRowsBulk(rows) {
  const body = JSON.stringify({ rows })
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  }

  let response = await fetch(`${API_BASE_URL}/api/contracts/import`, {
    method: 'POST',
    headers,
    body,
  })

  if (response.status === 405) {
    response = await fetch(`${API_BASE_URL}/api/contracts/bulk`, {
      method: 'POST',
      headers,
      body,
    })
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return parseResponseBody(response)
}

export const contractsApi = {
  list() {
    return requestJson('/api/contracts')
  },
  create(payload) {
    return requestJson('/api/contracts', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  bulkCreate(rows) {
    return postContractRowsBulk(rows)
  },
  update(id, patch) {
    return requestJson(`/api/contracts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  remove(id) {
    return requestJson(`/api/contracts/${id}`, {
      method: 'DELETE',
    })
  },
}
