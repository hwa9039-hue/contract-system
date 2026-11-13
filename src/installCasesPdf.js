import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { isInstallCaseVideo } from './installCaseMedia.js'
import { resolveInstallCaseHeroImage } from './installCasesApi.js'
import {
  MAJOR_CATEGORY_OPTIONS,
  buildSpecRows,
  compareInstallCases,
  formatContractAmount,
  formatSpecValue,
  formatYearDetail,
  getMajorLabel,
  getMiddleLabel,
  getMinorLabel,
  resolveCategories,
} from './publicShare/installCaseView.js'

const COMPANY_LOGO_URL = '/logo.png'
const FONT_FAMILY = 'Pretendard'
/** jsPDF 스타일 키 → Pretendard TTF (public/fonts) */
const FONT_FILES = Object.freeze({
  normal: { url: '/fonts/Pretendard-Regular.ttf', vfsName: 'Pretendard-Regular.ttf' },
  semibold: { url: '/fonts/Pretendard-SemiBold.ttf', vfsName: 'Pretendard-SemiBold.ttf' },
  bold: { url: '/fonts/Pretendard-Bold.ttf', vfsName: 'Pretendard-Bold.ttf' },
})

/** 마무리 페이지 회사 정보 (첫 줄 = 회사명) */
const COMPANY_INFO_LINES = Object.freeze([
  '주식회사 싸인텔레콤',
  'www.signtelecom.com',
])

/** logo.png 안에서 심볼(다이아몬드)이 차지하는 영역 — 원본 픽셀 비율 */
const LOGO_SYMBOL_CROP = Object.freeze({ x: 0.05, y: 0.1, w: 0.29, h: 0.8 })
const WATERMARK_OPACITY = 0.04

const LEGACY_HERO_RE = /\/install-cases\/[^/]+\/hero-image/
/** 동영상 확장자 (쿼리·해시 앞) */
const VIDEO_SOURCE_RE = /\.(mp4|m4v|mov|avi|wmv|webm|mkv|flv|ogv|ogg|3gp|mpe?g|ts)(\?|#|$)/i
/** 이 밝기 평균·편차 미만이면 까만 화면(깨진 이미지)으로 보고 제외 */
const BLANK_IMAGE_MAX_LUMA = 22
const BLANK_IMAGE_MAX_STDDEV = 12

/** 간지 대상 대분류 (목록 순서) */
const MAJOR_CATEGORY_ORDER = Object.freeze(MAJOR_CATEGORY_OPTIONS.map((opt) => opt.label))
/** 대분류가 비었거나 목록에 없는 사례의 간지 제목 */
const MAJOR_CATEGORY_FALLBACK = '미분류'

/** 사진 비율이 컨테이너와 이만큼 이내로 같으면 흐린 배경을 만들지 않는다. */
const BACKDROP_SKIP_TOLERANCE = 0.01
/** 흐린 배경 이미지 가로 픽셀(세로는 컨테이너 비율), 블러 전 축소 폭 */
const BACKDROP_PX = Object.freeze({ w: 640, tinyW: 24 })

/** A4 300dpi 기준 사진 칸(약 190mm)을 충분히 덮는 해상도 — 이보다 크면 줄여서 용량을 아낀다. */
const MAX_IMAGE_EDGE_PX = 2600
/** 사진 미리 불러오기 동시 개수 */
const IMAGE_PREFETCH_WINDOW = 4

/* ── 페이지 치수 (mm, A4 가로) ── */
const PAGE_W = 297
const PAGE_H = 210
const MARGIN_X = 9
const MARGIN_TOP = 8
const MARGIN_BOTTOM = 5
const LOGO_H = 7
const BODY_GAP = 5
const SIDE_COL_W = 90
const PHOTO_RADIUS = 3
/** 분류 경로 아래 네이비 구분선 y (고정) */
const HEADER_RULE_Y = 20.5
/** 대제목(사업명) — 구분선 바로 아래 한 줄. 길면 최소 크기까지 줄인 뒤 말줄임 */
const PROJECT_TITLE_Y = HEADER_RULE_Y + 4
const PROJECT_TITLE_PT = 17
const PROJECT_TITLE_MIN_PT = 13
/** 본문(사진·카드) 하단 기준선 = 푸터 로고 위 */
const BODY_BASELINE = PAGE_H - MARGIN_BOTTOM - LOGO_H - 4
/** 고정 사진 컨테이너: 대제목 아래부터 하단 기준선까지 */
const PHOTO_BOX = Object.freeze({
  x: MARGIN_X,
  y: PROJECT_TITLE_Y + 12,
  w: PAGE_W - MARGIN_X * 2 - BODY_GAP - SIDE_COL_W,
  h: BODY_BASELINE - (PROJECT_TITLE_Y + 12),
})
/** 사진과 우측 정보 영역 사이 추가 간격 */
const INFO_INSET_X = 3
const SECTION_TITLE_H = 7
const SECTION_GAP = 7
const GROUP_GAP = 4
const CELL_PAD_Y = 1.4
const SECTION_TITLE_PT = 10
const LABEL_FONT_PT = 9
const VALUE_FONT_PT = 9.6
const PT_PER_MM = 72 / 25.4
const LINE_HEIGHT_FACTOR = 1.15

const RGB = Object.freeze({
  navy: [11, 42, 74],
  blueGray: [74, 98, 122],
  line: [213, 221, 230],
  accent: [37, 99, 235],
  mat: [248, 249, 250],
  frame: [222, 226, 230],
  text: [19, 35, 55],
  muted: [106, 124, 144],
  white: [255, 255, 255],
})

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatPdfDateStamp(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/** 메인 스레드를 잠시 양보해 화면(진행 표시)이 갱신되게 한다. */
function yieldToBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(safeString(reader.result))
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

/** 확장자 · data URL 형식으로 동영상인지 판별 (installCaseMedia보다 넓게 본다) */
function isVideoSource(src) {
  const value = safeString(src).trim()
  if (!value) return false
  return isInstallCaseVideo(value) || VIDEO_SOURCE_RE.test(value) || /^data:video\//i.test(value)
}

/** 취소 신호가 오면 AbortError를 던진다. */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('PDF 생성을 취소했습니다.', 'AbortError')
}

export function isPdfAbortError(error) {
  return error?.name === 'AbortError'
}

async function fetchMediaAsDataUrl(url, signal) {
  const resolved = resolveInstallCaseHeroImage(url)
  if (!resolved || isVideoSource(resolved)) return ''
  if (resolved.startsWith('data:')) return /^data:image\//i.test(resolved) ? resolved : ''

  try {
    const headers = { ...getAuthHeaders() }
    const needsAuth =
      resolved.startsWith(`${API_BASE_URL}/`) ||
      resolved.startsWith('/api/') ||
      (typeof window !== 'undefined' && resolved.startsWith(window.location.origin))
    const response = await apiFetch(
      resolved,
      apiFetchInit({
        method: 'GET',
        headers: needsAuth ? headers : {},
        signal,
      }),
    )
    if (!response.ok) return ''
    const blob = await response.blob()
    // 확장자 없는 URL이 동영상을 돌려주는 경우도 응답 형식으로 걸러 낸다.
    if (!blob || !String(blob.type || '').startsWith('image/')) return ''
    return await blobToDataUrl(blob)
  } catch (error) {
    if (isPdfAbortError(error)) throw error
    return ''
  }
}

async function loadImageElement(dataUrl) {
  if (!dataUrl) return null
  const img = new Image()
  img.src = dataUrl
  try {
    await img.decode()
  } catch {
    return null
  }
  return img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null
}

/**
 * 거의 전부 까만(또는 단색으로 깨진) 이미지인지 — 동영상 첫 프레임 썸네일, 디코딩 실패 등.
 * 64px로 줄여 밝기 평균과 편차를 본다.
 */
function isBlankImage(img) {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, size, size)
  let data
  try {
    data = ctx.getImageData(0, 0, size, size).data
  } catch {
    return false
  }
  let sum = 0
  let sumSq = 0
  const count = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    sum += luma
    sumSq += luma * luma
  }
  const mean = sum / count
  const stdDev = Math.sqrt(Math.max(0, sumSq / count - mean * mean))
  return mean < BLANK_IMAGE_MAX_LUMA && stdDev < BLANK_IMAGE_MAX_STDDEV
}

