import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Trash2 } from 'lucide-react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { normalizeContractColumnFilterSelection } from '../contractColumnFilter.js'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { isAuthSessionExpiredError } from '../apiClient.js'
import { unitPricesApi } from '../api/unitPricesApi.js'
import {
  UNIT_PRICE_FILTERABLE_COLUMN_KEYS,
  buildUnitPriceColumnFilterOptions,
  filterUnitPriceRowsByActiveFilters,
  unitPriceMatchesColumnFilters,
  unitPriceMatchesSearch,
} from '../unitPriceColumnFilter.js'
import {
  UNIT_PRICE_PAGE_ROOT,
  UNIT_PRICE_PAGE_STACK,
  UNIT_PRICE_SEARCH_INPUT,
  UNIT_PRICE_TABLE_CLASS,
  UNIT_PRICE_TABLE_PANEL,
  UNIT_PRICE_TOOLBAR,
  getUnitPriceColStyle,
  tableRowStripeClass,
  unitPriceTableWrapClass,
} from '../unitPricePageLayout.js'
import { isTableCellEmpty, tableCellStateClass } from '../tableCellEmptyState.js'
import '../App.css'

const CONTRACT_TYPE_FILTER = '55121903'

const UNIT_PRICE_FIELDS = [
  'costService',
  'itemName',
  'designUnitPrice',
  'pitch',
  'capW',
  'capH',
  'enclosure',
  'quotePrice',
  'replacementType',
]

/** 천 단위 콤마 포맷을 적용하는 숫자형 컬럼 */
const NUMBER_FIELDS = ['designUnitPrice', 'quotePrice']

/** 신규/교체 여부 드롭다운 옵션 */
const REPLACEMENT_TYPE_OPTIONS = ['신규', '교체']

const EMPTY_ITEM_PAYLOAD = Object.freeze({
  costService: '',
  itemName: '',
  designUnitPrice: 0,
  pitch: '',
  capW: '',
  capH: '',
  enclosure: '',
  quotePrice: 0,
  replacementType: '',
})

const PLACEHOLDER_ID_PREFIX = '__empty__'

/**
 * DataGrid-style column definitions — array order and width are authoritative.
 * [앞] 작업 · 사업년도 · 발주처 → [중] 사업명(350) → [뒤] 원가용역 → 품명 → 설계단가 · Pitch · W · H
 */
const columns = [
  {
    field: 'actions',
    headerName: '',
    width: 80,
    filterable: false,
    colClass: 'unit-price-col-actions',
  },
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
    field: 'projectName',
    headerName: '사업명',
    width: 350,
    flexGrow: true,
    filterable: true,
    readonly: true,
    colClass: 'unit-price-col-project',
  },
  {
    field: 'costService',
    headerName: '원가용역',
    width: 140,
    filterable: true,
    editable: true,
    colClass: 'unit-price-col-cost',
  },
  {
    field: 'itemName',
    headerName: '품명',
    width: 180,
    filterable: true,
    editable: true,
    colClass: 'unit-price-col-item',
  },
  {
    field: 'designUnitPrice',
    headerName: '설계단가',
    width: 160,
    filterable: true,
    editable: true,
    align: 'right',
    colClass: 'unit-price-col-design',
  },
  {
    field: 'pitch',
    headerName: 'Pitch',
    width: 110,
    filterable: true,
    editable: true,
    colClass: 'unit-price-col-pitch',
  },
  {
    field: 'capW',
    headerName: 'W',
    width: 110,
    filterable: true,
    editable: true,
    colClass: 'unit-price-col-capw',
  },
  {
    field: 'capH',
    headerName: 'H',
    width: 110,
    filterable: true,
    editable: true,
    colClass: 'unit-price-col-caph',
  },
  {
    field: 'enclosure',
    headerName: '함체',
    width: 180,
    filterable: true,
    editable: true,
    colClass: 'unit-price-col-enclosure',
  },
  {
    field: 'quotePrice',
    headerName: '견적 단가',
    width: 160,
    filterable: true,
    editable: true,
    type: 'number',
    align: 'right',
    colClass: 'unit-price-col-quote',
  },
  {
    field: 'replacementType',
    headerName: '신규/교체 여부',
    width: 140,
    filterable: true,
    editable: true,
    type: 'select',
    options: REPLACEMENT_TYPE_OPTIONS,
    align: 'center',
    colClass: 'unit-price-col-replacement',
  },
]

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function isPlaceholderRowId(id) {
  return safeString(id).startsWith(PLACEHOLDER_ID_PREFIX)
}

