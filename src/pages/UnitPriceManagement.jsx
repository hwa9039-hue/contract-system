import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import { DataGrid, GridToolbar, useGridApiRef } from '@mui/x-data-grid'
import { koKR } from '@mui/x-data-grid/locales'
import { Plus, Trash2, X } from 'lucide-react'
import { unitPricesApi } from '../api/unitPricesApi.js'
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

const GRID_BASE_SX = {
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: '#f3f4f6',
    fontWeight: 700,
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    width: '100%',
    textAlign: 'center',
  },
}

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

function formatItemSummaryPart(item) {
  const itemName = safeString(item?.itemName).trim()
  const costService = safeString(item?.costService).trim()
  const label = itemName || costService
  if (!label) return ''
  const pitch = safeString(item?.pitch).trim()
  if (pitch) return `${label}(Pitch:${pitch})`
  return label
}

function buildItemsSummaryFromItems(items) {
  if (!Array.isArray(items)) return ''
  return items.map(formatItemSummaryPart).filter(Boolean).join(', ')
}

function contractToMainRow(contract) {
  const contractId = safeString(contract?.id).trim()
  const items = Array.isArray(contract?.items) ? contract.items : []
  const itemsSummary =
    safeString(contract?.itemsSummary).trim() || buildItemsSummaryFromItems(items)
  return {
    id: contractId || `__missing__${Math.random()}`,
    contractId,
    year: safeString(contract?.year).trim(),
    client: safeString(contract?.client).trim(),
    projectName: safeString(contract?.projectName).trim(),
    contractNo: safeString(contract?.contractNo).trim(),
    itemsSummary,
    items,
  }
}

