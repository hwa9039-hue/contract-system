import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { contractsApi } from '../contractsApi.js'
import {
  TABLE_INLINE_EDITABLE_CELL_CLASS,
  TABLE_INLINE_INPUT_STANDARD_CLASS,
} from '../tableInlineInputClass.js'
import {
  buildContractColumnFilterOptions,
  contractMatchesColumnFilters,
  filterContractRowsByActiveFilters,
} from '../contractColumnFilter.js'

const CONTRACT_TYPE_FILTER = '55121903'

/** GET ContractOut JSON 키 — 백엔드 AS "costService" 등과 100% 동일 (camelCase) */
const CONTRACT_OUT_UNIT_PRICE_FIELDS = Object.freeze([
  'costService',
  'itemName',
  'designUnitPrice',
  'pitch',
  'capW',
  'capH',
])

/**
 * UI 편집 필드 → PATCH/GET API 키 (camelCase — ContractOut 와 동일)
 */
const UNIT_PRICE_API_COLUMN_MAP = Object.freeze(
  Object.fromEntries(CONTRACT_OUT_UNIT_PRICE_FIELDS.map((field) => [field, field]))
)

/** API 응답/payload 키 → UI 편집 필드 키 */
const API_KEY_TO_UI_FIELD = Object.freeze({
  costService: 'costService',
  itemName: 'itemName',
  designUnitPrice: 'designUnitPrice',
  pitch: 'pitch',
  capW: 'capW',
  capH: 'capH',
  cost_service: 'costService',
  item_name: 'itemName',
  unit_price: 'designUnitPrice',
  width_w: 'capW',
  height_h: 'capH',
})

const UNIT_PRICE_PATCH_KEYS = Object.freeze(Object.keys(UNIT_PRICE_API_COLUMN_MAP))

const READONLY_COLUMNS = [
  { key: 'year', label: '사업년도', headerClass: 'unit-price-col-year' },
  { key: 'client', label: '발주처', headerClass: 'unit-price-col-client' },
  { key: 'projectName', label: '사업명', headerClass: 'unit-price-col-project' },
]

const EDITABLE_COLUMNS = [
  {
    key: 'costService',
    field: 'costService',
    label: '원가용역',
    headerClass: 'unit-price-col-editable',
    cellClass: 'unit-price-col-editable',
    inputAlign: 'center',
  },
  {
    key: 'itemName',
    field: 'itemName',
    label: '품명',
    headerClass: 'unit-price-col-editable',
    cellClass: 'unit-price-col-editable',
    inputAlign: 'center',
  },
  {
    key: 'designUnitPrice',
    field: 'designUnitPrice',
    label: '설계단가',
    headerClass: 'unit-price-col-design',
    cellClass: 'unit-price-col-design',
    inputAlign: 'right',
  },
  {
    key: 'pitch',
    field: 'pitch',
    label: 'Pitch',
    headerClass: 'unit-price-col-narrow',
    cellClass: 'unit-price-col-narrow',
    inputAlign: 'center',
  },
  {
    key: 'capW',
    field: 'capW',
    label: 'W',
    headerClass: 'unit-price-col-narrow',
    cellClass: 'unit-price-col-narrow',
    inputAlign: 'center',
  },
  {
    key: 'capH',
    field: 'capH',
    label: 'H',
    headerClass: 'unit-price-col-narrow',
    cellClass: 'unit-price-col-narrow',
    inputAlign: 'center',
  },
]

/** 필터 드롭다운을 붙일 9개 열(사업년도 ~ H) */
const ALL_TABLE_COLUMNS = [...READONLY_COLUMNS, ...EDITABLE_COLUMNS]

const ALL_TABLE_COLUMN_KEYS = ALL_TABLE_COLUMNS.map((column) => column.key)

/** 저장 성공 후 DB 동기화 대기 → 목록 재조회 */
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

function createEmptyEditableFields() {
  return EDITABLE_COLUMNS.reduce((acc, column) => {
    const field = column.field || column.key
    acc[field] = ''
    return acc
  }, {})
}

function getColumnField(column) {
  return column.field || column.key
}

