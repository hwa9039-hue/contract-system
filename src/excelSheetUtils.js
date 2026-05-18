import * as XLSX from 'xlsx'

function normalizeExcelHeaderKey(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function rowCellsNormalized(worksheet, rowIndex, colStart, colEnd) {
  const cells = []
  for (let c = colStart; c <= colEnd; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c })
    const cell = worksheet[addr]
    if (!cell) continue
    const raw = cell.w ?? cell.v ?? ''
    const text = normalizeExcelHeaderKey(raw)
    if (text) cells.push(text)
  }
  return cells
}

/**
 * 시트 상단 타이틀/빈 행을 건너뛰고 실제 헤더 행(0-based)을 찾는다.
 * @param {import('xlsx').WorkSheet} worksheet
 * @param {string[]} headerKeywords
 * @param {number} maxScanRows
 */
export function detectExcelHeaderRowIndex(worksheet, headerKeywords, maxScanRows = 20) {
  const ref = worksheet?.['!ref']
  if (!ref || !headerKeywords?.length) return 0

  const range = XLSX.utils.decode_range(ref)
  const normalizedKeywords = headerKeywords
    .map((kw) => normalizeExcelHeaderKey(kw))
    .filter(Boolean)

  if (!normalizedKeywords.length) return range.s.r

  const scanEnd = Math.min(range.e.r, range.s.r + maxScanRows)
  let bestRow = range.s.r
  let bestScore = 0

  for (let r = range.s.r; r <= scanEnd; r += 1) {
    const cells = rowCellsNormalized(worksheet, r, range.s.c, range.e.c)
    if (!cells.length) continue

    let score = 0
    for (const keyword of normalizedKeywords) {
      if (cells.some((cell) => cell === keyword || cell.includes(keyword) || keyword.includes(cell))) {
        score += 1
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestRow = r
    }

    const minHits = normalizedKeywords.length >= 4 ? 2 : 1
    if (score >= minHits) return r
  }

  return bestScore > 0 ? bestRow : range.s.r
}

/**
 * @param {import('xlsx').WorkSheet} worksheet
 * @param {string[]} headerKeywords
 */
export function sheetToJsonWithSmartHeader(worksheet, headerKeywords) {
  const headerRowIndex = detectExcelHeaderRowIndex(worksheet, headerKeywords)
  const ref = worksheet?.['!ref']
  if (!ref) {
    return { rows: [], headerRowIndex: 0 }
  }

  const range = XLSX.utils.decode_range(ref)
  range.s.r = headerRowIndex
  const trimmedSheet = { ...worksheet, '!ref': XLSX.utils.encode_range(range) }
  const rows = XLSX.utils.sheet_to_json(trimmedSheet, {
    defval: '',
    raw: true,
  })

  return { rows, headerRowIndex }
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
