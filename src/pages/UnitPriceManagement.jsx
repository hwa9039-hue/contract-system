import { useEffect, useState } from 'react'
import { contractsApi } from '../contractsApi.js'

const CONTRACT_TYPE_FILTER = '55121903'

const EDITABLE_COLUMNS = [
  { key: 'costService', label: '원가용역' },
  { key: 'itemName', label: '품명' },
  { key: 'designUnitPrice', label: '설계단가', headerClass: 'unit-price-th-design' },
  { key: 'pitch', label: 'Pitch' },
  { key: 'capW', label: 'W' },
  { key: 'lowerW', label: 'w' },
]

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

  const handleEditableChange = (rowId, fieldKey, value) => {
    setEditableByRowId((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || createEmptyEditableFields()),
        [fieldKey]: value,
      },
    }))
  }

  return (
    <div className="unit-price-management">
      <div className="contract-table-panel unit-price-table-panel">
        <div className="table-wrap overflow-x-auto">
          <table className="contract-table excel-table registry-table unit-price-table">
            <thead>
              <tr>
                <th className="unit-price-th">사업년도</th>
                <th className="unit-price-th">발주처</th>
                <th className="unit-price-th unit-price-th-project">사업명</th>
                {EDITABLE_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`unit-price-th${column.headerClass ? ` ${column.headerClass}` : ''}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3 + EDITABLE_COLUMNS.length} className="unit-price-empty-cell">
                    계약현황 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={3 + EDITABLE_COLUMNS.length} className="unit-price-empty-cell unit-price-empty-cell--error">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3 + EDITABLE_COLUMNS.length} className="unit-price-empty-cell">
                    계약분류가 {CONTRACT_TYPE_FILTER}인 계약 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="unit-price-readonly">{row.year || '-'}</td>
                    <td className="unit-price-readonly">{row.client || '-'}</td>
                    <td className="unit-price-readonly unit-price-readonly-project">{row.projectName || '-'}</td>
                    {EDITABLE_COLUMNS.map((column) => (
                      <td key={column.key} className="unit-price-editable-cell">
                        <input
                          type="text"
                          className="editable-text-cell-input editable-text-cell-input--left unit-price-cell-input"
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
