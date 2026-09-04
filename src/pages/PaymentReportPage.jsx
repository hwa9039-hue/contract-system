import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { DeleteConfirmModal, useDeleteConfirm } from '../DeleteConfirmModal.jsx'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { PAYMENT_REPORTS_API_PATH, normalizePaymentReportRow, paymentReportsApi } from '../paymentReportsApi.js'
import { RecordAttachmentChip, RecordFileAttachments } from '../RecordFileAttachments.jsx'
import {
  attachmentsNeedSync,
  getAttachmentCount,
  mergeAttachmentLists,
} from '../recordFileAttachments.js'
import { recordAttachmentDownloadUrl, saveRecordAttachments } from '../recordAttachmentsApi.js'
import {
  EXCLUDED_INLINE_EDITOR_CLASS,
  TABLE_INLINE_EDITABLE_CELL_CLASS,
} from '../tableInlineInputClass.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeAmountDigits(value) {
  return safeString(value).replace(/[^\d]/g, '')
}

function formatAmountComma(value) {
  const raw = normalizeAmountDigits(value)
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

/** 금액 문자열 → 숫자. `원 / %` 형식이면 금액(원 앞)만 읽고 요율 숫자는 무시한다. */
function parseAmountNumber(value) {
  const text = safeString(value).trim()
  if (!text) return null
  const amountPart = text.includes('원')
    ? text.slice(0, text.indexOf('원'))
    : text.includes('/')
      ? text.slice(0, text.indexOf('/'))
      : text
  const raw = normalizeAmountDigits(amountPart)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 기준 금액 대비 요율(%). 소수 둘째 자리까지 */
function formatRateAgainstBase(amount, base) {
  if (amount == null || base == null || base <= 0) return null
  const pct = (amount / base) * 100
  const rounded = Math.round(pct * 100) / 100
  if (!Number.isFinite(rounded)) return null
  return String(rounded)
}

/** 입력 중에는 숫자·콤마만 보여 준다. 빈칸은 빈칸으로 둔다. */
function toTypingAmountDisplay(value) {
  return formatAmountComma(normalizeAmountDigits(value))
}

/** 저장·표시용 금액. `원 / %` 가 섞여 있어도 금액만 남긴다. */
function formatStoredPaymentAmount(raw) {
  const amount = parseAmountNumber(raw)
  if (amount == null) return ''
  return formatAmountComma(String(amount))
}

/** 준공금액 대비 요율 칸. 준공이 없거나 0이면 비운다. */
function formatRatePercentDisplay(amountRaw, completionRaw) {
  const amount = parseAmountNumber(amountRaw)
  const completion = parseAmountNumber(completionRaw)
  if (amount == null || completion == null || completion <= 0) return ''
  const rate = formatRateAgainstBase(amount, completion)
  return rate == null ? '' : `${rate}%`
}

/**
 * 결제정보 파생 칸.
 * 물품원가·금회지출·수익률은 수기 금액만 저장하고, 요율은 화면에서 계산한다.
 */
function recalcDerivedPaymentInfo(completionRaw, materialCostRaw, currentExpenseRaw, profitRateRaw) {
  return {
    materialCost: formatStoredPaymentAmount(materialCostRaw),
    currentExpense: formatStoredPaymentAmount(currentExpenseRaw),
    profitRate: formatStoredPaymentAmount(profitRateRaw),
  }
}

/** 사업준공금액 blur 시: 준공칸은 금액(콤마)만 정리 + 수기 금액의 요율만 갱신 */
function buildCompletionBlurPaymentInfoFields(
  completionRaw,
  materialCostRaw,
  currentExpenseRaw,
  profitRateRaw
) {
  const completion = parseAmountNumber(completionRaw)
  if (completion == null || completion <= 0) {
    return {
      completionAmount: '',
      materialCost: formatStoredPaymentAmount(materialCostRaw),
      currentExpense: formatStoredPaymentAmount(currentExpenseRaw),
      profitRate: formatStoredPaymentAmount(profitRateRaw),
    }
  }
  return {
    completionAmount: formatAmountComma(String(completion)),
    ...recalcDerivedPaymentInfo(completion, materialCostRaw, currentExpenseRaw, profitRateRaw),
  }
}

const PAYMENT_REPORT_AMOUNT_KEYS = new Set(['plannedAmount'])

const PAYMENT_REPORT_TABLE_COL_COUNT = 12

const PAYMENT_REPORT_EDITABLE_CELL_CLASS = `editable-cell ${TABLE_INLINE_EDITABLE_CELL_CLASS}`

const PAYMENT_CYCLE_TABS = [
  { id: '15', label: '15일 결제' },
  { id: '31', label: '31일 결제' },
  { id: 'all', label: '월 전체' },
]

function normalizePaymentCycle(value) {
  return value === '31' ? '31' : '15'
}

function formatPaymentMonth(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function normalizePaymentMonth(value, fallback = formatPaymentMonth()) {
  const raw = safeString(value).trim()
  if (/^\d{4}-\d{2}$/.test(raw)) return raw
  return fallback
}

function getPaymentYear(monthKey) {
  return normalizePaymentMonth(monthKey).slice(0, 4)
}

function formatPaymentYearLabel(monthKey) {
  return `${getPaymentYear(monthKey)}년`
}

function shiftPaymentYear(monthKey, deltaYears) {
  const base = normalizePaymentMonth(monthKey)
  const [y, m] = base.split('-').map(Number)
  return `${y + deltaYears}-${String(m).padStart(2, '0')}`
}

function getPaymentMonthNumber(monthKey) {
  return Number(normalizePaymentMonth(monthKey).slice(5, 7))
}

function formatPaymentMonthLabel(monthKey) {
  return `${getPaymentMonthNumber(monthKey)}월`
}

function shiftPaymentCalendarMonth(monthKey, deltaMonths) {
  const base = normalizePaymentMonth(monthKey)
  const [year, month] = base.split('-').map(Number)
  const next = new Date(year, month - 1 + deltaMonths, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

function matchesPaymentReportSearch(row, query) {
  const q = safeString(query).trim().toLowerCase()
  if (!q) return true
  const cycleLabel = normalizePaymentCycle(row.paymentCycle) === '31' ? '31일' : '15일'
  const haystack = [
    row.seq,
    row.classification,
    row.projectName,
    row.contractAmount,
    row.projectPeriod,
    row.client,
    row.vendorInfo,
    row.plannedAmount,
    row.progress,
    row.projectVolume,
    row.expenseContent,
    row.vendorDetail,
    row.completionAmount,
    row.materialCost,
    row.currentExpense,
    row.profitRate,
    row.paymentMonth,
    cycleLabel,
  ]
    .map((value) => safeString(value).toLowerCase())
    .join(' ')
  return haystack.includes(q)
}

function displayLocked(value) {
  const text = safeString(value).trim()
  return text || '—'
}

function escapeHtmlForPdf(value) {
  return safeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isMultilinePdfText(value) {
  return /\r|\n/.test(safeString(value))
}

/** html2canvas 는 textarea·pre-wrap 의 줄바꿈을 한 줄로 그리는 경우가 있어 <br> 로 강제한다 */
function applyPdfMirrorText(el, text, multiline) {
  const value = safeString(text)
  if (!multiline) {
    el.textContent = value
    return
  }
  const html = escapeHtmlForPdf(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .join('<br>')
  el.innerHTML = html || '—'
}

function formatContractPeriod(contract) {
  const start = safeString(contract?.contractDate).trim()
  const end = safeString(contract?.dueDate).trim()
  if (start && end) return `${start} ~ ${end}`
  if (start) return start
  if (end) return end
  return ''
}

function formatPdfDateStamp(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/** 파일명 조각 — 경로 금지문자·공백 제거 */
function sanitizePdfFilenamePart(value) {
  const cleaned = safeString(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '')
  return cleaned.slice(0, 40) || '미지정'
}

/** 결제보고_{사업명}_{결제업체정보}_{YYYYMMDD}.pdf */
function buildPaymentReportPdfFilename(projectName, vendorInfo) {
  return `결제보고_${sanitizePdfFilenamePart(projectName)}_${sanitizePdfFilenamePart(vendorInfo)}_${formatPdfDateStamp()}.pdf`
}

function buildMergedPaymentReportPdfFilename() {
  return `결제보고_병합본_${formatPdfDateStamp()}.pdf`
}

function readCssBorder(computed, side) {
  return `${computed[`border${side}Width`]} ${computed[`border${side}Style`]} ${computed[`border${side}Color`]}`
}

/** computed padding 이 0 이면 fallback 사용 (input 의 padding: 0 8px 대응) */
function resolvePaddingPx(computed, side, fallbackPx) {
  const raw = Number.parseFloat(computed[`padding${side}`])
  if (!Number.isFinite(raw) || raw <= 0) return fallbackPx
  return raw
}

/**
 * live <input>/<textarea> → 단일 <div> 미러.
 * - 원본 padding 4방향을 인라인으로 강제 주입 (0 이면 안전한 기본값)
 * - overflow:visible + line-height:1.5 + min-height 로 글자 하단 잘림 방지
 * - 중첩 table-cell 구조는 쓰지 않음 (패딩/정렬이 캡처에서 깨지기 쉬움)
 */
function createFormControlMirror(sourceEl, valueOverride) {
  const isTextarea = sourceEl.tagName.toLowerCase() === 'textarea'
  const computed = window.getComputedStyle(sourceEl)
  const value = valueOverride != null ? safeString(valueOverride) : safeString(sourceEl.value)
  const multiline = isTextarea || isMultilinePdfText(value)
  const text = value || safeString(sourceEl.getAttribute('placeholder')).trim() || '—'
  const color = value ? computed.color : '#94a3b8'

  const padTop = resolvePaddingPx(computed, 'Top', isTextarea ? 8 : 8)
  const padRight = resolvePaddingPx(computed, 'Right', 10)
  const padBottom = resolvePaddingPx(computed, 'Bottom', isTextarea ? 8 : 8)
  const padLeft = resolvePaddingPx(computed, 'Left', 10)
  const fontSize = Number.parseFloat(computed.fontSize) || 13
  const lineCount = Math.max(1, text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').length)
  const contentHeight = lineCount * fontSize * 1.5 + padTop + padBottom
  const measuredHeight = Math.max(
    sourceEl.scrollHeight || 0,
    sourceEl.offsetHeight || 0,
    isTextarea ? 96 : 34,
    multiline ? contentHeight : 0
  )

  const mirror = document.createElement('div')
  mirror.className = multiline
    ? 'payment-report-pdf-input-mirror payment-report-pdf-input-mirror--multiline'
    : 'payment-report-pdf-input-mirror'
  mirror.style.boxSizing = 'border-box'
  mirror.style.display = 'block'
  // 고정 px 폭이면 칸보다 넓어져 한 줄로 잘릴 수 있음 — 멀티라인은 칸에 맞춤
  if (multiline) {
    mirror.style.width = '100%'
  } else {
    mirror.style.width = `${Math.max(sourceEl.offsetWidth, 1)}px`
  }
  mirror.style.maxWidth = '100%'
  mirror.style.minHeight = `${measuredHeight}px`
  mirror.style.height = 'auto'
  mirror.style.margin = '0'
  mirror.style.borderTop = readCssBorder(computed, 'Top')
  mirror.style.borderRight = readCssBorder(computed, 'Right')
  mirror.style.borderBottom = readCssBorder(computed, 'Bottom')
  mirror.style.borderLeft = readCssBorder(computed, 'Left')
  mirror.style.borderRadius = computed.borderRadius || '6px'
  mirror.style.backgroundColor = computed.backgroundColor || '#ffffff'
  mirror.style.fontFamily = computed.fontFamily
  mirror.style.fontSize = computed.fontSize || '13px'
  mirror.style.fontWeight = computed.fontWeight
  mirror.style.color = color
  mirror.style.textAlign = computed.textAlign || 'left'

  mirror.style.paddingTop = `${padTop}px`
  mirror.style.paddingRight = `${padRight}px`
  mirror.style.paddingBottom = `${padBottom}px`
  mirror.style.paddingLeft = `${padLeft}px`

  mirror.style.lineHeight = '1.5'
  mirror.style.overflow = 'visible'
  if (multiline) {
    mirror.style.setProperty('white-space', 'pre-wrap', 'important')
    mirror.style.wordBreak = 'break-word'
    mirror.style.overflowWrap = 'anywhere'
    mirror.style.textOverflow = 'clip'
  } else {
    mirror.style.whiteSpace = 'nowrap'
    mirror.style.wordBreak = 'normal'
    mirror.style.overflowWrap = 'normal'
    mirror.style.textOverflow = 'ellipsis'
  }
  applyPdfMirrorText(mirror, text, multiline)
  return mirror
}

/** 체크박스 등은 PDF 텍스트로 쓰지 않는다 */
function isPdfSkippedControl(el) {
  if (!el) return true
  if (el.closest?.('[data-pdf-exclude]')) return true
  const type = safeString(el.getAttribute?.('type') || el.type).toLowerCase()
  return type === 'checkbox' || type === 'radio' || type === 'hidden' || type === 'button' || type === 'submit'
}

/** clone 쪽 input/textarea 를 필드명으로 짝지어 미러로 치환 — 인덱스 순서에 의존하지 않음 */
function replaceCloneFormControls(cloneControls, liveControls) {
  const liveByField = new Map()
  liveControls.forEach((el) => {
    if (isPdfSkippedControl(el)) return
    const key = safeString(el.getAttribute('data-pdf-field')).trim()
    if (key) liveByField.set(key, el)
  })

  cloneControls.forEach((cloneEl) => {
    if (!cloneEl) return
    if (isPdfSkippedControl(cloneEl)) {
      cloneEl.remove()
      return
    }
    const key = safeString(cloneEl.getAttribute('data-pdf-field')).trim()
    const liveEl = key ? liveByField.get(key) : null
    const sourceEl = liveEl || cloneEl
    const value = liveEl ? liveEl.value : cloneEl.value
    const field = cloneEl.closest('.payment-report-expand-field')
    const mirror = createFormControlMirror(sourceEl, value)
    cloneEl.replaceWith(mirror)
    if (field && mirror.classList.contains('payment-report-pdf-input-mirror--multiline')) {
      field.classList.add('payment-report-expand-field--multiline')
    }
  })
}

/** 체크박스 value="on" 이 사업물량 등과 섞이지 않게 텍스트 입력만 모은다 */
function collectPdfTextControls(rootEl) {
  if (!rootEl) return []
  return [...rootEl.querySelectorAll('input, textarea')].filter((el) => {
    if (el.closest('[data-pdf-exclude]')) return false
    const type = safeString(el.getAttribute('type') || el.type).toLowerCase()
    return type !== 'checkbox' && type !== 'radio' && type !== 'hidden' && type !== 'button' && type !== 'submit'
  })
}

/**
 * 읽기전용 회색 박스(dd 등) 미러 — padding/line-height/overflow 로 잘림 방지
 */
function mirrorStaticTextBox(liveEl, cloneEl) {
  if (!liveEl || !cloneEl) return
  const computed = window.getComputedStyle(liveEl)
  const width = Math.max(liveEl.offsetWidth, cloneEl.offsetWidth, 1)
  const measuredHeight = Math.max(liveEl.offsetHeight, 34)
  const text = safeString(cloneEl.textContent).trim() || '—'
  const multiline =
    cloneEl.classList.contains('payment-report-expand-readonly-wrap') ||
    isMultilinePdfText(text) ||
    measuredHeight > 40

  const padTop = resolvePaddingPx(computed, 'Top', 8)
  const padRight = resolvePaddingPx(computed, 'Right', 10)
  const padBottom = resolvePaddingPx(computed, 'Bottom', 8)
  const padLeft = resolvePaddingPx(computed, 'Left', 10)

  const shell = document.createElement('div')
  shell.className = multiline
    ? 'payment-report-pdf-static-mirror payment-report-pdf-static-mirror--multiline'
    : 'payment-report-pdf-static-mirror'
  shell.style.boxSizing = 'border-box'
  shell.style.display = 'block'
  shell.style.width = multiline ? '100%' : `${width}px`
  shell.style.maxWidth = '100%'
  shell.style.minHeight = `${measuredHeight}px`
  shell.style.height = 'auto'
  shell.style.margin = '0'
  shell.style.backgroundColor = computed.backgroundColor || '#f3f4f6'
  shell.style.borderRadius = computed.borderRadius || '6px'
  shell.style.color = computed.color || '#334155'
  shell.style.fontFamily = computed.fontFamily
  shell.style.fontSize = computed.fontSize || '13px'
  shell.style.fontWeight = computed.fontWeight
  shell.style.paddingTop = `${padTop}px`
  shell.style.paddingRight = `${padRight}px`
  shell.style.paddingBottom = `${padBottom}px`
  shell.style.paddingLeft = `${padLeft}px`
  shell.style.lineHeight = '1.5'
  shell.style.overflow = 'visible'
  if (multiline) {
    shell.style.setProperty('white-space', 'pre-wrap', 'important')
    shell.style.wordBreak = 'break-word'
    shell.style.overflowWrap = 'anywhere'
  } else {
    shell.style.whiteSpace = 'nowrap'
    shell.style.wordBreak = 'normal'
    shell.style.overflowWrap = 'normal'
  }
  applyPdfMirrorText(shell, text, multiline)
  cloneEl.replaceWith(shell)
}

function normalizeCloneStaticBoxes(dataRowEl, detailEl, dataClone, detailClone) {
  const liveDds = detailEl.querySelectorAll('.payment-report-expand-readonly dd')
  const cloneDds = detailClone.querySelectorAll('.payment-report-expand-readonly dd')
  liveDds.forEach((liveEl, index) => {
    if (cloneDds[index]) mirrorStaticTextBox(liveEl, cloneDds[index])
  })

  const liveVendor = detailEl.querySelector('.payment-report-expand-vendor-name')
  const cloneVendor = detailClone.querySelector('.payment-report-expand-vendor-name')
  if (liveVendor && cloneVendor) mirrorStaticTextBox(liveVendor, cloneVendor)

  const liveLockedCells = dataRowEl.querySelectorAll('td.payment-report-cell--locked')
  const cloneLockedCells = dataClone.querySelectorAll('td.payment-report-cell--locked')
  liveLockedCells.forEach((_liveTd, index) => {
    const cloneTd = cloneLockedCells[index]
    if (!cloneTd) return
    const label = safeString(cloneTd.textContent).trim() || '—'
    cloneTd.textContent = ''
    const inner = document.createElement('div')
    inner.className = 'payment-report-pdf-table-cell-text'
    if (cloneTd.classList.contains('payment-report-cell--amount')) {
      inner.style.textAlign = 'right'
    }
    inner.textContent = label
    cloneTd.appendChild(inner)
  })

  dataClone.querySelectorAll('td.payment-report-sticky--seq').forEach((td) => {
    const label = safeString(td.textContent).trim()
    td.textContent = ''
    const inner = document.createElement('div')
    inner.className = 'payment-report-pdf-table-cell-text payment-report-pdf-table-cell-text--center'
    inner.textContent = label
    td.appendChild(inner)
  })
}

/**
 * 캡처 직전: 복제 DOM 전역에 overflow/line-height/min-height/padding 강제 주입
 * (html2canvas 가 flex 정렬을 무시해도 글자가 잘리지 않게)
 */
function hardenCloneStylesForPdfCapture(rootEl) {
  rootEl.querySelectorAll('th, td').forEach((el) => {
    el.style.setProperty('overflow', 'visible', 'important')
    el.style.setProperty('line-height', '1.5', 'important')
    el.style.setProperty('vertical-align', 'middle', 'important')
    el.style.setProperty('height', 'auto', 'important')
    el.style.setProperty('min-height', '48px', 'important')
    el.style.setProperty('padding-top', '12px', 'important')
    el.style.setProperty('padding-bottom', '12px', 'important')
  })

  rootEl
    .querySelectorAll(
      '.payment-report-pdf-table-cell-text, .payment-report-pdf-input-mirror, .payment-report-pdf-static-mirror, .payment-report-locked-text, .editable-text-cell-display'
    )
    .forEach((el) => {
      el.style.setProperty('overflow', 'visible', 'important')
      el.style.setProperty('line-height', '1.5', 'important')
      el.style.setProperty('height', 'auto', 'important')
    })

  rootEl.querySelectorAll('.payment-report-pdf-table-cell-text').forEach((el) => {
    el.style.setProperty('padding-top', '4px', 'important')
    el.style.setProperty('padding-bottom', '4px', 'important')
    el.style.setProperty('min-height', '24px', 'important')
    el.style.setProperty('white-space', 'normal', 'important')
    el.style.setProperty('word-break', 'keep-all', 'important')
  })

  rootEl.querySelectorAll('.payment-report-pdf-input-mirror, .payment-report-pdf-static-mirror').forEach((el) => {
    const cs = window.getComputedStyle(el)
    if (Number.parseFloat(cs.paddingTop) <= 0) el.style.paddingTop = '8px'
    if (Number.parseFloat(cs.paddingBottom) <= 0) el.style.paddingBottom = '8px'
    if (Number.parseFloat(cs.paddingLeft) <= 0) el.style.paddingLeft = '10px'
    if (Number.parseFloat(cs.paddingRight) <= 0) el.style.paddingRight = '10px'
    el.style.setProperty('overflow', 'visible', 'important')
    el.style.setProperty('line-height', '1.5', 'important')
  })

  rootEl
    .querySelectorAll(
      '.payment-report-pdf-input-mirror--multiline, .payment-report-pdf-static-mirror--multiline'
    )
    .forEach((el) => {
      el.style.setProperty('white-space', 'pre-wrap', 'important')
      el.style.setProperty('word-break', 'break-word', 'important')
      el.style.setProperty('overflow-wrap', 'anywhere', 'important')
      el.style.setProperty('overflow', 'visible', 'important')
      el.style.setProperty('height', 'auto', 'important')
      el.style.setProperty('max-width', '100%', 'important')
      el.style.setProperty('width', '100%', 'important')
      el.style.setProperty('text-overflow', 'clip', 'important')
    })

  rootEl.querySelectorAll('.payment-report-expand-field--multiline').forEach((el) => {
    el.style.setProperty('align-items', 'start', 'important')
  })
}

function applyLiveColumnWidths(sourceTable, theadClone, dataRowClone) {
  theadClone.querySelectorAll('[data-pdf-exclude]').forEach((el) => el.remove())
  dataRowClone.querySelectorAll('[data-pdf-exclude]').forEach((el) => el.remove())

  const sourceHeads = [...sourceTable.querySelectorAll('thead th')].filter(
    (th) => !th.hasAttribute('data-pdf-exclude')
  )
  const cloneHeads = theadClone.querySelectorAll('th')
  const cloneCells = dataRowClone.querySelectorAll('td')
  const minWidths = [56, 64, 100, 220, 140, 170, 120, 96, 150, 160, 150]
  let totalWidth = 0

  sourceHeads.forEach((th, index) => {
    const width = Math.max(Math.ceil(th.offsetWidth || 0), minWidths[index] || 100)
    totalWidth += width
    const px = `${width}px`
    if (cloneHeads[index]) {
      cloneHeads[index].style.width = px
      cloneHeads[index].style.minWidth = px
      cloneHeads[index].style.maxWidth = 'none'
    }
    if (cloneCells[index]) {
      cloneCells[index].style.width = px
      cloneCells[index].style.minWidth = px
      cloneCells[index].style.maxWidth = 'none'
    }
  })

  return totalWidth
}

/**
 * 타겟 DOM Clone → input/textarea/읽기전용 박스를 텍스트 미러로 치환한 캡처 루트
 */
function buildPaymentReportPdfCaptureRoot(dataRowEl, detailEl) {
  const sourceTable = dataRowEl.closest('table')
  if (!sourceTable) throw new Error('결제보고 표를 찾을 수 없습니다.')

  const root = document.createElement('div')
  root.className = 'payment-report-pdf-capture-root'

  const tableWrap = document.createElement('div')
  tableWrap.className = 'payment-report-pdf-table-wrap'

  const table = document.createElement('table')
  table.className = 'payment-report-table excel-table registry-table payment-report-pdf-table'

  const thead = sourceTable.querySelector('thead')?.cloneNode(true) || document.createElement('thead')
  thead.querySelectorAll('[data-pdf-exclude]').forEach((el) => el.remove())
  const dataClone = dataRowEl.cloneNode(true)
  dataClone.classList.add('is-expanded')
  dataClone.querySelectorAll('.payment-report-row-hint').forEach((el) => el.remove())
  dataClone.querySelectorAll('[data-pdf-exclude]').forEach((el) => el.remove())
  const columnsWidth = applyLiveColumnWidths(sourceTable, thead, dataClone)

  const tbody = document.createElement('tbody')
  tbody.appendChild(dataClone)
  table.appendChild(thead)
  table.appendChild(tbody)
  table.style.width = `${columnsWidth}px`
  table.style.minWidth = `${columnsWidth}px`
  tableWrap.appendChild(table)
  root.appendChild(tableWrap)

  const detailWrap = document.createElement('div')
  detailWrap.className = 'payment-report-pdf-detail-wrap'
  const detailClone = detailEl.cloneNode(true)
  detailClone.querySelectorAll('[data-pdf-exclude]').forEach((el) => el.remove())
  detailWrap.appendChild(detailClone)
  root.appendChild(detailWrap)

  normalizeCloneStaticBoxes(dataRowEl, detailEl, dataClone, detailClone)

  const liveControls = [
    ...collectPdfTextControls(dataRowEl),
    ...collectPdfTextControls(detailEl),
  ]
  const cloneControls = [
    ...collectPdfTextControls(dataClone),
    ...collectPdfTextControls(detailClone),
  ]
  replaceCloneFormControls(cloneControls, liveControls)

  // 치환 직후 잘림/패딩 방어 스타일 강제 주입
  hardenCloneStylesForPdfCapture(root)

  const captureWidth = Math.max(columnsWidth + 56, detailEl.scrollWidth + 56, 1360)
  root.style.width = `${captureWidth}px`
  root.style.maxWidth = 'none'
  root.style.boxSizing = 'border-box'
  root.style.background = '#ffffff'
  return root
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

function waitForStyleReflow(ms = 100) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function createOffscreenPdfHost() {
  const host = document.createElement('div')
  host.className = 'payment-report-pdf-capture-host'
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    'margin:0',
    'padding:0',
    'opacity:1',
    'pointer-events:none',
    'z-index:1',
    'width:1400px',
    'background:#ffffff',
  ].join(';')
  return host
}

/**
 * 아코디언이 접혀 있어도 캡처되도록, 화면 밖에 행+펼친 세부사항을 펼쳐 둔다.
 */
async function mountForcedOpenPaymentReportSlice(rowId) {
  const dataRowEl = document.querySelector(`[data-payment-report-data-id="${rowId}"]`)
  const detailEl = document.getElementById(`payment-report-pdf-${rowId}`)
  if (!dataRowEl || !detailEl) {
    throw new Error('세부사항 영역을 찾을 수 없습니다.')
  }
  const sourceTable = dataRowEl.closest('table')
  if (!sourceTable) throw new Error('결제보고 표를 찾을 수 없습니다.')

  const host = createOffscreenPdfHost()
  const table = sourceTable.cloneNode(false)
  const thead = sourceTable.querySelector('thead')?.cloneNode(true)
  const tbody = document.createElement('tbody')
  const dataClone = dataRowEl.cloneNode(true)
  dataClone.classList.add('is-expanded')
  tbody.appendChild(dataClone)

  const expandRow = document.createElement('tr')
  expandRow.className = 'payment-report-expand-row is-open'
  const expandTd = document.createElement('td')
  expandTd.colSpan = Math.max(sourceTable.querySelectorAll('thead th').length, PAYMENT_REPORT_TABLE_COL_COUNT)
  const inner = document.createElement('div')
  inner.className = 'payment-report-expand-inner'
  inner.style.display = 'block'
  inner.style.gridTemplateRows = '1fr'
  const body = document.createElement('div')
  body.className = 'payment-report-expand-body'
  body.style.overflow = 'visible'
  body.style.height = 'auto'
  body.style.minHeight = 'auto'
  body.style.padding = '16px 18px 18px'
  const detailClone = detailEl.cloneNode(true)
  detailClone.style.overflow = 'visible'
  detailClone.style.height = 'auto'
  body.appendChild(detailClone)
  inner.appendChild(body)
  expandTd.appendChild(inner)
  expandRow.appendChild(expandTd)
  tbody.appendChild(expandRow)
  if (thead) table.appendChild(thead)
  table.appendChild(tbody)
  host.appendChild(table)
  document.body.appendChild(host)

  await waitForNextPaint()
  await waitForStyleReflow(80)
  return { host, dataRowEl: dataClone, detailEl: detailClone }
}

async function capturePaymentReportCanvas(dataRowEl, detailEl) {
  const clone = buildPaymentReportPdfCaptureRoot(dataRowEl, detailEl)
  const host = createOffscreenPdfHost()
  host.appendChild(clone)
  document.body.appendChild(host)

  await waitForNextPaint()
  await waitForStyleReflow(100)

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.offsetWidth,
      windowHeight: Math.max(clone.scrollHeight, document.documentElement.offsetHeight),
    })
    if (!canvas.width || !canvas.height) {
      throw new Error('PDF 캡처 결과가 비어 있습니다.')
    }
    return canvas
  } finally {
    host.remove()
  }
}

async function capturePaymentReportRowCanvas(rowId) {
  const staged = await mountForcedOpenPaymentReportSlice(rowId)
  try {
    return await capturePaymentReportCanvas(staged.dataRowEl, staged.detailEl)
  } finally {
    staged.host.remove()
  }
}

function appendCanvasToPdf(pdf, canvas, { addPageBefore = false } = {}) {
  if (addPageBefore) pdf.addPage()

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 8
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2
  const imgData = canvas.toDataURL('image/png')
  const imgWidth = usableWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = margin
  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
  heightLeft -= usableHeight

  while (heightLeft > 1) {
    position = margin - (imgHeight - heightLeft)
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= usableHeight
  }
}

function createLandscapePaymentPdf() {
  return new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
}

async function downloadPaymentReportDetailPdf(row) {
  if (!row?.id) throw new Error('PDF 대상 영역을 찾을 수 없습니다.')
  const canvas = await capturePaymentReportRowCanvas(row.id)
  const pdf = createLandscapePaymentPdf()
  appendCanvasToPdf(pdf, canvas)
  pdf.save(buildPaymentReportPdfFilename(row.projectName, row.vendorInfo))
}

async function downloadMergedPaymentReportPdf(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row?.id)
  if (!list.length) throw new Error('선택된 결제보고가 없습니다.')

  const pdf = createLandscapePaymentPdf()
  for (let index = 0; index < list.length; index += 1) {
    const canvas = await capturePaymentReportRowCanvas(list[index].id)
    appendCanvasToPdf(pdf, canvas, { addPageBefore: index > 0 })
  }
  pdf.save(buildMergedPaymentReportPdfFilename())
}

/** 분류(참고번호) ↔ 계약현황 참고번호 매칭. 숫자면 선행 0 무시하고 동일 숫자로도 찾는다. */
export function findContractByClassification(contracts, classification) {
  const raw = safeString(classification).trim()
  if (!raw) return null

  const list = (Array.isArray(contracts) ? contracts : []).filter((row) => row && !row.isDraft)

  const exact = list.find((row) => safeString(row.refNo).trim() === raw)
  if (exact) return exact

  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    return (
      list.find((row) => {
        const ref = safeString(row.refNo).trim()
        return /^\d+$/.test(ref) && Number(ref) === n
      }) || null
    )
  }

  return null
}

function buildAutofillFromContract(contract) {
  if (!contract) {
    return {
      projectName: '',
      contractAmount: '',
      projectPeriod: '',
      client: '',
    }
  }
  return {
    projectName: safeString(contract.projectName).trim(),
    contractAmount: formatAmountComma(contract.amount),
    projectPeriod: formatContractPeriod(contract),
    client: safeString(contract.client).trim(),
  }
}

/** 분류 입력값과 계약현황 매칭 결과로 표에 표시할 뱃지 상태를 만든다. */
function resolveMatchStatus(contracts, classification) {
  const text = safeString(classification).trim()
  if (!text) return 'idle'
  return findContractByClassification(contracts, text) ? 'matched' : 'missed'
}

function createPaymentReportRow(seq, id, paymentCycle = '15', paymentMonth = formatPaymentMonth()) {
  return {
    id,
    seq,
    sortOrder: seq,
    paymentMonth: normalizePaymentMonth(paymentMonth),
    paymentCycle: normalizePaymentCycle(paymentCycle),
    classification: '',
    projectName: '',
    contractAmount: '',
    projectPeriod: '',
    client: '',
    vendorInfo: '',
    plannedAmount: '',
    progress: '',
    projectVolume: '',
    expenseContent: '',
    vendorDetail: '',
    completionAmount: '',
    materialCost: '',
    currentExpense: '',
    profitRate: '',
    files: [],
    attachmentItems: [],
  }
}

function isPersistedPaymentReportId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    safeString(id).trim()
  )
}

function PaymentAmountRateField({
  label,
  fieldKey,
  amountValue,
  completionAmount,
  onChange,
  onBlur,
}) {
  return (
    <div className="payment-report-expand-field payment-report-expand-field--split">
      <span>{label}</span>
      <div className="payment-report-amount-rate">
        <input
          className="payment-report-cell-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          data-pdf-field={fieldKey}
          value={formatStoredPaymentAmount(amountValue)}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={() => onBlur?.()}
          placeholder="금액 입력"
          aria-label={`${label} 금액`}
        />
        <input
          className="payment-report-cell-input payment-report-cell-input--readonly payment-report-rate-input"
          type="text"
          readOnly
          tabIndex={-1}
          autoComplete="off"
          data-pdf-field={`${fieldKey}-rate`}
          value={formatRatePercentDisplay(amountValue, completionAmount)}
          placeholder="-%"
          aria-label={`${label} 요율`}
        />
      </div>
    </div>
  )
}

function PaymentReportExpandedPanel({
  row,
  onChange,
  onCompletionAmountChange,
  onCompletionAmountBlur,
  onMaterialCostChange,
  onMaterialCostBlur,
  onCurrentExpenseChange,
  onCurrentExpenseBlur,
  onProfitRateChange,
  onProfitRateBlur,
  onAttachmentsChange,
  onCommit,
  onDownloadPdf,
  isDownloading,
}) {
  const commit = () => onCommit?.(row.id)
  return (
    <div
      id={`payment-report-pdf-${row.id}`}
      className="payment-report-expand-section"
      data-payment-report-pdf-root="true"
    >
      <div className="payment-report-expand-section-header">
        <h3 className="payment-report-expand-section-title">결제관련 세부사항</h3>
        <button
          type="button"
          className="payment-report-pdf-btn"
          data-pdf-exclude="true"
          disabled={isDownloading}
          onClick={() => onDownloadPdf?.(row)}
        >
          {isDownloading ? 'PDF 생성 중…' : '📄 PDF 다운로드'}
        </button>
      </div>
      <div className="payment-report-expand-grid">
      <div className="payment-report-expand-pane">
        <h4 className="payment-report-expand-pane-title">사업정보</h4>
        <dl className="payment-report-expand-readonly">
          <div>
            <dt>사업명</dt>
            <dd>{displayLocked(row.projectName)}</dd>
          </div>
          <div>
            <dt>계약금액</dt>
            <dd>{displayLocked(row.contractAmount)}</dd>
          </div>
          <div>
            <dt>사업기간</dt>
            <dd>{displayLocked(row.projectPeriod)}</dd>
          </div>
          <div>
            <dt>발주처</dt>
            <dd>{displayLocked(row.client)}</dd>
          </div>
          <div>
            <dt>사업진행사항</dt>
            <dd className="payment-report-expand-readonly-wrap">{displayLocked(row.progress)}</dd>
          </div>
        </dl>
        <label className="payment-report-expand-field">
          <span>사업물량</span>
          <textarea
            className="payment-report-expand-textarea"
            rows={5}
            data-pdf-field="projectVolume"
            value={row.projectVolume}
            onChange={(e) => onChange(row.id, 'projectVolume', e.target.value)}
            onBlur={commit}
            placeholder="사업물량을 입력하세요"
          />
        </label>
      </div>

      <div className="payment-report-expand-pane">
        <h4 className="payment-report-expand-pane-title">결제관련</h4>
        <div className="payment-report-expand-vendor">
          <span className="payment-report-expand-vendor-label">업체명</span>
          <strong className="payment-report-expand-vendor-name">{displayLocked(row.vendorInfo)}</strong>
        </div>
        <label className="payment-report-expand-field">
          <span>지출내용</span>
          <textarea
            className="payment-report-expand-textarea"
            rows={3}
            data-pdf-field="expenseContent"
            value={row.expenseContent}
            onChange={(e) => onChange(row.id, 'expenseContent', e.target.value)}
            onBlur={commit}
            placeholder="지출내용을 입력하세요"
          />
        </label>
        <label className="payment-report-expand-field">
          <span>업체정보</span>
          <textarea
            className="payment-report-expand-textarea"
            rows={3}
            data-pdf-field="vendorDetail"
            value={row.vendorDetail}
            onChange={(e) => onChange(row.id, 'vendorDetail', e.target.value)}
            onBlur={commit}
            placeholder="업체정보를 입력하세요"
          />
        </label>
        <div className="payment-report-expand-amounts">
          <p className="payment-report-expand-amounts-title">결제정보</p>
          <label className="payment-report-expand-field">
            <span>사업준공금액</span>
            <input
              className="payment-report-cell-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              data-pdf-field="completionAmount"
              value={row.completionAmount}
              onChange={(e) => onCompletionAmountChange?.(row.id, e.target.value)}
              onFocus={(e) => {
                const amount = parseAmountNumber(e.target.value)
                if (amount != null && /원|\//.test(e.target.value)) {
                  onChange(row.id, 'completionAmount', formatAmountComma(String(amount)))
                }
              }}
              onBlur={() => onCompletionAmountBlur?.(row.id)}
              placeholder="금액 입력"
            />
          </label>
          <PaymentAmountRateField
            label="물품원가금액"
            fieldKey="materialCost"
            amountValue={row.materialCost}
            completionAmount={row.completionAmount}
            onChange={(value) => onMaterialCostChange?.(row.id, value)}
            onBlur={() => onMaterialCostBlur?.(row.id)}
          />
          <PaymentAmountRateField
            label="금회지출액"
            fieldKey="currentExpense"
            amountValue={row.currentExpense}
            completionAmount={row.completionAmount}
            onChange={(value) => onCurrentExpenseChange?.(row.id, value)}
            onBlur={() => onCurrentExpenseBlur?.(row.id)}
          />
          <PaymentAmountRateField
            label="수익률"
            fieldKey="profitRate"
            amountValue={row.profitRate}
            completionAmount={row.completionAmount}
            onChange={(value) => onProfitRateChange?.(row.id, value)}
            onBlur={() => onProfitRateBlur?.(row.id)}
          />
        </div>
      </div>
      </div>
      <RecordFileAttachments
        items={Array.isArray(row.attachmentItems) ? row.attachmentItems : []}
        onChange={(next) => onAttachmentsChange?.(row.id, next)}
        downloadHrefFor={
          isPersistedPaymentReportId(row.id)
            ? (item) => recordAttachmentDownloadUrl(PAYMENT_REPORTS_API_PATH, row.id, item.id)
            : undefined
        }
      />
    </div>
  )
}

/** 같은 결제월·주기 안에서 구분(seq)을 1부터 다시 부여 */
function renumberRowsByMonthCycle(rows) {
  const counters = new Map()
  return rows.map((row) => {
    const month = normalizePaymentMonth(row.paymentMonth)
    const cycle = normalizePaymentCycle(row.paymentCycle)
    const key = `${month}:${cycle}`
    const nextSeq = (counters.get(key) || 0) + 1
    counters.set(key, nextSeq)
    return {
      ...row,
      paymentMonth: month,
      paymentCycle: cycle,
      seq: nextSeq,
    }
  })
}

/**
 * 결제보고 등록/수정 표.
 * - 월(YYYY-MM) x 결제주기(15/31)로 건을 구분
 * - 구분: 같은 월·주기 내 등록 순번(1부터)
 * - 분류 입력 시 사업명·계약금액·사업기간·발주처를 계약현황에서 채워 잠금
 */
export default function PaymentReportPage({ contracts = [] }) {
  const [activeMonth, setActiveMonth] = useState(() => formatPaymentMonth())
  const selectedMonth = getPaymentMonthNumber(activeMonth)
  const [activeTab, setActiveTab] = useState('15')
  const [searchQuery, setSearchQuery] = useState('')
  const { itemToDelete, isModalOpen, requestDelete, cancelDelete } = useDeleteConfirm()
  const [rows, setRows] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [pdfDownloadingId, setPdfDownloadingId] = useState('')
  const [saveError, setSaveError] = useState('')

  const rowsRef = useRef(rows)
  const saveTimersRef = useRef({})
  const dirtyIdsRef = useRef(new Set())
  const savingIdsRef = useRef(new Set())
  const selectAllRef = useRef(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const visibleRows = useMemo(() => {
    const monthKey = normalizePaymentMonth(activeMonth)
    const query = safeString(searchQuery).trim()
    const inMonth = rows.filter((row) => normalizePaymentMonth(row.paymentMonth) === monthKey)
    const byCycle =
      activeTab === 'all'
        ? inMonth
        : inMonth.filter((row) => normalizePaymentCycle(row.paymentCycle) === normalizePaymentCycle(activeTab))
    if (!query) return byCycle
    return byCycle.filter((row) => matchesPaymentReportSearch(row, query))
  }, [rows, activeMonth, activeTab, searchQuery])

  const selectedVisibleRows = useMemo(
    () => visibleRows.filter((row) => selectedIds.has(row.id)),
    [visibleRows, selectedIds]
  )
  const selectedCount = selectedVisibleRows.length
  const allVisibleSelected = visibleRows.length > 0 && selectedCount === visibleRows.length
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected, allVisibleSelected])

  /** 서버 반영 — 저장 중 들어온 추가 입력은 dirty 로 남겨 뒤이어 한 번 더 저장한다. */
  const persistRow = useCallback(async (rowId) => {
    const row = rowsRef.current.find((item) => item.id === rowId)
    if (!row || savingIdsRef.current.has(rowId)) return

    savingIdsRef.current.add(rowId)
    dirtyIdsRef.current.delete(rowId)
    const attachmentItems = Array.isArray(row.attachmentItems)
      ? row.attachmentItems
      : mergeAttachmentLists(row.files, [])
    const uploadedLocalIds = new Set(
      attachmentItems.filter((item) => item?.file instanceof File).map((item) => item.id)
    )
    try {
      const saved = isPersistedPaymentReportId(row.id)
        ? await paymentReportsApi.update(row.id, row)
        : await paymentReportsApi.create(row)
      let files = saved?.files
      if (attachmentsNeedSync(attachmentItems, saved?.files)) {
        const attached = await saveRecordAttachments(PAYMENT_REPORTS_API_PATH, saved.id, attachmentItems)
        files = attached?.files ?? files
      }
      const normalized = normalizePaymentReportRow({ ...saved, files }, row.seq)

      setRows((prev) => {
        const next = prev.map((item) => {
          if (item.id !== rowId) return item
          if (dirtyIdsRef.current.has(rowId)) {
            return {
              ...item,
              id: normalized.id,
              sortOrder: normalized.sortOrder,
              files: normalized.files,
              attachmentItems: mergeAttachmentLists(
                normalized.files,
                (item.attachmentItems || []).filter(
                  (entry) => entry?.file instanceof File && !uploadedLocalIds.has(entry.id)
                )
              ),
            }
          }
          return { ...normalized, seq: item.seq }
        })
        rowsRef.current = next
        return next
      })
      setSaveError('')

      if (dirtyIdsRef.current.has(rowId)) {
        dirtyIdsRef.current.delete(rowId)
        dirtyIdsRef.current.add(normalized.id)
        savingIdsRef.current.delete(rowId)
        window.setTimeout(() => persistRow(normalized.id), 0)
        return
      }
    } catch (error) {
      dirtyIdsRef.current.add(rowId)
      setSaveError(safeString(error?.message) || '결제보고 저장에 실패했습니다.')
    } finally {
      savingIdsRef.current.delete(rowId)
    }
  }, [])

  const scheduleSave = useCallback(
    (rowId) => {
      dirtyIdsRef.current.add(rowId)
      const timers = saveTimersRef.current
      if (timers[rowId]) window.clearTimeout(timers[rowId])
      timers[rowId] = window.setTimeout(() => {
        delete timers[rowId]
        persistRow(rowId)
      }, 500)
    },
    [persistRow]
  )

  const flushSave = useCallback(
    (rowId) => {
      const timers = saveTimersRef.current
      if (timers[rowId]) {
        window.clearTimeout(timers[rowId])
        delete timers[rowId]
      }
      if (dirtyIdsRef.current.has(rowId)) persistRow(rowId)
    },
    [persistRow]
  )

  useEffect(() => {
    let cancelled = false
    const timers = saveTimersRef.current

    async function loadRows() {
      try {
        const list = await paymentReportsApi.list()
        if (cancelled) return
        const normalized = (Array.isArray(list) ? list : []).map((row, index) =>
          normalizePaymentReportRow(row, index + 1)
        )
        setRows(renumberRowsByMonthCycle(normalized))
        setSaveError('')
      } catch (error) {
        if (cancelled) return
        setSaveError(safeString(error?.message) || '결제보고를 불러오지 못했습니다.')
      }
    }

    loadRows()
    return () => {
      cancelled = true
      Object.values(timers).forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  /**
   * 행 수정 반영.
   * rowsRef 를 즉시 갱신해야 뒤이은 저장이 방금 입력한 값을 읽는다.
   * immediate=true 는 셀 편집 확정처럼 더 미룰 이유가 없는 경우에 쓴다.
   */
  const applyRowUpdate = useCallback(
    (rowId, updater, { immediate = false } = {}) => {
      let changed = false
      const next = rowsRef.current.map((row) => {
        if (row.id !== rowId) return row
        changed = true
        return updater(row)
      })
      if (!changed) return

      rowsRef.current = next
      setRows(next)

      if (immediate) {
        dirtyIdsRef.current.add(rowId)
        flushSave(rowId)
        return
      }
      scheduleSave(rowId)
    },
    [flushSave, scheduleSave]
  )

  /** 분류 → 계약현황 자동완성. 채워진 값도 그대로 저장 대상에 포함된다. */
  const applyClassificationLookup = useCallback(
    (rowId, classificationValue) => {
      const found = findContractByClassification(contracts, classificationValue)
      const autofill = buildAutofillFromContract(found)

      applyRowUpdate(
        rowId,
        (row) => ({
          ...row,
          classification: safeString(classificationValue),
          projectName: autofill.projectName,
          contractAmount: autofill.contractAmount,
          projectPeriod: autofill.projectPeriod,
          client: autofill.client,
        }),
        { immediate: true }
      )
    },
    [contracts, applyRowUpdate]
  )

  const handleAttachmentsChange = useCallback(
    (rowId, nextItems) => {
      applyRowUpdate(rowId, (row) => ({
        ...row,
        attachmentItems: Array.isArray(nextItems) ? nextItems : [],
      }))
    },
    [applyRowUpdate]
  )

  const handleEditableChange = useCallback(
    (rowId, key, value, options) => {
      applyRowUpdate(
        rowId,
        (row) => {
          const nextValue = PAYMENT_REPORT_AMOUNT_KEYS.has(key)
            ? formatAmountComma(value)
            : value
          const nextRow = { ...row, [key]: nextValue }
          return nextRow
        },
        options
      )
    },
    [applyRowUpdate]
  )

  /** 사업준공금액 입력 중 — 숫자·콤마만 보여 주고, 수기 금액의 요율·수익률을 갱신 */
  const handleCompletionAmountChange = useCallback(
    (rowId, value) => {
      applyRowUpdate(rowId, (row) => {
        const digits = normalizeAmountDigits(value)
        const display = formatAmountComma(digits)
        return {
          ...row,
          completionAmount: display,
          ...recalcDerivedPaymentInfo(display, row.materialCost, row.currentExpense, row.profitRate),
        }
      })
    },
    [applyRowUpdate]
  )

  /** 사업준공금액 확정 — 금액(콤마)만 정리 + 파생 요율 저장 */
  const handleCompletionAmountBlur = useCallback(
    (rowId) => {
      applyRowUpdate(
        rowId,
        (row) => ({
          ...row,
          ...buildCompletionBlurPaymentInfoFields(
            row.completionAmount,
            row.materialCost,
            row.currentExpense,
            row.profitRate
          ),
        }),
        { immediate: true }
      )
    },
    [applyRowUpdate]
  )

  /** 물품원가금액 수기 입력. 요율만 준공금액 대비 자동. */
  const handleMaterialCostChange = useCallback(
    (rowId, value) => {
      applyRowUpdate(rowId, (row) => {
        const display = toTypingAmountDisplay(value)
        return {
          ...row,
          materialCost: display,
        }
      })
    },
    [applyRowUpdate]
  )

  const handleMaterialCostBlur = useCallback(
    (rowId) => {
      applyRowUpdate(
        rowId,
        (row) => ({
          ...row,
          materialCost: formatStoredPaymentAmount(row.materialCost),
        }),
        { immediate: true }
      )
    },
    [applyRowUpdate]
  )

  /** 금회지출액 수기 입력. 요율만 준공금액 대비 자동. */
  const handleCurrentExpenseChange = useCallback(
    (rowId, value) => {
      applyRowUpdate(rowId, (row) => {
        const display = toTypingAmountDisplay(value)
        return {
          ...row,
          currentExpense: display,
        }
      })
    },
    [applyRowUpdate]
  )

  const handleCurrentExpenseBlur = useCallback(
    (rowId) => {
      applyRowUpdate(
        rowId,
        (row) => ({
          ...row,
          currentExpense: formatStoredPaymentAmount(row.currentExpense),
        }),
        { immediate: true }
      )
    },
    [applyRowUpdate]
  )

  /** 수익률 수기 금액 입력. 요율만 준공금액 대비 자동. */
  const handleProfitRateChange = useCallback(
    (rowId, value) => {
      applyRowUpdate(rowId, (row) => {
        const display = toTypingAmountDisplay(value)
        return {
          ...row,
          profitRate: display,
        }
      })
    },
    [applyRowUpdate]
  )

  const handleProfitRateBlur = useCallback(
    (rowId) => {
      applyRowUpdate(
        rowId,
        (row) => ({
          ...row,
          profitRate: formatStoredPaymentAmount(row.profitRate),
        }),
        { immediate: true }
      )
    },
    [applyRowUpdate]
  )

  const handleCellCommit = useCallback(
    (rowId, key, value) => {
      handleEditableChange(rowId, key, value, { immediate: true })
    },
    [handleEditableChange]
  )

  const toggleRowExpand = (rowId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const handleDownloadPdf = async (row) => {
    if (!row?.id || pdfDownloadingId) return
    setPdfDownloadingId(row.id)
    try {
      await downloadPaymentReportDetailPdf(row)
    } catch (error) {
      console.error(error)
      window.alert('PDF 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setPdfDownloadingId('')
    }
  }

  const handleMergePdfDownload = async () => {
    if (!selectedCount || pdfDownloadingId) return
    setPdfDownloadingId('merge')
    try {
      await downloadMergedPaymentReportPdf(selectedVisibleRows)
    } catch (error) {
      console.error(error)
      window.alert('병합 PDF 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setPdfDownloadingId('')
    }
  }

  const toggleRowSelected = (rowId, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  const toggleSelectAllVisible = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      visibleRows.forEach((row) => {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      })
      return next
    })
  }

  const handleYearShift = (deltaYears) => {
    setActiveMonth(shiftPaymentYear(activeMonth, deltaYears))
  }

  const handleMonthShift = (deltaMonths) => {
    setActiveMonth(shiftPaymentCalendarMonth(activeMonth, deltaMonths))
  }

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
  }

  const handleAddRow = async () => {
    const month = normalizePaymentMonth(activeMonth)
    const cycle = activeTab === 'all' ? '15' : normalizePaymentCycle(activeTab)
    const bucketCount = rowsRef.current.filter(
      (row) =>
        normalizePaymentMonth(row.paymentMonth) === month &&
        normalizePaymentCycle(row.paymentCycle) === cycle
    ).length
    const draft = createPaymentReportRow(
      bucketCount + 1,
      `draft-${Date.now()}`,
      cycle,
      month
    )

    try {
      const created = await paymentReportsApi.create(draft)
      const normalized = normalizePaymentReportRow(created, draft.seq)
      setRows((prev) => renumberRowsByMonthCycle([...prev, normalized]))
      setSaveError('')
    } catch (error) {
      setRows((prev) => renumberRowsByMonthCycle([...prev, draft]))
      scheduleSave(draft.id)
      setSaveError(safeString(error?.message) || '등록에 실패했습니다.')
    }
  }

  const handleRemoveRow = async (rowId) => {
    if (!rowId) return
    const timers = saveTimersRef.current
    if (timers[rowId]) {
      window.clearTimeout(timers[rowId])
      delete timers[rowId]
    }
    dirtyIdsRef.current.delete(rowId)

    if (isPersistedPaymentReportId(rowId)) {
      try {
        await paymentReportsApi.bulkDelete([rowId])
        setSaveError('')
      } catch (error) {
        setSaveError(safeString(error?.message) || '삭제에 실패했습니다.')
        return
      }
    }

    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
    setSelectedIds((prev) => {
      if (!prev.has(rowId)) return prev
      const next = new Set(prev)
      next.delete(rowId)
      return next
    })
    setRows((prev) => renumberRowsByMonthCycle(prev.filter((row) => row.id !== rowId)))
  }

  return (
    <section className="stat-card payment-report-page" aria-label="결제보고">
      <div className="payment-report-toolbar">
        <button type="button" className="primary-btn payment-report-add-btn" onClick={handleAddRow}>
          등록
        </button>

        <div className="payment-report-period-nav">
          <div className="payment-report-month-nav" aria-label="결제 연도 선택">
            <button
              type="button"
              className="payment-report-month-btn"
              onClick={() => handleYearShift(-1)}
              aria-label="이전 해"
            >
              ‹
            </button>
            <span className="payment-report-month-label">{formatPaymentYearLabel(activeMonth)}</span>
            <button
              type="button"
              className="payment-report-month-btn"
              onClick={() => handleYearShift(1)}
              aria-label="다음 해"
            >
              ›
            </button>
          </div>
          <div className="payment-report-month-nav" aria-label={`결제 월 선택, 현재 ${selectedMonth}월`}>
            <button
              type="button"
              className="payment-report-month-btn"
              onClick={() => handleMonthShift(-1)}
              aria-label="이전 달"
            >
              ‹
            </button>
            <span className="payment-report-month-label payment-report-month-label--month">
              {formatPaymentMonthLabel(activeMonth)}
            </span>
            <button
              type="button"
              className="payment-report-month-btn"
              onClick={() => handleMonthShift(1)}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
        </div>

        <div className="payment-report-tabs" role="tablist" aria-label="결제 주기">
          {PAYMENT_CYCLE_TABS.map((tab) => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`payment-report-tab-${tab.id}`}
                aria-selected={selected}
                className={`payment-report-tab${selected ? ' is-active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="payment-report-merge-pdf-btn"
          disabled={selectedCount === 0 || Boolean(pdfDownloadingId)}
          onClick={() => void handleMergePdfDownload()}
        >
          {pdfDownloadingId === 'merge' ? '병합 PDF 생성 중…' : '📄 선택항목 병합 PDF 다운로드'}
          <span className="payment-report-merge-pdf-badge">{selectedCount}건</span>
        </button>

        <input
          className="table-search-input payment-report-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="사업명, 업체, 발주처 등 검색"
          aria-label="결제보고 검색"
        />
      </div>

      <p className="payment-report-page-desc">
        {formatPaymentYearLabel(activeMonth)} {formatPaymentMonthLabel(activeMonth)} 기준으로{' '}
        {activeTab === 'all'
          ? '선택한 달의 15일·31일 결제 건을 함께 표시합니다. 등록 시 기본값은 15일 결제입니다.'
          : `${activeTab}일 결제 건만 표시합니다. 등록 시 현재 연·월·주기가 자동 적용됩니다.`}{' '}
        분류(참고번호)를 입력하면 계약현황 정보가 표에 자동 입력되며 수정할 수 없습니다.
      </p>

      {saveError ? (
        <p className="payment-report-save-error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="payment-report-table-wrap">
        <table className="payment-report-table excel-table registry-table">
          <thead>
            <tr>
              <th
                className="payment-report-sticky payment-report-sticky--select"
                data-pdf-exclude="true"
              >
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                  aria-label="결제보고 전체 선택"
                />
              </th>
              <th className="payment-report-sticky payment-report-sticky--action">삭제</th>
              <th className="payment-report-sticky payment-report-sticky--seq">구분</th>
              <th className="payment-report-sticky payment-report-sticky--class">분류</th>
              <th className="payment-report-sticky payment-report-sticky--project">사업명</th>
              <th className="payment-report-sticky payment-report-sticky--amount">
                계약금액 (VAT 포함)
              </th>
              <th className="payment-report-sticky payment-report-sticky--period">사업기간</th>
              <th className="payment-report-sticky payment-report-sticky--client">발주처</th>
              <th className="payment-report-sticky payment-report-sticky--detail payment-report-sticky--last">
                세부사항
              </th>
              <th className="payment-report-col-vendor">결제 업체정보</th>
              <th className="payment-report-col-planned">결제 예정 금액 (VAT 포함)</th>
              <th className="payment-report-col-progress">진행사항</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isExpanded = expandedIds.has(row.id)
              const matchStatus = resolveMatchStatus(contracts, row.classification)
              return (
                <Fragment key={row.id}>
                  <tr
                    className={
                      isExpanded ? 'payment-report-data-row is-expanded' : 'payment-report-data-row'
                    }
                    data-payment-report-data-id={row.id}
                  >
                    <td
                      className="payment-report-sticky payment-report-sticky--select"
                      data-pdf-exclude="true"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={(e) => toggleRowSelected(row.id, e.target.checked)}
                        aria-label={`${row.seq}번 행 선택`}
                      />
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--action">
                      <button
                        type="button"
                        className="payment-report-remove-btn"
                        onClick={() => requestDelete(row.id)}
                        aria-label={`${row.seq}번 행 삭제`}
                      >
                        ×
                      </button>
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--seq payment-report-cell--locked">
                      {row.seq}
                    </td>
                    <td
                      className={`payment-report-sticky payment-report-sticky--class ${PAYMENT_REPORT_EDITABLE_CELL_CLASS}`}
                    >
                      <EditableTextCell
                        value={row.classification}
                        inputClassName={EXCLUDED_INLINE_EDITOR_CLASS}
                        onSave={(nextValue) => applyClassificationLookup(row.id, nextValue)}
                      />
                      {matchStatus === 'matched' ? (
                        <span className="payment-report-row-hint payment-report-row-hint--ok">일치</span>
                      ) : null}
                      {matchStatus === 'missed' ? (
                        <span className="payment-report-row-hint payment-report-row-hint--warn">없음</span>
                      ) : null}
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--project payment-report-cell--locked">
                      <span className="payment-report-locked-text payment-report-locked-text--wrap">
                        {row.projectName || '—'}
                      </span>
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--amount payment-report-cell--locked payment-report-cell--amount">
                      {row.contractAmount || '—'}
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--period payment-report-cell--locked">
                      <span className="payment-report-locked-text" title={row.projectPeriod || undefined}>
                        {row.projectPeriod || '—'}
                      </span>
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--client payment-report-cell--locked">
                      <span className="payment-report-locked-text" title={row.client || undefined}>
                        {row.client || '—'}
                      </span>
                    </td>
                    <td className="payment-report-sticky payment-report-sticky--detail payment-report-sticky--last payment-report-col-detail">
                      <div className="payment-report-detail-cell-inner">
                        <button
                          type="button"
                          className={`payment-report-detail-btn${isExpanded ? ' is-open' : ''}`}
                          aria-expanded={isExpanded}
                          aria-controls={`payment-report-detail-${row.id}`}
                          onClick={() => toggleRowExpand(row.id)}
                        >
                          세부사항
                        </button>
                        <span data-pdf-exclude="true">
                          <RecordAttachmentChip
                            count={getAttachmentCount(row)}
                            className="payment-report-attach-chip"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!isExpanded) toggleRowExpand(row.id)
                            }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className={`${PAYMENT_REPORT_EDITABLE_CELL_CLASS} payment-report-col-vendor`}>
                      <EditableTextCell
                        value={row.vendorInfo}
                        className="registry-cell-text-wrap"
                        inputClassName={EXCLUDED_INLINE_EDITOR_CLASS}
                        onSave={(nextValue) => handleCellCommit(row.id, 'vendorInfo', nextValue)}
                      />
                    </td>
                    <td className={`${PAYMENT_REPORT_EDITABLE_CELL_CLASS} payment-report-cell--planned`}>
                      <EditableTextCell
                        value={row.plannedAmount}
                        align="right"
                        formatMode="amount"
                        inputClassName={EXCLUDED_INLINE_EDITOR_CLASS}
                        onSave={(nextValue) => handleCellCommit(row.id, 'plannedAmount', nextValue)}
                      />
                    </td>
                    <td className={`${PAYMENT_REPORT_EDITABLE_CELL_CLASS} payment-report-col-progress`}>
                      <EditableTextCell
                        value={row.progress}
                        className="registry-cell-text-wrap"
                        inputClassName={EXCLUDED_INLINE_EDITOR_CLASS}
                        onSave={(nextValue) => handleCellCommit(row.id, 'progress', nextValue)}
                      />
                    </td>
                  </tr>
                  <tr className={`payment-report-expand-row${isExpanded ? ' is-open' : ''}`}>
                    <td colSpan={PAYMENT_REPORT_TABLE_COL_COUNT}>
                      <div className="payment-report-expand-inner">
                        <div
                          id={`payment-report-detail-${row.id}`}
                          className="payment-report-expand-body"
                        >
                          <PaymentReportExpandedPanel
                            row={row}
                            onChange={handleEditableChange}
                            onCompletionAmountChange={handleCompletionAmountChange}
                            onCompletionAmountBlur={handleCompletionAmountBlur}
                            onMaterialCostChange={handleMaterialCostChange}
                            onMaterialCostBlur={handleMaterialCostBlur}
                            onCurrentExpenseChange={handleCurrentExpenseChange}
                            onCurrentExpenseBlur={handleCurrentExpenseBlur}
                            onProfitRateChange={handleProfitRateChange}
                            onProfitRateBlur={handleProfitRateBlur}
                            onAttachmentsChange={handleAttachmentsChange}
                            onCommit={flushSave}
                            onDownloadPdf={handleDownloadPdf}
                            isDownloading={pdfDownloadingId === row.id}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <DeleteConfirmModal
        open={isModalOpen}
        onCancel={cancelDelete}
        onConfirm={() => {
          const rowId = itemToDelete
          cancelDelete()
          void handleRemoveRow(rowId)
        }}
      />
    </section>
  )
}

