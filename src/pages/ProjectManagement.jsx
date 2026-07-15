import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { normalizeContractColumnFilterSelection } from '../contractColumnFilter.js'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { EditableDateCell } from '../EditableDateCell.jsx'
import { EditableCommencementCertCell } from '../EditableCommencementCertCell.jsx'
import { isAuthSessionExpiredError } from '../apiClient.js'
import { projectManagementApi } from '../api/projectManagementApi.js'
import {
  COMMENCEMENT_CERT_OMIT_LABEL,
  formatCommencementCertDisplay,
  formatDateDisplay,
  isCommencementCertOmitValue,
  mapCommencementCertFromApi,
  toCommencementCertApiValue,
  toDbDate,
} from '../dateFieldUtils.js'
import {
  PROJECT_MANAGEMENT_FILTERABLE_COLUMN_KEYS,
  buildProjectManagementColumnFilterOptions,
  filterProjectManagementRowsByActiveFilters,
  projectManagementMatchesColumnFilters,
  projectManagementMatchesSearch,
} from '../projectManagementColumnFilter.js'
import {
  UNIT_PRICE_PAGE_ROOT,
  UNIT_PRICE_PAGE_STACK,
  UNIT_PRICE_SEARCH_INPUT,
  UNIT_PRICE_TABLE_CLASS,
  UNIT_PRICE_TABLE_PANEL,
  UNIT_PRICE_TABLE_PROJECT_MODIFIER,
  UNIT_PRICE_TOOLBAR,
  getUnitPriceColStyle,
  tableRowStripeClass,
  unitPriceTableWrapClass,
} from '../unitPricePageLayout.js'
import {
  formatEditableTableCellText,
  isDateTableCellEmpty,
  isTableCellEmpty,
  tableCellStateClass,
} from '../tableCellEmptyState.js'
import '../App.css'

/** 계약분류 — 목록에서 제외 (코드·라벨) */
const EXCLUDED_CONTRACT_TYPE_CODE = '43211514'
const EXCLUDED_CONTRACT_TYPE_LABEL = '유지보수'

const PROJECT_MANAGEMENT_EDITABLE_FIELDS = Object.freeze([
  'commencementCert',
  'completionCert',
  'warrantyStart',
  'warrantyExpiry',
  'guaranteeRate',
  'performanceCertStatus',
])

