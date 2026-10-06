/**
 * 외부 공유용 설치사례 뷰어가 쓰는 표시 규칙.
 *
 * 관리자 화면(App.jsx)의 설치사례 표시와 같은 결과가 나오도록 맞춘 읽기 전용 사본이다.
 * App.jsx 를 import 하면 관리자 코드 전체가 딸려 오기 때문에 일부러 분리했다.
 * (분류 목록·표시 형식을 바꾸면 App.jsx 쪽도 함께 확인할 것)
 */
import { normalizeHeroImagesList, withInstallCaseMediaVersion } from '../installCasesApi.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export const MAJOR_CATEGORY_OPTIONS = [
  { value: '옥외전광판', label: '옥외전광판' },
  { value: '옥내전광판', label: '옥내전광판' },
]

export const MIDDLE_CATEGORY_OPTIONS = [
  { value: '체육시설', label: '체육시설' },
  { value: '미디어보드', label: '미디어보드' },
  { value: '미디어파사드', label: '미디어파사드' },
  { value: '미디어 폴', label: '미디어 폴' },
  { value: '재난·재해·환경안내', label: '재난·재해·환경안내' },
  { value: '전자게시대', label: '전자게시대' },
  { value: '교통정보전광판', label: '교통정보전광판' },
  { value: '해외비즈니스', label: '해외비즈니스' },
]

export const MINOR_CATEGORY_OPTIONS = [
  { value: '공공기관', label: '공공기관' },
  { value: '교육기관', label: '교육기관' },
  { value: '문화·전시·컨벤션', label: '문화·전시·컨벤션' },
  { value: '관광·레저', label: '관광·레저' },
  { value: '상업·유통', label: '상업·유통' },
  { value: '교통', label: '교통' },
  { value: '의료기관', label: '의료기관' },
  { value: '운동장', label: '운동장' },
  { value: '축구장', label: '축구장' },
  { value: '야구장', label: '야구장' },
  { value: '수영장', label: '수영장' },
  { value: '빙상장', label: '빙상장' },
  { value: '체육관', label: '체육관' },
  { value: '기타', label: '기타' },
]

const LEGACY_MAJOR_CATEGORY = { indoor: '옥내전광판', outdoor: '옥외전광판' }
const LEGACY_MINOR_CATEGORY = {
  public: '공공기관',
  education: '교육기관',
  culture: '문화·전시·컨벤션',
  private: '기타',
}

const MAX_SPEC_SETS = 3
const SPEC_SET_FIELDS = [
  { base: 'displayArea', label: '표출부 사이즈' },
  { base: 'resolution', label: '해상도' },
  { base: 'ledPitch', label: 'LED Pitch' },
]

export function withSelectPlaceholder(options, placeholder) {
  return [{ value: '', label: placeholder }, ...options]
}

function specKey(base, setIndex) {
  return setIndex === 0 ? base : `${base}${setIndex + 1}`
}

function specSetLabel(label, setIndex) {
  return setIndex === 0 ? label : `${label} (${setIndex + 1})`
}

function migrateMajor(raw) {
  const v = safeString(raw).trim()
  if (!v) return ''
  if (LEGACY_MAJOR_CATEGORY[v]) return LEGACY_MAJOR_CATEGORY[v]
  if (MAJOR_CATEGORY_OPTIONS.some((o) => o.value === v)) return v
  if (MIDDLE_CATEGORY_OPTIONS.some((o) => o.value === v)) return ''
  return v
}

function migrateMiddle(middleRaw, environmentRaw) {
  const mid = safeString(middleRaw).trim()
  if (mid && MIDDLE_CATEGORY_OPTIONS.some((o) => o.value === mid)) return mid
  const env = safeString(environmentRaw).trim()
  if (env && MIDDLE_CATEGORY_OPTIONS.some((o) => o.value === env)) return env
  return mid
}

function migrateMinor(raw) {
  const v = safeString(raw).trim()
  if (!v) return ''
  if (LEGACY_MINOR_CATEGORY[v]) return LEGACY_MINOR_CATEGORY[v]
  return v
}

function categoryLabel(options, value, legacyMap = {}) {
  const v = safeString(value).trim()
  if (!v) return '-'
  const hit = options.find((o) => o.value === v)
  if (hit) return hit.label
  if (legacyMap[v]) return legacyMap[v]
  return v
}

export function getMajorLabel(value) {
  return categoryLabel(MAJOR_CATEGORY_OPTIONS, value, LEGACY_MAJOR_CATEGORY)
}
export function getMiddleLabel(value) {
  return categoryLabel(MIDDLE_CATEGORY_OPTIONS, value)
}
export function getMinorLabel(value) {
  return categoryLabel(MINOR_CATEGORY_OPTIONS, value, LEGACY_MINOR_CATEGORY)
}

