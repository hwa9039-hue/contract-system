import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, CircularProgress, IconButton, Tooltip } from '@mui/material'
import { DataGridPro } from '@mui/x-data-grid-pro'
import { LicenseInfo } from '@mui/x-license'
import { Plus, Trash2 } from 'lucide-react'
import { unitPricesApi } from '../api/unitPricesApi.js'

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

if (import.meta.env.VITE_MUI_X_LICENSE_KEY) {
  LicenseInfo.setLicenseKey(import.meta.env.VITE_MUI_X_LICENSE_KEY)
}

const REFETCH_AFTER_SAVE_DELAY_MS = 750

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
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
  return {
    costService: safeString(item?.costService).trim(),
    itemName: safeString(item?.itemName).trim(),
    designUnitPrice: formatDesignUnitPrice(item?.designUnitPrice),
    pitch: safeString(item?.pitch).trim(),
    capW: safeString(item?.capW).trim(),
    capH: safeString(item?.capH).trim(),
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

function formatContractTreeLabel(row) {
  const parts = [row.year, row.client, row.projectName]
    .map((v) => safeString(v).trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '계약'
}

function formatItemTreeLabel(row) {
  const name = safeString(row.itemName).trim()
  const service = safeString(row.costService).trim()
  if (name && service) return `${name} (${service})`
  return name || service || '품목'
}

/** GET nested 응답 → DataGridPro treeData rows */
function contractsToGridRows(contracts) {
  const rows = []
  for (const contract of contracts || []) {
    const contractId = safeString(contract.id).trim()
    if (!contractId) continue

    const parentRow = {
      id: `contract:${contractId}`,
      rowKind: 'contract',
      path: [contractId],
      contractId,
      itemId: '',
      year: safeString(contract.year).trim(),
      client: safeString(contract.client).trim(),
      projectName: safeString(contract.projectName).trim(),
      treeLabel: '',
      costService: '',
      itemName: '',
      designUnitPrice: '',
      pitch: '',
      capW: '',
      capH: '',
    }
    parentRow.treeLabel = formatContractTreeLabel(parentRow)
    rows.push(parentRow)

    const items = Array.isArray(contract.items) ? contract.items : []
    for (const item of items) {
      const itemId = safeString(item.id).trim()
      if (!itemId) continue
      const fields = normalizeItemFromApi(item)
      const childRow = {
        id: `item:${itemId}`,
        rowKind: 'item',
        path: [contractId, itemId],
        contractId,
        itemId,
        year: '',
        client: '',
        projectName: '',
        treeLabel: '',
        ...fields,
      }
      childRow.treeLabel = formatItemTreeLabel(childRow)
      rows.push(childRow)
    }
  }
  return rows
}

export default function UnitPriceManagement() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [addingContractId, setAddingContractId] = useState(null)
  const [deletingItemId, setDeletingItemId] = useState(null)

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

  const fetchTree = useCallback(async ({ silent = false, isRefetch = false } = {}) => {
    if (isRefetch) setRefetching(true)
    else if (!silent) setLoading(true)
    setError(null)

    try {
      const data = await unitPricesApi.listTree(CONTRACT_TYPE_FILTER)
      const list = Array.isArray(data) ? data : []
      setContracts(list)

      const saved = {}
      for (const contract of list) {
        for (const item of contract.items || []) {
          const itemId = safeString(item.id).trim()
          if (itemId) saved[itemId] = normalizeItemFromApi(item)
        }
      }
      savedByItemIdRef.current = saved
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
  }, [])

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

  const gridRows = useMemo(() => contractsToGridRows(contracts), [contracts])

  const handleAddItem = useCallback(
    async (contractId) => {
      const cid = safeString(contractId).trim()
      if (!cid) return
      setAddingContractId(cid)
      setSaveError(null)
      try {
        await unitPricesApi.createItem(cid, { ...EMPTY_ITEM_PAYLOAD })
        showToast('품목이 추가되었습니다.')
        await fetchTree({ silent: true, isRefetch: true })
      } catch (err) {
        setSaveError(err?.message || '품목 추가에 실패했습니다.')
      } finally {
        setAddingContractId(null)
      }
    },
    [fetchTree, showToast]
  )

  const handleDeleteItem = useCallback(
    async (itemId) => {
      const iid = safeString(itemId).trim()
      if (!iid) return
      if (!window.confirm('이 품목을 삭제할까요?')) return

      setDeletingItemId(iid)
      setSaveError(null)
      try {
        await unitPricesApi.removeItem(iid)
        delete savedByItemIdRef.current[iid]
        showToast('품목이 삭제되었습니다.')
        await fetchTree({ silent: true, isRefetch: true })
      } catch (err) {
        setSaveError(err?.message || '품목 삭제에 실패했습니다.')
      } finally {
        setDeletingItemId(null)
      }
    },
    [fetchTree, showToast]
  )

  const processRowUpdate = useCallback(
    async (newRow, oldRow) => {
      if (newRow.rowKind !== 'item') return newRow

      const itemId = safeString(newRow.itemId).trim()
      if (!itemId || savingItemIdsRef.current.has(itemId)) return oldRow

      const current = {
        costService: newRow.costService,
        itemName: newRow.itemName,
        designUnitPrice: newRow.designUnitPrice,
        pitch: newRow.pitch,
        capW: newRow.capW,
        capH: newRow.capH,
      }
      const saved = savedByItemIdRef.current[itemId] || normalizeItemFromApi({})
      const patch = buildItemPatchDiff(current, saved)
      if (Object.keys(patch).length === 0) return newRow

      savingItemIdsRef.current.add(itemId)
      try {
        const updated = await unitPricesApi.updateItem(itemId, patch)
        const normalized = normalizeItemFromApi(updated)
        savedByItemIdRef.current[itemId] = normalized
        setSaveError(null)
        showToast('저장되었습니다.')
        scheduleRefetchAfterSave()
        return {
          ...newRow,
          ...normalized,
          treeLabel: formatItemTreeLabel({ ...newRow, ...normalized }),
        }
      } catch (saveErr) {
        console.error('[단가관리] 품목 저장 실패', saveErr)
        setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
        setSaveSuccess(null)
        throw saveErr
      } finally {
        savingItemIdsRef.current.delete(itemId)
      }
    },
    [scheduleRefetchAfterSave, showToast]
  )

  const columns = useMemo(
    () => [
      {
        field: 'actions',
        headerName: '',
        width: 108,
        headerAlign: 'center',
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        disableExport: true,
        renderCell: (params) => {
          if (params.row.rowKind === 'contract') {
            const busy = addingContractId === params.row.contractId
            return (
              <Tooltip title="품목 추가">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    startIcon={<Plus size={14} strokeWidth={2.5} />}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleAddItem(params.row.contractId)
                    }}
                    sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 12 }}
                  >
                    {busy ? '…' : '품목'}
                  </Button>
                </span>
              </Tooltip>
            )
          }
          if (params.row.rowKind === 'item') {
            const busy = deletingItemId === params.row.itemId
            return (
              <Tooltip title="품목 삭제">
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={busy}
                    aria-label="품목 삭제"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDeleteItem(params.row.itemId)
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </span>
              </Tooltip>
            )
          }
          return null
        },
      },
      {
        field: 'year',
        headerName: '사업년도',
        width: 96,
        headerAlign: 'center',
        editable: false,
        valueFormatter: (value, row) =>
          row.rowKind === 'contract' ? value || '-' : '',
      },
      {
        field: 'client',
        headerName: '발주처',
        width: 140,
        headerAlign: 'center',
        editable: false,
        valueFormatter: (value, row) =>
          row.rowKind === 'contract' ? value || '-' : '',
      },
      {
        field: 'projectName',
        headerName: '사업명',
        flex: 1,
        minWidth: 200,
        headerAlign: 'center',
        editable: false,
        valueFormatter: (value, row) =>
          row.rowKind === 'contract' ? value || '-' : '',
      },
      {
        field: 'costService',
        headerName: '원가용역',
        width: 120,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
      {
        field: 'itemName',
        headerName: '품명',
        width: 120,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
      {
        field: 'designUnitPrice',
        headerName: '설계단가',
        width: 110,
        editable: true,
        align: 'right',
        headerAlign: 'center',
      },
      {
        field: 'pitch',
        headerName: 'Pitch',
        width: 80,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
      {
        field: 'capW',
        headerName: 'W',
        width: 72,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
      {
        field: 'capH',
        headerName: 'H',
        width: 72,
        editable: true,
        align: 'center',
        headerAlign: 'center',
      },
    ],
    [addingContractId, deletingItemId, handleAddItem, handleDeleteItem]
  )

  const isCellEditable = useCallback((params) => params.row.rowKind === 'item', [])

  const getTreeDataPath = useCallback((row) => row.path, [])

  const groupingColDef = useMemo(
    () => ({
      headerName: '계약 / 품목',
      width: 280,
      headerAlign: 'center',
      valueGetter: (_value, row) => row.treeLabel || '',
    }),
    []
  )

  const showEmpty = !loading && !error && contracts.length === 0

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

        {loading && contracts.length === 0 ? (
          <Box className="unit-price-grid-loading" sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error && contracts.length === 0 ? (
          <div className="unit-price-empty-cell unit-price-empty-cell--error">{error}</div>
        ) : showEmpty ? (
          <div className="unit-price-empty-cell">
            계약분류가 {CONTRACT_TYPE_FILTER}인 계약 데이터가 없습니다.
          </div>
        ) : (
          <Box className="unit-price-datagrid-wrap" sx={{ flex: 1, minHeight: 480, width: '100%' }}>
            <DataGridPro
              treeData
              rows={gridRows}
              columns={columns}
              getTreeDataPath={getTreeDataPath}
              groupingColDef={groupingColDef}
              defaultGroupingExpansionDepth={-1}
              getRowId={(row) => row.id}
              isCellEditable={isCellEditable}
              processRowUpdate={processRowUpdate}
              onProcessRowUpdateError={(err) => {
                console.error('[단가관리] grid row update error', err)
              }}
              editMode="cell"
              disableRowSelectionOnClick
              density="compact"
              loading={refetching}
              filterMode="client"
              localeText={{
                noRowsLabel: '표시할 데이터가 없습니다.',
              }}
              sx={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#f3f4f6',
                  fontWeight: 700,
                },
                '& .unit-price-grid-row--contract': {
                  backgroundColor: '#f8fafc',
                  fontWeight: 600,
                },
                '& .unit-price-grid-row--contract .MuiDataGrid-cell': {
                  color: '#1e293b',
                },
                '& .unit-price-grid-row--item .MuiDataGrid-cell--editable': {
                  cursor: 'text',
                },
              }}
              getRowClassName={(params) =>
                params.row.rowKind === 'contract'
                  ? 'unit-price-grid-row--contract'
                  : 'unit-price-grid-row--item'
              }
            />
          </Box>
        )}
      </div>
    </div>
  )
}
