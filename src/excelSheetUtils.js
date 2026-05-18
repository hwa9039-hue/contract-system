import * as XLSX from 'xlsx'

function normalizeExcelHeaderKey(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function rowMatchesHeaderKeywords(row, headerKeywords) {
  const cells = (row || [])
    .map((cell) => normalizeExcelHeaderKey(cell))
    .filter(Boolean)
  if (!cells.length) return 0

  const normalizedKeywords = headerKeywords
    .map((kw) => normalizeExcelHeaderKey(kw))
    .filter(Boolean)

  if (!normalizedKeywords.length) return 0

  let score = 0
  for (const keyword of normalizedKeywords) {
    if (
      cells.some(
        (cell) => cell === keyword || cell.includes(keyword) || keyword.includes(cell)
      )
    ) {
      score += 1
    }
  }
  return score
}

/**
 * 2차원 배열에서 실제 헤더 행(0-based)을 찾는다.
 * @param {unknown[][]} rawData
 * @param {string[]} headerKeywords
 * @param {number} maxScanRows
 */
export function detectExcelHeaderRowIndexFromAoA(rawData, headerKeywords, maxScanRows = 30) {
  if (!Array.isArray(rawData) || !rawData.length || !headerKeywords?.length) return 0

  const normalizedKeywords = headerKeywords
    .map((kw) => normalizeExcelHeaderKey(kw))
    .filter(Boolean)
  if (!normalizedKeywords.length) return 0

  const scanEnd = Math.min(rawData.length, maxScanRows)
  let bestRow = 0
  let bestScore = 0

  for (let r = 0; r < scanEnd; r += 1) {
    const score = rowMatchesHeaderKeywords(rawData[r], headerKeywords)
    if (score > bestScore) {
      bestScore = score
      bestRow = r
    }

    const minHits = normalizedKeywords.length >= 4 ? 2 : 1
    if (score >= minHits) return r
  }

  return bestScore > 0 ? bestRow : 0
}

function isEmptyDataRow(row) {
  if (!Array.isArray(row) || !row.length) return true
  return row.every((cell) => {
    if (cell === null || cell === undefined) return true
    return String(cell).trim() === ''
  })
}

function buildHeaderKeys(headerRow) {
  const used = new Map()
  return (headerRow || []).map((cell, index) => {
    const base = String(cell ?? '').trim() || `__EMPTY_${index}`
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

/**
 * sheet_to_json(header:1) → 헤더 행 탐지 → 객체 배열 수동 변환
 * @param {import('xlsx').WorkSheet} worksheet
 * @param {string[]} headerKeywords
 */
export function sheetToJsonWithSmartHeader(worksheet, headerKeywords) {
  const raw_data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  })

  console.log(raw_data)

  if (!Array.isArray(raw_data) || !raw_data.length) {
    return { rows: [], headerRowIndex: 0, raw_data: [] }
  }

  const headerRowIndex = detectExcelHeaderRowIndexFromAoA(raw_data, headerKeywords)
  const headerRow = raw_data[headerRowIndex]
  if (!Array.isArray(headerRow)) {
    return { rows: [], headerRowIndex, raw_data }
  }

  const headerKeys = buildHeaderKeys(headerRow)
  const rows = []

  for (let r = headerRowIndex + 1; r < raw_data.length; r += 1) {
    const dataRow = raw_data[r]
    if (!Array.isArray(dataRow) || isEmptyDataRow(dataRow)) continue

    const rowObject = {}
    headerKeys.forEach((key, columnIndex) => {
      rowObject[key] = dataRow[columnIndex] ?? ''
    })
    rows.push(rowObject)
  }

  return { rows, headerRowIndex, raw_data }
}

/** @deprecated AoA 기반 detectExcelHeaderRowIndexFromAoA 사용 */
export function detectExcelHeaderRowIndex(worksheet, headerKeywords, maxScanRows = 30) {
  const raw_data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  })
  return detectExcelHeaderRowIndexFromAoA(raw_data, headerKeywords, maxScanRows)
}

export const CONTRACT_EXCEL_HEADER_KEYWORDS = [
  '사업년도',
  '계약일자',
  '계약번호',
  '참고번호',
  '발주처',
  '사업명',
  '계약금액',
  '준공일자',
  '계약분류',
  '영업담당자',
]