/** 단가관리와 동일 colgroup·colgroup 클래스 패턴 (열 정의만 사업관리용) */
const columns = [
  {
    field: 'year',
    headerName: '사업년도',
    width: 100,
    filterable: true,
    readonly: true,
    colClass: 'unit-price-col-year',
  },
  {
    field: 'client',
    headerName: '발주처',
    width: 160,
    filterable: true,
    readonly: true,
    colClass: 'unit-price-col-client',
  },
  {
    field: 'contractDate',
    headerName: '계약일자',
    width: 128,
    filterable: true,
    readonly: true,
    type: 'date',
    colClass: 'unit-price-col-contract-date',
  },
  {
    field: 'dueDate',
    headerName: '납기일(준공일자)',
    width: 140,
    filterable: true,
    readonly: true,
    type: 'date',
    colClass: 'unit-price-col-due-date',
  },
  {
    field: 'projectName',
    headerName: '사업명',
    width: 350,
    flexGrow: true,
    filterable: true,
    readonly: true,
    colClass: 'unit-price-col-project',
  },
  {
    field: 'salesOwner',
    headerName: '영업담당자',
    width: 120,
    filterable: true,
    readonly: true,
    colClass: 'unit-price-col-sales-owner',
  },
  {
    field: 'pm',
    headerName: '현장PM',
    width: 100,
    filterable: true,
    readonly: true,
    colClass: 'unit-price-col-pm',
  },
  {
    field: 'commencementCert',
    headerName: '착수계',
    width: 172,
    filterable: true,
    editable: true,
    type: 'commencementCert',
    colClass: 'unit-price-col-date-picker unit-price-col-commencement-cert',
  },
  {
    field: 'completionCert',
    headerName: '준공계',
    width: 140,
    filterable: true,
    editable: true,
    type: 'date',
    colClass: 'unit-price-col-date-picker',
  },
  {
    field: 'warrantyStart',
    headerName: '하자보증 시작',
    width: 140,
    filterable: true,
    editable: true,
    type: 'date',
    colClass: 'unit-price-col-date-picker',
  },
  {
    field: 'warrantyExpiry',
    headerName: '하자보증 만기',
    width: 140,
    filterable: true,
    editable: true,
    type: 'date',
    colClass: 'unit-price-col-date-picker',
  },
  {
    field: 'guaranteeRate',
    headerName: '보증금율',
    width: 110,
    filterable: true,
    editable: true,
    type: 'text',
    colClass: 'unit-price-col-guarantee-rate',
  },
  {
    field: 'performanceCertStatus',
    headerName: '실적증명 여부',
    width: 140,
    filterable: true,
    editable: true,
    type: 'text',
    colClass: 'unit-price-col-performance-cert',
  },
]

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeContractFromApi(contract) {
  const id = safeString(contract?.id).trim()
  if (!id) return null

  const row = {
    id,
    year: safeString(contract?.year).trim(),
    client: safeString(contract?.client).trim(),
    contractDate: formatDateDisplay(contract?.contractDate),
    dueDate: formatDateDisplay(contract?.dueDate),
    projectName: safeString(contract?.projectName).trim(),
    salesOwner: safeString(contract?.salesOwner).trim(),
    pm: safeString(contract?.pm).trim(),
    contractType: safeString(contract?.contractType).trim(),
    commencementCert: mapCommencementCertFromApi(contract?.commencementCert),
    completionCert: formatDateDisplay(contract?.completionCert),
    warrantyStart: formatDateDisplay(contract?.warrantyStart),
    warrantyExpiry: formatDateDisplay(contract?.warrantyExpiry),
    guaranteeRate: safeString(contract?.guaranteeRate).trim(),
    performanceCertStatus: safeString(contract?.performanceCertStatus).trim(),
  }

  return row
}

function isIncludedInProjectManagement(contract) {
  if (!contract || typeof contract !== 'object') return false
  const contractType = safeString(contract.contractType).trim()
  return (
    contractType !== EXCLUDED_CONTRACT_TYPE_CODE &&
    !contractType.includes(EXCLUDED_CONTRACT_TYPE_LABEL)
  )
}

function filterProjectContracts(contracts) {
  const list = Array.isArray(contracts) ? contracts : []
  return list
    .filter((item) => isIncludedInProjectManagement(item))
    .map((item) => normalizeContractFromApi(item))
    .filter(Boolean)
}

function fieldToSavedSnapshotValue(field, rowValue, column) {
  if (column?.type === 'commencementCert') {
    return toCommencementCertApiValue(rowValue)
  }
  if (column?.type === 'date') {
    return toDbDate(rowValue)
  }
  return safeString(rowValue).trim()
}

function normalizePatchCompareValue(value) {
  if (value === undefined || value === null) return null
  return value
}

/**
 * dirty/현재 스냅샷(new) 기준 PATCH 생성.
 * 과거(saved/old)에 키가 없어도 새 필드(예: performanceCertStatus)가 빠지지 않는다.
 */
