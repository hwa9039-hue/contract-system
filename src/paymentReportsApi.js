import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

export const PAYMENT_REPORTS_API_PATH = '/api/payment-reports'

/** 서버에 저장하는 필드 목록 — 화면 상태와 페이로드가 어긋나지 않도록 한 곳에서 관리한다. */
export const PAYMENT_REPORT_FIELDS = [
  'paymentMonth',
  'paymentCycle',
  'classification',
  'projectName',
  'contractAmount',
  'projectPeriod',
  'client',
  'vendorInfo',
  'plannedAmount',
  'progress',
  'projectVolume',
  'expenseContent',
  'vendorDetail',
  'completionAmount',
  'materialCost',
  'currentExpense',
  'profitRate',
]

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeCycle(value) {
  return safeString(value).trim() === '31' ? '31' : '15'
}

export function buildPaymentReportPayload(row) {
  const source = row && typeof row === 'object' ? row : {}
  const sortOrderRaw = Number(source.sortOrder)
  const payload = {
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0,
  }
  PAYMENT_REPORT_FIELDS.forEach((key) => {
    payload[key] = key === 'paymentCycle' ? normalizeCycle(source[key]) : safeString(source[key])
  })
  return payload
}

export function normalizePaymentReportRow(row, seq = 1) {
  const source = row && typeof row === 'object' ? row : {}
  const sortOrderRaw = Number(source.sortOrder)
  const normalized = {
    id: safeString(source.id).trim(),
    seq,
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : seq,
  }
  PAYMENT_REPORT_FIELDS.forEach((key) => {
    normalized[key] = key === 'paymentCycle' ? normalizeCycle(source[key]) : safeString(source[key])
  })
  return normalized
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

export const paymentReportsApi = {
  list() {
    return requestJson(PAYMENT_REPORTS_API_PATH, { method: 'GET' })
  },
  create(row) {
    return requestJson(PAYMENT_REPORTS_API_PATH, {
      method: 'POST',
      body: JSON.stringify(buildPaymentReportPayload(row)),
    })
  },
  update(id, row) {
    return requestJson(`${PAYMENT_REPORTS_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(buildPaymentReportPayload(row)),
    })
  },
  bulkDelete(ids) {
    return requestJson(PAYMENT_REPORTS_API_PATH, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  },
}
