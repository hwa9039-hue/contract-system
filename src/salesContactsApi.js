import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

export const SALES_CONTACTS_API_PATH = '/api/sales-contacts'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeStatus(value) {
  const raw = safeString(value).trim().toLowerCase()
  if (
    raw === 'inactive' ||
    raw === '비활성' ||
    raw === '비활성화' ||
    raw === 'disabled' ||
    raw === 'n' ||
    raw === '0'
  ) {
    return 'inactive'
  }
  return 'active'
}

export function buildSalesContactPayload(form) {
  const source = form && typeof form === 'object' ? form : {}
  const sortOrderRaw = Number(source.sortOrder)
  return {
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0,
    managerName: safeString(source.managerName).trim(),
    position: safeString(source.position).trim(),
    phone: safeString(source.phone).trim(),
    email: safeString(source.email).trim(),
    division: safeString(source.division).trim(),
    companyName: safeString(source.companyName).trim(),
    department: safeString(source.department).trim(),
    review: safeString(source.review).trim(),
    status: normalizeStatus(source.status),
    linkedProject: safeString(source.linkedProject).trim(),
    address: safeString(source.address).trim(),
    notes: safeString(source.notes).trim(),
  }
}

export function normalizeSalesContactRow(row, seq = 1) {
  const source = row && typeof row === 'object' ? row : {}
  const sortOrderRaw = Number(source.sortOrder)
  return {
    id: safeString(source.id).trim(),
    seq,
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : seq,
    managerName: safeString(source.managerName),
    position: safeString(source.position),
    phone: safeString(source.phone),
    email: safeString(source.email),
    division: safeString(source.division),
    companyName: safeString(source.companyName),
    department: safeString(source.department),
    review: safeString(source.review),
    status: normalizeStatus(source.status),
    linkedProject: safeString(source.linkedProject),
    address: safeString(source.address),
    notes: safeString(source.notes),
  }
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const { headers: optHeaders, ...rest } = options
  let response
  try {
    response = await apiFetch(
      url,
      apiFetchInit({
        ...rest,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...(optHeaders || {}),
        },
      })
    )
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

export const salesContactsApi = {
  list() {
    return requestJson(SALES_CONTACTS_API_PATH, { method: 'GET' })
  },
  create(formOrPayload) {
    const payload = buildSalesContactPayload(formOrPayload)
    return requestJson(SALES_CONTACTS_API_PATH, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`${SALES_CONTACTS_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(buildSalesContactPayload(patch)),
    })
  },
  bulkDelete(ids) {
    return requestJson(SALES_CONTACTS_API_PATH, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  },
}
