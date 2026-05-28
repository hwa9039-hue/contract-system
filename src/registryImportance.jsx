/** 상태값 → 중요도 색상 (영업관리대장·사업검색이력 공통) */

const IMPORTANCE_RED_STATUSES = new Set(['확인필요', '보류'])
const IMPORTANCE_YELLOW_STATUSES = new Set(['대기', '대응중'])
const IMPORTANCE_GREEN_STATUSES = new Set(['발주계획', '사전규격', '입찰공고', '정보공개'])
const IMPORTANCE_GRAY_STATUSES = new Set(['계약', '마감', '완료'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function normalizeStatusForImportance(status) {
  const trimmed = safeString(status).trim()
  if (!trimmed) return ''
  return trimmed === '완료' ? '마감' : trimmed
}

/**
 * @param {string} status
 * @returns {{ tone: 'red'|'yellow'|'green'|'gray'|'empty', label: string }}
 */
export function getImportanceStyle(status) {
  const normalized = normalizeStatusForImportance(status)

  if (!normalized) {
    return { tone: 'empty', label: '' }
  }

  if (IMPORTANCE_RED_STATUSES.has(normalized)) {
    return { tone: 'red', label: '검토' }
  }

  if (IMPORTANCE_YELLOW_STATUSES.has(normalized)) {
    return { tone: 'yellow', label: '대기중' }
  }

  if (IMPORTANCE_GREEN_STATUSES.has(normalized)) {
    return { tone: 'green', label: '사업공고' }
  }

  if (IMPORTANCE_GRAY_STATUSES.has(normalized)) {
    return { tone: 'gray', label: '종료' }
  }

  return { tone: 'gray', label: '기타' }
}

export function getImportanceStatusFromRow(row, column) {
  if (!column || !row) return ''
  const statusKey = column.statusKey || column.importanceStatusKey
  if (!statusKey) return ''
  return safeString(row[statusKey]).trim()
}

/** 테이블 행·컬럼 정의에서 중요도 계산용 상태 문자열 추출 */
export function resolveRegistryImportanceStatus(row, column) {
  try {
    const raw = getImportanceStatusFromRow(row, column)
    return normalizeStatusForImportance(raw)
  } catch {
    return ''
  }
}

export function RegistryImportanceDot({ status, size = 'md' }) {
  const normalized = normalizeStatusForImportance(status)
  if (!normalized) return null

  let tone = 'empty'
  try {
    tone = getImportanceStyle(status).tone
  } catch {
    return null
  }

  if (tone === 'empty') return null

  return (
    <span
      className={`registry-importance-dot registry-importance-dot--${tone} registry-importance-dot--size-${size}`}
      aria-hidden="true"
    />
  )
}

export function RegistryImportanceBadge({ status }) {
  let style
  let title = ''

  try {
    title = normalizeStatusForImportance(status)
    style = getImportanceStyle(status)
  } catch {
    return (
      <span className="registry-importance-badge" aria-label="중요도 없음">
        <span className="registry-importance-dot registry-importance-dot--empty" aria-hidden="true" />
        <span className="registry-importance-label">-</span>
      </span>
    )
  }

  const tone = style?.tone || 'empty'
  const label = style?.label || ''

  return (
    <span
      className={`registry-importance-badge registry-importance-badge--${tone}`}
      title={title || undefined}
      aria-label={title ? `중요도: ${title}` : '중요도 없음'}
    >
      <span
        className={`registry-importance-dot registry-importance-dot--${tone}`}
        aria-hidden="true"
      />
      <span className="registry-importance-label">{label || '-'}</span>
    </span>
  )
}
