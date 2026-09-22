import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../AuthContext.jsx'
import {
  BIT_EXTRA_KEYS,
  BIT_FROM_CONTRACT_KEYS,
  bitHistoryApi,
  isManualBitRow,
  mergeBitRowsFromContracts,
  normalizeBitHistoryRow,
} from '../../bitHistoryApi.js'
import { getContractYearKey } from '../../contractAggregation.js'
import { DeleteConfirmModal, useDeleteConfirm } from '../../DeleteConfirmModal.jsx'
import { EditableDateCell } from '../../EditableDateCell.jsx'
import { EditableTextCell } from '../../EditableTextCell.jsx'
import { formatDateDisplay, toDateInputValue } from '../../dateFieldUtils.js'
import { MobileDataCardList, mobileCardText } from '../../MobileDataCardList.jsx'
import { canAccessBitHistory } from '../../permissions.js'
import { buildStyledExcelFilename, downloadStyledExcel } from '../../styledExcelDownload.js'
import {
  EXCLUDED_INLINE_EDITOR_CLASS,
  TABLE_INLINE_EDITABLE_CELL_CLASS,
} from '../../tableInlineInputClass.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * 엑셀 원본 헤더와 1:1로 맞춘 컬럼 정의.
 * 테이블 헤더·행 셀·검색·엑셀 다운로드·모바일 상세가 모두 이 배열만 보고 렌더링한다.
 * sticky 컬럼(발주처~사업명)은 폭이 흔들리면 left 좌표가 어긋나므로 width 를 고정값으로 쓴다.
 */
const BIT_COLUMNS = [
  { key: 'seqNo', label: '참고번호', type: 'text', width: 88, align: 'center', sticky: true, fromContract: true },
  { key: 'client', label: '발주처', type: 'text', width: 130, align: 'center', sticky: true, fromContract: true },
  { key: 'department', label: '담당부서', type: 'text', width: 96, align: 'center', sticky: true, fromContract: true },
  { key: 'contractMethod', label: '계약방식', type: 'text', width: 88, align: 'center', sticky: true, fromContract: true },
  { key: 'contractClass', label: '계약분류', type: 'text', width: 96, align: 'center', sticky: true, fromContract: true },
  { key: 'identNo', label: '식별번호', type: 'text', width: 96, align: 'center', sticky: true, fromContract: true },
  { key: 'contractDate', label: '계약일자', type: 'date', width: 140, align: 'center', sticky: true, fromContract: true },
  { key: 'dueDate', label: '준공일자', type: 'date', width: 140, align: 'center', sticky: true, fromContract: true },
  { key: 'projectName', label: '사업명', type: 'text', width: 280, align: 'left', sticky: true, fromContract: true },
  { key: 'contractAmount', label: '계약금액', type: 'amount', width: 150, align: 'right', fromContract: true },
  { key: 'quantity', label: '수량', type: 'text', width: 80, align: 'center' },
  { key: 'boardApplied', label: '보드적용', type: 'check', width: 100, align: 'center' },
  { key: 'programItem', label: '프로그램', type: 'check', width: 100, align: 'center' },
  { key: 'manufacturing', label: '제작', type: 'text', width: 110, align: 'center' },
  { key: 'shippingInspection', label: '출하검사', type: 'check', width: 100, align: 'center' },
  { key: 'note1', label: '비고(1)', type: 'note', width: 180, align: 'center' },
  { key: 'moduleItem', label: '모듈', type: 'text', width: 88, align: 'center' },
  { key: 'moduleArray', label: '배열', type: 'text', width: 100, align: 'center' },
  { key: 'moduleKind', label: '종류', type: 'text', width: 88, align: 'center' },
  { key: 'etcItem', label: '기타', type: 'text', width: 88, align: 'center' },
  { key: 'projectComplete', label: '사업완료', type: 'check', width: 100, align: 'center' },
  { key: 'defect', label: '불량발생', type: 'check', width: 100, align: 'center' },
  { key: 'note2', label: '비고(2)', type: 'note', width: 180, align: 'center' },
]

