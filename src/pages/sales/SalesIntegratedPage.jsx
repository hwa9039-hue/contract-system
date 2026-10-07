import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IMPORTANCE_LEGEND_ITEMS, ImportanceLegend } from '../../ImportanceLegend.jsx'
import { MobileDataCardList } from '../../MobileDataCardList.jsx'
import {
  SALES_INTEGRATED_STATUS_BY_TONE,
  salesIntegratedApi,
} from '../../salesIntegratedApi.js'

const DOT_TONES = new Set(['red', 'yellow', 'blue', 'green', 'gray', 'empty'])

const INTEGRATED_LEGEND_ITEMS = [
  ...IMPORTANCE_LEGEND_ITEMS,
  { tone: 'gray', label: '종료' },
]

function rowSearchText(row) {
  const amountDigits = String(row?.amount || '').replace(/[^\d]/g, '')
  return [row?.statusLabel, row?.sourceMenu, row?.date, row?.client, row?.title, row?.amount, amountDigits, row?.manager]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function statusDotClass(tone) {
  const safe = DOT_TONES.has(tone) ? tone : 'empty'
  return `registry-importance-dot registry-importance-dot--${safe} registry-importance-dot--size-md`
}

function StatusDot({ tone, label }) {
  return (
    <span className="registry-importance-dot-only" title={label || '상태 없음'} aria-label={label || '상태 없음'}>
      <span className={statusDotClass(tone)} aria-hidden="true" />
    </span>
  )
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
          <button type="button" className="secondary-btn" onClick={onClose}>
            닫기
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
            {detail.columns.map((column) => (
              <div key={column.label} className="sales-integrated-detail-row">
                <dt>{column.label}</dt>
                <dd>
                  {column.label === '중요도' ? (
                    <span className="sales-integrated-importance-value">
                      <StatusDot tone={detail.statusColor} label={column.value || detail.statusLabel} />
                      <span>{column.value || '없음'}</span>
                    </span>
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
  const [tone, setTone] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const loadRows = useCallback(async (nextTone) => {
    setLoading(true)
    setLoadError('')
    try {
      const status = nextTone ? SALES_INTEGRATED_STATUS_BY_TONE[nextTone] || '' : ''
      const nextRows = await salesIntegratedApi.list(status)
      setRows(nextRows)
    } catch (err) {
      setRows([])
      setLoadError(err?.message || '통합 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRows(tone)
  }, [tone, loadRows])

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

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase().replace(/\s+/g, '')
    if (!query) return rows
    return rows.filter((row) => rowSearchText(row).includes(query))
  }, [rows, searchQuery])

  const emptyText = loading
    ? '불러오는 중입니다.'
    : rows.length === 0
      ? tone
        ? '이 상태에 해당하는 데이터가 없습니다.'
        : '표시할 데이터가 없습니다.'
      : '검색 결과가 없습니다.'

  return (
    <section className="stat-card sales-contacts-page sales-integrated-page" aria-label="영업관리(통합)">
      <div className="sales-integrated-filters" aria-label="상태 필터">
        <ImportanceLegend
          className="sales-integrated-legend"
          items={INTEGRATED_LEGEND_ITEMS}
          allLabel="전체보기"
          selectedImportance={tone}
          onSelect={setTone}
        />
        <p className="sales-integrated-click-hint">상태 또는 해당 사업 클릭 시 상세정보 확인 가능</p>
        <input
          className="table-search-input sales-integrated-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="사업명, 발주처, 담당자, 출처 등 검색"
          aria-label="영업관리(통합) 검색"
        />
      </div>

      {loadError ? (
        <p className="sales-contacts-save-status is-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="sales-contacts-table-wrap desktop-table-only hidden md:block">
        <table className="excel-table registry-table sales-integrated-table">
          <colgroup>
            <col className="sales-integrated-col-dot" />
            <col className="sales-integrated-col-status" />
            <col className="sales-integrated-col-source" />
            <col className="sales-integrated-col-date" />
            <col className="sales-integrated-col-client" />
            <col className="sales-integrated-col-title" />
            <col className="sales-integrated-col-amount" />
            <col className="sales-integrated-col-manager" />
          </colgroup>
          <thead>
            <tr>
              <th className="sales-integrated-col-dot">중요도</th>
              <th className="sales-integrated-col-status">상태</th>
              <th className="sales-integrated-col-source">출처</th>
              <th className="sales-integrated-col-date">등록일</th>
              <th className="sales-integrated-col-client">발주처</th>
              <th className="sales-integrated-col-title">사업명</th>
              <th className="sales-integrated-col-amount">사업금액</th>
              <th className="sales-integrated-col-manager">담당자</th>
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
                  <td className="sales-integrated-col-dot">
                    <StatusDot tone={row.statusColor} label={row.statusLabel} />
                  </td>
                  <td className="sales-integrated-col-status">{row.statusLabel || '—'}</td>
                  <td className="sales-integrated-col-source">{row.sourceMenu}</td>
                  <td className="sales-integrated-col-date">{row.date || '—'}</td>
                  <td className="sales-integrated-col-client">{row.client || '—'}</td>
                  <td className="sales-integrated-col-title">{row.title || '—'}</td>
                  <td className="sales-integrated-col-amount">{row.amount || '—'}</td>
                  <td className="sales-integrated-col-manager">{row.manager || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <MobileDataCardList
        rows={visibleRows}
        getRowKey={(row) => `${row.sourceKey}:${row.id}`}
        getTitle={(row) => row.title}
        getBadge={(row) => ({ label: row.statusLabel || row.sourceMenu, tone: row.statusColor })}
        summaryFields={[
          { label: '출처', getValue: (row) => row.sourceMenu },
          { label: '등록일', getValue: (row) => row.date },
          { label: '발주처', getValue: (row) => row.client },
          { label: '사업금액', getValue: (row) => row.amount },
          { label: '담당자', getValue: (row) => row.manager },
        ]}
        emptyText={emptyText}
        onCardClick={openDetail}
      />

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
