import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

export const BIT_HISTORY_API_PATH = '/api/bit-history'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 계약현황에서 BIT로 분류되는 계약분류 값 — UNSPSC 코드(물품분류번호) */
export const BIT_CONTRACT_TYPE_CODES = ['43211514', '43211507', '43211902']

const DISPLAY_CONTRACT_TYPE_HINTS = ['55121903', '전광판', '디스플레이']

/**
 * 계약현황의 계약분류(contractType)가 BIT 인지 판정.
 * 엑셀·수기 입력이 섞여 코드와 'BIT' 라벨이 함께 쓰이므로 둘 다 받고,
 * 전광판 계약은 대시보드 분류와 동일하게 BIT 에서 제외한다.
 */
export function isBitContractType(value) {
  const compact = safeString(value).replace(/[\s,]+/g, '')
  if (!compact) return false
  if (DISPLAY_CONTRACT_TYPE_HINTS.some((hint) => compact.includes(hint))) return false
  if (compact.toUpperCase().includes('BIT')) return true
  return BIT_CONTRACT_TYPE_CODES.some((code) => compact.includes(code))
}

const BIT_TEXT_KEYS = [
  'contractId',
  'seqNo',
  'client',
  'department',
  'contractMethod',
  'contractClass',
  'identNo',
  'contractDate',
  'dueDate',
  'projectName',
  'contractAmount',
  'quantity',
  'boardApplied',
  'programItem',
  'manufacturing',
  'shippingInspection',
  'note1',
  'moduleItem',
  'moduleArray',
  'moduleKind',
  'etcItem',
  'projectComplete',
  'defect',
  'note2',
]

export function buildBitHistoryPayload(form) {
  const source = form && typeof form === 'object' ? form : {}
  const sortOrderRaw = Number(source.sortOrder)
  const payload = {
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : 0,
  }
  for (const key of BIT_TEXT_KEYS) {
    payload[key] = safeString(source[key]).trim()
  }
  return payload
}

export function normalizeBitHistoryRow(row, sortOrderFallback = 0) {
  const source = row && typeof row === 'object' ? row : {}
  const sortOrderRaw = Number(source.sortOrder)
  const normalized = {
    id: safeString(source.id).trim(),
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : sortOrderFallback,
    createdAt: safeString(source.createdAt ?? source.created_at),
    updatedAt: safeString(source.updatedAt ?? source.updated_at),
  }
  for (const key of BIT_TEXT_KEYS) {
    normalized[key] = safeString(source[key])
  }
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

export const bitHistoryApi = {
  list() {
    return requestJson(BIT_HISTORY_API_PATH, { method: 'GET' })
  },
  create(formOrPayload) {
    return requestJson(BIT_HISTORY_API_PATH, {
      method: 'POST',
      body: JSON.stringify(buildBitHistoryPayload(formOrPayload)),
    })
  },
  update(id, patch) {
    return requestJson(`${BIT_HISTORY_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(buildBitHistoryPayload(patch)),
    })
  },
  bulkDelete(ids) {
    return requestJson(BIT_HISTORY_API_PATH, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  },
}
