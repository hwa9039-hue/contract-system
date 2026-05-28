export const IMPORTANCE_LEGEND_ITEMS = [
  { tone: 'red', label: '검토(확인필요, 보류)' },
  { tone: 'yellow', label: '대기중(대기, 대응중)' },
  { tone: 'green', label: '사업공고(발주계획, 사전규격, 입찰공고, 정보공개)' },
]

export function ImportanceLegend({ className = '' }) {
  return (
    <div className={`dashboard-importance-legend ${className}`.trim()} aria-label="상태 중요도 범례">
      {IMPORTANCE_LEGEND_ITEMS.map((item) => (
        <span key={item.label} className="dashboard-importance-legend-item">
          <span
            className={`registry-importance-dot registry-importance-dot--${item.tone} registry-importance-dot--size-legend`}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}

