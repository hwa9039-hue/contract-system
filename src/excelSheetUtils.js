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

export function isExcelDateSerialNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 100000
}

function looksLikePureSerialText(text) {
  return /^\d{4,6}(\.0+)?$/.test(String(text ?? '').trim())
}

/** 엑셀 셀의 포맷 문자열(w) 또는 number format(z) 기반 표시 텍스트 */
export function getExcelCellFormattedText(cell) {
  if (!cell) return ''
  if (cell.w != null && String(cell.w).trim() !== '') {
    return String(cell.w).trim()
  }
  if (cell.t === 'n' && cell.z != null) {
    try {
      const formatted = XLSX.SSF.format(cell.z, cell.v)
      if (formatted != null && String(formatted).trim() !== '') {
        return String(formatted).trim()
      }
    } catch {
      /* ignore format errors */
    }
  }
  return ''
}

/** 세부내용 등 긴 텍스트 — w가 첫 줄만 담는 경우 v(줄바꿈 포함)를 우선 */
export function getExcelCellLongText(cell) {
  if (!cell) return ''
  const formatted = getExcelCellFormattedText(cell)
  const raw =
    cell.v === null || cell.v === undefined
      ? ''
      : typeof cell.v === 'string'
        ? cell.v
        : String(cell.v)
  const rawTrimmed = raw.trim()
  if (!formatted) return rawTrimmed
  if (!rawTrimmed) return formatted
  if (rawTrimmed.includes('\n') && !formatted.includes('\n')) return rawTrimmed
  return rawTrimmed.length > formatted.length ? rawTrimmed : formatted
}

/** 엑셀 날짜 시리얼 → 'YYYY년 M월' (준공시기 등 월 단위 표기) */
export function excelSerialToYearMonthKorean(serial) {
  const parsed = XLSX.SSF.parse_date_code(serial)
  if (!parsed?.y) return ''
  return `${parsed.y}년 ${parsed.m}월`
}

/** 준공시기 셀: 포맷 텍스트 우선, 시리얼이면 'YYYY년 M월', 일반 텍스트는 유지 */
export function normalizeExcelCompletionPeriodCell(cell) {
  if (!cell) return ''
  const formatted = getExcelCellFormattedText(cell)
  if (formatted && !looksLikePureSerialText(formatted)) {
    return formatted
  }

  const raw = cell.v
  if (typeof raw === 'number' && isExcelDateSerialNumber(raw)) {
    return excelSerialToYearMonthKorean(raw)
  }
  if (formatted) return formatted
  if (raw === null || raw === undefined) return ''
  return String(raw).trim()
}

/** 건축정보일자 셀: 포맷 텍스트 우선, 시리얼이면 YYYY-MM-DD, 그 외 문자열 유지 */
export function normalizeExcelPermitDateCell(cell) {
  if (!cell) return ''

  const raw = cell.v
  if (raw === null || raw === undefined || raw === '') return ''
  if (typeof raw === 'number' && isExcelDateSerialNumber(raw)) {
    return excelCellToYmd(raw)
  }
  const formatted = getExcelCellFormattedText(cell)
  if (formatted) {
    const ymd = excelCellToYmd(formatted)
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : formatted
  }
  return String(raw).trim()
}

/** DB·화면에 시리얼 숫자 문자열로 저장된 준공시기 복구 */
export function normalizeCompletionPeriodDisplay(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (looksLikePureSerialText(text)) {
    const num = Number(text)
    if (isExcelDateSerialNumber(num)) {
      return excelSerialToYearMonthKorean(num)
    }
  }
  return text
}

/** DB·화면에 시리얼 숫자 문자열로 저장된 건축정보일자 복구 */
export function normalizePermitDateDisplay(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (looksLikePureSerialText(text)) {
    const num = Number(text)
    if (isExcelDateSerialNumber(num)) {
      return excelCellToYmd(num) || text
    }
  }
  return text
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
  '건축 정보 일자',
  '사업명',
  '공사명',
  '과업명',
  '발주처',
  '수요기관',
  '허가일',
  '허가일자',
  '인허가일',
  '사업구분',
  '사업금액',
  '준공시기',
  '영업자',
  '담당자',
  '세부내용',
]

