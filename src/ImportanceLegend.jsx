export const IMPORTANCE_LEGEND_ITEMS = [
  { tone: 'red', label: '검토(확인필요)' },
  { tone: 'yellow', label: '대응중' },
  { tone: 'blue', label: '보고' },
  { tone: 'green', label: '사업공고(발주계획, 사전규격, 입찰공고, 정보공개)' },
]

/** 이미 선택한 항목을 다시 누르면 전체 보기로 되돌린다. */
export function toggleSelectedImportance(current, nextTone) {
  return current === nextTone ? null : nextTone
}

export function ImportanceLegend({
  className = '',
  selectedImportance = null,
  onSelect = null,
}) {
  const interactive = typeof onSelect === 'function'
  const isFiltered = Boolean(selectedImportance)

  return (
    <div
      className={`dashboard-importance-legend ${isFiltered ? 'is-filtered' : ''} ${className}`.trim()}
      aria-label="상태 중요도 범례"
      role={interactive ? 'toolbar' : undefined}
    >
      {IMPORTANCE_LEGEND_ITEMS.map((item) => {
        const isActive = selectedImportance === item.tone
        const classNameItem = [
          'dashboard-importance-legend-item',
          interactive ? 'dashboard-importance-legend-item--button' : '',
          isActive ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')

        const body = (
          <>
            <span
              className={`registry-importance-dot registry-importance-dot--${item.tone} registry-importance-dot--size-legend`}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </>
        )

        if (!interactive) {
          return (
            <span key={item.tone} className={classNameItem}>
              {body}
            </span>
          )
        }

        return (
          <button
            key={item.tone}
            type="button"
            className={classNameItem}
            aria-pressed={isActive}
            aria-label={`${item.label} 필터`}
            onClick={() => onSelect(toggleSelectedImportance(selectedImportance, item.tone))}
          >
            {body}
          </button>
        )
      })}
    </div>
  )
}