let fontDataPromise = null

/** Pretendard TTF를 base64로 한 번만 불러와 재사용한다 (문서마다 VFS에 등록). */
function loadKoreanFonts() {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all(
      Object.entries(FONT_FILES).map(async ([style, file]) => {
        const response = await fetch(file.url)
        if (!response.ok) throw new Error('PDF용 한글 폰트를 불러오지 못했습니다.')
        const dataUrl = await blobToDataUrl(await response.blob())
        return { style, vfsName: file.vfsName, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
      }),
    ).catch((error) => {
      fontDataPromise = null
      throw error
    })
  }
  return fontDataPromise
}

function registerFonts(doc, fonts) {
  fonts.forEach(({ style, vfsName, base64 }) => {
    doc.addFileToVFS(vfsName, base64)
    doc.addFont(vfsName, FONT_FAMILY, style)
  })
  doc.setFont(FONT_FAMILY, 'normal')
}

async function loadLogo() {
  try {
    const response = await fetch(COMPANY_LOGO_URL)
    if (!response.ok) return null
    const dataUrl = await blobToDataUrl(await response.blob())
    const img = await loadImageElement(dataUrl)
    return img ? { dataUrl, img, width: img.naturalWidth, height: img.naturalHeight } : null
  } catch {
    return null
  }
}

/** 로고에서 심볼만 잘라 투명 배경 PNG로 만든다(흰 배경 → 투명). */
function cropLogoSymbol(logo) {
  const { img } = logo
  const sx = Math.round(logo.width * LOGO_SYMBOL_CROP.x)
  const sy = Math.round(logo.height * LOGO_SYMBOL_CROP.y)
  const width = Math.round(logo.width * LOGO_SYMBOL_CROP.w)
  const height = Math.round(logo.height * LOGO_SYMBOL_CROP.h)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, sx, sy, width, height, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height)
  const { data } = pixels
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) data[i + 3] = 0
  }
  ctx.putImageData(pixels, 0, 0)
  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

/**
 * 사진 후보 목록 (영상 제외). 레거시 `/hero-image`는 다른 사진이 없을 때만 쓴다.
 */
function pickImageSources(sources) {
  const all = [
    ...new Set(
      (Array.isArray(sources) ? sources : []).map((item) => safeString(item).trim()).filter(Boolean),
    ),
  ]
  const hasVideo = all.some(isVideoSource)
  const images = all.filter((url) => !isVideoSource(url))
  const regular = images.filter((url) => !LEGACY_HERO_RE.test(url))
  const legacy = images.filter((url) => LEGACY_HERO_RE.test(url))
  if (regular.length) return [...regular, ...legacy]
  // 동영상만 등록된 사례의 레거시 hero 엔드포인트는 동영상(또는 검은 프레임)을 돌려주므로 쓰지 않는다.
  return hasVideo ? [] : legacy
}

/**
 * 브라우저가 디코딩한 비트맵을 항상 RGB JPEG로 다시 인코딩한다.
 * CMYK·프로그레시브 JPEG·WebP 등 원본 바이트를 jsPDF에 그대로 넣으면 까맣게 나오는 경우가 많다.
 */
function normalizeImageForPdf(img) {
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(1, MAX_IMAGE_EDGE_PX / Math.max(longEdge, 1))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // JPEG는 투명 픽셀을 검정으로 만들므로 먼저 흰 깐다.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    format: 'JPEG',
    width,
    height,
  }
}

/**
 * 고정 사진 컨테이너를 꽉 채우도록 확대한 뒤 강하게 흐린 배경 이미지.
 * 작게 줄였다가 다시 키우고(ctx.filter 미지원 브라우저 대비) blur 필터를 한 번 더 건다.
 */
