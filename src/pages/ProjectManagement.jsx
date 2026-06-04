import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { normalizeContractColumnFilterSelection } from '../contractColumnFilter.js'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { EditableDateCell } from '../EditableDateCell.jsx'
import { contractsApi } from '../contractsApi.js'
import { formatDateDisplay, toDbDate } from '../dateFieldUtils.js'
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
    width: 140,
    filterable: true,
    editable: true,
    type: 'date',
    colClass: 'unit-price-col-date-picker',
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
    colClass: 'unit-price-col-guarantee-rate',
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
    commencementCert: formatDateDisplay(contract?.commencementCert),
    completionCert: formatDateDisplay(contract?.completionCert),
    warrantyStart: formatDateDisplay(contract?.warrantyStart),
    warrantyExpiry: formatDateDisplay(contract?.warrantyExpiry),
    guaranteeRate: safeString(contract?.guaranteeRate).trim(),
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

function rowToSavedSnapshot(row) {
  const snap = {}
  for (const key of PROJECT_MANAGEMENT_EDITABLE_FIELDS) {
    if (columns.find((c) => c.field === key)?.type === 'date') {
      snap[key] = toDbDate(row[key])
    } else {
      snap[key] = safeString(row[key]).trim()
    }
  }
  return snap
}

function buildContractPatchDiff(current, saved) {
  const patch = {}
  for (const key of PROJECT_MANAGEMENT_EDITABLE_FIELDS) {
    const column = columns.find((c) => c.field === key)
    const cur =
      column?.type === 'date' ? toDbDate(current[key]) : safeString(current[key]).trim()
    const prev = saved[key]
    if (cur !== prev) {
      patch[key] = cur
    }
  }
  return patch
}

function getEditableColumnCellState(row, column) {
  const raw = row[column.field]
  if (column.type === 'date') {
    return formatEditableTableCellText(raw, { isDate: true })
  }
  return formatEditableTableCellText(raw)
}

export default function ProjectManagement({ canEdit = true }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [tableBusy, setTableBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState({})
  const [openContractColumnFilterKey, setOpenContractColumnFilterKey] = useState(null)

  const savedByContractIdRef = useRef({})
  const savingContractIdsRef = useRef(new Set())

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
      const data = await contractsApi.list()
      const rows = filterProjectContracts(data)
      setContracts(rows)
      syncSavedSnapshots(rows)
    } catch (fetchError) {
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

  const persistContractFields = useCallback(
    async (row, nextSnapshot) => {
      const contractId = safeString(row.id).trim()
      if (!contractId || savingContractIdsRef.current.has(contractId)) return false

      const saved = savedByContractIdRef.current[contractId] || rowToSavedSnapshot(row)
      const patch = buildContractPatchDiff(
        {
          ...row,
          ...Object.fromEntries(
            PROJECT_MANAGEMENT_EDITABLE_FIELDS.map((key) => {
              const column = columns.find((c) => c.field === key)
              if (column?.type === 'date') {
                return [key, nextSnapshot[key] ?? toDbDate(row[key])]
              }
              return [key, nextSnapshot[key] ?? safeString(row[key]).trim()]
            })
          ),
        },
        saved
      )

      if (Object.keys(patch).length === 0) return false

      savingContractIdsRef.current.add(contractId)
      try {
        const updated = await contractsApi.update(contractId, patch)
        const normalized = normalizeContractFromApi(updated)
        if (normalized) {
          savedByContractIdRef.current[contractId] = rowToSavedSnapshot(normalized)
          setContracts((prev) =>
            prev.map((item) => (item.id === contractId ? { ...item, ...normalized } : item))
          )
        } else {
          savedByContractIdRef.current[contractId] = rowToSavedSnapshot({
            ...row,
            ...patch,
          })
        }
        setSaveError(null)
        return true
      } catch (saveErr) {
        console.error('[사업관리] 계약 저장 실패', saveErr)
        setSaveError(saveErr?.message || '사업관리 데이터 저장에 실패했습니다.')
        return false
      } finally {
        savingContractIdsRef.current.delete(contractId)
      }
    },
    []
  )

  const handleFieldSave = useCallback(
    async (row, field, rawValue) => {
      const column = columns.find((c) => c.field === field)
      const nextSnapshot = rowToSavedSnapshot(row)
      if (column?.type === 'date') {
        nextSnapshot[field] =
          rawValue === null || rawValue === undefined ? null : toDbDate(rawValue)
      } else {
        nextSnapshot[field] = safeString(rawValue).trim()
      }
      await persistContractFields(row, nextSnapshot)
    },
    [persistContractFields]
  )

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
        const cellText =
          column.type === 'date'
            ? formatDateDisplay(row[column.field]) || '-'
            : safeString(row[column.field]).trim() || '-'
        return (
          <td
            key={column.field}
            className={`unit-price-readonly ${colClass}${
              isProject ? ' text-left pl-4 unit-price-cell-project' : ''
            }${isClient ? ' text-center unit-price-cell-truncate' : ''}${
              !isProject && !isClient ? ' text-center' : ''
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
