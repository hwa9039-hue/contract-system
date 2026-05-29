/** 계약현황 테이블 헤더 다중 필터 — 공통 로직 */

export const CONTRACT_FILTERABLE_COLUMN_KEYS = Object.freeze([
  'year',
  'contractMethod',
  'contractType',
  'salesOwner',
  'pm',
])

export const CONTRACT_COLUMN_FILTER_BLANK = '(비어 있음)'

const HIDDEN_CONTRACT_FILTER_VALUES = Object.freeze(['전유찬', '전유찬 대리'])

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

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

/** 행·컬럼 → 필터 비교용 표시값 */
export function getContractColumnFilterCellValue(item, columnKey) {
  if (columnKey === 'year') {
    const label = getYearLabel(item?.year)
    return label || CONTRACT_COLUMN_FILTER_BLANK
  }
  const raw = safeString(item?.[columnKey]).trim()
  return raw || CONTRACT_COLUMN_FILTER_BLANK
}

export function buildContractColumnFilterOptions(items, columnKey) {
  const values = new Set()
  items.forEach((item) => {
    const cell = getContractColumnFilterCellValue(item, columnKey)
    if (cell === CONTRACT_COLUMN_FILTER_BLANK) return
    if (HIDDEN_CONTRACT_FILTER_VALUES.includes(cell)) return
    values.add(cell)
  })

  let sorted = [...values]
  if (columnKey === 'year') {
    sorted.sort((a, b) => {
      const ya = Number(a) || 0
      const yb = Number(b) || 0
      if (ya !== yb) return yb - ya
      return compareKoreanText(a, b)
    })
  } else {
    sorted.sort(compareKoreanText)
  }

  const hasBlank = items.some((item) => getContractColumnFilterCellValue(item, columnKey) === CONTRACT_COLUMN_FILTER_BLANK)
  if (hasBlank) sorted = [CONTRACT_COLUMN_FILTER_BLANK, ...sorted]
  return sorted
}

export function contractMatchesColumnFilters(item, columnFilters, excludeKey = null) {
  if (!columnFilters || typeof columnFilters !== 'object') return true

  for (const key of CONTRACT_FILTERABLE_COLUMN_KEYS) {
    if (excludeKey && key === excludeKey) continue
    const selected = columnFilters[key]
    if (!Array.isArray(selected) || selected.length === 0) continue
    const cellValue = getContractColumnFilterCellValue(item, key)
    if (!selected.includes(cellValue)) return false
  }
  return true
}

export function contractMatchesSearch(item, search) {
  const q = safeString(search).trim().toLowerCase()
  if (!q) return true

  const text = [
    item?.year,
    item?.segment,
    item?.refNo,
    item?.contractNo,
    item?.client,
    item?.department,
    item?.contractMethod,
    item?.contractType,
    item?.contractDate,
    item?.dueDate,
    item?.projectName,
    item?.amount,
    item?.salesOwner,
    item?.pm,
    item?.note,
  ]
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
  return CONTRACT_FILTERABLE_COLUMN_KEYS.some(
    (key) => Array.isArray(columnFilters[key]) && columnFilters[key].length > 0
  )
}
