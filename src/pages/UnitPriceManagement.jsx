import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { contractsApi } from '../contractsApi.js'
import {
  buildContractColumnFilterOptions,
  contractMatchesColumnFilters,
  filterContractRowsByActiveFilters,
} from '../contractColumnFilter.js'

const CONTRACT_TYPE_FILTER = '55121903'

/**
 * UI 편집 필드 → PATCH API 키 (영문 DB 컬럼명, snake_case)
 * 한글 라벨(원가용역 등)은 절대 payload에 넣지 않음.
 */
const UNIT_PRICE_API_COLUMN_MAP = Object.freeze({
  costService: 'cost_service',
  itemName: 'item_name',
  designUnitPrice: 'unit_price',
  pitch: 'pitch',
  capW: 'width_w',
  capH: 'height_h',
})

/** PATCH payload 키 → UI 편집 필드 키 (저장 후 로컬 상태 반영) */
const API_KEY_TO_UI_FIELD = Object.freeze({
  cost_service: 'costService',
  item_name: 'itemName',
  unit_price: 'designUnitPrice',
  pitch: 'pitch',
  width_w: 'capW',
  height_h: 'capH',
  costService: 'costService',
  itemName: 'itemName',
  designUnitPrice: 'designUnitPrice',
  capW: 'capW',
  capH: 'capH',
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
    label: '원가용역',
    headerClass: 'unit-price-col-editable',
    cellClass: 'unit-price-col-editable',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'itemName',
    label: '품명',
    headerClass: 'unit-price-col-editable',
    cellClass: 'unit-price-col-editable',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'designUnitPrice',
    label: '설계단가',
    headerClass: 'unit-price-col-design',
    cellClass: 'unit-price-col-design',
    inputClass: 'editable-text-cell-input--right text-right pr-4',
  },
  {
    key: 'pitch',
    label: 'Pitch',
    headerClass: 'unit-price-col-narrow',
    cellClass: 'unit-price-col-narrow',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'capW',
    label: 'W',
    headerClass: 'unit-price-col-narrow',
    cellClass: 'unit-price-col-narrow',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'capH',
    label: 'H',
    headerClass: 'unit-price-col-narrow',
    cellClass: 'unit-price-col-narrow',
    inputClass: 'editable-text-cell-input--center text-center',
  },
]

/** 필터 드롭다운을 붙일 9개 열(사업년도 ~ H) */
const ALL_TABLE_COLUMNS = [...READONLY_COLUMNS, ...EDITABLE_COLUMNS]

const ALL_TABLE_COLUMN_KEYS = ALL_TABLE_COLUMNS.map((column) => column.key)

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
    acc[column.key] = ''
    return acc
  }, {})
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
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [activeFilters, setActiveFilters] = useState({})
  const [openColumnFilterKey, setOpenColumnFilterKey] = useState(null)

  const savedByRowIdRef = useRef({})
  const editableByRowIdRef = useRef({})
  const savingRowIdsRef = useRef(new Set())
  const focusValueByCellRef = useRef({})

  useEffect(() => {
    editableByRowIdRef.current = editableByRowId
  }, [editableByRowId])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      setSaveError(null)

      try {
        const data = await contractsApi.list()
        const filtered = (Array.isArray(data) ? data : [])
          .filter((item) => safeString(item.contractType).trim() === CONTRACT_TYPE_FILTER)
          .map((item, index) => {
            const serverId = safeString(item.id ?? item._id ?? item.contract_id ?? item.ID).trim()
            const id = serverId || `__ROW__${index}`
            return {
              id,
              year: safeString(item.year).trim(),
              client: safeString(item.client).trim(),
              projectName: safeString(item.projectName).trim(),
              editableFields: extractEditableFields(item),
            }
          })

        if (cancelled) return

        const nextEditable = filtered.reduce((acc, row) => {
          acc[row.id] = { ...row.editableFields }
          return acc
        }, {})

        savedByRowIdRef.current = Object.fromEntries(
          Object.entries(nextEditable).map(([rowId, fields]) => [rowId, { ...fields }])
        )

        setRows(filtered.map(({ id, year, client, projectName }) => ({ id, year, client, projectName })))
        setEditableByRowId(nextEditable)
      } catch (fetchError) {
        if (cancelled) return
        console.error('[단가관리] 계약현황 API fetch failed', fetchError)
        setError(fetchError?.message || '계약현황 데이터를 불러오지 못했습니다.')
        setRows([])
        setEditableByRowId({})
        savedByRowIdRef.current = {}
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

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

    savingRowIdsRef.current.add(normalizedRowId)

    try {
      if (Object.keys(payload).length === 0) return
      console.log('🚀 [단가관리] 서버로 전송하는 Payload:', payload)
      await contractsApi.update(normalizedRowId, payload)
      const mergedFields = applyPatchToEditableFields(saved, payload)
      savedByRowIdRef.current = {
        ...savedByRowIdRef.current,
        [normalizedRowId]: { ...mergedFields },
      }
      setEditableByRowId((prev) => ({
        ...prev,
        [normalizedRowId]: { ...mergedFields },
      }))
      setSaveError(null)
    } catch (saveErr) {
      console.error('[단가관리] 행 저장 실패', saveErr)
      setSaveError(saveErr?.message || '단가 데이터 저장에 실패했습니다.')
    } finally {
      savingRowIdsRef.current.delete(normalizedRowId)
    }
  }, [])

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
      {saveError ? (
        <div className="unit-price-save-error" role="alert">
          {saveError}
        </div>
      ) : null}
      <div className="contract-table-panel unit-price-table-panel flex flex-col h-full min-h-[500px]">
        <div className="table-wrap unit-price-table-scroll flex-1 min-h-0 overflow-y-auto overflow-x-auto">
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
              {loading ? (
                <tr>
                  <td colSpan={totalColumnCount} className="unit-price-empty-cell">
                    계약현황 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : error ? (
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
                    필터 조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="unit-price-readonly unit-price-col-year text-center">{row.year || '-'}</td>
                    <td className="unit-price-readonly unit-price-col-client unit-price-cell-truncate text-center">
                      {row.client || '-'}
                    </td>
                    <td className="unit-price-readonly unit-price-col-project unit-price-cell-truncate text-left pl-4">
                      {row.projectName || '-'}
                    </td>
                    {EDITABLE_COLUMNS.map((column) => {
                      const cellValue = editableByRowId[row.id]?.[column.key] ?? ''
                      return (
                        <td
                          key={column.key}
                          className={`unit-price-editable-cell ${column.cellClass || ''}`}
                        >
                          <input
                            type="text"
                            className={`editable-text-cell-input unit-price-cell-input ${column.inputClass || ''}`}
                            value={cellValue}
                            onFocus={(event) =>
                              handleEditableFocus(row.id, column.key, event.target.value)
                            }
                            onChange={(event) =>
                              handleEditableChange(row.id, column.key, event.target.value)
                            }
                            onBlur={(event) =>
                              handleEditableBlur(row.id, column.key, event.target.value)
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
