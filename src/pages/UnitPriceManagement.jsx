import { useCallback, useEffect, useMemo, useState } from 'react'
import { ContractColumnHeaderFilter } from '../ContractColumnHeaderFilter.jsx'
import { contractsApi } from '../contractsApi.js'
import {
  buildContractColumnFilterOptions,
  contractMatchesColumnFilters,
  filterContractRowsByActiveFilters,
} from '../contractColumnFilter.js'

const CONTRACT_TYPE_FILTER = '55121903'

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
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'itemName',
    label: '품명',
    headerClass: 'unit-price-col-editable',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'designUnitPrice',
    label: '설계단가',
    headerClass: 'unit-price-col-design unit-price-th-design',
    inputClass: 'editable-text-cell-input--right text-right pr-4',
  },
  {
    key: 'pitch',
    label: 'Pitch',
    headerClass: 'unit-price-col-narrow',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'capW',
    label: 'W',
    headerClass: 'unit-price-col-narrow',
    inputClass: 'editable-text-cell-input--center text-center',
  },
  {
    key: 'capH',
    label: 'H',
    headerClass: 'unit-price-col-narrow',
    inputClass: 'editable-text-cell-input--center text-center',
  },
]

const FILTERABLE_COLUMN_KEYS = FILTERABLE_COLUMNS.map((column) => column.key)

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function createEmptyEditableFields() {
  return EDITABLE_COLUMNS.reduce((acc, column) => {
    acc[column.key] = ''
    return acc
  }, {})
}

export default function UnitPriceManagement() {
  const [rows, setRows] = useState([])
  const [editableByRowId, setEditableByRowId] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeFilters, setActiveFilters] = useState({})
  const [openColumnFilterKey, setOpenColumnFilterKey] = useState(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await contractsApi.list()
        const filtered = (Array.isArray(data) ? data : [])
          .filter((item) => safeString(item.contractType).trim() === CONTRACT_TYPE_FILTER)
          .map((item, index) => {
            const serverId = safeString(item.id ?? item._id ?? item.contract_id ?? item.ID).trim()
            return {
              id: serverId || `__ROW__${index}`,
              year: safeString(item.year).trim(),
              client: safeString(item.client).trim(),
              projectName: safeString(item.projectName).trim(),
            }
          })

        if (cancelled) return

        setRows(filtered)
        setEditableByRowId(
          filtered.reduce((acc, row) => {
            acc[row.id] = createEmptyEditableFields()
            return acc
          }, {})
        )
      } catch (fetchError) {
        if (cancelled) return
        console.error('[단가관리] 계약현황 API fetch failed', fetchError)
        setError(fetchError?.message || '계약현황 데이터를 불러오지 못했습니다.')
        setRows([])
        setEditableByRowId({})
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

  const handleEditableChange = (rowId, fieldKey, value) => {
    setEditableByRowId((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || createEmptyEditableFields()),
        [fieldKey]: value,
      },
    }))
  }

  const totalColumnCount = FILTERABLE_COLUMNS.length + EDITABLE_COLUMNS.length

  return (
    <div className="unit-price-management">
      <div className="contract-table-panel unit-price-table-panel">
        <div className="table-wrap overflow-x-auto">
          <table className="contract-table excel-table registry-table unit-price-table w-full table-fixed">
            <thead>
              <tr>
                {FILTERABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`unit-price-th text-center contract-th-filterable relative ${column.headerClass}`}
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
                    className={`unit-price-th text-center relative ${column.headerClass || ''}`}
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
                    {EDITABLE_COLUMNS.map((column) => (
                      <td key={column.key} className={`unit-price-editable-cell ${column.headerClass || ''}`}>
                        <input
                          type="text"
                          className={`editable-text-cell-input unit-price-cell-input ${column.inputClass || ''}`}
                          value={editableByRowId[row.id]?.[column.key] ?? ''}
                          onChange={(event) => handleEditableChange(row.id, column.key, event.target.value)}
                        />
                      </td>
                    ))}
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