function buildBlurBackdrop(img) {
  const boxRatio = PHOTO_BOX.w / PHOTO_BOX.h
  const ratio = img.naturalWidth / img.naturalHeight
  if (Math.abs(ratio / boxRatio - 1) <= BACKDROP_SKIP_TOLERANCE) return null

  const { w, tinyW } = BACKDROP_PX
  const h = Math.round(w / boxRatio)
  const tinyH = Math.round((tinyW * h) / w)
  const tiny = document.createElement('canvas')
  tiny.width = tinyW
  tiny.height = tinyH
  const tinyCtx = tiny.getContext('2d')
  tinyCtx.fillStyle = '#ffffff'
  tinyCtx.fillRect(0, 0, tinyW, tinyH)
  const scale = Math.max(tinyW / img.naturalWidth, tinyH / img.naturalHeight)
  const drawW = img.naturalWidth * scale
  const drawH = img.naturalHeight * scale
  tinyCtx.imageSmoothingQuality = 'high'
  tinyCtx.drawImage(img, (tinyW - drawW) / 2, (tinyH - drawH) / 2, drawW, drawH)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  const bleed = 48
  if ('filter' in ctx) ctx.filter = 'blur(28px) saturate(1.1)'
  ctx.drawImage(tiny, -bleed, -bleed, w + bleed * 2, h + bleed * 2)
  ctx.filter = 'none'
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)'
  ctx.fillRect(0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** canvas 둥근 사각형 경로 */
function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * 배경(blur) + contain 사진을 하나의 RGB JPEG 판으로 합친다.
 * PDF clip/addImage 조합 이슈를 피하고, 페이지에는 이 판만 올린다.
 */
async function composePhotoPlate(photoImg, normalized) {
  const dpi = 168
  const pxW = Math.max(1, Math.round((PHOTO_BOX.w / 25.4) * dpi))
  const pxH = Math.max(1, Math.round((PHOTO_BOX.h / 25.4) * dpi))
  const radius = Math.max(1, Math.round((PHOTO_RADIUS / 25.4) * dpi))
  const canvas = document.createElement('canvas')
  canvas.width = pxW
  canvas.height = pxH
  const ctx = canvas.getContext('2d')
  // JPEG 투명→검정 방지: 먼저 흰색, 그다음 둥근 영역만 채운다.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, pxW, pxH)
  roundedRectPath(ctx, 0, 0, pxW, pxH, radius)
  ctx.clip()
  ctx.fillStyle = `rgb(${RGB.mat.join(',')})`
  ctx.fillRect(0, 0, pxW, pxH)

  const backdropUrl = buildBlurBackdrop(photoImg)
  if (backdropUrl) {
    const backdropImg = await loadImageElement(backdropUrl)
    if (backdropImg) ctx.drawImage(backdropImg, 0, 0, pxW, pxH)
  }

  const mainImg = await loadImageElement(normalized.dataUrl)
  if (!mainImg) return null
  const scale = Math.min(pxW / mainImg.naturalWidth, pxH / mainImg.naturalHeight)
  const drawW = mainImg.naturalWidth * scale
  const drawH = mainImg.naturalHeight * scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(mainImg, (pxW - drawW) / 2, (pxH - drawH) / 2, drawW, drawH)

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    format: 'JPEG',
    width: pxW,
    height: pxH,
  }
}

/** 대표 사진 1장 — 앞 후보가 깨졌으면 다음 후보로 넘어간다. */
async function loadMainPhoto(sources, signal) {
  for (const src of pickImageSources(sources)) {
    throwIfAborted(signal)
    const dataUrl = await fetchMediaAsDataUrl(src, signal)
    if (!dataUrl) continue
    const img = await loadImageElement(dataUrl)
    if (!img || isBlankImage(img)) continue
    const normalized = normalizeImageForPdf(img)
    // 재인코딩본이 깨졌으면 이 후보는 건너뛴다.
    const encoded = await loadImageElement(normalized.dataUrl)
    if (!encoded || isBlankImage(encoded)) continue
    const plate = await composePhotoPlate(img, normalized)
    if (!plate) continue
    const plateImg = await loadImageElement(plate.dataUrl)
    if (!plateImg || isBlankImage(plateImg)) continue
    return plate
  }
  return null
}

/** addImage 직전 최종 확인: 정상 디코딩된 이미지 데이터인지 */
function isDrawablePhoto(photo) {
  return Boolean(
    photo &&
      /^data:image\/(jpeg|jpg|png);base64,/i.test(photo.dataUrl) &&
      photo.dataUrl.length > 200 &&
      photo.width > 0 &&
      photo.height > 0,
  )
}

function joinedRawSpecValues(specs, keys) {
  const parts = []
  for (const key of keys) {
    const text = safeString(specs?.[key]).trim()
    if (text && text !== '-') parts.push(text)
  }
  return parts.length ? parts.join('\n') : '-'
}

function hasDisplayValue(value) {
  if (value === null || value === undefined) return false
  const text = safeString(value).trim()
  return Boolean(text) && text !== '-'
}

function displayValue(value) {
  return hasDisplayValue(value) ? safeString(value).trim() : ''
}

function filterFilledRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => hasDisplayValue(row?.value))
}

/** 간지 기준 대분류 이름 (미디어보드·미디어 폴…). 목록에 없으면 '미분류' */
function resolveInstallCaseMajorGroup(row) {
  const label = displayValue(getMajorLabel(row?.environment))
  return MAJOR_CATEGORY_ORDER.includes(label) ? label : MAJOR_CATEGORY_FALLBACK
}

/** 목록 화면과 같은 순서. 대분류가 목록에 없는 사례('미분류')는 맨 뒤로 간다. */
function compareInstallCasePdfPages(a, b) {
  return compareInstallCases(a.row, b.row)
}