/** 체크박스 열 폭 — 다른 대장과 동일한 44px, sticky 누적 left 의 시작점 */
const BIT_CHECK_COL_WIDTH = 44

/** 틀 고정 마지막 열(사업명) — 오른쪽 경계선·그림자를 여기에만 붙인다 */
const BIT_STICKY_LAST_KEY = 'projectName'

/** 체크박스 → 발주처 → … → 사업명 순으로 앞선 열 폭을 누적한 left 좌표 */
const BIT_STICKY_LEFTS = (() => {
  const lefts = {}
  let offset = BIT_CHECK_COL_WIDTH
  for (const column of BIT_COLUMNS) {
    if (!column.sticky) break
    lefts[column.key] = offset
    offset += column.width
  }
  return lefts
})()

/** 모바일 카드 요약에 고정으로 올리는 3개 — 나머지는 아코디언 상세로 내려간다. */
const MOBILE_SUMMARY_KEYS = ['projectName', 'client', 'quantity']

const BIT_EXCEL_COLUMNS = BIT_COLUMNS.map((column) => ({
  header: column.label,
  key: column.label,
  minWidth: column.type === 'note' ? 24 : column.type === 'amount' ? 16 : undefined,
}))

function formatYmdSlash(ymd) {
  const s = safeString(ymd).trim()
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  return s.replace(/-/g, '/')
}

function openNativeDatePicker(inputEl) {
  if (!inputEl) return
  if (typeof inputEl.showPicker === 'function') {
    try {
      inputEl.showPicker()
      return
    } catch {
      /* 일부 브라우저는 사용자 제스처 없으면 거부 */
    }
  }
  inputEl.click()
}

function formatAmountComma(value) {
  const raw = safeString(value).replace(/[^\d]/g, '')
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

function formatAmountDisplay(value) {
  const formatted = formatAmountComma(value)
  return formatted ? `${formatted}원` : ''
}

function parseBitAmount(value) {
  const digits = safeString(value).replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

function uniqueContractAmountSum(items) {
  const seen = new Set()
  let sum = 0
  for (const row of items) {
    const key = safeString(row.contractId || row.id)
    if (!key || seen.has(key)) continue
    seen.add(key)
    sum += parseBitAmount(row.contractAmount)
  }
  return sum
}

function getBitYearKey(row) {
  return getContractYearKey({ contractDate: row?.contractDate })
}

function groupBitRowsByYear(rows) {
  const groups = new Map()
  for (const row of rows) {
    const year = getBitYearKey(row)
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year).push(row)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const na = Number(a)
      const nb = Number(b)
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na
      return safeString(b).localeCompare(safeString(a), 'ko-KR', { numeric: true })
    })
    .map(([year, items]) => ({
      year,
      items,
      count: items.length,
      totalAmount: uniqueContractAmountSum(items),
    }))
}

function bindExpandCollapseRow(toggle, isExpanded) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-expanded': isExpanded,
    onClick: toggle,
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggle()
      }
    },
  }
}

function isAddedBitLine(row) {
  const line = Number(safeString(row?.lineNo).replace(/[^\d]/g, ''))
  return Number.isFinite(line) && line > 1
}

function nextLineNo(rows, contractId) {
  const siblings = (rows || []).filter((row) => safeString(row.contractId) === safeString(contractId))
  const maxLine = siblings.reduce((acc, row) => {
    const value = Number(safeString(row.lineNo).replace(/[^\d]/g, ''))
    return Number.isFinite(value) ? Math.max(acc, value) : acc
  }, 0)
  return maxLine + 1
}

/** 기간 필터는 계약일자 기준 */
function inContractDateRange(row, startDate, endDate) {
  if (!startDate && !endDate) return true
  const ymd = toDateInputValue(row?.contractDate)
  if (!ymd) return false
  if (startDate && ymd < startDate) return false
  if (endDate && ymd > endDate) return false
  return true
}