/** 건축정보 엑셀 헤더 → 시스템 표준 컬럼명(canonical) 매핑 */
const DISCOVERY_HEADER_CANONICAL_RULES = [
  {
    canonical: '건축정보일자',
    aliases: [
      '건축정보일자',
      '건축정보일',
      '건축정보',
      '건축정보일시',
      '허가일',
      '허가일자',
      '인허가일',
      '건축허가일',
      '건축인허가일',
      '건축인허가',
      '허가날짜',
      '허가일시',
    ],
  },
  {
    canonical: '확인',
    aliases: ['확인', '확인여부', '체크', '확인상태', '검토', '검토여부'],
  },
  {
    canonical: '영업자',
    aliases: ['영업자', '영업대상', '영업담당', '영업담당자', '영업담당자명', '영업'],
  },
  {
    canonical: '사업구분',
    aliases: ['사업구분', '사업구분명', '구분', '프로젝트구분', '사업분류'],
  },
  {
    canonical: '발주처',
    aliases: ['발주처', '수요기관', '발주기관', '발주기관명', '발주자', '의뢰기관'],
  },
  {
    canonical: '사업명',
    aliases: ['사업명', '공사명', '과업명', '건명', '프로젝트명', '사업명칭', '공사명칭'],
  },
  {
    canonical: '사업금액',
    aliases: ['사업금액', '금액', '사업금액원', '계약금액', '공사금액', '총사업비'],
  },
  {
    canonical: '준공시기',
    aliases: ['준공시기', '준공', '납기', '준공예정', '준공시점', '준공일', '준공예정일'],
  },
  {
    canonical: '담당자',
    aliases: ['담당자', '담당', '담당자명', 'pm', '현장담당', '현장담당자'],
  },
  {
    canonical: '세부내용',
    aliases: ['세부내용', '비고', '메모', '참고', '참고사항', '특이사항', '내용'],
  },
]

function normalizeDiscoveryHeaderText(text) {
  return stripCellForMatch(text)
}

function resolveDiscoveryCanonicalHeader(headerText) {
  const compact = normalizeDiscoveryHeaderText(headerText)
  if (!compact) return ''

  const norm = normalizeExcelHeaderKey(headerText)
  if (!norm) return compact

  for (const rule of DISCOVERY_HEADER_CANONICAL_RULES) {
    const canonicalNorm = normalizeExcelHeaderKey(rule.canonical)
    if (norm === canonicalNorm) return rule.canonical

    for (const alias of rule.aliases) {
      const aliasNorm = normalizeExcelHeaderKey(alias)
      if (aliasNorm && norm === aliasNorm) return rule.canonical
    }
  }

  for (const rule of DISCOVERY_HEADER_CANONICAL_RULES) {
    for (const alias of rule.aliases) {
      const aliasNorm = normalizeExcelHeaderKey(alias)
      if (!aliasNorm) continue
      // 짧고 흔한 단어(금액/구분/담당/내용 등)는 엉뚱한 열까지 잡기 쉬우므로
      // 정확히 일치할 때만 매핑한다.
      if (aliasNorm.length <= 2 || norm.length <= 2) continue
      if (norm.includes(aliasNorm)) return rule.canonical
    }
  }

  return compact
}

function isDiscoveryPermitDateHeader(canonicalHeader, rawHeader) {
  const norm = normalizeExcelHeaderKey(rawHeader || canonicalHeader)
  return (
    canonicalHeader === '건축정보일자' ||
    norm.includes('건축정보일') ||
    norm.includes('허가일') ||
    norm.includes('인허가')
  )
}

