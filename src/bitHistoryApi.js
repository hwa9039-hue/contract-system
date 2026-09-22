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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

/** 계약현황에서 그대로 꽂는 기본 정보 — 화면에서 읽기 전용 */
export const BIT_FROM_CONTRACT_KEYS = [
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
]

/** BIT 이력관리에만 있는 추가 필드 — contract_id 로 별도 저장 */
export const BIT_EXTRA_KEYS = [
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

const BIT_TEXT_KEYS = ['contractId', ...BIT_FROM_CONTRACT_KEYS, ...BIT_EXTRA_KEYS]

export function isManualBitRow(row) {
  return !normalizeBitContractId(row?.contractId)
}

export function isPersistedBitId(id) {
  return UUID_RE.test(safeString(id).trim())
}

export function normalizeBitContractId(value) {
  const text = safeString(value).trim()
  if (text.startsWith('contract-')) return text.slice('contract-'.length)
  return text
}

function formatAmountFromContract(value) {
  const raw = safeString(value).replace(/[^\d]/g, '')
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

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

/** 계약현황 기본 정보는 빼고, BIT 추가 필드 + contractId 만 보낸다. */
export function buildBitExtrasPayload(form) {
  const source = form && typeof form === 'object' ? form : {}
  const payload = {
    contractId: normalizeBitContractId(source.contractId || source.id),
  }
  for (const key of BIT_EXTRA_KEYS) {
    payload[key] = safeString(source[key]).trim()
  }
  return payload
}

export function normalizeBitHistoryRow(row, sortOrderFallback = 0) {
  const sourceRow = row && typeof row === 'object' ? row : {}
  const sortOrderRaw = Number(sourceRow.sortOrder)
  const contractId = normalizeBitContractId(sourceRow.contractId)
  const rawId = safeString(sourceRow.id).trim()
  const extraId = isPersistedBitId(sourceRow.extraId)
    ? safeString(sourceRow.extraId).trim()
    : isPersistedBitId(rawId)
      ? rawId
      : ''
  const normalized = {
    id: contractId || rawId,
    extraId,
    sortOrder: Number.isFinite(sortOrderRaw) ? sortOrderRaw : sortOrderFallback,
    createdAt: safeString(sourceRow.createdAt ?? sourceRow.created_at),
    updatedAt: safeString(sourceRow.updatedAt ?? sourceRow.updated_at),
  }
  for (const key of BIT_TEXT_KEYS) {
    normalized[key] = safeString(sourceRow[key])
  }
  if (contractId) normalized.contractId = contractId
  return normalized
}

function extraRowId(extra) {
  if (isPersistedBitId(extra?.extraId)) return safeString(extra.extraId).trim()
  if (isPersistedBitId(extra?.id)) return safeString(extra.id).trim()
  return ''
}

function lineNoValue(extra, fallback = 1) {
  const raw = Number(safeString(extra?.lineNo).replace(/[^\d]/g, ''))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

function buildLinkedBitRow(contract, extra, seqNo, lineNo) {
  const contractId = safeString(contract.id).trim()
  const extraId = extraRowId(extra)
  const row = {
    id: extraId || `${contractId}#${lineNo}`,
    extraId,
    contractId,
    isManual: false,
    isAddedLine: lineNo > 1,
    sortOrder: seqNo,
    seqNo: safeString(contract.refNo).trim(),
    lineNo: String(lineNo),
    client: safeString(contract.client).trim(),
    department: safeString(contract.department).trim(),
    contractMethod: safeString(contract.contractMethod).trim(),
    contractClass: safeString(contract.contractType).trim(),
    identNo: safeString(contract.identNo).trim(),
    contractDate: safeString(contract.contractDate).trim(),
    dueDate: safeString(contract.dueDate).trim(),
    projectName: safeString(contract.projectName).trim(),
    contractAmount: formatAmountFromContract(contract.amount ?? extra?.contractAmount),
    createdAt: safeString(extra?.createdAt ?? extra?.created_at),
    updatedAt: safeString(extra?.updatedAt ?? extra?.updated_at),
  }
  for (const key of BIT_EXTRA_KEYS) {
    row[key] = safeString(extra?.[key])
  }
  if (!row.quantity) {
    row.quantity = safeString(contract.quantity || contract.signboardQty)
  }
  return row
}

/**
 * 계약현황 BIT 행을 기본 목록으로 만들고, extras 를 contract_id 로 붙인다.
 * 같은 계약에 extras 가 여러 개면 차수(줄)로 펼친다. contractId 없는 행은 수기등록.
 */
export function mergeBitRowsFromContracts(contracts, extras = []) {
  const extrasByContractId = new Map()
  const manualRows = []
  for (const extra of extras || []) {
    const contractId = normalizeBitContractId(extra?.contractId)
    if (!contractId) {
      manualRows.push({
        ...normalizeBitHistoryRow(extra),
        isManual: true,
        contractId: '',
        id: extraRowId(extra) || safeString(extra?.id),
      })
      continue
    }
    if (!extrasByContractId.has(contractId)) extrasByContractId.set(contractId, [])
    extrasByContractId.get(contractId).push(extra)
  }

  const bitContracts = (Array.isArray(contracts) ? contracts : [])
    .filter((contract) => contract && !contract.isDraft)
    .filter((contract) => safeString(contract.id).trim())
    .filter((contract) => isBitContractType(contract.contractType))
    .slice()
    .sort((a, b) => {
      const dateA = safeString(a.contractDate)
      const dateB = safeString(b.contractDate)
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return safeString(a.id).localeCompare(safeString(b.id))
    })

  const usedContractIds = new Set()
  const linkedRows = []
  let seqNo = 1
  for (const contract of bitContracts) {
    const contractId = safeString(contract.id).trim()
    usedContractIds.add(contractId)
    const linked = (extrasByContractId.get(contractId) || [])
      .slice()
      .sort((a, b) => lineNoValue(a) - lineNoValue(b))
    if (linked.length === 0) {
      linkedRows.push(buildLinkedBitRow(contract, {}, seqNo, 1))
      seqNo += 1
      continue
    }
    linked.forEach((extra, index) => {
      linkedRows.push(buildLinkedBitRow(contract, extra, seqNo, lineNoValue(extra, index + 1)))
      seqNo += 1
    })
  }

  for (const extra of extras || []) {
    const contractId = normalizeBitContractId(extra?.contractId)
    if (contractId && !usedContractIds.has(contractId)) {
      manualRows.push({
        ...normalizeBitHistoryRow(extra),
        isManual: true,
        id: extraRowId(extra) || safeString(extra?.id),
      })
    }
  }

  return [...manualRows, ...linkedRows]
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
    const extraId = extraRowId(patch) || id
    const isManual = isManualBitRow(patch)
    const body = isManual
      ? buildBitHistoryPayload(patch)
      : buildBitExtrasPayload({ ...patch, contractId: patch?.contractId })
    return requestJson(`${BIT_HISTORY_API_PATH}/${encodeURIComponent(extraId || id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },
  upsertByContract(contractId, patch) {
    const extraId = extraRowId(patch)
    if (extraId) return bitHistoryApi.update(extraId, { ...patch, contractId })
    const id = normalizeBitContractId(contractId)
    return requestJson(`${BIT_HISTORY_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(buildBitExtrasPayload({ ...patch, contractId: id })),
    })
  },
  bulkDelete(ids) {
    return requestJson(BIT_HISTORY_API_PATH, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  },
}