function formatContractDialogTitle(contract) {
  const parts = [
    safeString(contract?.projectName).trim(),
    safeString(contract?.client).trim(),
    contract?.year ? `${contract.year}년` : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '품목 관리'
}

export default function UnitPriceManagement() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedContract, setSelectedContract] = useState(null)
  const [dialogItems, setDialogItems] = useState([])
  const [dialogBusy, setDialogBusy] = useState(false)

  const savedByItemIdRef = useRef({})
  const savingItemIdsRef = useRef(new Set())
  const saveSuccessTimerRef = useRef(null)
  const refetchAfterSaveTimerRef = useRef(null)
  const dialogContractIdRef = useRef('')

  const itemGridApiRef = useGridApiRef()

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

  const syncDialogItemsFromContract = useCallback((contract) => {
    const items = (contract?.items || [])
      .map((item) => normalizeItemFromApi(item))
      .filter((row) => row.id)

    const saved = {}
    for (const row of items) {
      saved[row.id] = { ...row }
    }
    savedByItemIdRef.current = saved
    setDialogItems(items)
  }, [])

  const fetchTree = useCallback(async ({ silent = false, isRefetch = false } = {}) => {
    if (isRefetch) setRefetching(true)
    else if (!silent) setLoading(true)
    setError(null)

    try {
      const data = await unitPricesApi.listTree(CONTRACT_TYPE_FILTER)
      const list = Array.isArray(data) ? data : []
      setContracts(list)

      const dialogCid = safeString(dialogContractIdRef.current).trim()
      if (dialogCid) {
        const updated = list.find((c) => safeString(c.id).trim() === dialogCid)
        if (updated) {
          const row = contractToMainRow(updated)
          setSelectedContract(row)
          syncDialogItemsFromContract(updated)
        }
      }
    } catch (fetchError) {
      console.error('[단가관리] tree API fetch failed', fetchError)
      if (!isRefetch) {
        setError(fetchError?.message || '단가 데이터를 불러오지 못했습니다.')
        setContracts([])
      }
    } finally {
      if (isRefetch) setRefetching(false)
      else if (!silent) setLoading(false)
    }
  }, [syncDialogItemsFromContract])

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

  const mainRows = useMemo(
    () => contracts.map(contractToMainRow).filter((row) => row.contractId),
    [contracts]
  )

  const handleOpenItemDialog = useCallback((contractRow) => {
    const contract = contracts.find(
      (c) => safeString(c.id).trim() === safeString(contractRow.contractId).trim()
    )
    if (!contract) return

    const row = contractToMainRow(contract)
    setSelectedContract(row)
    dialogContractIdRef.current = row.contractId
    syncDialogItemsFromContract(contract)
    setSaveError(null)
    setDialogOpen(true)
  }, [contracts, syncDialogItemsFromContract])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setSelectedContract(null)
    dialogContractIdRef.current = ''
    setDialogItems([])
    savedByItemIdRef.current = {}
    setDialogBusy(false)
  }, [])

  const handleDialogAddItem = useCallback(async () => {
    const contractId = safeString(selectedContract?.contractId).trim()
    if (!contractId || dialogBusy) return

    setDialogBusy(true)
    setSaveError(null)
    try {
      await unitPricesApi.createItem(contractId, { ...EMPTY_ITEM_PAYLOAD })
      showToast('품목이 추가되었습니다.')
      await fetchTree({ silent: true, isRefetch: true })
    } catch (err) {
      setSaveError(err?.message || '품목 추가에 실패했습니다.')
    } finally {
      setDialogBusy(false)
    }
  }, [selectedContract?.contractId, dialogBusy, fetchTree, showToast])

  const handleDialogDeleteItem = useCallback(
    async (itemId) => {
      const iid = safeString(itemId).trim()
      if (!iid || dialogBusy) return
      if (!window.confirm('이 품목을 삭제할까요?')) return

      setDialogBusy(true)
      setSaveError(null)
      try {
        await unitPricesApi.removeItem(iid)
        delete savedByItemIdRef.current[iid]
        showToast('품목이 삭제되었습니다.')
        await fetchTree({ silent: true, isRefetch: true })
      } catch (err) {
        setSaveError(err?.message || '품목 삭제에 실패했습니다.')
      } finally {
        setDialogBusy(false)
      }
    },
    [dialogBusy, fetchTree, showToast]
  )

  const processItemRowUpdate = useCallback(
    async (newRow, oldRow) => {
      const itemId = safeString(newRow.id).trim()
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
        savedByItemIdRef.current[itemId] = { ...normalized }
        setDialogItems((prev) =>
          prev.map((row) => (row.id === itemId ? { ...normalized } : row))
        )
        setSaveError(null)
        showToast('저장되었습니다.')
        scheduleRefetchAfterSave()
        return { ...newRow, ...normalized }
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

  const handleItemCellClick = useCallback((params, event) => {
    if (params.isEditable) {
      event.defaultMuiPrevented = true
    }
  }, [])

  const handleItemCellDoubleClick = useCallback((params) => {
    if (!params.isEditable || !itemGridApiRef.current) return
    itemGridApiRef.current.startCellEditMode({
      id: params.id,
      field: params.field,
    })
  }, [])

  const mainColumns = useMemo(
    () => [
      {
        field: 'manage',
        headerName: '품목',
        width: 108,
        headerAlign: 'center',
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <Button
            size="small"
            variant="contained"
            onClick={(event) => {
              event.stopPropagation()
              handleOpenItemDialog(params.row)
            }}
            sx={{ minWidth: 0, px: 1.5, py: 0.35, fontSize: 12 }}
          >
            품목 관리
          </Button>
        ),
      },
      {
        field: 'year',
        headerName: '사업년도',
        width: 96,
        headerAlign: 'center',
        valueFormatter: (value) => value || '-',
      },
      {
        field: 'client',
        headerName: '발주처',
        width: 160,
        headerAlign: 'center',
        valueFormatter: (value) => value || '-',
      },
      {
        field: 'projectName',
        headerName: '사업명',
        flex: 1,
        minWidth: 200,
        headerAlign: 'center',
        valueFormatter: (value) => value || '-',
      },
      {
        field: 'itemsSummary',
        headerName: '품목 요약',
        flex: 1.4,
        minWidth: 280,
        headerAlign: 'center',
        valueFormatter: (value) => value || '-',
      },
      {
        field: 'contractNo',
        headerName: '계약번호',
        width: 120,
        headerAlign: 'center',
        valueFormatter: (value) => value || '-',
      },
    ],
    [handleOpenItemDialog]
  )

  const itemColumns = useMemo(
    () => [
      {
        field: 'actions',
        headerName: '',
        width: 56,
        headerAlign: 'center',
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <Tooltip title="품목 삭제">
            <span>
              <IconButton
                size="small"
                color="error"
                disabled={dialogBusy}
                aria-label="품목 삭제"
                onClick={(event) => {
                  event.stopPropagation()
                  void handleDialogDeleteItem(params.row.id)
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            </span>
          </Tooltip>
        ),
      },
      {
        field: 'costService',
        headerName: '원가용역',
        width: 120,
        headerAlign: 'center',
        align: 'center',
        editable: true,
      },
      {
        field: 'itemName',
        headerName: '품명',
        width: 120,
        headerAlign: 'center',
        align: 'center',
        editable: true,
      },
      {
        field: 'designUnitPrice',
        headerName: '설계단가',
        width: 110,
        headerAlign: 'center',
        align: 'right',
        editable: true,
      },
      {
        field: 'pitch',
        headerName: 'Pitch',
        width: 80,
        headerAlign: 'center',
        align: 'center',
        editable: true,
      },
      {
        field: 'capW',
        headerName: 'W',
        width: 72,
        headerAlign: 'center',
        align: 'center',
        editable: true,
      },
      {
        field: 'capH',
        headerName: 'H',
        width: 72,
        headerAlign: 'center',
        align: 'center',
        editable: true,
      },
    ],
    [dialogBusy, handleDialogDeleteItem]
  )

  const showEmpty = !loading && !error && mainRows.length === 0

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

        {loading && mainRows.length === 0 ? (
          <Box className="unit-price-grid-loading" sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error && mainRows.length === 0 ? (
          <div className="unit-price-empty-cell unit-price-empty-cell--error">{error}</div>
        ) : showEmpty ? (
          <div className="unit-price-empty-cell">
            계약분류가 {CONTRACT_TYPE_FILTER}인 계약 데이터가 없습니다.
          </div>
        ) : (
          <Box className="unit-price-datagrid-wrap" sx={{ flex: 1, minHeight: 480, width: '100%' }}>
            <DataGrid
              rows={mainRows}
              columns={mainColumns}
              loading={refetching}
              showToolbar
              slots={{ toolbar: GridToolbar }}
              slotProps={{ toolbar: { showQuickFilter: true } }}
              {...sharedGridProps}
            />
          </Box>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="lg"
        scroll="paper"
        aria-labelledby="unit-price-items-dialog-title"
      >
        <DialogTitle
          id="unit-price-items-dialog-title"
          sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}
        >
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              품목 관리
            </Typography>
            <Typography variant="h6" component="span" fontWeight={700}>
              {formatContractDialogTitle(selectedContract)}
            </Typography>
          </Box>
          <IconButton aria-label="닫기" onClick={handleCloseDialog} size="small">
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              disabled={dialogBusy || !selectedContract?.contractId}
              startIcon={<Plus size={14} strokeWidth={2.5} />}
              onClick={() => void handleDialogAddItem()}
            >
              {dialogBusy ? '처리 중…' : '품목 추가'}
            </Button>
          </Box>

          <Box sx={{ height: 420, width: '100%' }}>
            <DataGrid
              apiRef={itemGridApiRef}
              rows={dialogItems}
              columns={itemColumns}
              editMode="cell"
              processRowUpdate={processItemRowUpdate}
              onProcessRowUpdateError={(err) => {
                console.error('[단가관리] 품목 그리드 저장 오류', err)
              }}
              onCellClick={handleItemCellClick}
              onCellDoubleClick={handleItemCellDoubleClick}
              loading={dialogBusy || refetching}
              {...sharedGridProps}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            셀을 더블클릭하면 수정할 수 있으며, 편집 후 다른 셀을 클릭하면 자동 저장됩니다.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseDialog} variant="outlined">
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