function isDiscoveryCompletionPeriodHeader(canonicalHeader, rawHeader) {
  const norm = normalizeExcelHeaderKey(rawHeader || canonicalHeader)
  return canonicalHeader === '준공시기' || norm.includes('준공') || norm.includes('납기')
}

function detectDiscoveryHeaderRowIndex(rawData) {
  if (!Array.isArray(rawData) || !rawData.length) return -1

  const scored = detectExcelHeaderRowIndexFromAoA(rawData, DISCOVERY_HEADER_MARKERS, 40)
  if (rowMatchesHeaderKeywords(rawData[scored], DISCOVERY_HEADER_MARKERS) >= 3) {
    return scored
  }

  const scanEnd = Math.min(rawData.length, 40)
  for (let i = 0; i < scanEnd; i += 1) {
    const row = rawData[i]
    if (!Array.isArray(row)) continue

    const hasProject = rowContainsText(row, ['사업명', '공사명', '과업명', '건명', '프로젝트명'])
    const hasClient = rowContainsText(row, ['발주처', '수요기관', '발주기관', '의뢰기관'])
    const hasDate = rowContainsText(row, [
      '건축정보일자',
      '건축정보 일자',
      '건축 정보 일자',
      '허가일',
      '허가일자',
      '인허가일',
    ])
    const hasAmount = rowContainsText(row, ['사업금액', '사업 금액', '계약금액', '총사업비'])
    const hasManager = rowContainsText(row, ['담당자', '영업자', '영업담당자'])
    const markerHits = [hasProject, hasClient, hasDate, hasAmount, hasManager].filter(Boolean).length
    if (markerHits >= 2) return i
  }

  return -1
}

function assignDiscoveryRowField(rowData, canonicalHeader, value) {
  if (!canonicalHeader) return
  const text = value === null || value === undefined ? '' : value
  const existing = rowData[canonicalHeader]
  if (stripCellForMatch(existing) === '') {
    rowData[canonicalHeader] = text
    return
  }
  if (stripCellForMatch(text) !== '') {
    rowData[canonicalHeader] = text
  }
}

const DISCOVERY_EXCEL_DATA_FIELDS = [
  '건축정보일자',
  '확인',
  '영업자',
  '사업구분',
  '발주처',
  '사업명',
  '사업금액',
  '준공시기',
  '담당자',
]

function discoveryExcelRowHasPrimaryData(row) {
  if (!row || typeof row !== 'object') return false
  return DISCOVERY_EXCEL_DATA_FIELDS.some(
    (key) => stripCellForMatch(row[key]) !== ''
  )
}

/**
 * 엑셀에서 세부내용만 다음 행에 이어지는 경우(줄바꿈·셀 병합) 한 레코드로 합침
 */
export function mergeDiscoveryExcelNoteContinuationRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return rows

  const merged = []
  for (const row of rows) {
    const note = String(row?.세부내용 ?? '').trim()
    const hasPrimary = discoveryExcelRowHasPrimaryData(row)

    if (!hasPrimary && note && merged.length > 0) {
      const prev = merged[merged.length - 1]
      const prevNote = String(prev.세부내용 ?? '').trim()
      prev.세부내용 = prevNote ? `${prevNote}\n${note}` : note
      continue
    }

    merged.push({ ...row })
  }
  return merged
}

export const DISCOVERY_EXCEL_FORMAT_ERROR = '엑셀 양식이 올바르지 않습니다.'
export const DISCOVERY_EXCEL_NO_DATA_ERROR = '업로드할 유효한 데이터가 없습니다.'

/**
 * 건축정보: 2차원 배열 → 헤더 행 탐색(유연) → 표준 컬럼명으로 매핑 → 객체 배열 조립
 * @param {import('xlsx').WorkSheet} worksheet
 */
