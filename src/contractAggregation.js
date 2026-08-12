/** 계약현황 — 연도·분류 그룹 건수/금액 집계 */

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 콤마·원·공백 등 제거 후 숫자 합산용 정수로 변환 */
export function parseContractAmount(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }
  const digits = safeString(value).replace(/,/g, '').replace(/[^\d]/g, '')
  if (!digits) return 0
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
}

export function sumContractAmounts(items) {
  if (!Array.isArray(items) || items.length === 0) return 0
  return items.reduce((sum, item) => sum + parseContractAmount(item?.amount), 0)
}

export function getYearLabel(value) {
  const s = safeString(value).trim()
  if (!s) return ''
  const match = s.match(/\d{4}/)
  return match ? match[0] : s
}

/** 아코디언·요약·필터가 동일한 연도 키를 쓰도록 통일 */
export function getContractYearKey(item) {
  const fromYear = getYearLabel(item?.year)
  if (fromYear) return fromYear

  const fromContractDate = safeString(item?.contractDate).trim().slice(0, 4)
  if (/^\d{4}$/.test(fromContractDate)) return fromContractDate

  return '미분류'
}

/**
 * 계약현황 2차 그룹 — 계약분류(contractType) 기준
 * - 값이 정확히 '유지보수' → [유지보수]
 * - 그 외 전부(빈 값·코드·전광판 등) → [전광판]
 */
export const CONTRACT_CATEGORY_SUBGROUPS = Object.freeze([
  { groupId: 'signboard', label: '[전광판]' },
  { groupId: 'maintenance', label: '[유지보수]' },
])

export function getContractCategorySubgroupId(contractType) {
  const type = safeString(contractType).trim()
  return type === '유지보수' ? 'maintenance' : 'signboard'
}

/** 엑셀 업로드·수기 입력으로 들어오는 '값 없음' 표기 */
const SORT_PLACEHOLDER_VALUES = new Set(['-', '--', '–', '—', '.', 'null', 'undefined', 'nan'])

/** 공백·자리표시자('-' 등)를 모두 빈 값으로 취급 */
function normalizeSortValue(value) {
  const text = safeString(value).trim()
  if (!text) return ''
  return SORT_PLACEHOLDER_VALUES.has(text.toLowerCase()) ? '' : text
}

/**
 * 날짜 문자열 → 비교용 정수(yyyymmdd).
 * `2026-08-12` `2026.8.1` `2026/08/12` `20260812` `2026년 8월 12일` 을 모두 흡수하고,
 * 자리표시자·형식 불명은 null 을 돌려 "날짜 없음"으로 분류한다.
 */
function toComparableDateNumber(value) {
  const raw = normalizeSortValue(value)
  if (!raw) return null

  const digitGroups = raw.match(/\d+/g)
  if (!digitGroups || digitGroups.length === 0) return null

  if (digitGroups.length === 1) {
    const only = digitGroups[0]
    if (only.length === 8) return Number(only)
    if (only.length === 4) return Number(only) * 10000
    return null
  }

  const year = Number(digitGroups[0])
  if (!Number.isFinite(year) || year < 1900 || year > 2999) return null
  const month = Math.min(Math.max(Number(digitGroups[1]) || 0, 0), 12)
  const day = Math.min(Math.max(Number(digitGroups[2]) || 0, 0), 31)
  return year * 10000 + month * 100 + day
}

/** 계약일자 기준 정렬값. 계약일자가 비면 준공일자로 대체한다. */
function getContractSortDateNumber(item) {
  return toComparableDateNumber(item?.contractDate) ?? toComparableDateNumber(item?.dueDate)
}

/** 참고번호 내림차순. numeric 비교라 "100" 이 "99" 보다 위로 온다. */
function compareRefNoDesc(a, b) {
  const ra = normalizeSortValue(a?.refNo)
  const rb = normalizeSortValue(b?.refNo)

  if (ra && !rb) return -1
  if (!ra && rb) return 1
  if (!ra && !rb) return 0
  return rb.localeCompare(ra, 'ko-KR', { numeric: true, sensitivity: 'base' })
}

