import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ContractColumnHeaderFilter } from '../../ContractColumnHeaderFilter.jsx'
import { ImportanceLegend } from '../../ImportanceLegend.jsx'
import { MobileDataCardList } from '../../MobileDataCardList.jsx'
import { useDesktopTableLayout } from '../../useDesktopTableLayout.js'
import { salesIntegratedApi } from '../../salesIntegratedApi.js'
import {
  SALES_INTEGRATED_FILTERABLE_COLUMN_KEYS,
  buildSalesIntegratedColumnFilterOptions,
  filterSalesIntegratedRowsByActiveFilters,
  hasActiveSalesIntegratedColumnFilters,
  normalizeSalesIntegratedColumnFilterSelection,
  salesIntegratedMatchesColumnFilters,
} from '../../salesIntegratedColumnFilter.js'
import {
  SALES_STATUS_ALL_BADGE_CLASS,
  SALES_STATUS_LEGEND_ITEMS,
  SalesStatusBadge,
  salesStatusMobileBadge,
  salesStatusMatchesLegend,
} from '../../salesStatusBadge.jsx'

const INTEGRATED_TABLE_COLUMNS = Object.freeze([
  { key: 'statusLabel', label: '중요도(상태)', className: 'sales-integrated-col-status' },
  { key: 'sourceMenu', label: '출처', className: 'sales-integrated-col-source' },
  { key: 'date', label: '등록일', className: 'sales-integrated-col-date' },
  { key: 'client', label: '발주처', className: 'sales-integrated-col-client' },
  { key: 'title', label: '사업명', className: 'sales-integrated-col-title' },
  { key: 'amount', label: '사업금액', className: 'sales-integrated-col-amount' },
  { key: 'manager', label: '담당자', className: 'sales-integrated-col-manager' },
  { key: 'note', label: '비고', className: 'sales-integrated-col-note' },
])

const INTEGRATED_LEGEND_ITEMS = SALES_STATUS_LEGEND_ITEMS