function normalizeSpecs(rawSpecs) {
  let specs = rawSpecs
  if (typeof specs === 'string' && specs.trim().startsWith('{')) {
    try {
      specs = JSON.parse(specs)
    } catch {
      specs = {}
    }
  }
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) specs = {}

  const normalized = { installType: safeString(specs.installType).trim() || '-' }
  for (let setIndex = 0; setIndex < MAX_SPEC_SETS; setIndex += 1) {
    for (const { base } of SPEC_SET_FIELDS) {
      const key = specKey(base, setIndex)
      const value = safeString(specs[key]).trim()
      normalized[key] = value || (setIndex === 0 ? '-' : '')
    }
  }
  return normalized
}

function isDummyHeroUrl(url) {
  const text = safeString(url).trim()
  return /picsum\.photos/i.test(text) || /seed\/newinstallh/i.test(text)
}

/** 공개 API 응답 한 건 → 화면용 행 */
export function normalizePublicInstallCase(row) {
  const heroImages = normalizeHeroImagesList(row?.heroImages, row?.heroImage)
    .filter((url) => !isDummyHeroUrl(url))
    .map((url) => {
      const text = safeString(url).trim()
      try {
        if (text.startsWith('http://') || text.startsWith('https://')) {
          const parsed = new URL(text)
          if (parsed.pathname.startsWith('/api/')) return `${parsed.pathname}${parsed.search}`
        }
      } catch {
        /* ignore */
      }
      return text
    })
  return {
    id: safeString(row?.id).trim(),
    projectName: safeString(row?.projectName).trim() || '-',
    heroImages,
    heroImage: heroImages[0] || '',
    environment: migrateMajor(row?.environment),
    middleCategory: migrateMiddle(row?.middleCategory, row?.environment),
    audience: migrateMinor(row?.audience),
    year: safeString(row?.year).trim() || '-',
    purpose: safeString(row?.purpose).trim() || '-',
    client: safeString(row?.client).trim() || '-',
    specs: normalizeSpecs(row?.specs),
  }
}

// ── 정렬 ────────────────────────────────────────────────────────────

function sortYear(row) {
  const digits = safeString(row?.year).replace(/[^\d]/g, '').slice(0, 4)
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? n : -1
}

function environmentRank(environment) {
  const raw = safeString(environment).trim()
  const label = migrateMajor(raw)
  if (raw.toLowerCase() === 'outdoor' || label.includes('옥외') || raw.includes('옥외')) return 0
  if (raw.toLowerCase() === 'indoor' || label.includes('옥내') || raw.includes('옥내')) return 1
  return 2
}

export function sortInstallCases(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const yearDiff = sortYear(b) - sortYear(a)
    if (yearDiff !== 0) return yearDiff
    return environmentRank(a.environment) - environmentRank(b.environment)
  })
}

// ── 규격 표시 ───────────────────────────────────────────────────────

function commaNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  const rounded = Math.round(v * 100) / 100
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : undefined,
    maximumFractionDigits: 2,
  })
}