/**
 * 기존 API 행 → 제안서 페이지 모델.
 * 값이 비어 있는 행은 제외한다. 계약금액은 includeContractAmount 일 때만 넣는다.
 */
export function buildInstallCaseProposalModel(row, { includeContractAmount = false } = {}) {
  const specs = row?.specs && typeof row.specs === 'object' ? row.specs : {}
  const categoryTitle = displayValue(getMajorLabel(row?.environment)) || '설치사례'
  const location = displayValue(row?.location || specs?.location || specs?.site || row?.site)

  return {
    categoryTitle,
    categoryPath: [
      categoryTitle,
      displayValue(getMiddleLabel(row?.middleCategory)),
      displayValue(getMinorLabel(row?.audience)),
    ].filter(Boolean),
    projectName: displayValue(row?.projectName) || '제목 없음',
    infoRows: filterFilledRows([
      { label: '사업년도', value: formatYearDetail(row?.year) },
      { label: '용도', value: displayValue(row?.purpose) },
      { label: '발주처', value: displayValue(row?.client) },
      { label: '위치', value: location },
      { label: '중분류', value: getMiddleLabel(row?.middleCategory) },
      { label: '소분류', value: getMinorLabel(row?.audience) },
      includeContractAmount
        ? {
            label: '계약금액',
            value: formatContractAmount(row?.contractAmount, row?.contractAmountNote),
          }
        : null,
    ]),
    specRows: buildPdfSpecRows(specs),
  }
}

/**
 * 규격 세트별 행 (세트가 2개 이상이면 "(1)", "(2)" 접미사 + 점선 구분).
 * 모듈 사이즈·LED Pitch 는 세트 안에서 모두 싣는다.
 * 뒤에 공통 항목(색상 · 모듈 수량 · 표출능력 · 설치유형)을 붙인다. 빈 값은 제외.
 */
function buildPdfSpecRows(specs) {
  const setRows = buildSpecRows(specs).filter((row) => row.key !== 'installType')
  const rows = []
  let pendingSetStart = false
  let setIndex = 0
  setRows.forEach((row) => {
    if (row.setStart) {
      pendingSetStart = true
      setIndex += 1
    }
    if (!hasDisplayValue(row.text)) return
    rows.push({
      label: row.label,
      value: row.text,
      setIndex,
      setStart: pendingSetStart && rows.length > 0,
    })
    pendingSetStart = false
  })
  const multiSet = rows.some((row) => row.setIndex > 0)
  if (multiSet) {
    rows.forEach((row) => {
      if (row.setIndex === 0) row.label = `${row.label} (1)`
    })
  }

  const commonRows = filterFilledRows([
    {
      label: '색상',
      value: displayValue(specs?.color || specs?.ledColor || specs?.colorType),
    },
    {
      label: '모듈 수량',
      value: joinedRawSpecValues(specs, ['moduleQty', 'moduleQty2', 'moduleQty3']),
    },
    {
      label: '표출능력',
      value: displayValue(specs?.displayCapacity || specs?.displayCapability || specs?.brightness),
    },
    { label: '설치유형', value: formatSpecValue('installType', specs?.installType) },
  ])
  if (multiSet && commonRows.length) commonRows[0] = { ...commonRows[0], setStart: true }
  return [...rows, ...commonRows]
}

/* ───────────────────────── 그리기 ───────────────────────── */

function setFont(doc, style, sizePt, color) {
  doc.setFont(FONT_FAMILY, style)
  doc.setFontSize(sizePt)
  if (color) doc.setTextColor(...color)
}

function lineHeightMm(sizePt) {
  return (sizePt * LINE_HEIGHT_FACTOR) / PT_PER_MM
}

/** 행 묶음: setStart 지점마다 점선으로 나뉘는 그룹 */
function splitRowGroups(rows) {
  const groups = []
  rows.forEach((row) => {
    if (row.setStart || !groups.length) groups.push([])
    groups[groups.length - 1].push(row)
  })
  return groups
}

function labelColumnWidth(width) {
  return Math.min(30, Math.max(22, width * 0.34))
}

function measureRowHeight(doc, row, width) {
  const labelW = labelColumnWidth(width)
  setFont(doc, 'normal', LABEL_FONT_PT)
  const labelLines = doc.splitTextToSize(row.label, labelW - 3).length
  setFont(doc, 'semibold', VALUE_FONT_PT)
  const valueLines = safeString(row.value)
    .split('\n')
    .reduce((sum, line) => sum + doc.splitTextToSize(line, width - labelW - 4).length, 0)
  return Math.max(
    labelLines * lineHeightMm(LABEL_FONT_PT),
    valueLines * lineHeightMm(VALUE_FONT_PT),
  ) + CELL_PAD_Y * 2
}

function measureSection(doc, rows, width) {
  const groups = splitRowGroups(rows)
  const rowsHeight = groups.reduce(
    (sum, group) => sum + group.reduce((acc, row) => acc + measureRowHeight(doc, row, width), 0),
    0,
  )
  return SECTION_TITLE_H + rowsHeight + (groups.length - 1) * GROUP_GAP
}

function drawSectionTitle(doc, title, x, y) {
  setFont(doc, 'bold', SECTION_TITLE_PT, RGB.navy)
  doc.text(title, x, y, { baseline: 'top' })
}