function rowSearchText(row) {
  const amountDigits = String(row?.amount || '').replace(/[^\d]/g, '')
  return [row?.stage, row?.statusLabel, row?.sourceMenu, row?.date, row?.client, row?.title, row?.amount, amountDigits, row?.manager, row?.note]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function IntegratedDetailModal({ detail, loading, error, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (typeof document === 'undefined' || !document.body) return null

  const title = detail?.columns?.find((column) => column.label === '사업명')?.value || '상세'

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="sales-integrated-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-integrated-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sales-integrated-modal-header">
          <div>
            <p className="sales-integrated-modal-source">{detail?.sourceMenu || '원본 메뉴'}</p>
            <h2 id="sales-integrated-detail-title">{title}</h2>
            <p className="sales-integrated-modal-meta">
              <span>발주처 {detail?.columns?.find((column) => column.label === '발주처')?.value || '—'}</span>
              <span>사업금액 {detail?.columns?.find((column) => column.label === '사업금액')?.value || '—'}</span>
            </p>
          </div>
          <button type="button" className="sales-integrated-modal-close" onClick={onClose} aria-label="닫기">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </header>

        {loading ? <p className="sales-integrated-modal-status">불러오는 중입니다.</p> : null}
        {error ? (
          <p className="sales-contacts-save-status is-error" role="alert">
            {error}
          </p>
        ) : null}

        {detail && !loading ? (
          <dl className="sales-integrated-detail-list">
            {detail.columns.filter((column) => column.label !== '상태').map((column) => (
              <div key={column.label} className="sales-integrated-detail-row">
                <dt>{column.label === '중요도' ? '중요도(상태)' : column.label}</dt>
                <dd>
                  {column.label === '중요도' ? (
                    <SalesStatusBadge status={detail.stage || column.value} />
                  ) : (
                    column.value || '—'
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export default function SalesIntegratedPage() {
  const isDesktopTable = useDesktopTableLayout()
  const [tone, setTone] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [openColumnFilterKey, setOpenColumnFilterKey] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const loadRows = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const nextRows = await salesIntegratedApi.list()
      setRows(nextRows)
    } catch (err) {
      setRows([])
      setLoadError(err?.message || '통합 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const openDetail = useCallback(async (row) => {
    if (!row?.id || !row?.sourceKey) return
    setSelected(row)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    try {
      const nextDetail = await salesIntegratedApi.detail(row.sourceKey, row.id)
      setDetail(nextDetail)
    } catch (err) {
      setDetailError(err?.message || '상세 정보를 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setSelected(null)
    setDetail(null)
    setDetailError('')
    setDetailLoading(false)
  }, [])

  const searchFilteredRows = useMemo(() => {
    const matched = rows.filter((row) => salesStatusMatchesLegend(row.stage || row.statusLabel, tone))
    const query = searchQuery.trim().toLowerCase().replace(/\s+/g, '')
    if (!query) return matched
    return matched.filter((row) => rowSearchText(row).includes(query))
  }, [rows, searchQuery, tone])

  const columnFilterOptionsMap = useMemo(() => {
    const map = {}
    SALES_INTEGRATED_FILTERABLE_COLUMN_KEYS.forEach((columnKey) => {
      const pool = searchFilteredRows.filter((row) =>
        salesIntegratedMatchesColumnFilters(row, columnFilters, columnKey),
      )
      map[columnKey] = buildSalesIntegratedColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [columnFilters, searchFilteredRows])

  const handleColumnFiltersApply = useCallback((columnKey, selectedValues) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selectedValues) ? [...selectedValues] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  const visibleRows = useMemo(
    () => filterSalesIntegratedRowsByActiveFilters(searchFilteredRows, columnFilters),
    [searchFilteredRows, columnFilters],
  )

  const hasActiveFilters =
    Boolean(tone) ||
    Boolean(searchQuery.trim()) ||
    hasActiveSalesIntegratedColumnFilters(columnFilters)

  const emptyText = loading
    ? '불러오는 중입니다.'
    : rows.length === 0
      ? '표시할 데이터가 없습니다.'
      : hasActiveFilters
        ? '필터 조건에 맞는 데이터가 없습니다.'
        : '표시할 데이터가 없습니다.'

  return (
    <section className="stat-card sales-contacts-page sales-integrated-page registry-control-stack" aria-label="영업관리(통합)">
      <div className="sales-integrated-filters registry-control-filters flex flex-wrap items-center" aria-label="상태 필터">
        <ImportanceLegend
          className="sales-integrated-legend registry-header-legend"
          items={INTEGRATED_LEGEND_ITEMS}
          allLabel="전체보기"
          allIcon="🌐"
          allClassName={SALES_STATUS_ALL_BADGE_CLASS}
          selectedImportance={tone}
          onSelect={setTone}
        />
        <input
          className="table-search-input sales-integrated-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="검색어를 입력하세요."
          aria-label="영업관리(통합) 검색"
        />
      </div>

      {loadError ? (
        <p className="sales-contacts-save-status is-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {isDesktopTable ? (
      <div className="sales-contacts-table-wrap">
        <table className="excel-table registry-table sales-integrated-table">
          <colgroup>
            <col className="sales-integrated-col-status" />
            <col className="sales-integrated-col-source" />
            <col className="sales-integrated-col-date" />
            <col className="sales-integrated-col-client" />
            <col className="sales-integrated-col-title" />
            <col className="sales-integrated-col-amount" />
            <col className="sales-integrated-col-manager" />
            <col className="sales-integrated-col-note" />
          </colgroup>
          <thead>
            <tr>
              {INTEGRATED_TABLE_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`${column.className} contract-th-filterable`.trim()}
                >
                  <div className="contract-th-filter-wrap">
                    <span className="contract-th-label">{column.label}</span>
                    <ContractColumnHeaderFilter
                      columnKey={column.key}
                      options={columnFilterOptionsMap[column.key] ?? []}
                      selected={columnFilters[column.key] ?? []}
                      onApply={handleColumnFiltersApply}
                      isOpen={openColumnFilterKey === column.key}
                      onOpenChange={setOpenColumnFilterKey}
                      normalizeSelection={normalizeSalesIntegratedColumnFilterSelection}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="sales-integrated-empty">
                  {emptyText}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={`${row.sourceKey}:${row.id}`}
                  className="sales-integrated-row"
                  tabIndex={0}
                  onClick={() => openDetail(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDetail(row)
                    }
                  }}
                >
                  <td className="sales-integrated-col-status">
                    <SalesStatusBadge status={row.stage || row.statusLabel} />
                  </td>
                  <td className="sales-integrated-col-source">{row.sourceMenu}</td>
                  <td className="sales-integrated-col-date">{row.date || '—'}</td>
                  <td className="sales-integrated-col-client">{row.client || '—'}</td>
                  <td className="sales-integrated-col-title">{row.title || '—'}</td>
                  <td className="sales-integrated-col-amount">{row.amount || '—'}</td>
                  <td className="sales-integrated-col-manager">{row.manager || '—'}</td>
                  <td className="sales-integrated-col-note">{row.note || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      ) : (
      <MobileDataCardList
        rows={visibleRows}
        getRowKey={(row) => `${row.sourceKey}:${row.id}`}
        getTitle={(row) => row.title}
        getBadge={(row) => salesStatusMobileBadge(row.stage || row.statusLabel)}
        getClient={(row) => row.client}
        getAmount={(row) => row.amount}
        getDateText={(row) => row.date}
        summaryFields={[]}
        detailFields={[
          { label: '출처', getValue: (row) => row.sourceMenu },
          { label: '담당자', getValue: (row) => row.manager },
          { label: '비고', getValue: (row) => row.note },
        ]}
        emptyText={emptyText}
        onCardClick={openDetail}
      />
      )}

      {selected ? (
        <IntegratedDetailModal
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      ) : null}
    </section>
  )
}