function normalizeUnitPriceRowFromApi(item) {
  const fields = extractEditableFields(item)
  const normalized = {
    costService: fields.costService,
    itemName: fields.itemName,
    designUnitPrice: fields.designUnitPrice,
    pitch: fields.pitch,
    capW: fields.capW,
    capH: fields.capH,
  }
  for (const field of CONTRACT_OUT_UNIT_PRICE_FIELDS) {
    if (item && item[field] !== undefined && item[field] !== null) {
      if (field === 'designUnitPrice') {
        normalized.designUnitPrice = formatDesignUnitPrice(item[field])
      } else {
        normalized[field] = safeString(item[field]).trim()
      }
    }
  }
  return normalized
}

function readContractField(item, ...keys) {
  if (!item || typeof item !== 'object') return ''
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) {
      return item[key]
    }
  }
  return ''
}

function extractEditableFields(item) {
  // ContractOut GET 키(camelCase) 우선 — EDITABLE_COLUMNS[].key 와 1:1 대응
  return {
    costService: safeString(
      readContractField(item, 'costService', 'cost_service', 'costservice')
    ).trim(),
    itemName: safeString(readContractField(item, 'itemName', 'item_name', 'itemname')).trim(),
    designUnitPrice: formatDesignUnitPrice(
      readContractField(
        item,
        'designUnitPrice',
        'unit_price',
        'design_unit_price',
        'designunitprice'
      )
    ),
    pitch: safeString(readContractField(item, 'pitch')).trim(),
    capW: safeString(
      readContractField(item, 'capW', 'width_w', 'cap_w', 'capw', 'width')
    ).trim(),
    capH: safeString(
      readContractField(item, 'capH', 'height_h', 'cap_h', 'caph', 'height')
    ).trim(),
  }
}

function applyPatchToEditableFields(saved, patch) {
  const next = { ...(saved || createEmptyEditableFields()) }
  for (const [patchKey, patchValue] of Object.entries(patch || {})) {
    const uiKey = API_KEY_TO_UI_FIELD[patchKey]
    if (!uiKey) continue
    if (uiKey === 'designUnitPrice') {
      next.designUnitPrice = formatDesignUnitPrice(patchValue)
    } else {
      next[uiKey] = safeString(patchValue).trim()
    }
  }
  return next
}

function editableFieldToApiValue(fieldKey, fields) {
  const cur = fields || createEmptyEditableFields()
  switch (fieldKey) {
    case 'designUnitPrice':
      return parseDesignUnitPrice(cur.designUnitPrice)
    case 'costService':
    case 'itemName':
    case 'pitch':
    case 'capW':
    case 'capH':
      return safeString(cur[fieldKey]).trim()
    default:
      return undefined
  }
}

/** 편집 필드 → ContractPatch payload (DB 컬럼명 = API 키) */
function mapEditableFieldsToContractApiPatch(fields, fieldKeys = UNIT_PRICE_PATCH_KEYS) {
  const cur = fields || createEmptyEditableFields()
  const patch = {}
  for (const fieldKey of fieldKeys) {
    const apiKey = UNIT_PRICE_API_COLUMN_MAP[fieldKey]
    if (!apiKey) continue
    const value = editableFieldToApiValue(fieldKey, cur)
    if (value === undefined) continue
    patch[apiKey] = value
  }
  return patch
}

function buildUnitPriceApiPatchDiff(current, saved) {
  const cur = current || createEmptyEditableFields()
  const sav = saved || createEmptyEditableFields()
  const changedKeys = UNIT_PRICE_PATCH_KEYS.filter(
    (fieldKey) => !isEditableFieldEqual(fieldKey, cur, sav)
  )
  return mapEditableFieldsToContractApiPatch(cur, changedKeys)
}

function buildUnitPriceFieldApiPatch(fieldKey, current, saved) {
  if (!UNIT_PRICE_PATCH_KEYS.includes(fieldKey)) return {}
  if (isEditableFieldEqual(fieldKey, current, saved)) return {}
  return mapEditableFieldsToContractApiPatch(current, [fieldKey])
}

function isEditableFieldEqual(fieldKey, left, right) {
  const a = left || createEmptyEditableFields()
  const b = right || createEmptyEditableFields()
  if (fieldKey === 'designUnitPrice') {
    return parseDesignUnitPrice(a[fieldKey]) === parseDesignUnitPrice(b[fieldKey])
  }
  return safeString(a[fieldKey]).trim() === safeString(b[fieldKey]).trim()
}

function getFocusCacheKey(rowId, fieldKey) {
  return `${safeString(rowId).trim()}:${fieldKey}`
}

