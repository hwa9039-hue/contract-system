/** 영업관리대장 상태 뱃지. 저장값을 새 이름으로 바꾸지 않고, 있는 글자 그대로 색만 입힌다. */

export const SALES_STAGE_OPTIONS = [
  '긴급대응',
  '초기접촉',
  '미팅진행',
  '견적단계',
  '설계단계',
  '보고(신규 등록)',
  '사업공고',
  '계약',
  '마감',
]

export const SALES_STATUS_LEGEND_ITEMS = [
  { id: '긴급대응', tone: 'red', label: '긴급대응' },
  { id: '초기접촉', tone: 'yellow', label: '초기접촉' },
  { id: '미팅진행', tone: 'orange', label: '미팅진행' },
  { id: '견적단계', tone: 'fuchsia', label: '견적단계' },
  { id: '설계단계', tone: 'emerald', label: '설계단계' },
  { id: '보고(신규 등록)', tone: 'blue', label: '보고(신규 등록)' },
  { id: '사업공고', tone: 'green', label: '사업공고' },
  { id: '계약&마감', tone: 'gray', label: '계약&마감' },
]

const BADGE_TONE_BY_LABEL = {
  긴급대응: 'red',
  초기접촉: 'yellow',
  미팅진행: 'orange',
  견적단계: 'fuchsia',
  설계단계: 'emerald',
  '보고(신규 등록)': 'blue',
  사업공고: 'green',
  확인필요: 'red',
  보류: 'red',
  대응중: 'yellow',
  대기중: 'yellow',
  보고: 'blue',
  발주계획: 'green',
  사전규격: 'green',
  입찰공고: 'green',
  정보공개: 'green',
  계약: 'gray',
  마감: 'gray',
  완료: 'gray',
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 화면 글자. '완료'만 예전처럼 '마감'으로 읽고, 그 외 저장값은 그대로 둔다. */
export function salesStatusBadgeLabel(stage) {
  const text = safeString(stage).trim()
  if (!text) return ''
  if (text === '완료') return '마감'
  return text
}

export function salesStatusBadgeTone(stage) {
  const label = salesStatusBadgeLabel(stage)
  if (!label) return 'empty'
  return BADGE_TONE_BY_LABEL[label] || 'gray'
}

export function salesStatusMatchesLegend(stage, selectedId) {
  if (!selectedId) return true
  const label = salesStatusBadgeLabel(stage)
  if (selectedId === '계약&마감') return label === '계약' || label === '마감'
  return label === selectedId
}

/** 현재 행의 예전 상태값은 목록 맨 아래에 남겨, 선택창이 빈칸으로 보이지 않게 한다. */
export function resolveSalesStageOptions(currentValue, baseOptions = SALES_STAGE_OPTIONS) {
  const options = Array.isArray(baseOptions) ? [...baseOptions] : []
  const current = safeString(currentValue).trim()
  if (current && !options.includes(current)) options.push(current)
  return options
}

export function SalesStatusBadge({ status }) {
  const label = salesStatusBadgeLabel(status)
  if (!label) return null
  const tone = salesStatusBadgeTone(status)
  return <span className={`sales-status-badge sales-status-badge--${tone}`}>{label}</span>
}