/** 날짜·번호가 모두 같을 때 리렌더마다 행이 뒤바뀌지 않도록 순서를 고정한다. */
function compareContractsByNameFallback(a, b) {
  const seg = safeString(a?.segment).localeCompare(safeString(b?.segment), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
  if (seg !== 0) return seg
  return safeString(a?.projectName).localeCompare(safeString(b?.projectName), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

/**
 * 계약현황 기본 정렬 — 1순위 계약일자 내림차순, 2순위 참고번호 내림차순.
 *
 * 참고번호를 1순위로 두면 번호가 없는 민간계약이 전부 목록 끝으로 밀려서
 * 관급계약과 나란히 날짜를 비교할 수 없다. 그래서 날짜를 먼저 보고,
 * 같은 날짜 안에서만 참고번호가 큰 건을 위로 올린다.
 *
 * - `-` 같은 자리표시자는 값이 있는 것처럼 취급하지 않는다.
 * - 계약일자·준공일자가 모두 없는 건만 맨 뒤로 보낸다.
 */
export function compareContractsForDisplay(a, b) {
  const da = getContractSortDateNumber(a)
  const db = getContractSortDateNumber(b)

  if (da === null && db !== null) return 1
  if (da !== null && db === null) return -1
  if (da !== null && db !== null && da !== db) return db - da

  const byRef = compareRefNoDesc(a, b)
  if (byRef !== 0) return byRef

  return compareContractsByNameFallback(a, b)
}

function createEmptyBuckets() {
  return { signboard: [], maintenance: [] }
}

/**
 * 필터링된 계약 목록 → 연도·분류 아코디언 그룹
 * - 연도별 건수/금액 = 해당 연도 전체
 * - 하위 그룹 합 = 연도 합과 일치 (누락·중복 없음)
 */
export function groupContractsForAccordion(filteredData) {
  const list = Array.isArray(filteredData) ? filteredData : []
  const groups = new Map()

  list.forEach((item) => {
    const year = getContractYearKey(item)
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year).push(item)
  })

  return [...groups.entries()]
    .sort(([a], [b]) => {
      const na = Number(a)
      const nb = Number(b)
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na
      return safeString(b).localeCompare(safeString(a), 'ko-KR', { numeric: true })
    })
    .map(([year, yearItems]) => {
      const buckets = createEmptyBuckets()
      yearItems.forEach((item) => {
        const groupId = getContractCategorySubgroupId(item.contractType)
        buckets[groupId].push(item)
      })

      const subGroups = CONTRACT_CATEGORY_SUBGROUPS.map(({ groupId, label }) => {
        const items = [...buckets[groupId]].sort(compareContractsForDisplay)
        return {
          groupId,
          label,
          items,
          count: items.length,
          totalAmount: sumContractAmounts(items),
        }
      })

      const assignedItems = subGroups.flatMap((g) => g.items)
      const yearCount = yearItems.length
      const yearTotalAmount = sumContractAmounts(yearItems)
      const subCountSum = subGroups.reduce((sum, g) => sum + g.count, 0)
      const subAmountSum = subGroups.reduce((sum, g) => sum + g.totalAmount, 0)
      if (
        import.meta.env.DEV &&
        (subCountSum !== yearCount || subAmountSum !== yearTotalAmount)
      ) {
        console.warn('[계약현황] 연도·하위 그룹 합산 불일치', {
          year,
          yearCount,
          subCountSum,
          yearTotalAmount,
          subAmountSum,
        })
      }

      return {
        year,
        subGroups,
        items: assignedItems,
        count: yearCount,
        totalAmount: yearTotalAmount,
      }
    })
}

/** API·엑셀 로드 직후 amount·year 정규화 */
export function normalizeContractListRow(item, index = 0) {
  if (!item || typeof item !== 'object') return item
  return {
    ...item,
    year: getContractYearKey(item) || getYearLabel(item.year) || item.year,
    amount: parseContractAmount(item.amount),
  }
}