export function sheetToJsonWithDiscoveryDynamicHeader(worksheet) {
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

  if (!Array.isArray(rawData) || !rawData.length) {
    throw new Error(DISCOVERY_EXCEL_NO_DATA_ERROR)
  }

  const headerIndex = detectDiscoveryHeaderRowIndex(rawData)
  if (headerIndex < 0) {
    console.error('건축정보 헤더 행 탐색 실패:', rawData)
    throw new Error(DISCOVERY_EXCEL_FORMAT_ERROR)
  }

  const headerRow = rawData[headerIndex]
  const headers = (headerRow || []).map((key, colIndex) => {
    const raw = String(key ?? '').trim()
    return {
      colIndex,
      raw,
      canonical: resolveDiscoveryCanonicalHeader(raw),
    }
  })

  const parsedData = []
  for (let rowOffset = 0; rowOffset < rawData.length - headerIndex - 1; rowOffset += 1) {
    const row = rawData[headerIndex + 1 + rowOffset]
    if (!Array.isArray(row) || isEmptyDataRow(row)) continue

    const sheetRowIndex = headerIndex + 1 + rowOffset
    const rowData = {}

    headers.forEach(({ colIndex, raw, canonical }) => {
      if (!canonical) return

      const cellAddress = XLSX.utils.encode_cell({ r: sheetRowIndex, c: colIndex })
      const cell = worksheet[cellAddress]
      let value

      if (isDiscoveryCompletionPeriodHeader(canonical, raw)) {
        value = normalizeExcelCompletionPeriodCell(cell)
      } else if (isDiscoveryPermitDateHeader(canonical, raw)) {
        value = normalizeExcelPermitDateCell(cell)
      } else if (canonical === '세부내용') {
        value = getExcelCellLongText(cell)
      } else {
        const formatted = getExcelCellFormattedText(cell)
        if (formatted) {
          value = formatted
        } else {
          value = cell?.v ?? row[colIndex] ?? ''
        }
        if (value === null || value === undefined) value = ''
        else if (typeof value !== 'string') value = String(value)
      }

      assignDiscoveryRowField(rowData, canonical, value)
    })

    if (!isEmptyParsedRow(rowData)) {
      parsedData.push(rowData)
    }
  }

  return {
    rows: mergeDiscoveryExcelNoteContinuationRows(parsedData),
    headerRowIndex: headerIndex,
    raw_data: rawData,
    headers: headers.map((h) => h.canonical || h.raw).filter(Boolean),
  }
}

/** @deprecated sheetToJsonWithDiscoveryDynamicHeader 사용 */
export const DISCOVERY_EXCEL_SKIP_ROWS = 3

/** @deprecated sheetToJsonWithDiscoveryDynamicHeader 사용 */
export function sheetToJsonWithRangeSkip(worksheet, skipRows = DISCOVERY_EXCEL_SKIP_ROWS) {
  return sheetToJsonWithDiscoveryDynamicHeader(worksheet)
}

const REGISTRY_IMPORT_NUMERIC_FIELDS = new Set([
  'projectAmount',
  'amount',
  'budgetAmount',
  'orderNo',
  'year',
])

function sanitizeRegistryImportScalar(key, value) {
  if (value === null || value === undefined) {
    return REGISTRY_IMPORT_NUMERIC_FIELDS.has(key) ? 0 : ''
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return REGISTRY_IMPORT_NUMERIC_FIELDS.has(key) ? 0 : ''
    }
    return value
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'object') {
    return REGISTRY_IMPORT_NUMERIC_FIELDS.has(key) ? 0 : ''
  }

  const text = String(value).trim()
  if (!text || text === 'undefined' || text === 'null' || text === 'NaN') {
    return REGISTRY_IMPORT_NUMERIC_FIELDS.has(key) ? 0 : ''
  }
  return text
}

/** API 전송 직전 — null/undefined·비정상 텍스트를 백엔드 스키마에 맞게 정제 */
export function sanitizeRegistryImportPayload(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return {}
    const sanitized = {}
    for (const [key, value] of Object.entries(row)) {
      sanitized[key] = sanitizeRegistryImportScalar(key, value)
    }
    return sanitized
  })
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