function parseWhMm(formatted) {
  const s = safeString(formatted).trim()
  if (!s || s === '-') return null
  const toNum = (x) => {
    const n = parseFloat(String(x).replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  let m = s.match(/\(?W\)?\s*([\d,]+\.?\d*)\s*[x×]\s*\(?H\)?\s*([\d,]+\.?\d*)\s*mm/i)
  if (m) return { w: toNum(m[1]), h: toNum(m[2]) }
  m = s.match(/([\d,]+\.?\d*)\s*\(\s*W\s*\)\s*[×x]\s*([\d,]+\.?\d*)\s*\(\s*H\s*\)/i)
  if (m) return { w: toNum(m[1]), h: toNum(m[2]) }
  m = s.match(/([0-9.]+)\s*m\s*[×x]\s*([0-9.]+)\s*m/i)
  if (m) {
    return {
      w: Math.round(parseFloat(m[1]) * 1000 * 100) / 100 || 0,
      h: Math.round(parseFloat(m[2]) * 1000 * 100) / 100 || 0,
    }
  }
  m = s.match(/([\d,]+\.?\d*)\s*mm\s*[×x]\s*([\d,]+\.?\d*)\s*mm/i)
  if (m) return { w: toNum(m[1]), h: toNum(m[2]) }
  return null
}

function formatWhMm(w, h) {
  if (!w && !h) return ''
  return `(W)${commaNumber(w)} x (H)${commaNumber(h)}mm`
}

function parseResolution(s) {
  const t = safeString(s).trim()
  let m = t.match(/\(?W\)?\s*([\d,]+)\s*[x×]\s*\(?H\)?\s*([\d,]+)/i)
  if (m) return { w: m[1].replace(/\D/g, ''), h: m[2].replace(/\D/g, '') }
  m = t.match(/^([\d,]+)\s*[×x]\s*([\d,]+)$/)
  if (m) return { w: m[1].replace(/\D/g, ''), h: m[2].replace(/\D/g, '') }
  return { w: '', h: '' }
}

function formatResolution(wRaw, hRaw) {
  const w = parseInt(safeString(wRaw).replace(/\D/g, ''), 10) || 0
  const h = parseInt(safeString(hRaw).replace(/\D/g, ''), 10) || 0
  if (!w && !h) return ''
  return `(W)${commaNumber(w)} x (H)${commaNumber(h)}`
}

function formatLedPitch(pitch) {
  const s = safeString(pitch).trim()
  if (!s || s === '-') return '-'
  const mm = s.match(/^P\.?\s*([\d.]+)\s*mm$/i)
  if (mm) return `P${mm[1]}mm`
  const m = s.match(/^P\.?\s*(\d+(?:\.\d+)?)$/i)
  if (m) return `P${m[1]}mm`
  return s
}

export function formatSpecValue(base, rawValue) {
  const value = safeString(rawValue).trim()
  if (!value || value === '-') return '-'
  if (base === 'displayArea') {
    const pair = parseWhMm(value)
    return pair ? formatWhMm(pair.w, pair.h) || value : value
  }
  if (base === 'resolution') {
    const pair = parseResolution(value)
    if (pair.w !== '' || pair.h !== '') return formatResolution(pair.w, pair.h) || '-'
    return value
  }
  if (base === 'ledPitch') return formatLedPitch(value)
  return value
}

function joinedSpecSets(specs, base) {
  const parts = []
  for (let setIndex = 0; setIndex < MAX_SPEC_SETS; setIndex += 1) {
    const text = formatSpecValue(base, specs?.[specKey(base, setIndex)])
    if (text && text !== '-') parts.push(text)
  }
  return parts.length ? parts.join(' / ') : '-'
}

export function formatYearDetail(raw) {
  const s = safeString(raw).trim()
  if (!s) return '-'
  const dot = s.match(/^(\d{4})\.(\d{1,2})$/)
  if (dot) {
    const mm = String(Math.min(12, Math.max(1, parseInt(dot[2], 10) || 1))).padStart(2, '0')
    return `${dot[1]}.${mm}`
  }
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 6) {
    const mm = String(Math.min(12, Math.max(1, parseInt(digits.slice(4, 6), 10) || 1))).padStart(2, '0')
    return `${digits.slice(0, 4)}.${mm}`
  }
  if (digits.length >= 4) return `${digits.slice(0, 4)}.01`
  return s
}

export function formatCardSubline(row) {
  const yRaw = safeString(row?.year).trim()
  const yearPart = yRaw ? `${yRaw.match(/^\d{4}/) ? yRaw.slice(0, 4) : yRaw}년` : '-'
  return `${yearPart} | ${joinedSpecSets(row?.specs, 'displayArea')} | ${joinedSpecSets(row?.specs, 'ledPitch')}`
}

/** 상세 화면에 그릴 규격 줄 목록 (세트 1은 항상, 2·3은 값이 있을 때만) */
export function buildSpecRows(specs) {
  const rows = []
  for (let setIndex = 0; setIndex < MAX_SPEC_SETS; setIndex += 1) {
    const hasValue = SPEC_SET_FIELDS.some(({ base }) => {
      const value = safeString(specs?.[specKey(base, setIndex)]).trim()
      return value && value !== '-'
    })
    if (setIndex > 0 && !hasValue) continue
    SPEC_SET_FIELDS.forEach(({ base, label }, rowIndex) => {
      const text = formatSpecValue(base, specs?.[specKey(base, setIndex)])
      if (setIndex > 0 && text === '-') return
      rows.push({
        key: `${base}-${setIndex}`,
        label: specSetLabel(label, setIndex),
        text,
        setStart: setIndex > 0 && rowIndex === 0,
      })
    })
  }
  rows.push({
    key: 'installType',
    label: '설치유형',
    text: formatSpecValue('installType', specs?.installType),
    setStart: false,
  })
  return rows
}

// ── 검색 ────────────────────────────────────────────────────────────

function searchToken(value) {
  return safeString(value).toLowerCase().replace(/\s+/g, '')
}

function searchTokens(row) {
  const specs = row?.specs ?? {}
  const values = [
    row?.projectName,
    row?.year,
    row?.environment,
    getMajorLabel(row?.environment),
    row?.middleCategory,
    getMiddleLabel(row?.middleCategory),
    row?.audience,
    getMinorLabel(row?.audience),
    row?.purpose,
    row?.client,
    specs?.installType,
  ]
  for (let setIndex = 0; setIndex < MAX_SPEC_SETS; setIndex += 1) {
    for (const { base } of SPEC_SET_FIELDS) {
      const raw = specs?.[specKey(base, setIndex)]
      values.push(raw)
      values.push(formatSpecValue(base, raw))
    }
  }
  return values
    .filter((value) => safeString(value).trim() !== '-')
    .map(searchToken)
    .filter(Boolean)
}

export function matchesSearch(row, keyword) {
  const normalized = searchToken(keyword)
  if (!normalized) return true
  return searchTokens(row).some((token) => token.includes(normalized))
}

// ── 썸네일 후보 ─────────────────────────────────────────────────────

export function getThumbnailSources(row) {
  const urls = [...(row?.heroImages || [])]
  const id = safeString(row?.id).trim()
  if (id) {
    const legacyHero = withInstallCaseMediaVersion(`/api/install-cases/${id}/hero-image`, '')
    if (!urls.some((url) => String(url).includes(`/install-cases/${id}/hero-image`))) {
      urls.push(legacyHero)
    }
  }
  return urls
}
