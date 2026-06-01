import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, CircularProgress, IconButton, Tooltip } from '@mui/material'
import { DataGrid, useGridApiRef } from '@mui/x-data-grid'
import { koKR } from '@mui/x-data-grid/locales'
import { Plus, Trash2 } from 'lucide-react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { normalizeContractColumnFilterSelection } from '../contractColumnFilter.js'
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

const GRID_BASE_SX = {
  border: 'none',
  borderRadius: 0,
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: '#f3f4f6',
    fontWeight: 700,
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    width: '100%',
    textAlign: 'center',
  },
  '& .MuiDataGrid-columnHeader': {
    overflow: 'visible !important',
  },
}

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

function renderFilterHeader(label, columnKey, ctx) {
  const { unitPriceColumnFilterOptionsMap, activeFilters, handleActiveFiltersApply, openColumnFilterKey, setOpenColumnFilterKey } =
    ctx
  return (
    <div className="contract-th-filter-wrap">
      <span className="contract-th-label">{label}</span>
      <ContractColumnHeaderFilter
        columnKey={columnKey}
        options={unitPriceColumnFilterOptionsMap[columnKey] ?? []}
        selected={activeFilters[columnKey] ?? []}
        onApply={handleActiveFiltersApply}
        isOpen={openColumnFilterKey === columnKey}
        onOpenChange={setOpenColumnFilterKey}
        normalizeSelection={normalizeContractColumnFilterSelection}
      />
    </div>
  )
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
  const [openColumnFilterKey, setOpenColumnFilterKey] = useState(null)

  const savedByItemIdRef = useRef({})
  const savingItemIdsRef = useRef(new Set())
  const saveSuccessTimerRef = useRef(null)
  const refetchAfterSaveTimerRef = useRef(null)

  const gridApiRef = useGridApiRef()

  const gridLocaleText = useMemo(
    () => ({
      ...koKR,
      noRowsLabel: '표시할 데이터가 없습니다.',
    }),
    []
  )

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

  const handleAddItem = useCallback(
    async (contractId) => {
      const cid = safeString(contractId).trim()
      if (!cid || tableBusy) return

      setTableBusy(true)
      setSaveError(null)
      try {
        await unitPricesApi.createItem(cid, { ...EMPTY_ITEM_PAYLOAD })
        showToast('품목이 추가되었습니다.')
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
        showToast('품목이 삭제되었습니다.')
        await fetchTree({ silent: true, isRefetch: true })
      } catch (err) {
        setSaveError(err?.message || '품목 삭제에 실패했습니다.')
      } finally {
        setTableBusy(false)
      }
    },
    [fetchTree, showToast, tableBusy]
  )

  const processRowUpdate = useCallback(
    async (newRow, oldRow) => {
      const rowId = safeString(newRow.id).trim()
      if (!rowId || savingItemIdsRef.current.has(rowId) || tableBusy) return oldRow

      const current = rowToSavedSnapshot(newRow)
      const contractId = safeString(newRow.contractId).trim()

      if (newRow.isPlaceholder || isPlaceholderRowId(rowId)) {
        const payload = itemFieldsToApiPatch(current)
        const hasContent = UNIT_PRICE_FIELDS.some((key) => {
          if (key === 'designUnitPrice') return payload.designUnitPrice > 0
          return Boolean(safeString(payload[key]).trim())
        })
        if (!hasContent) return newRow

        savingItemIdsRef.current.add(rowId)
        try {
          if (!contractId) throw new Error('계약 ID가 없습니다.')
          await unitPricesApi.createItem(contractId, payload)
          setSaveError(null)
          showToast('저장되었습니다.')
          scheduleRefetchAfterSave()
          return newRow
        } catch (saveErr) {
          console.error('[단가관리] 품목 생성 실패', saveErr)
          setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
          setSaveSuccess(null)
          throw saveErr
        } finally {
          savingItemIdsRef.current.delete(rowId)
        }
      }

      const saved = savedByItemIdRef.current[rowId] || rowToSavedSnapshot(oldRow)
      const patch = buildItemPatchDiff(current, saved)
      if (Object.keys(patch).length === 0) return newRow

      savingItemIdsRef.current.add(rowId)
      try {
        const updated = await unitPricesApi.updateItem(rowId, patch)
        const normalized = normalizeItemFromApi(updated)
        savedByItemIdRef.current[rowId] = rowToSavedSnapshot({
          ...newRow,
          ...normalized,
        })
        setSaveError(null)
        showToast('저장되었습니다.')
        scheduleRefetchAfterSave()
        return {
          ...newRow,
          costService: normalized.costService,
          itemName: normalized.itemName,
          designUnitPrice: normalized.designUnitPrice,
          pitch: normalized.pitch,
          capW: normalized.capW,
          capH: normalized.capH,
        }
      } catch (saveErr) {
        console.error('[단가관리] 품목 저장 실패', saveErr)
        setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
        setSaveSuccess(null)
        throw saveErr
      } finally {
        savingItemIdsRef.current.delete(rowId)
      }
    },
    [scheduleRefetchAfterSave, showToast, tableBusy]
  )

  const handleCellClick = useCallback((params, event) => {
    if (params.field === 'actions') return
    if (params.isEditable) {
      event.defaultMuiPrevented = true
    }
  }, [])

  const handleCellDoubleClick = useCallback((params) => {
    if (params.field === 'actions' || !params.isEditable || !gridApiRef.current) return
    gridApiRef.current.startCellEditMode({
      id: params.id,
      field: params.field,
    })
  }, [])

  const filterHeaderCtx = useMemo(
    () => ({
      unitPriceColumnFilterOptionsMap,
      activeFilters,
      handleActiveFiltersApply,
      openColumnFilterKey,
      setOpenColumnFilterKey,
    }),
    [
      activeFilters,
      handleActiveFiltersApply,
      openColumnFilterKey,
      unitPriceColumnFilterOptionsMap,
    ]
  )

  const columns = useMemo(() => {
    const filterHeader = (label, key) => ({
      renderHeader: () => renderFilterHeader(label, key, filterHeaderCtx),
    })

    return [
      {
        field: 'actions',
        headerName: '',
        width: 72,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        headerAlign: 'center',
        align: 'center',
        renderCell: (params) => (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
            <Tooltip title="품목 추가">
              <span>
                <IconButton
                  size="small"
                  aria-label="품목 추가"
                  disabled={tableBusy || refetching}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleAddItem(params.row.contractId)
                  }}
                >
                  <Plus size={16} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={params.row.isPlaceholder ? '삭제할 품목 없음' : '품목 삭제'}>
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label="품목 삭제"
                  disabled={tableBusy || refetching || params.row.isPlaceholder}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleDeleteItem(params.row)
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ),
      },
      {
        field: 'year',
        headerName: '사업년도',
        width: 88,
        editable: false,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        valueFormatter: (value) => value || '-',
        ...filterHeader('사업년도', 'year'),
      },
      {
        field: 'client',
        headerName: '발주처',
        width: 130,
        editable: false,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        valueFormatter: (value) => value || '-',
        ...filterHeader('발주처', 'client'),
      },
      {
        field: 'projectName',
        headerName: '사업명',
        flex: 1,
        minWidth: 180,
        editable: false,
        headerAlign: 'center',
        disableColumnMenu: true,
        valueFormatter: (value) => value || '-',
        ...filterHeader('사업명', 'projectName'),
      },
      {
        field: 'itemName',
        headerName: '품명',
        width: 120,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        ...filterHeader('품명', 'itemName'),
      },
      {
        field: 'costService',
        headerName: '단가유형',
        width: 110,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        ...filterHeader('단가유형', 'costService'),
      },
      {
        field: 'designUnitPrice',
        headerName: '설계단가',
        width: 100,
        editable: true,
        headerAlign: 'center',
        align: 'right',
        disableColumnMenu: true,
        ...filterHeader('설계단가', 'designUnitPrice'),
      },
      {
        field: 'pitch',
        headerName: 'Pitch',
        width: 72,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        ...filterHeader('Pitch', 'pitch'),
      },
      {
        field: 'capW',
        headerName: 'W',
        width: 64,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        ...filterHeader('W', 'capW'),
      },
      {
        field: 'capH',
        headerName: 'H',
        width: 64,
        editable: true,
        headerAlign: 'center',
        align: 'center',
        disableColumnMenu: true,
        ...filterHeader('H', 'capH'),
      },
    ]
  }, [filterHeaderCtx, handleAddItem, handleDeleteItem, refetching, tableBusy])

  const showEmpty = !loading && !error && flatRows.length === 0

  const sharedGridProps = {
    disableColumnMenu: true,
    disableRowSelectionOnClick: true,
    density: 'compact',
    localeText: gridLocaleText,
    filterMode: 'client',
    sx: GRID_BASE_SX,
  }

  return (
    <div className="unit-price-management h-full min-h-0">
      {saveSuccess ? (
        <div className="unit-price-save-success" role="status">
          {saveSuccess}
        </div>
      ) : null}
      {saveError ? (
        <div className="unit-price-save-error" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="contract-table-panel unit-price-table-panel flex flex-col h-full min-h-[500px]">
        {refetching ? (
          <div className="unit-price-refetch-banner" role="status" aria-live="polite">
            데이터를 불러오는 중...
          </div>
        ) : null}

        {loading && flatRows.length === 0 ? (
          <Box className="unit-price-grid-loading" sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error && flatRows.length === 0 ? (
          <div className="unit-price-empty-cell unit-price-empty-cell--error">{error}</div>
        ) : showEmpty ? (
          <div className="unit-price-empty-cell">
            계약분류가 {CONTRACT_TYPE_FILTER}인 계약 데이터가 없습니다.
          </div>
        ) : (
          <>
            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="사업명, 발주처, 품명, Pitch 등 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Box
              className={`unit-price-datagrid-wrap contract-table-panel${
                refetching ? ' unit-price-table-wrap--refetching' : ''
              }`}
              sx={{ flex: 1, minHeight: 480, width: '100%' }}
            >
              <DataGrid
                apiRef={gridApiRef}
                rows={isTableFilterResultEmpty ? [] : filteredFlatRows}
                columns={columns}
                editMode="cell"
                processRowUpdate={processRowUpdate}
                onProcessRowUpdateError={(err) => {
                  console.error('[단가관리] 저장 오류', err)
                }}
                onCellClick={handleCellClick}
                onCellDoubleClick={handleCellDoubleClick}
                loading={refetching || tableBusy}
                {...sharedGridProps}
                localeText={{
                  ...gridLocaleText,
                  noRowsLabel: isTableFilterResultEmpty
                    ? '필터 조건에 맞는 데이터가 없습니다.'
                    : gridLocaleText.noRowsLabel,
                }}
              />
            </Box>
            <p className="unit-price-grid-hint" style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
              품목 셀을 더블클릭하면 수정할 수 있으며, 편집 후 다른 셀을 클릭하면 자동 저장됩니다.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
