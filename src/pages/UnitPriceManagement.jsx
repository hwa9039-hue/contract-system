import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { contractsApi } from '../contractsApi.js'
import {
  buildContractColumnFilterOptions,
  contractMatchesColumnFilters,
  filterContractRowsByActiveFilters,
} from '../contractColumnFilter.js'

const CONTRACT_TYPE_FILTER = '55121903'

/** 백엔드 contracts_rows / ContractPatch 컬럼명과 100% 일치 */
const UNIT_PRICE_PATCH_KEYS = Object.freeze([
  'costService',
  'itemName',
  'designUnitPrice',
  'pitch',
  'capW',
  'capH',
])

const FILTERABLE_COLUMNS = [
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

const FILTERABLE_COLUMN_KEYS = FILTERABLE_COLUMNS.map((column) => column.key)

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

function extractEditableFields(item) {
  return {
    costService: safeString(item?.costService).trim(),
    itemName: safeString(item?.itemName).trim(),
    designUnitPrice: formatDesignUnitPrice(item?.designUnitPrice),
    pitch: safeString(item?.pitch).trim(),
    capW: safeString(item?.capW).trim(),
    capH: safeString(item?.capH).trim(),
  }
}

function applyPatchToEditableFields(saved, patch) {
  const next = { ...(saved || createEmptyEditableFields()) }
  if (Object.prototype.hasOwnProperty.call(patch, 'costService')) {
    next.costService = safeString(patch.costService).trim()
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'itemName')) {
    next.itemName = safeString(patch.itemName).trim()
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'designUnitPrice')) {
    next.designUnitPrice = formatDesignUnitPrice(patch.designUnitPrice)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pitch')) {
    next.pitch = safeString(patch.pitch).trim()
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'capW')) {
    next.capW = safeString(patch.capW).trim()
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'capH')) {
    next.capH = safeString(patch.capH).trim()
  }
  return next
}

function buildUnitPriceApiPatchDiff(current, saved) {
  const cur = current || createEmptyEditableFields()
  const sav = saved || createEmptyEditableFields()
  const patch = {}

  if (safeString(cur.costService).trim() !== safeString(sav.costService).trim()) {
    patch.costService = safeString(cur.costService).trim()
  }
  if (safeString(cur.itemName).trim() !== safeString(sav.itemName).trim()) {
    patch.itemName = safeString(cur.itemName).trim()
  }
  if (parseDesignUnitPrice(cur.designUnitPrice) !== parseDesignUnitPrice(sav.designUnitPrice)) {
    patch.designUnitPrice = parseDesignUnitPrice(cur.designUnitPrice)
  }
  if (safeString(cur.pitch).trim() !== safeString(sav.pitch).trim()) {
    patch.pitch = safeString(cur.pitch).trim()
  }
  if (safeString(cur.capW).trim() !== safeString(sav.capW).trim()) {
    patch.capW = safeString(cur.capW).trim()
  }
  if (safeString(cur.capH).trim() !== safeString(sav.capH).trim()) {
    patch.capH = safeString(cur.capH).trim()
  }

  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => UNIT_PRICE_PATCH_KEYS.includes(key))
  )
}

function isEditableFieldEqual(fieldKey, left, right) {
  const a = left || createEmptyEditableFields()
  const b = right || createEmptyEditableFields()
  if (fieldKey === 'designUnitPrice') {
    return parseDesignUnitPrice(a[fieldKey]) === parseDesignUnitPrice(b[fieldKey])
  }
  return safeString(a[fieldKey]).trim() === safeString(b[fieldKey]).trim()
}

function areEditableFieldsEqual(left, right) {
  return EDITABLE_COLUMNS.every((column) => isEditableFieldEqual(column.key, left, right))
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

  const columnFilterOptionsMap = useMemo(() => {
    const map = {}
    FILTERABLE_COLUMN_KEYS.forEach((columnKey) => {
      const pool = rows.filter((item) =>
        contractMatchesColumnFilters(item, activeFilters, columnKey)
      )
      map[columnKey] = buildContractColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [activeFilters, rows])

  const filteredRows = useMemo(
    () => filterContractRowsByActiveFilters(rows, activeFilters),
    [activeFilters, rows]
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

  const persistUnitPriceRow = useCallback(async (rowId) => {
    const normalizedRowId = safeString(rowId).trim()
    if (!normalizedRowId || normalizedRowId.startsWith('__ROW__')) return
    if (savingRowIdsRef.current.has(normalizedRowId)) return

    const current = editableByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    const saved = savedByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    if (areEditableFieldsEqual(current, saved)) return

    const payload = buildUnitPriceApiPatchDiff(current, saved)
    if (Object.keys(payload).length === 0) return

    savingRowIdsRef.current.add(normalizedRowId)
    const previousSaved = { ...saved }

    try {
      if (Object.keys(payload).length === 0) return
      await contractsApi.update(normalizedRowId, payload)
      const mergedFields = applyPatchToEditableFields(saved, payload)
      savedByRowIdRef.current = {
        ...savedByRowIdRef.current,
        [normalizedRowId]: { ...mergedFields },
      }
      setEditableByRowId((prev) => ({
        ...prev,
        [normalizedRowId]: mergedFields,
      }))
      setSaveError(null)
    } catch (saveErr) {
      console.error('[단가관리] 행 저장 실패', saveErr)
      setEditableByRowId((prev) => ({
        ...prev,
        [normalizedRowId]: previousSaved,
      }))
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

    if (currentValue === originalValue) return

    const current = editableByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    const saved = savedByRowIdRef.current[normalizedRowId] || createEmptyEditableFields()
    if (isEditableFieldEqual(fieldKey, current, saved)) return
    if (areEditableFieldsEqual(current, saved)) return

    void persistUnitPriceRow(normalizedRowId)
  }

  const totalColumnCount = FILTERABLE_COLUMNS.length + EDITABLE_COLUMNS.length

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
                {FILTERABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`unit-price-th text-center sticky top-0 z-10 bg-gray-100 contract-th-filterable relative ${column.headerClass}`}
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
                {EDITABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`unit-price-th text-center sticky top-0 z-10 bg-gray-100 relative ${column.headerClass || ''}`}
                  >
                    {column.label}
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