/** 라벨 | 값 2열 표 — jspdf-autotable로 그린다. 반환값: 다음 y */
function drawRowsTable(doc, rows, x, y, width) {
  const labelW = labelColumnWidth(width)
  autoTable(doc, {
    startY: y,
    margin: { left: x, right: PAGE_W - x - width, top: 0, bottom: 0 },
    tableWidth: width,
    theme: 'plain',
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    body: rows.map((row) => [row.label, row.value]),
    styles: {
      font: FONT_FAMILY,
      fontStyle: 'semibold',
      fontSize: VALUE_FONT_PT,
      textColor: RGB.text,
      overflow: 'linebreak',
      valign: 'top',
      cellPadding: { top: CELL_PAD_Y, bottom: CELL_PAD_Y, left: 4, right: 0 },
    },
    columnStyles: {
      0: {
        cellWidth: labelW,
        fontStyle: 'normal',
        fontSize: LABEL_FONT_PT,
        textColor: RGB.muted,
        cellPadding: { top: CELL_PAD_Y + 0.25, bottom: CELL_PAD_Y, left: 0, right: 3 },
      },
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 0) return
      const { cell } = data
      doc.setDrawColor(...RGB.line)
      doc.setLineWidth(0.25)
      doc.line(cell.x + cell.width, cell.y + 0.6, cell.x + cell.width, cell.y + cell.height - 0.6)
    },
  })
  return doc.lastAutoTable?.finalY ?? y
}

function drawSection(doc, title, rows, x, y, width) {
  drawSectionTitle(doc, title, x, y)
  let cursor = y + SECTION_TITLE_H
  const groups = splitRowGroups(rows)
  groups.forEach((group, index) => {
    if (index > 0) {
      const lineY = cursor + GROUP_GAP / 2
      doc.setDrawColor(...RGB.line)
      doc.setLineWidth(0.25)
      doc.setLineDashPattern([0.8, 0.8], 0)
      doc.line(x, lineY, x + width, lineY)
      doc.setLineDashPattern([], 0)
      cursor += GROUP_GAP
    }
    cursor = drawRowsTable(doc, group, x, cursor, width)
  })
  return cursor
}

function detailSections(model) {
  return [
    { title: '사업 정보', rows: model.infoRows },
    { title: '세부 사양', rows: model.specRows },
  ].filter((section) => section.rows.length)
}

/** 우측 정보 영역(사업 정보 → 가로선 → 세부 사양) 높이 */
function measureStackedCard(doc, model, width) {
  const sections = detailSections(model)
  if (!sections.length) return 0
  const innerW = width - INFO_INSET_X
  const content = sections.reduce((sum, s) => sum + measureSection(doc, s.rows, innerW), 0)
  return content + (sections.length - 1) * SECTION_GAP
}

/** 배경 박스 없이 흰 바탕 위에 표·구분선만 그린다. */
function drawStackedCard(doc, model, x, y, width) {
  const sections = detailSections(model)
  if (!sections.length) return
  const innerX = x + INFO_INSET_X
  const innerW = width - INFO_INSET_X
  let cursor = y
  sections.forEach((section, index) => {
    if (index > 0) {
      const lineY = cursor + SECTION_GAP / 2 - 1
      doc.setDrawColor(...RGB.line)
      doc.setLineWidth(0.3)
      doc.line(innerX, lineY, innerX + innerW, lineY)
      cursor += SECTION_GAP
    }
    cursor = drawSection(doc, section.title, section.rows, innerX, cursor, innerW)
  })
}

/** 겹겹이 옅은 사각형으로 만드는 부드러운 그림자 */
function drawSoftShadow(doc, x, y, w, h) {
  const layers = [
    { spread: 1.6, offset: 1.1, opacity: 0.035 },
    { spread: 1.0, offset: 0.8, opacity: 0.05 },
    { spread: 0.5, offset: 0.5, opacity: 0.07 },
  ]
  doc.saveGraphicsState()
  doc.setFillColor(15, 23, 42)
  layers.forEach(({ spread, offset, opacity }) => {
    doc.setGState(new doc.GState({ opacity }))
    const r = PHOTO_RADIUS + spread
    doc.roundedRect(x - spread, y - spread + offset, w + spread * 2, h + spread * 2, r, r, 'F')
  })
  doc.restoreGraphicsState()
}

/**
 * 고정 크기 사진 컨테이너(x, y, w, h). 모서리는 둥글게 잘라 낸다.
 * 원본은 contain으로 중앙에 두고, 남는 여백은 같은 사진을 꽉 채워 흐리게 한 배경으로 메운다.
 */
function drawPhotoContainer(doc, photo, x, y, w, h, alias) {
  drawSoftShadow(doc, x, y, w, h)

  // 사진은 이미 RGB JPEG 한 장(plate)으로 합쳐 두었으므로, clip 없이 컨테이너에 맞춘다.
  doc.setFillColor(...RGB.mat)
  doc.roundedRect(x, y, w, h, PHOTO_RADIUS, PHOTO_RADIUS, 'F')
  doc.addImage(photo.dataUrl, photo.format || 'JPEG', x, y, w, h, alias, 'MEDIUM')

  doc.setDrawColor(...RGB.frame)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, PHOTO_RADIUS, PHOTO_RADIUS, 'S')
}

/** 싸인텔레콤 심볼을 아주 옅게 깐 배경 워터마크 */
function drawWatermark(doc, symbol, { x, y, h }) {
  if (!symbol) return
  const w = (h * symbol.width) / symbol.height
  doc.saveGraphicsState()
  doc.setGState(new doc.GState({ opacity: WATERMARK_OPACITY }))
  doc.addImage(symbol.dataUrl, 'PNG', x, y, w, h, 'company-symbol', 'FAST')
  doc.restoreGraphicsState()
}

/** 너무 긴 사업명은 maxLines 줄에서 말줄임 */
function clampLines(doc, text, width, maxLines) {
  const lines = doc.splitTextToSize(text, width)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && doc.getTextWidth(`${last}…`) > width) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** 상단: 대분류 > 중분류 > 소분류 + 네이비 구분선(고정 y) */
function drawHeader(doc, model) {
  const separator = '  >  '
  let cursorX = MARGIN_X
  model.categoryPath.forEach((part, index) => {
    setFont(doc, 'bold', 20, RGB.navy)
    if (index > 0) {
      doc.text(separator, cursorX, MARGIN_TOP, { baseline: 'top' })
      cursorX += doc.getTextWidth(separator)
    }
    doc.text(part, cursorX, MARGIN_TOP, { baseline: 'top' })
    cursorX += doc.getTextWidth(part)
  })

  doc.setDrawColor(...RGB.navy)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_X, HEADER_RULE_Y, PAGE_W - MARGIN_X, HEADER_RULE_Y)
}

