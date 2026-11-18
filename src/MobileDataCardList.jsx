import { useState } from 'react'
import { ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { getImportanceStyle } from './registryImportance.jsx'
import { scheduleStatusMobileTone } from './scheduleStatusTheme.js'

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
  const scheduleTone = scheduleStatusMobileTone(text)
  if (scheduleTone) return scheduleTone
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

function callText(fn, row, index) {
  return mobileCardText(typeof fn === 'function' ? fn(row, index) : '')
}

/** 카드 한 장 — 펼침 상태를 카드가 직접 들고 있어, 펼치기/접기 때 이 카드만 다시 그린다. */
function MobileDataCard({ row, index, cardKey, config }) {
  const [open, setOpen] = useState(false)
  const {
    getTitle,
    getBadge,
    summaryFields,
    detailFields,
    onCardClick,
    renderHeaderExtra,
    getDday,
    getClient,
    getAmount,
    getDateText,
    getTag,
    getFootTag,
  } = config

  const title = mobileCardText(getTitle?.(row, index)) || '(제목 없음)'
  const badge = getBadge?.(row, index)
  const badgeLabel = mobileCardText(badge?.label)
  const tone = badge?.tone || mobileCardBadgeTone(badgeLabel)
  const summary = fieldEntries(summaryFields, row)
  const dday = callText(getDday, row, index)
  const client = callText(getClient, row, index)
  const amount = callText(getAmount, row, index)
  const dateText = callText(getDateText, row, index)
  const tag = callText(getTag, row, index)
  const footTag = callText(getFootTag, row, index)
  const structured = Boolean(client || amount || dateText || dday || footTag)
  // 펼친 영역에는 카드 요약에 이미 보이는 값을 다시 싣지 않는다.
  const visibleValues = new Set(
    [title, badgeLabel, dday, client, amount, dateText, tag, footTag]
      .concat(structured ? [] : summary.map((item) => item.value))
      .filter(Boolean)
  )
  const details = fieldEntries(detailFields, row).filter((item) => !visibleValues.has(item.value))
  const detailId = `mobile-card-detail-${cardKey}`

  return (
    <article
      className={`mobile-data-card flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm${
        open ? ' is-open' : ''
      }${onCardClick ? ' is-clickable' : ''}`}
      onClick={onCardClick ? () => onCardClick(row) : undefined}
    >
      {badgeLabel || tag || dday ? (
        <div className="mobile-data-card-topline flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {badgeLabel ? <span className={`mobile-data-card-badge is-${tone}`}>{badgeLabel}</span> : null}
            {tag ? <span className="mobile-data-card-tag">{tag}</span> : null}
          </span>
          {dday ? <span className="mobile-data-card-dday">{dday}</span> : null}
        </div>
      ) : null}

      <div className="mobile-data-card-main flex flex-col gap-1">
        <h3 className="mobile-data-card-title">{title}</h3>
        {client ? <p className="mobile-data-card-client">{client}</p> : null}
      </div>

      {amount || dateText || footTag ? (
        <div className="mobile-data-card-foot flex items-end justify-between gap-2">
          {amount ? <strong className="mobile-data-card-amount">{amount}</strong> : <span />}
          {dateText || footTag ? (
            <span className="flex shrink-0 items-center gap-1.5">
              {dateText ? <span className="mobile-data-card-date">{dateText}</span> : null}
              {footTag ? <span className="mobile-data-card-foot-tag">{footTag}</span> : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {typeof renderHeaderExtra === 'function' ? renderHeaderExtra(row, index) : null}

      {!structured && summary.length > 0 ? (
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
          {open ? (
            <div id={detailId} className="mobile-data-card-details">
              <dl>
                {details.map((item) => (
                  <div key={item.label} className="mobile-data-card-kv">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <button
            type="button"
            className="mobile-data-card-toggle"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={(event) => {
              event.stopPropagation()
              setOpen((prev) => !prev)
            }}
          >
            {open ? '▲ 상세 정보 접기' : '▼ 상세 정보 펼치기'}
          </button>
        </>
      ) : null}
    </article>
  )
}

export function MobileDataCardList({
  rows = [],
  getRowKey,
  emptyText = '표시할 데이터가 없습니다.',
  className = '',
  summaryFields = [],
  detailFields = [],
  ...config
}) {
  const cardConfig = { ...config, summaryFields, detailFields }

  return (
    <div className={`mobile-data-card-list mobile-card-only block md:hidden ${className}`.trim()}>
      {rows.length === 0 ? (
        <p className="mobile-data-card-empty">{emptyText}</p>
      ) : (
        rows.map((row, index) => {
          const key = String(getRowKey ? getRowKey(row, index) : row?.id ?? index)
          return <MobileDataCard key={key} row={row} index={index} cardKey={key} config={cardConfig} />
        })
      )}
    </div>
  )
}

/**
 * 모바일 카드 목록 + 맨 아래 「계약·마감」 접이 섹션(기본 접힘).
 * showAllInline 이면(계약·마감 필터 선택·검색 중) 접지 않고 한 목록으로 보여 준다.
 */
export function MobileClosedAccordionCardList({
  rows = [],
  isClosedRow,
  showAllInline = false,
  closedLabel = '계약·마감 건',
  emptyText,
  ...cardProps
}) {
  const [closedOpen, setClosedOpen] = useState(false)

  if (showAllInline || typeof isClosedRow !== 'function') {
    return <MobileDataCardList rows={rows} emptyText={emptyText} {...cardProps} />
  }

  const activeRows = []
  const closedRows = []
  for (const row of rows) (isClosedRow(row) ? closedRows : activeRows).push(row)

  // 진행 중인 건이 하나도 없으면(예: 상태 열 필터로 계약만 고름) 접지 않고 바로 보여 준다.
  if (closedRows.length === 0 || activeRows.length === 0) {
    return <MobileDataCardList rows={rows} emptyText={emptyText} {...cardProps} />
  }

  return (
    <div className="mobile-card-only block md:hidden">
      <MobileDataCardList rows={activeRows} {...cardProps} />
      <button
        type="button"
        className="mobile-closed-accordion-bar"
        aria-expanded={closedOpen}
        onClick={() => setClosedOpen((prev) => !prev)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Lock size={15} strokeWidth={2.25} aria-hidden="true" />
          <span>
            {closedLabel} ({closedRows.length.toLocaleString('ko-KR')}건)
          </span>
        </span>
        {closedOpen ? (
          <ChevronUp size={18} strokeWidth={2.25} aria-hidden="true" />
        ) : (
          <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
        )}
      </button>
      {closedOpen ? <MobileDataCardList rows={closedRows} {...cardProps} /> : null}
    </div>
  )
}
