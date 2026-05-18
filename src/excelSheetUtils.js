import * as XLSX from 'xlsx'

/** 셀 매칭용: 공백·줄바꿈·NBSP·제로폭 문자 전부 제거 */
function stripCellForMatch(cell) {
  return String(cell ?? '')
    .replace(/[\s\u200b\u00a0\u2028\u2029\ufeff]+/g, '')
}

function normalizeExcelHeaderKey(text) {
  return stripCellForMatch(text)
    .replace(/\(.*?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function rowContainsText(row, markers) {
  if (!Array.isArray(row)) return false
  return row.some((cell) => {
    const compact = stripCellForMatch(cell)
    if (!compact) return false
    return markers.some((marker) => {
      const compactMarker = stripCellForMatch(marker)
      if (!compactMarker) return false
      return (
        compact.includes(compactMarker) ||
        normalizeExcelHeaderKey(cell).includes(normalizeExcelHeaderKey(marker))
      )
    })
  })
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
  return row.every((cell) => stripCellForMatch(cell) === '')
}

function isEmptyParsedRow(rowObject) {
  if (!rowObject || typeof rowObject !== 'object') return true
  return !Object.values(rowObject).some((value) => stripCellForMatch(value) !== '')
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

function isDateLikeHeader(headerKey) {
  const norm = normalizeExcelHeaderKey(headerKey)
  return (
    norm.includes('일자') ||
    norm.includes('날짜') ||
    norm.includes('허가일') ||
    norm.includes('건축정보일자')
  )
}

/** 엑셀 시리얼·문자열 → YYYY-MM-DD */
export function excelCellToYmd(value) {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed?.y) {
      const yyyy = String(parsed.y)
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
  }

  const str = String(value).trim()
  if (!str) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) return str.replaceAll('.', '-')
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replaceAll('/', '-')

  const numeric = Number(str)
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 60000) {
    const parsed = XLSX.SSF.parse_date_code(numeric)
    if (parsed?.y) {
      const yyyy = String(parsed.y)
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
  }

  const date = new Date(str)
  if (!Number.isNaN(date.getTime())) {
    const yyyy = String(date.getFullYear())
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return str
}

function aoaToObjectRows(rawData, headerRowIndex, { convertDateHeaders = false } = {}) {
  const headerRow = rawData[headerRowIndex]
  if (!Array.isArray(headerRow)) {
    return []
  }

  const headers = buildHeaderKeys(headerRow)
  const parsedData = []

  for (let r = headerRowIndex + 1; r < rawData.length; r += 1) {
    const dataRow = rawData[r]
    if (!Array.isArray(dataRow) || isEmptyDataRow(dataRow)) continue

    const rowObject = {}
    headers.forEach((key, columnIndex) => {
      let value = dataRow[columnIndex] ?? ''
      if (convertDateHeaders && isDateLikeHeader(key)) {
        value = excelCellToYmd(value)
      }
      rowObject[key] = value
    })
    parsedData.push(rowObject)
  }

  return parsedData
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
  const rows = aoaToObjectRows(raw_data, headerRowIndex, { convertDateHeaders: true })

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

/** 건축정보 헤더 행 탐색용 앵커 컬럼명 (공백 제거 후 부분 일치) */
export const DISCOVERY_HEADER_MARKERS = [
  '건축정보일자',
  '건축정보 일자',
  '사업명',
  '발주처',
  '허가일',
]

export const DISCOVERY_EXCEL_FORMAT_ERROR = '엑셀 양식이 올바르지 않습니다.'
export const DISCOVERY_EXCEL_NO_DATA_ERROR = '업로드할 유효한 데이터가 없습니다.'

/**
 * 건축정보: 2차원 배열 → '사업명'+'발주처' 헤더 행 탐색 → 객체 배열 조립
 * @param {import('xlsx').WorkSheet} worksheet
 */
export function sheetToJsonWithDiscoveryDynamicHeader(worksheet) {
  // 1. 순수 2차원 배열 추출
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

  // 2. 헤더 찾기 (JSON 문자열 변환으로 가장 확실하게 검색)
  let headerIndex = -1
  for (let i = 0; i < rawData.length; i++) {
    if (Array.isArray(rawData[i])) {
      const rowStr = JSON.stringify(rawData[i]).replace(/\s/g, '')
      if (rowStr.includes('사업명') && rowStr.includes('발주처')) {
        headerIndex = i
        break
      }
    }
  }

  // 3. ★ 최후의 수단: 그래도 못 찾으면 무조건 인덱스 2번(3번째 줄) 강제 지정 ★
  if (headerIndex === -1) {
    if (rawData[2] && rawData[2].length >= 5) {
      headerIndex = 2
      console.log('검색 실패: 인덱스 2번을 헤더로 강제 지정합니다.')
    } else {
      console.error('원본 데이터:', rawData)
      throw new Error(DISCOVERY_EXCEL_NO_DATA_ERROR)
    }
  }

  // 4. 헤더 키(Key) 정규화
  const headers = rawData[headerIndex].map((key) => String(key || '').replace(/\s+/g, '').trim())

  // 5. 데이터 매핑 (엑셀 날짜 변환 포함)
  const parsedData = rawData
    .slice(headerIndex + 1)
    .filter((row) => row && row.length > 0)
    .map((row) => {
      const rowData = {}
      headers.forEach((header, index) => {
        if (header) {
          let value = row[index]

          if (header === '건축정보일자' && typeof value === 'number') {
            const date = new Date(Math.round((value - 25569) * 86400 * 1000))
            const yyyy = date.getFullYear()
            const mm = String(date.getMonth() + 1).padStart(2, '0')
            const dd = String(date.getDate()).padStart(2, '0')
            value = `${yyyy}-${mm}-${dd}`
          }

          rowData[header] = value
        }
      })
      return rowData
    })
    .filter((item) => item.사업명)

  console.log('최종 렌더링될 데이터:', parsedData)

  return {
    rows: parsedData,
    headerRowIndex: headerIndex,
    raw_data: rawData,
    headers,
  }
}

/** @deprecated sheetToJsonWithDiscoveryDynamicHeader 사용 */
export const DISCOVERY_EXCEL_SKIP_ROWS = 3

/** @deprecated sheetToJsonWithDiscoveryDynamicHeader 사용 */
export function sheetToJsonWithRangeSkip(worksheet, skipRows = DISCOVERY_EXCEL_SKIP_ROWS) {
  return sheetToJsonWithDiscoveryDynamicHeader(worksheet)
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