/** 대제목(사업명): 구분선 바로 아래 한 줄. 사진 컨테이너 높이가 페이지마다 같도록 줄 수를 고정한다. */
function drawProjectTitle(doc, projectName) {
  const maxW = PAGE_W - MARGIN_X * 2 - 5
  let sizePt = PROJECT_TITLE_PT
  setFont(doc, 'bold', sizePt, RGB.text)
  while (sizePt > PROJECT_TITLE_MIN_PT && doc.getTextWidth(projectName) > maxW) {
    sizePt -= 0.5
    setFont(doc, 'bold', sizePt, RGB.text)
  }
  const [line] = clampLines(doc, projectName, maxW, 1)
  const lineH = lineHeightMm(sizePt)

  doc.setFillColor(...RGB.accent)
  doc.rect(MARGIN_X, PROJECT_TITLE_Y + 0.6, 1.3, lineH - 1.2, 'F')
  doc.text(line, MARGIN_X + 5, PROJECT_TITLE_Y, { baseline: 'top' })
}

const FOOTER_Y = PAGE_H - MARGIN_BOTTOM - LOGO_H

/** 하단 좌측 회사 로고 */
function drawFooterLogo(doc, logo) {
  if (!logo) return
  const logoW = (LOGO_H * logo.width) / logo.height
  doc.addImage(logo.dataUrl, 'PNG', MARGIN_X, FOOTER_Y, logoW, LOGO_H, 'company-logo', 'FAST')
}

/** 하단 우측 쪽번호 — 건너뛴 사례를 뺀 최종 장수로 마지막에 쓴다. */
function drawPageNumber(doc, pageIndex, pageCount) {
  setFont(doc, 'bold', 8, RGB.blueGray)
  doc.text(`${pageIndex} / ${pageCount}`, PAGE_W - MARGIN_X, FOOTER_Y + LOGO_H / 2, {
    align: 'right',
    baseline: 'middle',
  })
}

/**
 * 1사례 = 1페이지. 상단: 분류 경로 · 구분선 · 대제목.
 * 본문: 좌 고정 사진 컨테이너(대제목 아래 ~ 하단 기준선, 1장 전체 폭) / 우 사업정보·세부 사양.
 */
function drawCasePage(doc, { model, photo, logo, symbol, alias }) {
  drawHeader(doc, model)
  drawWatermark(doc, symbol, { x: PAGE_W - 128, y: HEADER_RULE_Y, h: 120 })
  drawFooterLogo(doc, logo)
  drawProjectTitle(doc, model.projectName)

  const { x, y, w, h } = PHOTO_BOX
  drawPhotoContainer(doc, photo, x, y, w, h, alias)

  const cardH = Math.min(measureStackedCard(doc, model, SIDE_COL_W), h)
  if (cardH) {
    drawStackedCard(doc, model, x + w + BODY_GAP, BODY_BASELINE - cardH, SIDE_COL_W)
  }
}

function formatDisplayDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}. ${m}. ${d}`
}

/** jsPDF의 align: 'center'는 charSpace를 폭에 넣지 않으므로 직접 계산한다. */
function drawSpacedCenteredText(doc, text, centerX, y, charSpace = 1.2) {
  const width = doc.getTextWidth(text) + charSpace * (text.length - 1)
  doc.text(text, centerX - width / 2, y, { baseline: 'top', charSpace })
}

function drawCenteredLogo(doc, logo, centerY, width) {
  if (!logo) return centerY
  const h = (width * logo.height) / logo.width
  doc.addImage(logo.dataUrl, 'PNG', (PAGE_W - width) / 2, centerY - h / 2, width, h, 'company-logo', 'FAST')
  return centerY + h / 2
}

function drawBottomBand(doc) {
  doc.setFillColor(...RGB.navy)
  doc.rect(0, PAGE_H - 6, PAGE_W, 6, 'F')
  doc.setFillColor(...RGB.accent)
  doc.rect(0, PAGE_H - 7.2, PAGE_W * 0.32, 1.2, 'F')
}

/** 표지: '싸인텔레콤 설치사례' · 필터/검색어 부제 · 하단 발행일 */
function drawCoverPage(doc, { symbol, subtitle }) {
  drawWatermark(doc, symbol, { x: PAGE_W - 150, y: 40, h: 190 })
  const centerX = PAGE_W / 2

  setFont(doc, 'bold', 36, RGB.navy)
  doc.text('싸인텔레콤 설치사례', centerX, 79, { align: 'center', baseline: 'top' })

  doc.setDrawColor(...RGB.navy)
  doc.setLineWidth(0.6)
  doc.line(centerX - 18, 100, centerX + 18, 100)

  if (subtitle) {
    setFont(doc, 'semibold', 15, RGB.blueGray)
    const lines = clampLines(doc, subtitle, PAGE_W - 80, 2)
    doc.text(lines, centerX, 107, { align: 'center', baseline: 'top' })
  }

  const label = '발행일'
  const date = formatDisplayDate()
  const gap = 4
  setFont(doc, 'normal', 9.5, RGB.muted)
  const labelW = doc.getTextWidth(label)
  setFont(doc, 'semibold', 11, RGB.navy)
  const dateW = doc.getTextWidth(date)
  const startX = centerX - (labelW + gap * 2 + 0.3 + dateW) / 2
  const dateY = PAGE_H - 30
  setFont(doc, 'normal', 9.5, RGB.muted)
  doc.text(label, startX, dateY, { baseline: 'middle' })
  doc.setDrawColor(...RGB.line)
  doc.setLineWidth(0.3)
  doc.line(startX + labelW + gap, dateY - 2.4, startX + labelW + gap, dateY + 2.4)
  setFont(doc, 'semibold', 11, RGB.navy)
  doc.text(date, startX + labelW + gap * 2 + 0.3, dateY, { baseline: 'middle' })

  drawBottomBand(doc)
}

/** 간지: 네이비 전면 배경 + 정중앙 큰 흰색 대분류명 + 짧은 포인트 라인 */
function drawDividerPage(doc, { heading, symbol }) {
  doc.setFillColor(...RGB.navy)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')
  if (symbol) {
    const h = 210
    const w = (h * symbol.width) / symbol.height
    doc.saveGraphicsState()
    doc.setGState(new doc.GState({ opacity: 0.06 }))
    doc.addImage(symbol.dataUrl, 'PNG', PAGE_W - w * 0.72, -20, w, h, 'company-symbol', 'FAST')
    doc.restoreGraphicsState()
  }

  const centerX = PAGE_W / 2
  const centerY = PAGE_H / 2
  setFont(doc, 'bold', 48, RGB.white)
  const [line] = clampLines(doc, heading, PAGE_W - 40, 1)
  doc.text(line, centerX, centerY - 3, { align: 'center', baseline: 'middle' })

  doc.setFillColor(...RGB.accent)
  doc.rect(centerX - 16, centerY + 12, 32, 1.2, 'F')
}

/** 마무리: 감사 인사 · 로고 · 회사 정보 */
function drawEndingPage(doc, { logo, symbol }) {
  drawWatermark(doc, symbol, { x: -40, y: 30, h: 190 })
  const centerX = PAGE_W / 2

  setFont(doc, 'bold', 28, RGB.navy)
  doc.text('감사합니다', centerX, 52, { align: 'center', baseline: 'top' })
  setFont(doc, 'semibold', 10, RGB.blueGray)
  drawSpacedCenteredText(doc, 'THANK YOU', centerX, 66)

  const logoBottom = drawCenteredLogo(doc, logo, 100, 78)

  doc.setDrawColor(...RGB.line)
  doc.setLineWidth(0.3)
  doc.line(centerX - 60, logoBottom + 12, centerX + 60, logoBottom + 12)

  let y = logoBottom + 19
  COMPANY_INFO_LINES.forEach((line, index) => {
    setFont(doc, index === 0 ? 'bold' : 'normal', index === 0 ? 11.5 : 9.5, index === 0 ? RGB.navy : RGB.muted)
    doc.text(line, centerX, y, { align: 'center', baseline: 'top' })
    y += index === 0 ? 7.5 : 5.6
  })
  drawBottomBand(doc)
}

/* ───────────────────────── 파일명 · 다운로드 ───────────────────────── */

function sanitizeFilenamePart(value, fallback = '전체') {
  const cleaned = safeString(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '')
  return cleaned || fallback
}

function isMeaningfulFilterLabel(value) {
  const text = safeString(value).trim()
  return Boolean(text) && text !== '전체'
}

/** 지역 약칭 → 파일명용 정식 표기 (검색어와 정확히 일치할 때만) */
const REGION_FILENAME_MAP = Object.freeze({
  충청: '충청도',
  강원: '강원도',
  전라: '전라도',
  경상: '경상도',
  경기: '경기도',
  제주: '제주도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전라북도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
})

/**
 * 검색어 → 파일명 텍스트
 * - 4자리 숫자: 연도 → 2024년
 * - 그 외 숫자·소수(앞의 P 허용): LED 피치 → P2.5, P10
 * - 지역 약칭: 충청 → 충청도
 * - 나머지: 그대로
 */
export function formatSearchTermForFileName(searchTerm) {
  const term = safeString(searchTerm).trim()
  if (!term) return ''
  if (/^\d{4}$/.test(term)) return `${term}년`
  const pitch = term.match(/^[pP]?(\d+(?:\.\d+)?)$/)
  if (pitch) return `P${pitch[1]}`
  return REGION_FILENAME_MAP[term] || term
}

/** 쉼표로 구분된 검색어 → 공백 제거·빈 값/중복 제외 배열 ("2.5, 4.44" → ['2.5', '4.44']) */
export function splitSearchTerms(searchText) {
  const terms = safeString(searchText)
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
  return [...new Set(terms)]
}

/** 검색어마다 스마트 매핑을 적용한 배열 (중복 제거) */
function formatSearchTerms(searchText) {
  return [...new Set(splitSearchTerms(searchText).map(formatSearchTermForFileName).filter(Boolean))]
}

/**
 * 검색어가 있으면: [싸인텔레콤] 설치사례_${가공된 검색어들을 _로}_${YYYYMMDD}.pdf (예: _P2.5_P4.44_)
 * 없으면 '전체'가 아닌 분류만 이어 붙인다: [싸인텔레콤] 설치사례_${분류…}_${가시성}_${YYYYMMDD}.pdf
 */
export function buildInstallCasesPdfFilename(filters = {}) {
  const date = formatPdfDateStamp()
  const keywords = formatSearchTerms(filters.searchKeyword)
    .map((term) => sanitizeFilenamePart(term, ''))
    .filter(Boolean)
  if (keywords.length) return `[싸인텔레콤] 설치사례_${keywords.join('_')}_${date}.pdf`

  const parts = [
    filters.majorLabel,
    filters.middleLabel,
    filters.minorLabel,
    filters.visibilityLabel,
  ]
    .filter(isMeaningfulFilterLabel)
    .map((part) => sanitizeFilenamePart(part, ''))
    .filter(Boolean)
  return `[싸인텔레콤] 설치사례_${parts.length ? `${parts.join('_')}_` : ''}${date}.pdf`
}

/** 표지 부제: '전체'가 아닌 분류 + 가공된 검색어들 (예: 교통 · P2.5, P4.44) */
function buildCoverSubtitle(filters = {}) {
  const categories = [filters.majorLabel, filters.middleLabel, filters.minorLabel]
    .filter(isMeaningfulFilterLabel)
    .map((part) => safeString(part).trim())
  const keywords = formatSearchTerms(filters.searchKeyword).join(', ')
  return [...categories, keywords].filter(Boolean).join('  ·  ')
}

/** 사진(영상 제외) 후보가 하나라도 있는 사례만 */
function hasPhotoCandidate(row, getImageSources) {
  return pickImageSources(getImageSources(row)).length > 0
}

/** 사진을 동시에 IMAGE_PREFETCH_WINDOW 개씩 불러온다. 결과는 원래 순서. 취소되면 즉시 중단. */
async function loadPhotosWithConcurrency(rows, getImageSources, onEach, signal) {
  const results = new Array(rows.length).fill(null)
  let cursor = 0
  let done = 0
  const worker = async () => {
    while (cursor < rows.length) {
      throwIfAborted(signal)
      const index = cursor
      cursor += 1
      try {
        results[index] = await loadMainPhoto(getImageSources(rows[index]), signal)
      } catch (error) {
        if (isPdfAbortError(error)) throw error
        results[index] = null
      }
      done += 1
      onEach(done)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(IMAGE_PREFETCH_WINDOW, rows.length) }, () => worker()),
  )
  return results
}

/**
 * 필터된 설치사례를 가로(A4 landscape) 제안서 PDF로 저장한다.
 * 표지 → [분류 간지 → 사례(1건 = 1페이지)…] → 마무리 페이지. 텍스트·표는 벡터, 사진은 원본(contain).
 * 사례는 대분류 → 중분류 → 소분류 목록 순서 → 사업년도(년·월) 최신순으로 정렬하고, 대분류가 바뀔 때마다 간지를 넣는다.
 * 동영상만 있거나, 사진을 못 불러왔거나(깨짐·까만 화면), 그리다 실패한 사례는 건너뛴다.
 *
 * helpers.onProgress({ phase: 'load' | 'draw', done, total })
 * helpers.includeContractAmount — true 일 때만 사업 정보 표에 계약금액 행을 넣는다.
 * helpers.signal — AbortSignal. 취소되면 다음 단계로 넘어가지 않고 AbortError를 던진다(파일 저장 안 함).
 * 반환값: { included, excluded }
 */
export async function downloadInstallCasesPdf(rows, helpers = {}) {
  const getImageSources = helpers.getImageSources || (() => [])
  const buildModel = helpers.buildPageModel || buildInstallCaseProposalModel
  const onProgress = typeof helpers.onProgress === 'function' ? helpers.onProgress : () => {}
  const filters = helpers.filters || {}
  const { signal } = helpers

  const all = (Array.isArray(rows) ? rows.filter(Boolean) : []).map((row) => ({
    ...row,
    ...resolveCategories(row),
  }))
  const candidates = all.filter((row) => hasPhotoCandidate(row, getImageSources))
  if (!candidates.length) {
    throw new Error('사진이 등록된 설치사례가 없어 PDF를 만들 수 없습니다.')
  }

  onProgress({ phase: 'load', done: 0, total: candidates.length })
  const [fonts, logo, photos] = await Promise.all([
    loadKoreanFonts(),
    loadLogo(),
    loadPhotosWithConcurrency(
      candidates,
      getImageSources,
      (done) => onProgress({ phase: 'load', done, total: candidates.length }),
      signal,
    ),
  ])
  throwIfAborted(signal)
  const symbol = logo ? cropLogoSymbol(logo) : null

  const pages = candidates
    .map((row, index) => ({
      row,
      photo: photos[index],
      majorGroup: resolveInstallCaseMajorGroup(row),
    }))
    .filter((page) => isDrawablePhoto(page.photo))
    .sort(compareInstallCasePdfPages)
  if (!pages.length) {
    throw new Error('사진을 불러오지 못해 PDF를 만들 수 없습니다.')
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  registerFonts(doc, fonts)
  doc.setLineHeightFactor(LINE_HEIGHT_FACTOR)

  drawCoverPage(doc, {
    symbol,
    subtitle: buildCoverSubtitle(filters),
  })

  const section = { category: null, dividerPage: 0, drawn: 0 }
  // 사례가 하나도 그려지지 않은 분류의 간지는 지운다(그 간지가 항상 마지막 페이지라 앞 쪽번호는 그대로).
  const dropEmptyDivider = () => {
    if (section.dividerPage && section.drawn === 0) doc.deletePage(section.dividerPage)
  }

  const casePageNumbers = []
  for (const [index, page] of pages.entries()) {
    throwIfAborted(signal)
    if (page.majorGroup !== section.category) {
      dropEmptyDivider()
      doc.addPage()
      drawDividerPage(doc, { heading: page.majorGroup, symbol })
      Object.assign(section, {
        category: page.majorGroup,
        dividerPage: doc.getNumberOfPages(),
        drawn: 0,
      })
    }

    doc.addPage()
    const pageNumber = doc.getNumberOfPages()
    try {
      drawCasePage(doc, {
        model: buildModel(page.row, {
          includeContractAmount: Boolean(helpers.includeContractAmount),
        }),
        photo: page.photo,
        logo,
        symbol,
        alias: `case-photo-${index}`,
      })
      casePageNumbers.push(pageNumber)
      section.drawn += 1
    } catch (error) {
      // addImage가 깨진 데이터로 실패하면 그 페이지는 통째로 버린다.
      console.warn('[설치사례 PDF] 페이지를 건너뜁니다:', page.row?.id, error)
      doc.deletePage(pageNumber)
    }
    onProgress({ phase: 'draw', done: index + 1, total: pages.length })
    await yieldToBrowser()
  }
  dropEmptyDivider()
  throwIfAborted(signal)
  if (!casePageNumbers.length) {
    throw new Error('사진을 그리지 못해 PDF를 만들 수 없습니다.')
  }

  casePageNumbers.forEach((pageNumber, index) => {
    doc.setPage(pageNumber)
    drawPageNumber(doc, index + 1, casePageNumbers.length)
  })
  doc.addPage()
  drawEndingPage(doc, { logo, symbol })

  doc.save(buildInstallCasesPdfFilename(filters))
  return { included: casePageNumbers.length, excluded: all.length - casePageNumbers.length }
}
