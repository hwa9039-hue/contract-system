/** 계약현황 테이블 헤더 다중 필터 — 공통 로직 */

export const CONTRACT_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'year',
  'refNo',
  'client',
  'department',
  'contractMethod',
  'contractType',
  'identNo',
  'contractDate',
  'dueDate',
  'projectName',
  'amount',
  'salesOwner',
  'pm',
  'note',
])

export const CONTRACT_COLUMN_FILTER_BLANK = '(비어 있음)'

const HIDDEN_CONTRACT_FILTER_VALUES = Object.freeze(['전유찬', '전유찬 대리'])

const NUMERIC_SORT_COLUMN_KEYS = new Set(['year', 'amount'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function getYearLabel(value) {
  const s = safeString(value).trim()
  if (!s) return ''
  const match = s.match(/\d{4}/)
  return match ? match[0] : s
}

function formatAmountForFilter(value) {
  const raw = safeString(value).replace(/[^\d]/g, '')
  if (!raw) return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return safeString(value).trim()
  return n.toLocaleString('ko-KR')
}

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareNumericColumnValues(a, b, columnKey) {
  if (columnKey === 'year') {
    const ya = Number(getYearLabel(a)) || 0
    const yb = Number(getYearLabel(b)) || 0
    if (ya !== yb) return yb - ya
    return compareKoreanText(a, b)
  }
  if (columnKey === 'amount') {
    const na = Number(safeString(a).replace(/[^\d]/g, '')) || 0
    const nb = Number(safeString(b).replace(/[^\d]/g, '')) || 0
    if (na !== nb) return nb - na
    return compareKoreanText(a, b)
  }
  return compareKoreanText(a, b)
}

/** 행·컬럼 → 필터 비교용 표시값 (테이블 셀 표시와 동일 기준) */
export function getContractColumnFilterCellValue(item, columnKey) {
  const row = item && typeof item === 'object' ? item : {}

  if (columnKey === 'year') {
    const label = getYearLabel(row.year)
    return label || CONTRACT_COLUMN_FILTER_BLANK
  }

  if (columnKey === 'amount') {
    const displayed = formatAmountForFilter(row.amount)
    return displayed || CONTRACT_COLUMN_FILTER_BLANK
  }

  const raw = safeString(row[columnKey]).trim()
  return raw || CONTRACT_COLUMN_FILTER_BLANK
}

export function buildContractColumnFilterOptions(items, columnKey) {
  const list = Array.isArray(items) ? items : []
  const values = new Set()

  list.forEach((item) => {
    const cell = getContractColumnFilterCellValue(item, columnKey)
    if (cell === CONTRACT_COLUMN_FILTER_BLANK) return
    if (HIDDEN_CONTRACT_FILTER_VALUES.includes(cell)) return
    values.add(cell)
  })

  let sorted = [...values]
  if (NUMERIC_SORT_COLUMN_KEYS.has(columnKey)) {
    sorted.sort((a, b) => compareNumericColumnValues(a, b, columnKey))
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = list.some(
    (item) => getContractColumnFilterCellValue(item, columnKey) === CONTRACT_COLUMN_FILTER_BLANK
  )
  if (hasBlank) sorted = [CONTRACT_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function contractMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  const activeKeys = Object.keys(columnFilters).filter((key) => {
    if (excludeKey && key === excludeKey) return false
    const selected = columnFilters[key]
    return Array.isArray(selected) && selected.length > 0
  })

  for (const key of activeKeys) {
    const selected = columnFilters[key]
    const cellValue = getContractColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }

  return true
}

export function contractMatchesSearch(item, search) {
  const q = safeString(search).trim().toLowerCase()
  if (!q) return true

  const row = item && typeof item === 'object' ? item : {}
  const text = CONTRACT_FILTERABLE_COLUMN_KEYS.map((key) =>
    getContractColumnFilterCellValue(row, key)
  )
    .concat([
      row?.segment,
      row?.contractNo,
    ])
    .join(' ')
    .toLowerCase()

  return text.includes(q)
}

export function normalizeContractColumnFilterSelection(selected, options) {
  if (!Array.isArray(selected) || selected.length === 0) return []
  if (!Array.isArray(options) || options.length === 0) return selected
  if (selected.length >= options.length && options.every((option) => selected.includes(option))) {
    return []
  }
  return selected
}

export function hasActiveContractColumnFilters(columnFilters) {
  if (!columnFilters || typeof columnFilters !== 'object') return false
  return Object.keys(columnFilters).some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0
  )
}
