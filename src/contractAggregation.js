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

/** 계약현황 2차 그룹 — 전광판 / 유지보수 / 기타(미분류·그 외) */
export const CONTRACT_CATEGORY_SUBGROUPS = Object.freeze([
  { groupId: 'signboard', label: '[전광판]' },
  { groupId: 'maintenance', label: '[유지보수]' },
  { groupId: 'other', label: '[기타]' },
])

const SUBGROUP_BUCKET_IDS = CONTRACT_CATEGORY_SUBGROUPS.map((g) => g.groupId)

export function getContractCategorySubgroupId(contractType) {
  const type = safeString(contractType).trim()
  if (!type) return 'other'
  if (type.includes('유지보수')) return 'maintenance'
  if (type.includes('전광판') || type.includes('55121903')) return 'signboard'
  return 'other'
}

function compareContractsByContractDateDesc(a, b) {
  const ts = (item) => {
    const raw = safeString(item.contractDate ?? '').trim()
    if (!raw) return null
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
  }
  const ta = ts(a)
  const tb = ts(b)
  if (ta === null && tb === null) {
    /* fall through */
  } else if (ta === null) return 1
  else if (tb === null) return -1
  else if (ta !== tb) return tb - ta

  const seg = safeString(a.segment).localeCompare(safeString(b.segment), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
  if (seg !== 0) return seg
  return safeString(a.projectName).localeCompare(safeString(b.projectName), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function createEmptyBuckets() {
  return Object.fromEntries(SUBGROUP_BUCKET_IDS.map((id) => [id, []]))
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
        const bucketId = buckets[groupId] ? groupId : 'other'
        buckets[bucketId].push(item)
      })

      const subGroups = CONTRACT_CATEGORY_SUBGROUPS.map(({ groupId, label }) => {
        const items = [...buckets[groupId]].sort(compareContractsByContractDateDesc)
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