function buildProjectManagementPatchPayload(current, saved, dirtyFields = null) {
  const patch = {}
  const dirty =
    dirtyFields instanceof Set
      ? dirtyFields
      : dirtyFields
        ? new Set(dirtyFields)
        : new Set()
  const savedRow = saved && typeof saved === 'object' ? saved : {}

  // 1) dirty 필드는 비교 없이 현재 값으로 무조건 포함
  for (const key of dirty) {
    if (!PROJECT_MANAGEMENT_EDITABLE_FIELDS.includes(key)) continue
    const column = columns.find((c) => c.field === key)
    const cur = fieldToSavedSnapshotValue(key, current?.[key], column)
    patch[key] = cur === undefined ? null : cur
  }

  // 2) EDITABLE 필드 전체(new 키 기준) — old에 키가 없으면 빈값으로 간주해 비교
  for (const key of PROJECT_MANAGEMENT_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) continue
    const column = columns.find((c) => c.field === key)
    const cur = normalizePatchCompareValue(
      fieldToSavedSnapshotValue(key, current?.[key], column)
    )
    const prevRaw = Object.prototype.hasOwnProperty.call(savedRow, key)
      ? fieldToSavedSnapshotValue(key, savedRow[key], column)
      : null
    const prev = normalizePatchCompareValue(prevRaw)
    if (cur !== prev) {
      patch[key] = cur
    }
  }

  // JSON.stringify가 제거하는 undefined 차단
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) patch[key] = null
  }
  return patch
}

/** @deprecated — buildProjectManagementPatchPayload 사용 */
function buildContractPatchDiff(current, saved, forceFields = null) {
  return buildProjectManagementPatchPayload(current, saved, forceFields)
}

function rowToSavedSnapshot(row) {
  const snap = {}
  for (const key of PROJECT_MANAGEMENT_EDITABLE_FIELDS) {
    const column = columns.find((c) => c.field === key)
    // API/구데이터에 키가 없어도 editable 키는 항상 스냅샷에 존재하게 한다
    snap[key] = fieldToSavedSnapshotValue(key, row?.[key], column)
  }
  return snap
}

function getEditableColumnCellState(row, column) {
  const raw = row[column.field]
  if (column.type === 'commencementCert') {
    if (isCommencementCertOmitValue(raw)) {
      return { isEmpty: false, text: formatCommencementCertDisplay(raw) }
    }
    return formatEditableTableCellText(raw, { isDate: true })
  }
  if (column.type === 'date') {
    return formatEditableTableCellText(raw, { isDate: true })
  }
  return formatEditableTableCellText(raw)
}

function excelExportCellText(value) {
  const text = safeString(value).trim()
  return text || '-'
}

function projectManagementRowToExcelRow(row) {
  const commencementCol = columns.find((c) => c.field === 'commencementCert')
  const completionCol = columns.find((c) => c.field === 'completionCert')
  const warrantyStartCol = columns.find((c) => c.field === 'warrantyStart')
  const warrantyExpiryCol = columns.find((c) => c.field === 'warrantyExpiry')
  const guaranteeRateCol = columns.find((c) => c.field === 'guaranteeRate')
  const performanceCertStatusCol = columns.find((c) => c.field === 'performanceCertStatus')

  const contractDateState = formatEditableTableCellText(row.contractDate, { isDate: true })
  const dueDateState = formatEditableTableCellText(row.dueDate, { isDate: true })

  return {
    사업년도: excelExportCellText(row.year),
    발주처: excelExportCellText(row.client),
    계약일자: contractDateState.text,
    '납기일(준공일자)': dueDateState.text,
    사업명: excelExportCellText(row.projectName),
    영업담당자: excelExportCellText(row.salesOwner),
    현장PM: excelExportCellText(row.pm),
    착수계: getEditableColumnCellState(row, commencementCol).text,
    준공계: getEditableColumnCellState(row, completionCol).text,
    '하자보증 시작': getEditableColumnCellState(row, warrantyStartCol).text,
    '하자보증 만기': getEditableColumnCellState(row, warrantyExpiryCol).text,
    보증금율: getEditableColumnCellState(row, guaranteeRateCol).text,
    '실적증명 여부': getEditableColumnCellState(row, performanceCertStatusCol).text,
  }
}

