/** 상태값 → 중요도 색상 (영업관리대장·사업검색이력 공통) */

// '보류'는 상태 옵션에서 삭제되었으나(신규 선택 불가), 레거시 DB 데이터 호환을 위해
// 렌더링 시에는 '확인필요'와 동일하게 빨간색(검토)으로 표시되도록 유지한다.
const IMPORTANCE_RED_STATUSES = new Set(['확인필요', '보류'])
const IMPORTANCE_YELLOW_STATUSES = new Set(['대응중'])
const IMPORTANCE_BLUE_STATUSES = new Set(['보고'])
const IMPORTANCE_GREEN_STATUSES = new Set(['발주계획', '사전규격', '입찰공고', '정보공개'])
const IMPORTANCE_GRAY_STATUSES = new Set(['계약', '마감', '완료'])

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function normalizeStatusForImportance(status) {
  const trimmed = safeString(status).trim()
  if (!trimmed) return ''
  if (trimmed === '완료') return '마감'
  // 레거시 DB 값 호환: 예전에 저장된 '대기중' → '대응중'으로 통일
  if (trimmed === '대기중') return '대응중'
  return trimmed
}

/**
 * @param {string} status
 * @returns {{ tone: 'red'|'yellow'|'blue'|'green'|'gray'|'empty', label: string }}
 */
export function getImportanceStyle(status) {
  const normalized = normalizeStatusForImportance(status)

  if (!normalized) {
    return { tone: 'empty', label: '' }
  }

  if (IMPORTANCE_RED_STATUSES.has(normalized)) {
    return { tone: 'red', label: '검토' }
  }

  if (IMPORTANCE_BLUE_STATUSES.has(normalized)) {
    return { tone: 'blue', label: '보고' }
  }

  if (IMPORTANCE_YELLOW_STATUSES.has(normalized)) {
    return { tone: 'yellow', label: '대응중' }
  }

  if (IMPORTANCE_GREEN_STATUSES.has(normalized)) {
    return { tone: 'green', label: '사업공고' }
  }

  if (IMPORTANCE_GRAY_STATUSES.has(normalized)) {
    return { tone: 'gray', label: '종료' }
  }

  // 삭제된 '대기' 등 매핑되지 않는 상태값 fallback (회색 기본 텍스트)
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