function normalizeDesignUnitPriceValue(value) {
  if (value === null || value === undefined || value === '') return ''
  return safeString(value).replace(/[^0-9]/g, '')
}

function formatDesignUnitPrice(value) {
  const raw = normalizeDesignUnitPriceValue(value)
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

function parseDesignUnitPrice(value) {
  const raw = normalizeDesignUnitPriceValue(value)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

function normalizeItemFromApi(item) {
  const itemId = safeString(item?.id).trim()
  return {
    id: itemId,
    costService: safeString(item?.costService).trim(),
    itemName: safeString(item?.itemName).trim(),
    designUnitPrice: formatDesignUnitPrice(item?.designUnitPrice),
    pitch: safeString(item?.pitch).trim(),
    capW: safeString(item?.capW).trim(),
    capH: safeString(item?.capH).trim(),
    enclosure: safeString(item?.enclosure).trim(),
    quotePrice: formatDesignUnitPrice(item?.quotePrice),
    replacementType: safeString(item?.replacementType).trim(),
  }
}

function emptyItemFields() {
  return {
    costService: '',
    itemName: '',
    designUnitPrice: '',
    pitch: '',
    capW: '',
    capH: '',
    enclosure: '',
    quotePrice: '',
    replacementType: '',
  }
}

function itemFieldsToApiPatch(fields) {
  return {
    costService: safeString(fields.costService).trim(),
    itemName: safeString(fields.itemName).trim(),
    designUnitPrice: parseDesignUnitPrice(fields.designUnitPrice),
    pitch: safeString(fields.pitch).trim(),
    capW: safeString(fields.capW).trim(),
    capH: safeString(fields.capH).trim(),
    enclosure: safeString(fields.enclosure).trim(),
    quotePrice: parseDesignUnitPrice(fields.quotePrice),
    replacementType: safeString(fields.replacementType).trim(),
  }
}

function buildItemPatchDiff(current, saved) {
  const patch = {}
  const apiCurrent = itemFieldsToApiPatch(current)
  const apiSaved = itemFieldsToApiPatch(saved)
  for (const key of UNIT_PRICE_FIELDS) {
    if (apiCurrent[key] !== apiSaved[key]) {
      patch[key] = apiCurrent[key]
    }
  }
  return patch
}

function flattenContractsToRows(contracts) {
  const list = Array.isArray(contracts) ? contracts : []
  const rows = []

  for (const contract of list) {
    const contractId = safeString(contract?.id).trim()
    if (!contractId) continue

    const parent = {
      contractId,
      year: safeString(contract?.year).trim(),
      client: safeString(contract?.client).trim(),
      projectName: safeString(contract?.projectName).trim(),
      contractNo: safeString(contract?.contractNo).trim(),
    }

    const items = Array.isArray(contract?.items) ? contract.items : []
    const normalizedItems = items.map((item) => normalizeItemFromApi(item)).filter((row) => row.id)

    if (normalizedItems.length === 0) {
      rows.push({
        id: `${PLACEHOLDER_ID_PREFIX}${contractId}`,
        ...parent,
        isPlaceholder: true,
        ...emptyItemFields(),
      })
      continue
    }

    for (const item of normalizedItems) {
      rows.push({
        id: item.id,
        ...parent,
        isPlaceholder: false,
        costService: item.costService,
        itemName: item.itemName,
        designUnitPrice: item.designUnitPrice,
        pitch: item.pitch,
        capW: item.capW,
        capH: item.capH,
        enclosure: item.enclosure,
        quotePrice: item.quotePrice,
        replacementType: item.replacementType,
      })
    }
  }

  return rows
}

function rowToSavedSnapshot(row) {
  return {
    costService: row.costService,
    itemName: row.itemName,
    designUnitPrice: row.designUnitPrice,
    pitch: row.pitch,
    capW: row.capW,
    capH: row.capH,
    enclosure: row.enclosure,
    quotePrice: row.quotePrice,
    replacementType: row.replacementType,
  }
}

function itemFieldsToTreeItem(normalized, itemId) {
  const patch = itemFieldsToApiPatch(normalized)
  return {
    id: itemId,
    costService: patch.costService,
    itemName: patch.itemName,
    designUnitPrice: patch.designUnitPrice,
    pitch: patch.pitch,
    capW: patch.capW,
    capH: patch.capH,
    enclosure: patch.enclosure,
    quotePrice: patch.quotePrice,
    replacementType: patch.replacementType,
  }
}

/** API 저장 후 트리 상태만 갱신 (전체 refetch·토스트 없음) */
function patchContractsTreeItem(contracts, row, normalized) {
  const contractId = safeString(row.contractId).trim()
  const itemId = safeString(row.id).trim()
  if (!contractId || !itemId) return contracts

  const treeItem = itemFieldsToTreeItem(normalized, itemId)

  return (Array.isArray(contracts) ? contracts : []).map((contract) => {
    if (safeString(contract?.id).trim() !== contractId) return contract
    const items = Array.isArray(contract.items) ? contract.items : []
    const idx = items.findIndex((it) => safeString(it?.id).trim() === itemId)
    if (idx < 0) return contract
    const nextItems = [...items]
    nextItems[idx] = { ...nextItems[idx], ...treeItem }
    return { ...contract, items: nextItems }
  })
}

function displayReadonlyCell(row, key) {
  const value = safeString(row?.[key]).trim()
  return value || '-'
}

function excelExportCellText(value) {
  const text = safeString(value).trim()
  return text || '-'
}

function unitPriceRowToExcelRow(row) {
  const designPrice = formatDesignUnitPrice(row.designUnitPrice)
  const quotePrice = formatDesignUnitPrice(row.quotePrice)
  return {
    사업년도: displayReadonlyCell(row, 'year'),
    발주처: displayReadonlyCell(row, 'client'),
    사업명: displayReadonlyCell(row, 'projectName'),
    원가용역: excelExportCellText(row.costService),
    품명: excelExportCellText(row.itemName),
    설계단가: designPrice || '-',
    Pitch: excelExportCellText(row.pitch),
    W: excelExportCellText(row.capW),
    H: excelExportCellText(row.capH),
    함체: excelExportCellText(row.enclosure),
    '견적 단가': quotePrice || '-',
    '신규/교체 여부': excelExportCellText(row.replacementType),
  }
}

function buildMenuExcelFilename(menuLabel) {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${menuLabel}_${ymd}.xlsx`
}

export default function UnitPriceManagement({ canEdit = true }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [tableBusy, setTableBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState({})
  const [openContractColumnFilterKey, setOpenContractColumnFilterKey] = useState(null)

  const savedByItemIdRef = useRef({})
  const savingItemIdsRef = useRef(new Set())

  const syncSavedSnapshots = useCallback((rows) => {
    const saved = {}
    for (const row of rows) {
      if (!row.isPlaceholder && row.id) {
        saved[row.id] = rowToSavedSnapshot(row)
      }
    }
    savedByItemIdRef.current = saved
  }, [])

  const fetchTree = useCallback(async ({ silent = false, isRefetch = false } = {}) => {
    if (isRefetch) setRefetching(true)
    else if (!silent) setLoading(true)
    setError(null)

    try {
      const data = await unitPricesApi.listTree(CONTRACT_TYPE_FILTER)
      const list = Array.isArray(data) ? data : []
      setContracts(list)
      syncSavedSnapshots(flattenContractsToRows(list))
    } catch (fetchError) {
      if (isAuthSessionExpiredError(fetchError)) return
      console.error('[단가관리] tree API fetch failed', fetchError)
      if (!isRefetch) {
        setError(fetchError?.message || '단가 데이터를 불러오지 못했습니다.')
        setContracts([])
        savedByItemIdRef.current = {}
      }
    } finally {
      if (isRefetch) setRefetching(false)
      else if (!silent) setLoading(false)
    }
  }, [syncSavedSnapshots])

  useEffect(() => {
    void fetchTree()
  }, [fetchTree])

  const flatRows = useMemo(() => flattenContractsToRows(contracts), [contracts])

  const unitPriceColumnFilterOptionsMap = useMemo(() => {
    const basePool = flatRows.filter((item) => unitPriceMatchesSearch(item, search))
    const map = {}
    UNIT_PRICE_FILTERABLE_COLUMN_KEYS.forEach((columnKey) => {
      const pool = basePool.filter((item) =>
        unitPriceMatchesColumnFilters(item, activeFilters, columnKey)
      )
      map[columnKey] = buildUnitPriceColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [activeFilters, flatRows, search])

  const filteredFlatRows = useMemo(() => {
    const searched = flatRows.filter((item) => unitPriceMatchesSearch(item, search))
    return filterUnitPriceRowsByActiveFilters(searched, activeFilters)
  }, [activeFilters, flatRows, search])

  const isTableFilterResultEmpty = useMemo(
    () => flatRows.length > 0 && filteredFlatRows.length === 0,
    [filteredFlatRows.length, flatRows.length]
  )
  const visibleColumns = useMemo(
    () => (canEdit ? columns : columns.filter((column) => column.field !== 'actions')),
    [canEdit]
  )

  const handleExcelDownload = useCallback(() => {
    const rows = filteredFlatRows
      .filter((row) => !row.isPlaceholder && !isPlaceholderRowId(row.id))
      .map(unitPriceRowToExcelRow)
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '단가관리')
    XLSX.writeFile(workbook, buildMenuExcelFilename('단가관리'))
  }, [filteredFlatRows])

  const handleActiveFiltersApply = useCallback((columnKey, selected) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  const persistItemSnapshot = useCallback(
    async (row, nextSnapshot) => {
      const rowId = safeString(row.id).trim()
      if (!canEdit) return false
      if (!rowId || savingItemIdsRef.current.has(rowId)) return false

      const contractId = safeString(row.contractId).trim()
      const isPlaceholder = row.isPlaceholder || isPlaceholderRowId(rowId)

      if (isPlaceholder) {
        const payload = itemFieldsToApiPatch(nextSnapshot)
        const hasContent = UNIT_PRICE_FIELDS.some((key) => {
          if (NUMBER_FIELDS.includes(key)) return Number(payload[key]) > 0
          return Boolean(safeString(payload[key]).trim())
        })
        if (!hasContent) return false

        savingItemIdsRef.current.add(rowId)
        try {
          if (!contractId) throw new Error('계약 ID가 없습니다.')
          await unitPricesApi.createItem(contractId, payload)
          setSaveError(null)
          void fetchTree({ silent: true })
          return true
        } catch (saveErr) {
          if (isAuthSessionExpiredError(saveErr)) return false
          console.error('[단가관리] 품목 생성 실패', saveErr)
          setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
          return false
        } finally {
          savingItemIdsRef.current.delete(rowId)
        }
      }

      const saved = savedByItemIdRef.current[rowId] || rowToSavedSnapshot(row)
      const patch = buildItemPatchDiff(nextSnapshot, saved)
      if (Object.keys(patch).length === 0) return false

      savingItemIdsRef.current.add(rowId)
      try {
        const updated = await unitPricesApi.updateItem(rowId, patch)
        const normalized = normalizeItemFromApi(updated)
        const snapshot = rowToSavedSnapshot({ ...row, ...normalized })
        savedByItemIdRef.current[rowId] = snapshot
        setContracts((prev) => patchContractsTreeItem(prev, row, snapshot))
        setSaveError(null)
        return true
      } catch (saveErr) {
        if (isAuthSessionExpiredError(saveErr)) return false
        console.error('[단가관리] 품목 저장 실패', saveErr)
        setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
        return false
      } finally {
        savingItemIdsRef.current.delete(rowId)
      }
    },
    [canEdit, fetchTree]
  )

  const handleItemFieldSave = useCallback(
    async (row, field, rawValue) => {
      const nextSnapshot = rowToSavedSnapshot(row)
      if (!canEdit) return
      if (NUMBER_FIELDS.includes(field)) {
        nextSnapshot[field] = formatDesignUnitPrice(rawValue)
      } else {
        nextSnapshot[field] = safeString(rawValue).trim()
      }
      await persistItemSnapshot(row, nextSnapshot)
    },
    [canEdit, persistItemSnapshot]
  )

  const handleAddItem = useCallback(
    async (contractId) => {
      const cid = safeString(contractId).trim()
      if (!canEdit) return
      if (!cid || tableBusy) return

      setTableBusy(true)
      setSaveError(null)
      try {
        await unitPricesApi.createItem(cid, { ...EMPTY_ITEM_PAYLOAD })
        await fetchTree({ silent: true })
      } catch (err) {
        if (!isAuthSessionExpiredError(err)) {
          setSaveError(err?.message || '품목 추가에 실패했습니다.')
        }
      } finally {
        setTableBusy(false)
      }
    },
    [canEdit, fetchTree, tableBusy]
  )

  const handleDeleteItem = useCallback(
    async (row) => {
      if (row?.isPlaceholder || isPlaceholderRowId(row?.id)) return
      if (!canEdit) return
      const itemId = safeString(row?.id).trim()
      if (!itemId || tableBusy) return
      if (!window.confirm('이 품목을 삭제할까요?')) return

      setTableBusy(true)
      setSaveError(null)
      try {
        await unitPricesApi.removeItem(itemId)
        delete savedByItemIdRef.current[itemId]
        await fetchTree({ silent: true })
      } catch (err) {
        if (!isAuthSessionExpiredError(err)) {
          setSaveError(err?.message || '품목 삭제에 실패했습니다.')
        }
      } finally {
        setTableBusy(false)
      }
    },
    [canEdit, fetchTree, tableBusy]
  )

  const showEmpty = !loading && !error && flatRows.length === 0
  const tableColSpan = visibleColumns.length

  const renderBodyCell = useCallback(
    (row, column) => {
      const thAlign = ' th-align-center'
      const colClass = `${column.colClass}${thAlign}`

      if (column.field === 'actions') {
        return (
          <td key={column.field} className={`unit-price-readonly unit-price-action-cell ${colClass}`}>
            <div className="unit-price-action-group">
              <button
                type="button"
                className="unit-price-action-btn"
                aria-label="품목 추가"
                disabled={tableBusy}
                onClick={() => void handleAddItem(row.contractId)}
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                className="unit-price-action-btn unit-price-action-btn--danger"
                aria-label="품목 삭제"
                disabled={tableBusy || row.isPlaceholder}
                onClick={() => void handleDeleteItem(row)}
              >
                <Trash2 size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </td>
        )
      }

      if (column.readonly) {
        const isProject = column.field === 'projectName'
        const isClient = column.field === 'client'
        return (
          <td
            key={column.field}
            className={`unit-price-readonly ${colClass}${
              isProject ? ' text-left pl-4 unit-price-cell-project' : ''
            }${isClient ? ' text-center unit-price-cell-truncate' : ''}${
              !isProject && !isClient ? ' text-center' : ''
            }`}
          >
            {displayReadonlyCell(row, column.field)}
          </td>
        )
      }

      if (column.editable) {
        const raw = row[column.field]
        const isEmpty =
          NUMBER_FIELDS.includes(column.field)
            ? isTableCellEmpty(formatDesignUnitPrice(raw))
            : isTableCellEmpty(raw)
        if (!canEdit) {
          const displayValue =
            NUMBER_FIELDS.includes(column.field)
              ? formatDesignUnitPrice(raw)
              : safeString(raw).trim()
          return (
            <td
              key={column.field}
              className={`unit-price-readonly ${colClass} ${
                column.align === 'right' ? 'text-right pr-4' : 'text-center'
              } ${tableCellStateClass(isEmpty)}${isEmpty ? ' table-cell-empty-placeholder' : ''}`}
            >
              {displayValue || '-'}
            </td>
          )
        }
        if (column.type === 'select') {
          return (
            <td
              key={column.field}
              className={`unit-price-editable-cell p-0 align-middle ${colClass} ${tableCellStateClass(isEmpty)}`}
            >
              <select
                className="unit-price-cell-input unit-price-cell-select"
                value={safeString(row[column.field]).trim()}
                disabled={tableBusy}
                onChange={(e) => void handleItemFieldSave(row, column.field, e.target.value)}
              >
                <option value="">선택</option>
                {(column.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </td>
          )
        }
        return (
          <td
            key={column.field}
            className={`unit-price-editable-cell p-0 align-middle ${colClass} ${tableCellStateClass(isEmpty)}`}
          >
            <EditableTextCell
              value={row[column.field] ?? ''}
              align={column.align || 'center'}
              disabled={tableBusy}
              className="unit-price-cell-input"
              onSave={(nextValue) => void handleItemFieldSave(row, column.field, nextValue)}
            />
          </td>
        )
      }

      return null
    },
    [canEdit, handleAddItem, handleDeleteItem, handleItemFieldSave, tableBusy]
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

        {loading && flatRows.length === 0 ? (
          <div className="unit-price-empty-cell">데이터를 불러오는 중...</div>
        ) : error && flatRows.length === 0 ? (
          <div className="unit-price-empty-cell unit-price-empty-cell--error">{error}</div>
        ) : showEmpty ? (
          <div className="unit-price-empty-cell">
            계약분류에 {CONTRACT_TYPE_FILTER}이(가) 포함된 계약 데이터가 없습니다.
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
                <table className={UNIT_PRICE_TABLE_CLASS}>
                  <colgroup>
                    {visibleColumns.map((column) => (
                      <col
                        key={column.field}
                        className={column.colClass}
                        style={getUnitPriceColStyle(column)}
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {visibleColumns.map((column) => (
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
                                options={unitPriceColumnFilterOptionsMap[column.field] ?? []}
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
                    filteredFlatRows.map((row, rowIndex) => (
                      <tr key={row.id} className={tableRowStripeClass(rowIndex)}>
                        {visibleColumns.map((column) => renderBodyCell(row, column))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="unit-price-grid-hint">
              {canEdit
                ? '품목 셀을 클릭하면 수정할 수 있으며, 편집 후 다른 셀을 클릭하면 자동 저장됩니다.'
                : '일반 사용자는 단가관리 내용을 조회만 할 수 있습니다.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