function buildMenuExcelFilename(menuLabel) {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${menuLabel}_${ymd}.xlsx`
}

export default function ProjectManagement({ canEdit = true }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [tableBusy, setTableBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState({})
  const [openContractColumnFilterKey, setOpenContractColumnFilterKey] = useState(null)

  const savedByContractIdRef = useRef({})
  const savingContractIdsRef = useRef(new Set())
  /** contractId → { snapshot, dirtyFields: Set<string> } */
  const pendingByContractIdRef = useRef(new Map())
  const saveSuccessTimerRef = useRef(null)

  const syncSavedSnapshots = useCallback((rows) => {
    const saved = {}
    for (const row of rows) {
      if (row.id) saved[row.id] = rowToSavedSnapshot(row)
    }
    savedByContractIdRef.current = saved
  }, [])

  const fetchContracts = useCallback(async ({ silent = false, isRefetch = false } = {}) => {
    if (isRefetch) setRefetching(true)
    else if (!silent) setLoading(true)
    setError(null)

    try {
      const data = await projectManagementApi.list()
      const rows = filterProjectContracts(data)
      setContracts(rows)
      syncSavedSnapshots(rows)
    } catch (fetchError) {
      if (isAuthSessionExpiredError(fetchError)) return
      console.error('[사업관리] 계약 API fetch failed', fetchError)
      if (!isRefetch) {
        setError(fetchError?.message || '계약 데이터를 불러오지 못했습니다.')
        setContracts([])
        savedByContractIdRef.current = {}
      }
    } finally {
      if (isRefetch) setRefetching(false)
      else if (!silent) setLoading(false)
    }
  }, [syncSavedSnapshots])

  useEffect(() => {
    void fetchContracts()
  }, [fetchContracts])

  const projectManagementColumnFilterOptionsMap = useMemo(() => {
    const basePool = contracts.filter((item) => projectManagementMatchesSearch(item, search))
    const map = {}
    PROJECT_MANAGEMENT_FILTERABLE_COLUMN_KEYS.forEach((columnKey) => {
      const pool = basePool.filter((item) =>
        projectManagementMatchesColumnFilters(item, activeFilters, columnKey)
      )
      map[columnKey] = buildProjectManagementColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [activeFilters, contracts, search])

  const filteredRows = useMemo(() => {
    const searched = contracts.filter((item) => projectManagementMatchesSearch(item, search))
    return filterProjectManagementRowsByActiveFilters(searched, activeFilters)
  }, [activeFilters, contracts, search])

  const isTableFilterResultEmpty = useMemo(
    () => contracts.length > 0 && filteredRows.length === 0,
    [contracts.length, filteredRows.length]
  )

  const handleActiveFiltersApply = useCallback((columnKey, selected) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  const flushContractFieldSaves = useCallback(async (contractId) => {
    if (!contractId || savingContractIdsRef.current.has(contractId)) return false

    savingContractIdsRef.current.add(contractId)
    let savedAny = false

    try {
      while (pendingByContractIdRef.current.has(contractId)) {
        const pending = pendingByContractIdRef.current.get(contractId)
        pendingByContractIdRef.current.delete(contractId)

        const nextSnapshot = { ...(pending?.snapshot || {}) }
        const dirtyFields =
          pending?.dirtyFields instanceof Set ? pending.dirtyFields : new Set()
        // 셀 저장 시점에 고정해 둔 명시적 패치(키=백엔드 camelCase)를 최우선으로 사용
        const explicitPatch =
          pending?.explicitPatch && typeof pending.explicitPatch === 'object'
            ? { ...pending.explicitPatch }
            : {}

        const saved = savedByContractIdRef.current[contractId] || rowToSavedSnapshot({ id: contractId })
        const patch = {
          ...buildProjectManagementPatchPayload(nextSnapshot, saved, dirtyFields),
          ...explicitPatch,
        }

        // undefined 제거 — JSON.stringify({})로 빈 본문 나가는 것 차단
        for (const key of Object.keys(patch)) {
          if (patch[key] === undefined) delete patch[key]
        }

        if (Object.keys(patch).length === 0) {
          console.warn('[사업관리] 빈 PATCH 생략', { contractId, dirtyFields: [...dirtyFields] })
          continue
        }

        console.info('[사업관리] PATCH payload', contractId, patch)
        const updated = await projectManagementApi.update(contractId, patch)
        const normalized = normalizeContractFromApi(updated)
        if (normalized) {
          savedByContractIdRef.current[contractId] = rowToSavedSnapshot(normalized)
          setContracts((prev) =>
            prev.map((item) => {
              if (item.id !== contractId) return item
              const merged = { ...item }
              for (const key of PROJECT_MANAGEMENT_EDITABLE_FIELDS) {
                if (Object.prototype.hasOwnProperty.call(normalized, key)) {
                  merged[key] = normalized[key]
                }
              }
              return merged
            })
          )
        } else {
          savedByContractIdRef.current[contractId] = { ...nextSnapshot }
        }
        savedAny = true
        setSaveError(null)
        setSaveSuccess('저장되었습니다.')
        if (saveSuccessTimerRef.current) {
          clearTimeout(saveSuccessTimerRef.current)
        }
        saveSuccessTimerRef.current = setTimeout(() => {
          setSaveSuccess(null)
          saveSuccessTimerRef.current = null
        }, 2200)
      }
      return savedAny
    } catch (saveErr) {
      if (isAuthSessionExpiredError(saveErr)) return false
      console.error('[사업관리] 계약 저장 실패', saveErr)
      const message = safeString(saveErr?.message).trim()
      setSaveSuccess(null)
      setSaveError(
        message === 'Forbidden'
          ? '사업관리 저장은 관리자 권한이 필요합니다. 좌측 하단이 「관리자」인지 확인하고, 「일반 사용자」이면 로그아웃 후 관리자로 다시 로그인해 주세요.'
          : message || '사업관리 데이터 저장에 실패했습니다.'
      )
      pendingByContractIdRef.current.delete(contractId)
      void fetchContracts({ silent: true, isRefetch: true })
      return false
    } finally {
      savingContractIdsRef.current.delete(contractId)
      if (pendingByContractIdRef.current.has(contractId)) {
        void flushContractFieldSaves(contractId)
      }
    }
  }, [fetchContracts])

  useEffect(() => {
    return () => {
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current)
      }
    }
  }, [])

  const handleFieldSave = useCallback(
    async (row, field, rawValue) => {
      const contractId = safeString(row.id).trim()
      if (!contractId) return
      if (!PROJECT_MANAGEMENT_EDITABLE_FIELDS.includes(field)) {
        console.warn('[사업관리] 편집 불가 필드 저장 무시', field)
        return
      }

      const column = columns.find((c) => c.field === field)
      const previousPending = pendingByContractIdRef.current.get(contractId)
      const baseline =
        previousPending?.snapshot ||
        savedByContractIdRef.current[contractId] ||
        rowToSavedSnapshot(row)
      const nextSnapshot = { ...baseline }
      let displayValue = ''
      let apiValue = null

      if (column?.type === 'commencementCert') {
        apiValue = toCommencementCertApiValue(rawValue)
        nextSnapshot[field] = apiValue
        displayValue = isCommencementCertOmitValue(rawValue)
          ? COMMENCEMENT_CERT_OMIT_LABEL
          : formatDateDisplay(nextSnapshot[field])
      } else if (column?.type === 'date') {
        apiValue =
          rawValue === null || rawValue === undefined ? null : toDbDate(rawValue)
        nextSnapshot[field] = apiValue
        displayValue = formatDateDisplay(nextSnapshot[field])
      } else {
        // guaranteeRate / performanceCertStatus 등 텍스트 — 백엔드 키와 동일 camelCase
        apiValue = safeString(rawValue).trim()
        nextSnapshot[field] = apiValue
        displayValue = apiValue
      }

      const dirtyFields = new Set(previousPending?.dirtyFields || [])
      dirtyFields.add(field)
      const explicitPatch = {
        ...(previousPending?.explicitPatch || {}),
        // 변경된 칸은 diff 결과와 무관하게 반드시 Payload에 포함
        [field]: apiValue === undefined ? null : apiValue,
      }
      pendingByContractIdRef.current.set(contractId, {
        snapshot: nextSnapshot,
        dirtyFields,
        explicitPatch,
      })

      setContracts((prev) =>
        prev.map((item) =>
          item.id === contractId ? { ...item, [field]: displayValue } : item
        )
      )

      await flushContractFieldSaves(contractId)
    },
    [flushContractFieldSaves]
  )

  const handleExcelDownload = useCallback(() => {
    const rows = filteredRows.map(projectManagementRowToExcelRow)
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '사업관리')
    XLSX.writeFile(workbook, buildMenuExcelFilename('사업관리'))
  }, [filteredRows])

  const showEmpty = !loading && !error && contracts.length === 0
  const tableColSpan = columns.length

  const renderBodyCell = useCallback(
    (row, column) => {
      const thAlign = ' th-align-center'
      const colClass = `${column.colClass}${thAlign}`

      if (column.readonly) {
        const isProject = column.field === 'projectName'
        const isClient = column.field === 'client'
        const projectTitle = isProject ? safeString(row.projectName).trim() : ''
        const readonlyState =
          column.type === 'date'
            ? formatEditableTableCellText(row[column.field], { isDate: true })
            : {
                isEmpty: isTableCellEmpty(safeString(row[column.field]).trim()),
                text: safeString(row[column.field]).trim() || '-',
              }
        const cellText = readonlyState.text
        return (
          <td
            key={column.field}
            className={`unit-price-readonly ${colClass}${
              isProject ? ' text-left pl-4 unit-price-cell-project' : ''
            }${isClient ? ' text-center unit-price-cell-truncate' : ''}${
              !isProject && !isClient ? ' text-center' : ''
            } ${tableCellStateClass(readonlyState.isEmpty)}${
              readonlyState.isEmpty ? ' table-cell-empty-placeholder' : ''
            }`}
            title={isProject && projectTitle && cellText !== '-' ? projectTitle : undefined}
          >
            {cellText}
          </td>
        )
      }

      if (column.editable && !canEdit) {
        const { isEmpty, text } = getEditableColumnCellState(row, column)
        return (
          <td
            key={column.field}
            className={`unit-price-readonly ${colClass} text-center ${tableCellStateClass(isEmpty)}${
              isEmpty ? ' table-cell-empty-placeholder' : ''
            }`}
          >
            {text}
          </td>
        )
      }

      if (column.editable && column.type === 'commencementCert') {
        const isEmpty = !isCommencementCertOmitValue(row[column.field]) && isDateTableCellEmpty(row[column.field])
        return (
          <td
            key={column.field}
            className={`unit-price-editable-cell p-0 align-middle ${colClass} ${tableCellStateClass(!isEmpty)}`}
          >
            <EditableCommencementCertCell
              value={row[column.field] ?? ''}
              disabled={tableBusy}
              className="unit-price-cell-input"
              onSave={(nextValue) => void handleFieldSave(row, column.field, nextValue)}
            />
          </td>
        )
      }

      if (column.editable && column.type === 'date') {
        const isEmpty = isDateTableCellEmpty(row[column.field])
        return (
          <td
            key={column.field}
            className={`unit-price-editable-cell p-0 align-middle ${colClass} ${tableCellStateClass(isEmpty)}`}
          >
            <EditableDateCell
              value={row[column.field] ?? ''}
              disabled={tableBusy}
              className="unit-price-cell-input"
              onSave={(nextValue) => void handleFieldSave(row, column.field, nextValue)}
            />
          </td>
        )
      }

      if (column.editable) {
        const isEmpty = isTableCellEmpty(row[column.field])
        return (
          <td
            key={column.field}
            className={`unit-price-editable-cell p-0 align-middle ${colClass} ${tableCellStateClass(isEmpty)}`}
          >
            <EditableTextCell
              value={row[column.field] ?? ''}
              align="center"
              disabled={tableBusy}
              className="unit-price-cell-input"
              onSave={(nextValue) => void handleFieldSave(row, column.field, nextValue)}
            />
          </td>
        )
      }

      return null
    },
    [canEdit, handleFieldSave, tableBusy]
  )

  return (
    <div className={UNIT_PRICE_PAGE_ROOT}>
      {saveSuccess ? (
        <div className="unit-price-save-success" role="status" aria-live="polite">
          {saveSuccess}
        </div>
      ) : null}
      {saveError ? (
        <div className="unit-price-save-error" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className={UNIT_PRICE_TABLE_PANEL}>
        {refetching ? (
          <div className="unit-price-refetch-banner" role="status" aria-live="polite">
            데이터를 불러오는 중...
          </div>
        ) : null}

        {loading && contracts.length === 0 ? (
          <div className="unit-price-empty-cell">데이터를 불러오는 중...</div>
        ) : error && contracts.length === 0 ? (
          <div className="unit-price-empty-cell unit-price-empty-cell--error">{error}</div>
        ) : showEmpty ? (
          <div className="unit-price-empty-cell">
            표시할 계약 데이터가 없습니다. (계약분류 {EXCLUDED_CONTRACT_TYPE_CODE}·
            {EXCLUDED_CONTRACT_TYPE_LABEL} 제외)
          </div>
        ) : (
          <div className={UNIT_PRICE_PAGE_STACK}>
            <div className="contracts-header-actions">
              <button className="secondary-btn" type="button" onClick={handleExcelDownload}>
                엑셀로 내려받기
              </button>
            </div>

            <div className={UNIT_PRICE_TOOLBAR}>
              <input
                className={UNIT_PRICE_SEARCH_INPUT}
                placeholder="검색어를 입력하세요"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className={unitPriceTableWrapClass({ refetching, tableBusy })}>
              <table
                className={`${UNIT_PRICE_TABLE_CLASS} ${UNIT_PRICE_TABLE_PROJECT_MODIFIER}`}
              >
                <colgroup>
                  {columns.map((column) => (
                    <col
                      key={column.field}
                      className={column.colClass}
                      style={getUnitPriceColStyle(column)}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.field}
                        className={`${column.colClass} th-align-center${
                          column.filterable ? ' contract-th-filterable' : ''
                        }`}
                      >
                        {column.filterable ? (
                          <div className="contract-th-filter-wrap">
                            <span className="contract-th-label">{column.headerName}</span>
                            <ContractColumnHeaderFilter
                              columnKey={column.field}
                              options={projectManagementColumnFilterOptionsMap[column.field] ?? []}
                              selected={activeFilters[column.field] ?? []}
                              onApply={handleActiveFiltersApply}
                              isOpen={openContractColumnFilterKey === column.field}
                              onOpenChange={setOpenContractColumnFilterKey}
                              normalizeSelection={normalizeContractColumnFilterSelection}
                            />
                          </div>
                        ) : (
                          column.headerName
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isTableFilterResultEmpty ? (
                    <tr>
                      <td colSpan={tableColSpan} className="empty-cell">
                        필터 조건에 맞는 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, rowIndex) => (
                      <tr key={row.id} className={tableRowStripeClass(rowIndex)}>
                        {columns.map((column) => renderBodyCell(row, column))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="unit-price-grid-hint">
              편집 가능한 셀을 클릭하면 수정할 수 있으며, 날짜는 달력으로 선택할 수 있습니다. 변경 후
              다른 셀을 클릭하면 자동 저장됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