function matchesBitSearch(row, query) {
  const q = safeString(query).trim().toLowerCase()
  if (!q) return true
  const haystack = BIT_COLUMNS.map((column) => {
    const value = row[column.key]
    if (column.type === 'amount') return formatAmountComma(value)
    if (column.type === 'date') {
      const ymd = toDateInputValue(value)
      return `${ymd} ${formatYmdSlash(ymd)}`
    }
    return value
  })
    .map((value) => safeString(value).toLowerCase())
    .join(' ')
  return haystack.includes(q)
}

/**
 * 계약일자 최신순. 방금 [등록]으로 추가한 빈 행(계약일자 미입력)은 맨 위에 남겨
 * 바로 이어서 입력할 수 있게 한다.
 */
function lineNoNum(row) {
  const value = Number(safeString(row?.lineNo).replace(/[^\d]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : 1
}

function sortBitRows(rows) {
  return [...rows].sort((a, b) => {
    const da = toDateInputValue(a.contractDate)
    const db = toDateInputValue(b.contractDate)
    if (!da && db) return -1
    if (da && !db) return 1
    if (da && db && da !== db) return db.localeCompare(da)

    const contractA = safeString(a.contractId)
    const contractB = safeString(b.contractId)
    if (contractA && contractB && contractA === contractB) {
      return lineNoNum(a) - lineNoNum(b)
    }

    const ref = safeString(b.seqNo).localeCompare(safeString(a.seqNo), 'ko-KR', { numeric: true })
    if (ref !== 0) return ref
    return safeString(b.createdAt).localeCompare(safeString(a.createdAt))
  })
}

function cellAlignClass(align) {
  if (align === 'right') return 'td-align-right'
  if (align === 'left') return 'td-align-left'
  return 'td-align-center'
}

/** sticky 열은 left·고정폭을, 일반 열은 최소폭만 인라인으로 준다. */
function stickyCellProps(column, extraClass = '') {
  if (!column.sticky) {
    return {
      className: extraClass.trim(),
      style: { minWidth: `${column.width}px` },
    }
  }
  const isLast = column.key === BIT_STICKY_LAST_KEY
  return {
    className: `bit-history-sticky${isLast ? ' bit-history-sticky--last' : ''} ${extraClass}`.trim(),
    style: {
      left: `${BIT_STICKY_LEFTS[column.key]}px`,
      width: `${column.width}px`,
      minWidth: `${column.width}px`,
      maxWidth: `${column.width}px`,
    },
  }
}

function BitDateRangeFilter({ startDate, endDate, onStartChange, onEndChange }) {
  const startInputRef = useRef(null)
  const endInputRef = useRef(null)
  const startLabel = formatYmdSlash(startDate) || 'YYYY/MM/DD'
  const endLabel = formatYmdSlash(endDate) || 'YYYY/MM/DD'

  return (
    <div className="registry-date-range-picker" role="group" aria-label="기간 검색">
      <button
        type="button"
        className="registry-date-range-picker-segment"
        onClick={() => openNativeDatePicker(startInputRef.current)}
        aria-label="시작일 선택"
      >
        <span className={startDate ? '' : 'registry-date-range-picker-placeholder'}>{startLabel}</span>
      </button>
      <span className="registry-date-range-picker-sep" aria-hidden="true">
        ~
      </span>
      <button
        type="button"
        className="registry-date-range-picker-segment"
        onClick={() => openNativeDatePicker(endInputRef.current)}
        aria-label="종료일 선택"
      >
        <span className={endDate ? '' : 'registry-date-range-picker-placeholder'}>{endLabel}</span>
      </button>
      <button
        type="button"
        className="registry-date-range-picker-icon"
        onClick={() => openNativeDatePicker(startInputRef.current)}
        aria-label="기간 선택"
      >
        <span aria-hidden="true">📅</span>
      </button>
      <input
        ref={startInputRef}
        type="date"
        className="registry-date-range-picker-native"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={endInputRef}
        type="date"
        className="registry-date-range-picker-native"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

/** 컬럼 type 하나로 셀 편집기를 결정한다 — 연동 행의 계약현황 필드는 읽기 전용. */
function BitDataCell({ column, row, onCommit }) {
  const locked =
    column.fromContract === true && (!isManualBitRow(row) || isAddedBitLine(row))
  const muted = isAddedBitLine(row) && column.fromContract === true
  const props = stickyCellProps(
    column,
    `editable-cell ${TABLE_INLINE_EDITABLE_CELL_CLASS} ${cellAlignClass(column.align)} bit-history-td--${column.key}${
      locked ? ' bit-history-td--from-contract' : ''
    }${muted ? ' bit-history-td--added-muted' : ''}`
  )

  if (column.type === 'date') {
    return (
      <td {...props}>
        <EditableDateCell
          value={row[column.key]}
          disabled={locked}
          onSave={(next) => onCommit(row.id, column.key, next ?? '')}
        />
      </td>
    )
  }

  return (
    <td {...props}>
      <EditableTextCell
        value={row[column.key]}
        disabled={locked}
        align={column.align === 'right' ? 'right' : column.align === 'left' ? 'left' : 'center'}
        formatMode={column.type === 'amount' ? 'amount' : null}
        className="registry-cell-text-wrap"
        inputClassName={EXCLUDED_INLINE_EDITOR_CLASS}
        onSave={(next) => onCommit(row.id, column.key, next)}
      />
    </td>
  )
}

export default function BitHistoryPage({ contracts = [] }) {
  const { accountId } = useAuth()
  const allowed = canAccessBitHistory(accountId)

  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [syncNotice, setSyncNotice] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })
  const [selectedIds, setSelectedIds] = useState([])
  const [openYears, setOpenYears] = useState({})
  const { itemToDelete, isModalOpen, requestDelete, cancelDelete } = useDeleteConfirm()

  /** 셀 저장은 방금 입력한 값을 포함한 최신 행 전체를 보내야 하므로 ref 로 들고 있는다. */
  const rowsRef = useRef([])
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  /** 계약현황은 비동기로 도착하므로 최신 목록을 ref 로 본다. */
  const contractsRef = useRef(contracts)
  useEffect(() => {
    contractsRef.current = Array.isArray(contracts) ? contracts : []
  }, [contracts])

  /** extras API 응답 — 계약현황이 나중에 도착해도 extras 를 잃지 않게 보관 */
  const extrasRef = useRef([])

  const applyJoinedRows = useCallback((contractList, extras) => {
    const contractsSource = Array.isArray(contractList) ? contractList : []
    const extraSource = Array.isArray(extras) ? extras : []
    extrasRef.current = extraSource
    if (contractsSource.length > 0) {
      return sortBitRows(mergeBitRowsFromContracts(contractsSource, extraSource))
    }
    if (extraSource.length > 0) {
      return sortBitRows(extraSource.map((row, index) => normalizeBitHistoryRow(row, index + 1)))
    }
    return []
  }, [])

  const loadRows = useCallback(async () => {
    setIsLoading(true)
    const contractList = contractsRef.current
    try {
      const data = await bitHistoryApi.list()
      const list = Array.isArray(data) ? data : []
      setRows(applyJoinedRows(contractList, list))
      setLoadError('')
      setSyncNotice('')
    } catch (error) {
      // extras API 가 404(Not Found)여도 계약현황 BIT 는 화면에 띄운다.
      const fallback = applyJoinedRows(contractList, extrasRef.current)
      setRows(fallback)
      if (fallback.length > 0) {
        setLoadError('')
        setSyncNotice('계약현황의 BIT 계약을 표시합니다. 추가 이력 저장은 서버 연결 후 가능합니다.')
      } else {
        setLoadError(`목록을 불러오지 못했습니다. ${safeString(error?.message)}`)
      }
    } finally {
      setIsLoading(false)
    }
  }, [applyJoinedRows])

  useEffect(() => {
    if (!allowed) return
    void loadRows()
  }, [allowed, loadRows])

  /** 계약현황이 비동기로 도착·갱신되면 같은 extras 를 다시 조인한다. */
  useEffect(() => {
    if (!allowed) return
    const contractList = Array.isArray(contracts) ? contracts : []
    if (contractList.length === 0) return
    setRows((prev) => applyJoinedRows(contractList, extrasRef.current.length > 0 ? extrasRef.current : prev))
  }, [allowed, contracts, applyJoinedRows])

  const filteredRows = useMemo(
    () =>
      sortBitRows(
        rows.filter(
          (row) =>
            matchesBitSearch(row, searchQuery) &&
            inContractDateRange(row, dateRange.startDate, dateRange.endDate)
        )
      ),
    [rows, searchQuery, dateRange]
  )

  const yearGroups = useMemo(() => groupBitRowsByYear(filteredRows), [filteredRows])
  const defaultOpenYear = yearGroups[0]?.year || ''

  const isYearOpen = (year) =>
    Object.prototype.hasOwnProperty.call(openYears, year)
      ? openYears[year]
      : year === defaultOpenYear

  const toggleYear = (year) => {
    setOpenYears((prev) => ({
      ...prev,
      [year]: !isYearOpen(year),
    }))
  }

  const mobileDetailFields = useMemo(
    () =>
      BIT_COLUMNS.filter((column) => !MOBILE_SUMMARY_KEYS.includes(column.key)).map((column) => ({
        label: column.label,
        getValue: (row) => {
          if (column.type === 'amount') return formatAmountDisplay(row[column.key])
          if (column.type === 'date') return formatDateDisplay(row[column.key])
          return row[column.key]
        },
      })),
    []
  )

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id))

  const replaceRow = (rowId, nextRow) => {
    rowsRef.current = rowsRef.current.map((row) => (row.id === rowId ? nextRow : row))
    setRows(sortBitRows(rowsRef.current))
    const extraKey = nextRow.extraId || nextRow.id
    const hasExtra = extrasRef.current.some(
      (row) => safeString(row.extraId || row.id) === safeString(extraKey)
    )
    extrasRef.current = hasExtra
      ? extrasRef.current.map((row) =>
          safeString(row.extraId || row.id) === safeString(extraKey) ? nextRow : row
        )
      : [...extrasRef.current, nextRow]
  }

  /** 셀 편집 확정 — 연동 행은 extras 만, 수기등록은 전 필드 저장 */
  const commitCell = useCallback(async (rowId, key, value) => {
    const target = rowsRef.current.find((row) => row.id === rowId)
    if (!target) return
    const lockedKeys =
      isManualBitRow(target) && !isAddedBitLine(target) ? [] : BIT_FROM_CONTRACT_KEYS
    if (lockedKeys.includes(key)) return
    const nextRow = { ...target, [key]: safeString(value) }
    replaceRow(rowId, nextRow)

    try {
      const saved = nextRow.extraId
        ? await bitHistoryApi.update(nextRow.extraId, nextRow)
        : await bitHistoryApi.create(nextRow)
      const normalized = normalizeBitHistoryRow(saved, nextRow.sortOrder)
      const extraId = normalized.extraId || normalized.id
      const merged = {
        ...nextRow,
        ...normalized,
        extraId,
        id: extraId || nextRow.id,
        contractId: nextRow.contractId,
        isManual: isManualBitRow(nextRow),
        lineNo: nextRow.lineNo || normalized.lineNo || '1',
        seqNo: nextRow.seqNo,
        client: nextRow.client,
        department: nextRow.department,
        contractMethod: nextRow.contractMethod,
        contractClass: nextRow.contractClass,
        identNo: nextRow.identNo,
        contractDate: nextRow.contractDate,
        dueDate: nextRow.dueDate,
        projectName: nextRow.projectName,
        contractAmount: nextRow.contractAmount,
      }
      replaceRow(rowId, merged)
      setLoadError('')
    } catch (error) {
      setLoadError(`저장에 실패했습니다. ${safeString(error?.message)}`)
    }
  }, [])

  const handleManualAdd = async () => {
    try {
      const created = await bitHistoryApi.create({
        contractClass: 'BIT',
        lineNo: '1',
      })
      const normalized = {
        ...normalizeBitHistoryRow(created, rowsRef.current.length + 1),
        isManual: true,
        contractId: '',
      }
      extrasRef.current = [...extrasRef.current, normalized]
      setRows(sortBitRows([...rowsRef.current, normalized]))
      setOpenYears((prev) => ({ ...prev, 미분류: true }))
      setLoadError('')
    } catch (error) {
      setLoadError(`등록에 실패했습니다. ${safeString(error?.message)}`)
    }
  }

  const handleAddLine = async () => {
    const selected = rowsRef.current.filter((row) => selectedIds.includes(row.id))
    if (selected.length === 0) return
    const seen = new Set()
    const targets = []
    for (const row of selected) {
      const key = safeString(row.contractId || row.id)
      if (!key || seen.has(key)) continue
      seen.add(key)
      targets.push(row)
    }

    const createdRows = []
    let failed = 0
    for (const row of targets) {
      const extraBlank = BIT_EXTRA_KEYS.reduce((acc, key) => {
        acc[key] = ''
        return acc
      }, {})
      const payload = {
        ...extraBlank,
        contractId: row.contractId || '',
        lineNo: String(nextLineNo(rowsRef.current, row.contractId || row.id)),
        client: row.client,
        department: row.department,
        contractMethod: row.contractMethod,
        contractClass: row.contractClass || 'BIT',
        seqNo: row.seqNo,
        identNo: row.identNo,
        contractDate: row.contractDate,
        dueDate: row.dueDate,
        projectName: row.projectName,
        contractAmount: row.contractAmount,
      }
      try {
        const created = await bitHistoryApi.create(payload)
        createdRows.push({
          ...normalizeBitHistoryRow(created, rowsRef.current.length + createdRows.length + 1),
          isManual: isManualBitRow(payload),
          contractId: payload.contractId,
          lineNo: payload.lineNo,
        })
      } catch {
        failed += 1
      }
    }

    if (createdRows.length > 0) {
      extrasRef.current = [...extrasRef.current, ...createdRows]
      setRows(sortBitRows([...rowsRef.current, ...createdRows]))
    }
    if (failed > 0) {
      setLoadError(`줄 추가 ${createdRows.length}건 성공, ${failed}건 실패`)
    } else {
      setLoadError('')
    }
  }

  const handleExcelDownload = useCallback(async () => {
    const excelRows = filteredRows.map((row) => {
      const out = {}
      for (const column of BIT_COLUMNS) {
        if (column.type === 'amount') out[column.label] = formatAmountComma(row[column.key])
        else if (column.type === 'date') out[column.label] = toDateInputValue(row[column.key])
        else out[column.label] = safeString(row[column.key])
      }
      return out
    })

    try {
      await downloadStyledExcel({
        sheetName: 'BIT 이력관리',
        filename: buildStyledExcelFilename('BIT이력관리'),
        columns: BIT_EXCEL_COLUMNS,
        rows: excelRows,
      })
    } catch (error) {
      setLoadError(`엑셀 다운로드에 실패했습니다. ${safeString(error?.message)}`)
    }
  }, [filteredRows])

  const toggleRowSelection = (rowId) => {
    setSelectedIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const toggleAllFiltered = () => {
    setSelectedIds((prev) =>
      allSelected
        ? prev.filter((id) => !filteredRows.some((row) => row.id === id))
        : [...new Set([...prev, ...filteredRows.map((row) => row.id)])]
    )
  }

  const handleConfirmDelete = async () => {
    const ids = Array.isArray(itemToDelete) ? itemToDelete : itemToDelete ? [itemToDelete] : []
    const extraIds = ids
      .map((id) => {
        const row = rowsRef.current.find((item) => item.id === id)
        return safeString(row?.extraId || (row?.isManual ? row?.id : '')).trim()
      })
      .filter(Boolean)
    if (extraIds.length > 0) {
      try {
        await bitHistoryApi.bulkDelete(extraIds)
        setLoadError('')
      } catch (error) {
        setLoadError(`삭제에 실패했습니다. ${safeString(error?.message)}`)
        cancelDelete()
        return
      }
    }
    extrasRef.current = extrasRef.current.filter((row) => {
      const extraId = safeString(row.extraId || row.id).trim()
      return !extraIds.includes(extraId)
    })
    setRows(applyJoinedRows(contractsRef.current, extrasRef.current))
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)))
    cancelDelete()
  }

  if (!allowed) return null

  return (
    <section className="stat-card bit-history-page" aria-label="BIT 이력관리">
      <div className="bit-history-toolbar">
        <div className="bit-history-toolbar-left">
          <button className="primary-btn" type="button" onClick={() => void handleManualAdd()}>
            등록
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => void handleAddLine()}
            disabled={selectedIds.length === 0}
            title="선택한 계약과 같은 기본 정보로 이력을 한 줄 더 만듭니다."
          >
            줄 추가
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={() => requestDelete(selectedIds)}
            disabled={selectedIds.length === 0}
            title="BIT 이력 줄만 지웁니다. 계약현황 원본은 그대로 둡니다."
          >
            삭제
          </button>
          {selectedIds.length > 0 && (
            <button
              type="button"
              className="secondary-btn registry-selection-count"
              tabIndex={-1}
              aria-disabled="true"
              aria-live="polite"
            >
              총 {selectedIds.length}건 선택됨
            </button>
          )}
          <button className="secondary-btn" type="button" onClick={() => void handleExcelDownload()}>
            엑셀 다운로드
          </button>
        </div>
        <div className="bit-history-toolbar-right">
          <input
            className="table-search-input"
            placeholder="검색어를 입력하세요"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="BIT 이력 검색"
          />
          <BitDateRangeFilter
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onStartChange={(value) => setDateRange((prev) => ({ ...prev, startDate: value }))}
            onEndChange={(value) => setDateRange((prev) => ({ ...prev, endDate: value }))}
          />
        </div>
      </div>

      {loadError ? (
        <p className="sales-contacts-save-status is-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <p className="bit-history-join-hint" role="note">
        계약현황의 BIT 계약이 연도별로 자동 표시됩니다. 같은 계약을 출하·모듈 단위로 나눠야 하면 행을 고르고 [줄 추가] 하세요.
        계약현황에서 지우면 여기 연동 줄도 사라지고, 여기서 지우면 계약현황은 남습니다.
      </p>

      {!loadError && syncNotice ? (
        <p className="bit-history-sync-notice" role="status">
          {syncNotice}
        </p>
      ) : null}

      <div className="contract-table-panel bit-history-table-panel">
        {/* PC: 가로 스크롤 + 사업명까지 좌측 틀 고정 — 모바일에서는 desktop-table-only 로 감춘다 */}
        <div className="table-wrap contracts-only-scroll overflow-x-auto desktop-table-only hidden md:block">
          <table className="contract-table excel-table registry-table bit-history-table table-w-full-min table-layout-auto">
            <colgroup>
              <col
                className="registry-check-col"
                style={{ width: `${BIT_CHECK_COL_WIDTH}px`, minWidth: `${BIT_CHECK_COL_WIDTH}px` }}
              />
              {BIT_COLUMNS.map((column) => (
                <col
                  key={column.key}
                  style={
                    column.sticky
                      ? { width: `${column.width}px`, minWidth: `${column.width}px` }
                      : { minWidth: `${column.width}px` }
                  }
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  className="th-align-center registry-check-header bit-history-sticky"
                  style={{
                    left: 0,
                    width: `${BIT_CHECK_COL_WIDTH}px`,
                    minWidth: `${BIT_CHECK_COL_WIDTH}px`,
                    maxWidth: `${BIT_CHECK_COL_WIDTH}px`,
                  }}
                >
                  <input
                    className="registry-row-checkbox"
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAllFiltered}
                    aria-label="전체 선택"
                  />
                </th>
                {BIT_COLUMNS.map((column) => {
                  const props = stickyCellProps(column, 'th-align-center')
                  return (
                    <th key={column.key} {...props}>
                      {column.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={BIT_COLUMNS.length + 1} className="empty-cell">
                    불러오는 중...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={BIT_COLUMNS.length + 1} className="empty-cell">
                    {rows.length === 0
                      ? '계약현황에 등록된 BIT 계약이 없습니다.'
                      : '필터 조건에 맞는 데이터가 없습니다.'}
                  </td>
                </tr>
              ) : (
                yearGroups.flatMap((yearBlock) => {
                  const collapsed = !isYearOpen(yearBlock.year)
                  const yearRow = (
                    <tr
                      className="contract-year-row contract-year-row--toggle"
                      key={`bit-year-${yearBlock.year}`}
                      {...bindExpandCollapseRow(() => toggleYear(yearBlock.year), !collapsed)}
                    >
                      <td colSpan={BIT_COLUMNS.length + 1}>
                        <div className="contract-year-toggle" aria-hidden="true">
                          <span className="contract-year-sign">{collapsed ? '+' : '-'}</span>
                          <span>{yearBlock.year === '미분류' ? '미분류' : `${yearBlock.year}년`}</span>
                          <span className="contract-year-count">
                            {yearBlock.count.toLocaleString('ko-KR')}건 (총{' '}
                            {yearBlock.totalAmount.toLocaleString('ko-KR')}원)
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                  if (collapsed) return [yearRow]
                  return [
                    yearRow,
                    ...yearBlock.items.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`bit-history-data-row ${index % 2 === 0 ? 'row-even' : 'row-odd'}${
                          isAddedBitLine(row) ? ' bit-history-data-row--added' : ''
                        }`}
                      >
                        <td
                          className={`td-align-center registry-check-cell bit-history-sticky${
                            isAddedBitLine(row) ? ' bit-history-td--added-muted' : ''
                          }`}
                          style={{
                            left: 0,
                            width: `${BIT_CHECK_COL_WIDTH}px`,
                            minWidth: `${BIT_CHECK_COL_WIDTH}px`,
                            maxWidth: `${BIT_CHECK_COL_WIDTH}px`,
                          }}
                        >
                          <input
                            className="registry-row-checkbox"
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                            aria-label={`${row.projectName || 'BIT 이력'} 선택`}
                          />
                        </td>
                        {BIT_COLUMNS.map((column) => (
                          <BitDataCell
                            key={column.key}
                            column={column}
                            row={row}
                            onCommit={commitCell}
                          />
                        ))}
                      </tr>
                    )),
                  ]
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 모바일: 사업명·발주처·수량만 보이는 카드 + [▼ 상세 정보 펼치기] 아코디언 */}
        <MobileDataCardList
          rows={filteredRows}
          getRowKey={(row, index) => row.id || `bit-${index}`}
          getTitle={(row) => row.projectName}
          summaryFields={[
            { label: '발주처', getValue: (row) => row.client },
            { label: '수량', getValue: (row) => mobileCardText(row.quantity) },
          ]}
          detailFields={mobileDetailFields}
          emptyText={isLoading ? '불러오는 중...' : '표시할 데이터가 없습니다.'}
        />
      </div>

      <DeleteConfirmModal
        open={isModalOpen}
        onCancel={cancelDelete}
        onConfirm={() => void handleConfirmDelete()}
      />
    </section>
  )
}