export default function UnitPriceManagement() {
  const [rows, setRows] = useState([])
  const [editableByRowId, setEditableByRowId] = useState({})
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)
  const [activeFilters, setActiveFilters] = useState({})
  const [openColumnFilterKey, setOpenColumnFilterKey] = useState(null)

  const savedByRowIdRef = useRef({})
  const editableByRowIdRef = useRef({})
  const savingRowIdsRef = useRef(new Set())
  const focusValueByCellRef = useRef({})
  const saveSuccessTimerRef = useRef(null)
  const refetchAfterSaveTimerRef = useRef(null)

  useEffect(() => {
    editableByRowIdRef.current = editableByRowId
  }, [editableByRowId])

  const fetchUnitPriceRows = useCallback(async ({ silent = false, isRefetch = false } = {}) => {
    if (isRefetch) {
      setRefetching(true)
    } else if (!silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await contractsApi.list()
      const filtered = (Array.isArray(data) ? data : [])
        .filter((item) => safeString(item.contractType).trim() === CONTRACT_TYPE_FILTER)
        .map((item, index) => {
          const serverId = safeString(item.id ?? item._id ?? item.contract_id ?? item.ID).trim()
          const id = serverId || `__ROW__${index}`
          const unitPriceFields = normalizeUnitPriceRowFromApi(item)
          return {
            id,
            year: safeString(item.year).trim(),
            client: safeString(item.client).trim(),
            projectName: safeString(item.projectName).trim(),
            ...unitPriceFields,
            editableFields: unitPriceFields,
          }
        })

      const nextEditable = filtered.reduce((acc, row) => {
        acc[row.id] = { ...row.editableFields }
        return acc
      }, {})

      savedByRowIdRef.current = Object.fromEntries(
        Object.entries(nextEditable).map(([rowId, fields]) => [rowId, { ...fields }])
      )

      setRows(
        filtered.map(({ editableFields, ...rest }) => ({
          ...rest,
          editableFields,
        }))
      )
      setEditableByRowId(nextEditable)
    } catch (fetchError) {
      console.error('[단가관리] 계약현황 API fetch failed', fetchError)
      if (!isRefetch) {
        setError(fetchError?.message || '계약현황 데이터를 불러오지 못했습니다.')
        setRows([])
        setEditableByRowId({})
        savedByRowIdRef.current = {}
      }
    } finally {
      if (isRefetch) {
        setRefetching(false)
      } else if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  const applyOptimisticRowUpdate = useCallback((rowId, payload) => {
    const normalizedRowId = safeString(rowId).trim()
    if (!normalizedRowId) return

    const current =
      editableByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    const merged = applyPatchToEditableFields(current, payload)

    editableByRowIdRef.current = {
      ...editableByRowIdRef.current,
      [normalizedRowId]: { ...merged },
    }
    setEditableByRowId((prev) => ({
      ...prev,
      [normalizedRowId]: { ...merged },
    }))
    setRows((prev) =>
      prev.map((row) =>
        row.id === normalizedRowId
          ? { ...row, ...merged, editableFields: { ...merged } }
          : row
      )
    )
    return merged
  }, [])

  const rollbackOptimisticRowUpdate = useCallback((rowId, previousFields) => {
    const normalizedRowId = safeString(rowId).trim()
    if (!normalizedRowId) return

    const fields = { ...(previousFields || createEmptyEditableFields()) }
    editableByRowIdRef.current = {
      ...editableByRowIdRef.current,
      [normalizedRowId]: { ...fields },
    }
    setEditableByRowId((prev) => ({
      ...prev,
      [normalizedRowId]: { ...fields },
    }))
    setRows((prev) =>
      prev.map((row) =>
        row.id === normalizedRowId
          ? { ...row, ...fields, editableFields: { ...fields } }
          : row
      )
    )
  }, [])

  const scheduleRefetchAfterSave = useCallback(() => {
    if (refetchAfterSaveTimerRef.current) {
      clearTimeout(refetchAfterSaveTimerRef.current)
    }
    refetchAfterSaveTimerRef.current = setTimeout(() => {
      refetchAfterSaveTimerRef.current = null
      void fetchUnitPriceRows({ silent: true, isRefetch: true })
    }, REFETCH_AFTER_SAVE_DELAY_MS)
  }, [fetchUnitPriceRows])

  const applyServerRowToState = useCallback((contractRow) => {
    const rowId = safeString(contractRow?.id ?? contractRow?._id).trim()
    if (!rowId) return

    const fields = normalizeUnitPriceRowFromApi(contractRow)
    savedByRowIdRef.current = {
      ...savedByRowIdRef.current,
      [rowId]: { ...fields },
    }
    setEditableByRowId((prev) => ({
      ...prev,
      [rowId]: { ...fields },
    }))
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...fields, editableFields: fields } : row))
    )
  }, [])

  useEffect(() => {
    void fetchUnitPriceRows()
    return () => {
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current)
        saveSuccessTimerRef.current = null
      }
      if (refetchAfterSaveTimerRef.current) {
        clearTimeout(refetchAfterSaveTimerRef.current)
        refetchAfterSaveTimerRef.current = null
      }
    }
  }, [fetchUnitPriceRows])

  const filterSourceRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        ...(editableByRowId[row.id] || createEmptyEditableFields()),
      })),
    [rows, editableByRowId]
  )

  const columnFilterOptionsMap = useMemo(() => {
    const map = {}
    ALL_TABLE_COLUMN_KEYS.forEach((columnKey) => {
      const pool = filterSourceRows.filter((item) =>
        contractMatchesColumnFilters(item, activeFilters, columnKey)
      )
      map[columnKey] = buildContractColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [activeFilters, filterSourceRows])

  const filteredRows = useMemo(
    () => filterContractRowsByActiveFilters(filterSourceRows, activeFilters),
    [activeFilters, filterSourceRows]
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

  const persistUnitPriceRow = useCallback(async (rowId, explicitPayload = null) => {
    const normalizedRowId = safeString(rowId).trim()
    if (!normalizedRowId || normalizedRowId.startsWith('__ROW__')) return
    if (savingRowIdsRef.current.has(normalizedRowId)) return

    const current = editableByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    const saved = savedByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()

    const payload =
      explicitPayload && typeof explicitPayload === 'object'
        ? explicitPayload
        : buildUnitPriceApiPatchDiff(current, saved)

    if (Object.keys(payload).length === 0) return

    const snapshotFields = {
      ...(editableByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()),
    }

    applyOptimisticRowUpdate(normalizedRowId, payload)
    savingRowIdsRef.current.add(normalizedRowId)

    try {
      const updated = await contractsApi.update(normalizedRowId, payload)
      const mergedFields = applyPatchToEditableFields(snapshotFields, payload)
      if (updated && typeof updated === 'object') {
        applyServerRowToState(updated)
      } else {
        savedByRowIdRef.current = {
          ...savedByRowIdRef.current,
          [normalizedRowId]: { ...mergedFields },
        }
        setEditableByRowId((prev) => ({
          ...prev,
          [normalizedRowId]: { ...mergedFields },
        }))
        setRows((prev) =>
          prev.map((row) =>
            row.id === normalizedRowId
              ? { ...row, ...mergedFields, editableFields: { ...mergedFields } }
              : row
          )
        )
      }
      setSaveError(null)
      setSaveSuccess('저장되었습니다.')
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current)
      }
      saveSuccessTimerRef.current = setTimeout(() => {
        setSaveSuccess(null)
        saveSuccessTimerRef.current = null
      }, 1600)
      scheduleRefetchAfterSave()
    } catch (saveErr) {
      console.error('[단가관리] 행 저장 실패', saveErr)
      rollbackOptimisticRowUpdate(normalizedRowId, snapshotFields)
      setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
      setSaveSuccess(null)
    } finally {
      savingRowIdsRef.current.delete(normalizedRowId)
    }
  }, [
    applyOptimisticRowUpdate,
    applyServerRowToState,
    rollbackOptimisticRowUpdate,
    scheduleRefetchAfterSave,
  ])

  const handleEditableChange = (rowId, fieldKey, value) => {
    const nextValue =
      fieldKey === 'designUnitPrice' ? formatDesignUnitPrice(value) : value
    setEditableByRowId((prev) => {
      const nextRow = {
        ...(prev[rowId] || createEmptyEditableFields()),
        [fieldKey]: nextValue,
      }
      const next = { ...prev, [rowId]: nextRow }
      editableByRowIdRef.current = next
      return next
    })
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, [fieldKey]: nextValue, editableFields: { ...row.editableFields, [fieldKey]: nextValue } }
          : row
      )
    )
  }

  const handleEditableFocus = (rowId, fieldKey, originalValue) => {
    focusValueByCellRef.current[getFocusCacheKey(rowId, fieldKey)] = originalValue
  }

  const handleEditableBlur = (rowId, fieldKey, currentValue) => {
    const normalizedRowId = safeString(rowId).trim()
    if (!normalizedRowId || normalizedRowId.startsWith('__ROW__')) return

    const cacheKey = getFocusCacheKey(normalizedRowId, fieldKey)
    const originalValue = focusValueByCellRef.current[cacheKey] ?? currentValue
    delete focusValueByCellRef.current[cacheKey]

    if (currentValue === originalValue) return

    const current = editableByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    const saved = savedByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()

    const payload = buildUnitPriceFieldApiPatch(fieldKey, current, saved)
    if (Object.keys(payload).length === 0) return

    void persistUnitPriceRow(normalizedRowId, payload)
  }

  const totalColumnCount = ALL_TABLE_COLUMNS.length

  return (
    <div className="unit-price-management h-full min-h-0">
      {saveSuccess ? (
        <div
          className="unit-price-save-success"
          role="status"
          style={{
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: '#ecfdf5',
            border: '1px solid #bbf7d0',
            color: '#065f46',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
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
          <div
            className="unit-price-refetch-banner"
            role="status"
            aria-live="polite"
            style={{
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            데이터를 불러오는 중...
          </div>
        ) : null}
        <div
          className={`table-wrap unit-price-table-scroll flex-1 min-h-0 overflow-y-auto overflow-x-auto${refetching ? ' unit-price-table-wrap--refetching' : ''}`}
        >
          <table className="contract-table excel-table registry-table unit-price-table w-full table-fixed">
            <thead>
              <tr>
                {ALL_TABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`unit-price-th text-center sticky top-0 z-10 bg-gray-100 contract-th-filterable relative ${column.headerClass || ''}`}
                  >
                    <div className="contract-th-filter-wrap">
                      <span className="contract-th-label">{column.label}</span>
                      <ContractColumnHeaderFilter
                        columnKey={column.key}
                        options={columnFilterOptionsMap[column.key] ?? []}
                        selected={activeFilters[column.key] ?? []}
                        onApply={handleActiveFiltersApply}
                        isOpen={openColumnFilterKey === column.key}
                        onOpenChange={setOpenColumnFilterKey}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={totalColumnCount} className="unit-price-empty-cell">
                    데이터를 불러오는 중...
                  </td>
                </tr>
              ) : error && rows.length === 0 ? (
                <tr>
                  <td colSpan={totalColumnCount} className="unit-price-empty-cell unit-price-empty-cell--error">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={totalColumnCount} className="unit-price-empty-cell">
                    계약분류가 {CONTRACT_TYPE_FILTER}인 계약 데이터가 없습니다.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={totalColumnCount} className="unit-price-empty-cell">
                    {refetching ? '데이터를 불러오는 중...' : '필터 조건에 맞는 데이터가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className={refetching ? 'unit-price-row--refetching' : undefined}>
                    <td className="unit-price-readonly unit-price-col-year text-center">{row.year || '-'}</td>
                    <td className="unit-price-readonly unit-price-col-client unit-price-cell-truncate text-center">
                      {row.client || '-'}
                    </td>
                    <td className="unit-price-readonly unit-price-col-project unit-price-cell-truncate text-left pl-4">
                      {row.projectName || '-'}
                    </td>
                    {EDITABLE_COLUMNS.map((column) => {
                      const field = getColumnField(column)
                      const cellValue =
                        editableByRowId[row.id]?.[field] ?? row[field] ?? ''
                      return (
                        <td
                          key={field}
                          className={`unit-price-editable-cell ${TABLE_INLINE_EDITABLE_CELL_CLASS} ${column.cellClass || ''}`}
                        >
                          <input
                            type="text"
                            className={TABLE_INLINE_INPUT_STANDARD_CLASS}
                            style={{ textAlign: column.inputAlign || 'left' }}
                            value={cellValue}
                            onFocus={(event) =>
                              handleEditableFocus(row.id, field, event.target.value)
                            }
                            onChange={(event) =>
                              handleEditableChange(row.id, field, event.target.value)
                            }
                            onBlur={(event) =>
                              handleEditableBlur(row.id, field, event.target.value)
                            }
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
