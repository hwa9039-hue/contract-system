import { API_BASE_URL, getAuthHeaders, apiFetchInit } from '../apiClient.js'
import { readApiErrorMessage } from '../apiErrors.js'

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
    throw new Error(await readApiErrorMessage(response))
  }

  return parseResponseBody(response)
}

function encodePathId(id) {
  const s = String(id == null ? '' : id).trim()
  if (!s) throw new Error('id가 비어 있습니다.')
  return encodeURIComponent(s)
}

/** 단가관리 — 계약(Parent) + contract_unit_price_items(Child) nested API */
export const unitPricesApi = {
  /** GET /api/unit-prices?contractType= — { id, year, client, projectName, …, items: [] }[] */
  listTree(contractType) {
    const qs =
      contractType != null && String(contractType).trim() !== ''
        ? `?contractType=${encodeURIComponent(String(contractType).trim())}`
        : ''
    return requestJson(`/api/unit-prices${qs}`)
  },

  /** POST /api/unit-prices/contracts/{contractId}/items */
  createItem(contractId, payload) {
    return requestJson(`/api/unit-prices/contracts/${encodePathId(contractId)}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /** PATCH /api/unit-prices/items/{itemId} */
  updateItem(itemId, patch) {
    return requestJson(`/api/unit-prices/items/${encodePathId(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  /** DELETE /api/unit-prices/items/{itemId} */
  removeItem(itemId) {
    return requestJson(`/api/unit-prices/items/${encodePathId(itemId)}`, {
      method: 'DELETE',
    })
  },
}
