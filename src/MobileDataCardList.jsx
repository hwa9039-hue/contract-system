import { useCallback, useState } from 'react'
import { getImportanceStyle } from './registryImportance.jsx'

export function mobileCardText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function mobileCardAmount(value) {
  const raw = mobileCardText(value).replace(/[^\d]/g, '')
  if (!raw) return ''
  return `${Number(raw).toLocaleString('ko-KR')}원`
}

export function mobileCardBadgeTone(label) {
  const text = mobileCardText(label)
  if (!text) return 'slate'
  if (text === '준공지연') return 'purple'
  if (text === '준공임박') return 'red'
  if (text === '준공완료' || text === '진행중') return 'slate'
  const importance = getImportanceStyle(text)
  if (importance.tone && importance.tone !== 'empty' && importance.tone !== 'gray') {
    return importance.tone
  }
  if (importance.tone === 'gray') return 'gray'
  if (/활성|공유/.test(text) || text === 'O') return 'green'
  if (/비활성/.test(text) || text === 'X') return 'red'
  return 'blue'
}

function fieldEntries(fields, row) {
  return (fields || [])
    .map((field) => ({
      label: field.label,
      value: mobileCardText(typeof field.getValue === 'function' ? field.getValue(row) : row?.[field.key]),
    }))
    .filter((item) => item.label && item.value)
}

export function MobileDataCardList({
  rows = [],
  getRowKey,
  getTitle,
  getBadge,
  summaryFields = [],
  detailFields = [],
  emptyText = '표시할 데이터가 없습니다.',
  className = '',
  onCardClick,
}) {
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const toggleExpanded = useCallback((key) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div className={`mobile-data-card-list mobile-card-only block md:hidden ${className}`.trim()}>
      {rows.length === 0 ? (
        <p className="mobile-data-card-empty">{emptyText}</p>
      ) : (
        rows.map((row, index) => {
          const key = String(getRowKey ? getRowKey(row, index) : row?.id ?? index)
          const open = expandedIds.has(key)
          const title = mobileCardText(getTitle?.(row, index)) || '(제목 없음)'
          const badge = getBadge?.(row, index)
          const badgeLabel = mobileCardText(badge?.label)
          const summary = fieldEntries(summaryFields, row)
          const details = fieldEntries(detailFields, row)
          const tone = badge?.tone || mobileCardBadgeTone(badgeLabel)

          return (
            <article
              key={key}
              className={`mobile-data-card${open ? ' is-open' : ''}${onCardClick ? ' is-clickable' : ''}`}
              onClick={onCardClick ? () => onCardClick(row) : undefined}
            >
              <header className="mobile-data-card-header">
                <h3 className="mobile-data-card-title">{title}</h3>
                {badgeLabel ? (
                  <span className={`mobile-data-card-badge is-${tone}`}>{badgeLabel}</span>
                ) : null}
              </header>

              {summary.length > 0 ? (
                <dl className="mobile-data-card-summary">
                  {summary.map((item) => (
                    <div key={item.label} className="mobile-data-card-field">
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {details.length > 0 ? (
                <>
                  <div
                    id={`mobile-card-detail-${key}`}
                    className={`mobile-data-card-details${open ? ' is-open' : ''}`}
                  >
                    <dl>
                      {details.map((item) => (
                        <div key={item.label} className="mobile-data-card-kv">
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <button
                    type="button"
                    className="mobile-data-card-toggle"
                    aria-expanded={open}
                    aria-controls={`mobile-card-detail-${key}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleExpanded(key)
                    }}
                  >
                    {open ? '▲ 상세 정보 접기' : '▼ 상세 정보 펼치기'}
                  </button>
                </>
              ) : null}
            </article>
          )
        })
      )}
    </div>
  )
}
