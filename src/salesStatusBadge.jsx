/** 영업관리대장 상태 뱃지. 저장값을 새 이름으로 바꾸지 않고, 있는 글자 그대로 색만 입힌다. */

export const SALES_STAGE_OPTIONS = [
  '긴급대응',
  '초기접촉',
  '미팅진행',
  '견적단계',
  '설계단계',
  '보고',
  '사업공고',
  '계약',
  '마감',
]

const SALES_LEGEND_CHIP_CLASS =
  'h-10 px-2.5 py-1 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5'

export const SALES_STATUS_LEGEND_ITEMS = [
  { id: '긴급대응', tone: 'red', label: '긴급대응', icon: '🚨', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-red-50 text-red-700 border-red-200` },
  { id: '초기접촉', tone: 'yellow', label: '초기접촉', icon: '📞', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-amber-50 text-amber-700 border-amber-200` },
  { id: '미팅진행', tone: 'orange', label: '미팅진행', icon: '🤝', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-orange-50 text-orange-700 border-orange-200` },
  { id: '견적단계', tone: 'fuchsia', label: '견적단계', icon: '💬', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-purple-50 text-purple-700 border-purple-200` },
  { id: '설계단계', tone: 'emerald', label: '설계단계', icon: '📐', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-sky-50 text-sky-700 border-sky-200` },
  { id: '보고', tone: 'blue', label: '보고', icon: '📝', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-blue-50 text-blue-700 border-blue-200` },
  { id: '사업공고', tone: 'green', label: '사업공고', icon: '📢', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-emerald-50 text-emerald-700 border-emerald-200` },
  { id: '계약&마감', tone: 'gray', label: '계약&마감', icon: '🔒', badgeClass: `${SALES_LEGEND_CHIP_CLASS} bg-slate-100 text-slate-600 border-slate-200` },
]

export const SALES_STATUS_ALL_BADGE_CLASS = `${SALES_LEGEND_CHIP_CLASS} bg-indigo-50 text-indigo-700 border-indigo-200`

/** 대시보드 범례. 이모지 없이 색 점과 글자만 쓰고, 점 색은 표 뱃지와 같다. */
export const DASHBOARD_STATUS_LEGEND_ITEMS = [
  { id: '긴급대응', tone: 'red', label: '긴급대응' },
  { id: '초기접촉', tone: 'amber', label: '초기접촉' },
  { id: '미팅진행', tone: 'orange', label: '미팅진행' },
  { id: '견적단계', tone: 'purple', label: '견적단계' },
  { id: '설계단계', tone: 'sky', label: '설계단계' },
  { id: '보고', tone: 'blue', label: '보고' },
  { id: '사업공고', tone: 'emerald', label: '사업공고' },
  { id: '계약&마감', tone: 'slate', label: '계약&마감' },
]

const BADGE_TONE_BY_LABEL = {
  긴급대응: 'red',
  초기접촉: 'amber',
  미팅진행: 'orange',
  견적단계: 'purple',
  설계단계: 'sky',
  보고: 'blue',
  사업공고: 'emerald',
  확인필요: 'red',
  보류: 'red',
  대응중: 'amber',
  대기중: 'amber',
  발주계획: 'emerald',
  사전규격: 'emerald',
  입찰공고: 'emerald',
  정보공개: 'emerald',
  계약: 'slate',
  마감: 'slate',
  완료: 'slate',
}

const BADGE_ICON_BY_LABEL = {
  긴급대응: '🚨',
  확인필요: '🚨',
  보류: '🚨',
  초기접촉: '📞',
  대응중: '📞',
  대기중: '📞',
  미팅진행: '🤝',
  견적단계: '💬',
  설계단계: '📐',
  보고: '📝',
  사업공고: '📢',
  발주계획: '📢',
  사전규격: '📢',
  입찰공고: '📢',
  정보공개: '📢',
  계약: '🔒',
  마감: '🔒',
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 화면 글자. 저장값은 바꾸지 않고, 긴 예전 이름만 짧게 읽는다. */
export function salesStatusBadgeLabel(stage) {
  const text = safeString(stage).trim()
  if (!text) return ''
  if (text === '완료') return '마감'
  if (text === '보고(신규 등록)') return '보고'
  return text
}

export function salesStatusBadgeIcon(stage) {
  const label = salesStatusBadgeLabel(stage)
  if (!label) return ''
  return BADGE_ICON_BY_LABEL[label] || ''
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
  const currentLabel = salesStatusBadgeLabel(current)
  if (current && !options.includes(current) && !options.includes(currentLabel)) options.push(current)
  return options
}

/** 저장값이 '보고(신규 등록)'이어도 선택창에서는 '보고'가 선택된 것으로 보인다. */
export function salesStatusSelectValue(stored, options = SALES_STAGE_OPTIONS) {
  const current = safeString(stored).trim()
  if (!current) return ''
  if (options.includes(current)) return current
  const label = salesStatusBadgeLabel(current)
  if (options.includes(label)) return label
  return current
}

export function salesStatusMobileBadge(stage) {
  const label = salesStatusBadgeLabel(stage)
  const icon = salesStatusBadgeIcon(stage)
  return {
    label: [icon, label].filter(Boolean).join(' '),
    tone: salesStatusBadgeTone(stage),
  }
}

export function SalesStatusBadge({ status }) {
  const label = salesStatusBadgeLabel(status)
  if (!label) return null
  const tone = salesStatusBadgeTone(status)
  const icon = salesStatusBadgeIcon(status)
  return (
    <span className={`sales-status-badge sales-status-badge--${tone}`}>
      {icon ? (
        <span className="sales-status-badge-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  )
}
