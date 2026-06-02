import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { normalizeContractColumnFilterSelection } from '../contractColumnFilter.js'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { unitPricesApi } from '../api/unitPricesApi.js'
import {
  UNIT_PRICE_FILTERABLE_COLUMN_KEYS,
  buildUnitPriceColumnFilterOptions,
  filterUnitPriceRowsByActiveFilters,
  unitPriceMatchesColumnFilters,
  unitPriceMatchesSearch,
} from '../unitPriceColumnFilter.js'
import '../App.css'

const CONTRACT_TYPE_FILTER = '55121903'

const UNIT_PRICE_FIELDS = [
  'costService',
  'itemName',
  'designUnitPrice',
  'pitch',
  'capW',
  'capH',
]

const EMPTY_ITEM_PAYLOAD = Object.freeze({
  costService: '',
  itemName: '',
  designUnitPrice: 0,
  pitch: '',
  capW: '',
  capH: '',
})

const REFETCH_AFTER_SAVE_DELAY_MS = 750

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
  }
}

function displayReadonlyCell(row, key) {
  const value = safeString(row?.[key]).trim()
  return value || '-'
}

export default function UnitPriceManagement() {
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

  const savedByItemIdRef = useRef({})
  const savingItemIdsRef = useRef(new Set())
  const saveSuccessTimerRef = useRef(null)
  const refetchAfterSaveTimerRef = useRef(null)

  const showToast = useCallback((message) => {
    setSaveSuccess(message)
    if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
    saveSuccessTimerRef.current = setTimeout(() => {
      setSaveSuccess(null)
      saveSuccessTimerRef.current = null
    }, 1600)
  }, [])

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

  const scheduleRefetchAfterSave = useCallback(() => {
    if (refetchAfterSaveTimerRef.current) clearTimeout(refetchAfterSaveTimerRef.current)
    refetchAfterSaveTimerRef.current = setTimeout(() => {
      refetchAfterSaveTimerRef.current = null
      void fetchTree({ silent: true, isRefetch: true })
    }, REFETCH_AFTER_SAVE_DELAY_MS)
  }, [fetchTree])

  useEffect(() => {
    void fetchTree()
    return () => {
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      if (refetchAfterSaveTimerRef.current) clearTimeout(refetchAfterSaveTimerRef.current)
    }
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
      if (!rowId || savingItemIdsRef.current.has(rowId) || tableBusy) return false

      const contractId = safeString(row.contractId).trim()
      const isPlaceholder = row.isPlaceholder || isPlaceholderRowId(rowId)

      if (isPlaceholder) {
        const payload = itemFieldsToApiPatch(nextSnapshot)
        const hasContent = UNIT_PRICE_FIELDS.some((key) => {
          if (key === 'designUnitPrice') return payload.designUnitPrice > 0
          return Boolean(safeString(payload[key]).trim())
        })
        if (!hasContent) return false

        savingItemIdsRef.current.add(rowId)
        try {
          if (!contractId) throw new Error('계약 ID가 없습니다.')
          await unitPricesApi.createItem(contractId, payload)
          setSaveError(null)
          showToast('저장되었습니다.')
          scheduleRefetchAfterSave()
          return true
        } catch (saveErr) {
          console.error('[단가관리] 품목 생성 실패', saveErr)
          setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
          setSaveSuccess(null)
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
        savedByItemIdRef.current[rowId] = rowToSavedSnapshot({
          ...row,
          ...normalized,
        })
        setSaveError(null)
        showToast('저장되었습니다.')
        scheduleRefetchAfterSave()
        return true
      } catch (saveErr) {
        console.error('[단가관리] 품목 저장 실패', saveErr)
        setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
        setSaveSuccess(null)
        return false
      } finally {
        savingItemIdsRef.current.delete(rowId)
      }
    },
    [scheduleRefetchAfterSave, showToast, tableBusy]
  )

  const handleItemFieldSave = useCallback(
    async (row, field, rawValue) => {
      const nextSnapshot = rowToSavedSnapshot(row)
      if (field === 'designUnitPrice') {
        nextSnapshot.designUnitPrice = formatDesignUnitPrice(rawValue)
      } else {
        nextSnapshot[field] = safeString(rawValue).trim()
      }
      await persistItemSnapshot(row, nextSnapshot)
    },
    [persistItemSnapshot]
  )

  const handleAddItem = useCallback(
    async (contractId) => {
      const cid = safeString(contractId).trim()
      if (!cid || tableBusy) return

      setTableBusy(true)
      setSaveError(null)
      try {
        await unitPricesApi.createItem(cid, { ...EMPTY_ITEM_PAYLOAD })
        showToast('저장되었습니다.')
        await fetchTree({ silent: true, isRefetch: true })
      } catch (err) {
        setSaveError(err?.message || '품목 추가에 실패했습니다.')
      } finally {
        setTableBusy(false)
      }
    },
    [fetchTree, showToast, tableBusy]
  )

  const handleDeleteItem = useCallback(
    async (row) => {
      if (row?.isPlaceholder || isPlaceholderRowId(row?.id)) return
      const itemId = safeString(row?.id).trim()
      if (!itemId || tableBusy) return
      if (!window.confirm('이 품목을 삭제할까요?')) return

      setTableBusy(true)
      setSaveError(null)
      try {
        await unitPricesApi.removeItem(itemId)
        delete savedByItemIdRef.current[itemId]
        showToast('삭제되었습니다.')
        await fetchTree({ silent: true, isRefetch: true })
      } catch (err) {
        setSaveError(err?.message || '품목 삭제에 실패했습니다.')
      } finally {
        setTableBusy(false)
      }
    },
    [fetchTree, showToast, tableBusy]
  )

  const showEmpty = !loading && !error && flatRows.length === 0
  const tableColSpan = columns.length
  const tableTotalWidth = useMemo(
    () => columns.reduce((sum, column) => sum + column.width, 0),
    []
  )

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
                disabled={tableBusy || refetching}
                onClick={() => void handleAddItem(row.contractId)}
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                className="unit-price-action-btn unit-price-action-btn--danger"
                aria-label="품목 삭제"
                disabled={tableBusy || refetching || row.isPlaceholder}
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
        return (
          <td key={column.field} className={`unit-price-editable-cell p-0 align-middle ${colClass}`}>
            <EditableTextCell
              value={row[column.field] ?? ''}
              align={column.align || 'center'}
              disabled={tableBusy || refetching}
              className="unit-price-cell-input"
              onSave={(nextValue) => void handleItemFieldSave(row, column.field, nextValue)}
            />
          </td>
        )
      }

      return null
    },
    [handleAddItem, handleDeleteItem, handleItemFieldSave, refetching, tableBusy]
  )

  return (
    <div className="unit-price-management h-full min-h-0">
      {saveSuccess ? (
        <div className="mode-toast" role="status">
          {saveSuccess}
        </div>
      ) : null}
      {saveError ? (
        <div className="unit-price-save-error" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="contract-table-panel unit-price-table-panel flex flex-col flex-1 min-h-0">
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
            계약분류가 {CONTRACT_TYPE_FILTER}인 계약 데이터가 없습니다.
          </div>
        ) : (
          <div className="unit-price-page-stack">
            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="검색어를 입력하세요"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div
              className={`table-wrap contracts-only-scroll unit-price-table-scroll${
                refetching || tableBusy ? ' unit-price-table-wrap--refetching' : ''
              }`}
            >
                <table
                  className="contract-table excel-table registry-table ledger-table-ui contracts-fixed-table unit-price-table"
                  style={{ width: tableTotalWidth, minWidth: tableTotalWidth }}
                >
                  <colgroup>
                    {columns.map((column) => (
                      <col
                        key={column.field}
                        className={column.colClass}
                        style={{ width: column.width, minWidth: column.width }}
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
                    filteredFlatRows.map((row) => (
                      <tr key={row.id}>{columns.map((column) => renderBodyCell(row, column))}</tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="unit-price-grid-hint">
              품목 셀을 클릭하면 수정할 수 있으며, 편집 후 다른 셀을 클릭하면 자동 저장됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
