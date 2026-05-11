import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'
import { budgetProgressApi } from './budgetProgressApi'
import { contractsApi } from './contractsApi'
import { documentRegisterApi } from './documentRegisterApi'
import { excludedProjectsApi } from './excludedProjectsApi'
import { projectDiscoveryApi } from './projectDiscoveryApi'
import { salesRegisterApi } from './salesRegisterApi'
import { weeklyWorkReportsApi } from './weeklyWorkReportsApi'
import { API_BASE_URL, clearAuthToken, getAuthHeaders, setAuthToken } from './apiClient.js'

const CONTRACT_COLUMNS = [
  { key: 'year', label: '사업년도', className: 'col-year', align: 'center', type: 'text' },
  { key: 'segment', label: '구분', className: 'col-segment', align: 'center', type: 'text' },
  { key: 'refNo', label: '참고번호', className: 'col-ref', align: 'center', type: 'text' },
  { key: 'contractNo', label: '계약번호', className: 'col-contractno', align: 'center', type: 'text' },
  { key: 'client', label: '발주처', className: 'col-client', align: 'center', type: 'textarea' },
  { key: 'department', label: '담당부서', className: 'col-dept', align: 'center', type: 'textarea' },
  { key: 'contractMethod', label: '계약방식', className: 'col-method', align: 'center', type: 'text' },
  { key: 'contractType', label: '계약분류', className: 'col-type', align: 'center', type: 'text' },
  { key: 'identNo', label: '식별번호', className: 'col-ref', align: 'center', type: 'text' },
  { key: 'contractDate', label: '계약일자', className: 'col-date', align: 'center', type: 'date' },
  { key: 'dueDate', label: '준공일자', className: 'col-date', align: 'center', type: 'date' },
  { key: 'projectName', label: '사업명', className: 'col-project', align: 'left', type: 'textarea' },
  { key: 'amount', label: '계약금액', className: 'col-amount', align: 'right', type: 'amount' },
  { key: 'salesOwner', label: '영업담당자', className: 'col-owner', align: 'center', type: 'text' },
  { key: 'pm', label: '현장 PM', className: 'col-pm', align: 'center', type: 'text' },
  { key: 'note', label: '비고', className: 'col-note', align: 'left', type: 'textarea' },
]

const DOCUMENT_COLUMNS = [
  { key: 'docDate', label: '등록일', align: 'center', type: 'date', width: 110 },
  { key: 'docNo', label: '문서번호', align: 'center', type: 'text', width: 220 },
  { key: 'senderReceiver', label: '수신처 또는 발신처', align: 'center', type: 'textarea', width: 220 },
  { key: 'title', label: '문서명 또는 제목', align: 'left', type: 'textarea', width: 320 },
  { key: 'method', label: '접수 또는 발송형태', align: 'center', type: 'text', width: 170 },
  { key: 'writer', label: '수신자 또는 작성자', align: 'center', type: 'text', width: 160 },
  { key: 'note', label: '비고', align: 'left', type: 'textarea', width: 260 },
]

const SALES_CATEGORY_OPTIONS = ['DI사업', '도로사업']
const SALES_STAGE_OPTIONS = ['대기', '대응중', '확인필요', '보류', '완료', '발주계획', '사전규격', '입찰공고']
const SALES_MANAGER_OPTIONS = ['전기웅', '유영무', '김성수', '이재승', '이용자', '박재범', '신상준']
const SALES_REGISTER_MANAGER_OPTIONS = ['전기웅', '유영무', '김성수', '이재승', '이용자', '박재범']
const SALES_STAGE_TONE_MAP = {
  대기: { className: 'sales-stage-badge stage-waiting', optionStyle: { backgroundColor: '#fff8db', color: '#a16207' } },
  대응중: { className: 'sales-stage-badge stage-working', optionStyle: { backgroundColor: '#eaf1ff', color: '#1f4fd1' } },
  확인필요: { className: 'sales-stage-badge stage-alert', optionStyle: { backgroundColor: '#fff1e8', color: '#c2410c' } },
  보류: { className: 'sales-stage-badge stage-hold', optionStyle: { backgroundColor: '#f3f4f6', color: '#4b5563' } },
  완료: { className: 'sales-stage-badge stage-done', optionStyle: { backgroundColor: '#e5e7eb', color: '#111827' } },
  발주계획: { className: 'sales-stage-badge stage-green', optionStyle: { backgroundColor: '#ecfdf3', color: '#166534' } },
  사전규격: { className: 'sales-stage-badge stage-green', optionStyle: { backgroundColor: '#ecfdf3', color: '#166534' } },
  입찰공고: { className: 'sales-stage-badge stage-green', optionStyle: { backgroundColor: '#ecfdf3', color: '#166534' } },
}
const DISCOVERY_CATEGORY_TONE_MAP = {
  '장기 사업': 'discovery-category-badge discovery-long',
  '단기 사업': 'discovery-category-badge discovery-short',
}

const SALES_COLUMNS = [
  { key: 'registerDate', label: '등록일', align: 'center', type: 'date', width: 108 },
  { key: 'client', label: '발주처', align: 'center', type: 'text', width: 170 },
  { key: 'projectName', label: '프로젝트', align: 'left', type: 'textarea', width: 250 },
  { key: 'projectAmount', label: '사업금액', align: 'right', type: 'amount', width: 138 },
  { key: 'projectCategory', label: '사업구분', align: 'center', type: 'select', options: SALES_CATEGORY_OPTIONS, width: 102 },
  { key: 'manager', label: '담당자', align: 'center', type: 'select', options: SALES_REGISTER_MANAGER_OPTIONS, width: 112 },
  { key: 'projectStage', label: '상태', align: 'center', type: 'select', options: SALES_STAGE_OPTIONS, width: 102 },
  { key: 'department', label: '담당부서', align: 'center', type: 'text', width: 130 },
  { key: 'detail', label: '세부내용', align: 'left', type: 'textarea', width: 310 },
  { key: 'source', label: '출처', align: 'center', type: 'text', width: 140 },
  { key: 'salesNote', label: '영업매칭', align: 'left', type: 'textarea', width: 250 },
  { key: 'actionRequest', label: '영업 요청사항', align: 'left', type: 'textarea', width: 270 },
]

const BUDGET_COLUMNS = [
  { key: 'registerDate', label: '등록일', align: 'center', type: 'date', width: 108 },
  { key: 'localGov', label: '지자체', align: 'center', type: 'text', width: 160 },
  { key: 'projectName', label: '프로젝트', align: 'left', type: 'text', width: 260 },
  { key: 'budgetAmount', label: '예산액', align: 'right', type: 'amount', width: 138 },
  { key: 'manager', label: '담당자', align: 'center', type: 'select', options: SALES_MANAGER_OPTIONS, width: 112 },
  { key: 'projectStage', label: '상태', align: 'center', type: 'select', options: SALES_STAGE_OPTIONS, width: 102 },
  { key: 'department', label: '담당부서', align: 'center', type: 'text', width: 130 },
  { key: 'detail', label: '세부내용', align: 'left', type: 'textarea', width: 310 },
  { key: 'salesMatch', label: '영업매칭', align: 'left', type: 'text', width: 190 },
  { key: 'note', label: '비고', align: 'left', type: 'textarea', width: 260 },
]

const DISCOVERY_CATEGORY_OPTIONS = ['장기 사업', '단기 사업']
const DISCOVERY_SALES_TARGET_OPTIONS = SALES_MANAGER_OPTIONS
const DISCOVERY_COLUMNS = [
  { key: 'permitDate', label: '건축정보일자', align: 'center', type: 'date', width: 118 },
  { key: 'checkStatus', label: '확인', align: 'center', type: 'text', width: 76 },
  { key: 'salesTarget', label: '영업자', align: 'center', type: 'select', options: DISCOVERY_SALES_TARGET_OPTIONS, width: 118 },
  { key: 'projectCategory', label: '사업구분', align: 'center', type: 'select', options: DISCOVERY_CATEGORY_OPTIONS, width: 104 },
  { key: 'client', label: '발주처', align: 'center', type: 'text', width: 160 },
  { key: 'projectName', label: '사업명', align: 'left', type: 'text', width: 240 },
  { key: 'projectAmount', label: '사업금액', align: 'right', type: 'amount', width: 132 },
  { key: 'completionPeriod', label: '준공시기', align: 'center', type: 'text', width: 120 },
  { key: 'manager', label: '담당자', align: 'center', type: 'text', width: 110 },
  { key: 'note', label: '비고', align: 'left', type: 'textarea', width: 280 },
]

const EXCLUDED_CATEGORY_OPTIONS = ['발주계획', '사전규격', '입찰공고', '정보공개']
const EXCLUDED_KEYWORD_OPTIONS = [
  '(N)안내전광판',
  '(N)기상전광판',
  '(N)교통정보전광판',
  '(N)융복합안내전광판',
  '(N)영상정보디스플레이장치',
  '전광판',
  '미디어',
  '파사드',
  '사이니지',
  'LED',
  '액정모니터',
  '디스플레이',
  '공사',
]
const EXCLUDED_WRITER_OPTIONS = ['이용자', '정화영', '이재승', '정주희', '신상준']
const EXCLUDED_CATEGORY_TONE_MAP = {
  발주계획: { background: '#fff1e8', color: '#c2410c', borderColor: '#fdba74' },
  사전규격: { background: '#eaf1ff', color: '#1f4fd1', borderColor: '#bfd0ff' },
  입찰공고: { background: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  정보공개: { background: '#f7fee7', color: '#4d7c0f', borderColor: '#d9f99d' },
}
const EXCLUDED_KEYWORD_TONE_MAP = {
  '(N)안내전광판': { background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' },
  '(N)기상전광판': { background: '#fff8db', color: '#a16207', borderColor: '#f6d56c' },
  '(N)교통정보전광판': { background: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  '(N)융복합안내전광판': { background: '#eaf1ff', color: '#1f4fd1', borderColor: '#bfd0ff' },
  '(N)영상정보디스플레이장치': { background: '#7f1d1d', color: '#ffffff', borderColor: '#7f1d1d' },
  전광판: { background: '#f3f4f6', color: '#4b5563', borderColor: '#d1d5db' },
  미디어: { background: '#374151', color: '#ffffff', borderColor: '#374151' },
  파사드: { background: '#ede0d4', color: '#7c2d12', borderColor: '#d6ccc2' },
  사이니지: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  LED: { background: '#f3e8ff', color: '#7e22ce', borderColor: '#d8b4fe' },
  액정모니터: { background: '#e0e7ff', color: '#3730a3', borderColor: '#c7d2fe' },
  디스플레이: { background: '#ede0d4', color: '#7c2d12', borderColor: '#d6ccc2' },
  공사: { background: '#dbeafe', color: '#1d4ed8', borderColor: '#93c5fd' },
}
const EXCLUDED_WRITER_TONE_MAP = {
  이용자: { background: '#fff1e8', color: '#c2410c', borderColor: '#fdba74' },
  정화영: { background: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  이재승: { background: '#eaf1ff', color: '#1f4fd1', borderColor: '#bfd0ff' },
  정주희: { background: '#f3e8ff', color: '#7e22ce', borderColor: '#d8b4fe' },
  신상준: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
}
const EXCLUDED_COLUMNS = [
  { key: 'writeDate', label: '등록일', align: 'center', type: 'date', width: 110 },
  { key: 'openDate', label: '공개일', align: 'center', type: 'date', width: 110 },
  { key: 'category', label: '상태', align: 'center', type: 'select', options: EXCLUDED_CATEGORY_OPTIONS, width: 100 },
  { key: 'keyword', label: '검색어', align: 'center', type: 'select', options: EXCLUDED_KEYWORD_OPTIONS, width: 180 },
  { key: 'writer', label: '작성자', align: 'center', type: 'text', width: 100 },
  { key: 'projectName', label: '사업명', align: 'left', type: 'text', width: 220 },
  { key: 'client', label: '발주처', align: 'center', type: 'text', width: 150 },
  { key: 'projectAmount', label: '사업금액', align: 'right', type: 'amount', width: 130 },
  { key: 'exclusionReason', label: '제외 사유', align: 'left', type: 'textarea', width: 300 },
]

const WORK_REPORT_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const WORK_REPORT_MAIN_CHECK_COUNT = 5
const WORK_REPORT_EXTERNAL_ROW_COUNT = 5
const WORK_REPORT_DI_ROW_COUNT = 4
const WORK_REPORT_ROAD_ROW_COUNT = 2
const WORK_REPORT_SUPPORT_ITEM_COUNT = 10
const WORK_REPORT_SUPPORT_NUMBER_GUIDE = Array.from(
  { length: WORK_REPORT_SUPPORT_ITEM_COUNT },
  (_, index) => String(index + 1)
)
const WORK_REPORT_MANAGER_OPTIONS = [
  '전기웅',
  '유영무',
  '김성수',
  '이재승',
  '이용자',
  '박재범',
  '전재우',
  '정화영',
  '정주희',
  '신상준',
]
const WORK_REPORT_EXTERNAL_USER_OPTIONS = WORK_REPORT_MANAGER_OPTIONS
const WORK_REPORT_DI_MANAGERS = ['전기웅', '유영무', '김성수', '이재승']
const WORK_REPORT_ROAD_MANAGERS = ['이용자', '박재범']
const WORK_REPORT_SECTION_KEYS = {
  checklist: '주요확인사항',
  external: '외부일정',
  di: 'DI사업',
  road: '도로사업',
  supportProgress: '영업지원_진행업무',
  supportDone: '영업지원_완료업무',
}

const CALENDAR_STORAGE_KEY = 'contract_manager_calendar_events_v3'
const ADMIN_SESSION_KEY = 'contract_manager_admin_session_v1'
const CONTRACT_SHARED_AUTH_KEY = 'CONTRACT_SHARED_AUTH'
const CONTRACT_SHARED_EXPIRES_AT_KEY = 'CONTRACT_SHARED_EXPIRES_AT'
const CONTRACT_SHARED_SESSION_DURATION_MS = 20 * 60 * 1000
const CONTRACT_SHARED_WARNING_MS = 5 * 60 * 1000
const ADMIN_PASSWORD = 'admin2026!'
const SHARED_APP_PASSWORD = import.meta.env.VITE_APP_SHARED_PASSWORD || 'smartdi2026!'
const ALL_OPTION = '전체'
const DASHBOARD_CATEGORY_ORDER = ['전광판', 'BIT', '도로사업', '유지보수']
const DASHBOARD_STATUS_LABELS = SALES_STAGE_OPTIONS
const PAGE_TITLE_MAP = {
  dashboard: '대시보드',
  workReports: '일일/주간업무보고서',
  contracts: '계약현황',
  calendar: '캘린더',
  sales: '영업관리대장',
  budget: '본예산 진행정보',
  discovery: '건축정보',
  excluded: '사업검색이력',
  documents: '문서수발신대장',
}
const TOP_SYSTEM_SUBTITLE =
  '일일/주간업무보고서 · 계약현황 · 일정관리 · 영업관리대장 · 본예산 진행정보 · 건축정보 · 사업검색이력 · 문서수발신대장'
const HIDDEN_MANAGER_VALUES = ['전유찬', '전유찬 대리']

const emptyContract = {
  year: '',
  segment: '',
  refNo: '',
  contractNo: '',
  client: '',
  department: '',
  contractMethod: '',
  contractType: '',
  identNo: '',
  contractDate: '',
  dueDate: '',
  projectName: '',
  amount: '',
  salesOwner: '',
  pm: '',
  note: '',
}

const emptyEvent = {
  date: '',
  title: '',
  owner: '',
  note: '',
}

function createDocumentDraftRow() {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    docDate: '',
    docNo: '',
    senderReceiver: '',
    title: '',
    method: '',
    writer: '',
    note: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createSalesDraftRow() {
  return {
    id: `sales-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    registerDate: '',
    client: '',
    projectName: '',
    projectAmount: '',
    projectCategory: '',
    projectStage: '',
    manager: '',
    projectType: '',
    department: '',
    detail: '',
    source: '',
    salesNote: '',
    actionRequest: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createBudgetDraftRow() {
  return {
    id: `budget-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    registerDate: '',
    localGov: '',
    projectName: '',
    budgetAmount: '',
    manager: '',
    projectStage: '',
    department: '',
    detail: '',
    salesMatch: '',
    note: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createDiscoveryDraftRow() {
  return {
    id: `discovery-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    permitDate: '',
    checkStatus: '',
    salesTarget: '',
    projectCategory: '',
    localGov: '',
    client: '',
    projectName: '',
    projectAmount: '',
    completionPeriod: '',
    manager: '',
    note: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createExcludedDraftRow() {
  return {
    id: `excluded-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orderNo: '',
    writeDate: '',
    openDate: '',
    category: '',
    keyword: '',
    writer: '',
    projectName: '',
    client: '',
    projectAmount: '',
    exclusionReason: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createWorkReportDraftRow({
  reportDate,
  section,
  user = '',
  content = '',
  destination = '',
  orderIndex = 1,
}) {
  return {
    id: `work-report-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: reportDate,
    user,
    section,
    content,
    destination,
    orderIndex,
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function removeObjectKey(object, key) {
  const next = { ...object }
  delete next[key]
  return next
}

function normalizeHeader(text) {
  return safeString(text)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function getValueByHeader(row, candidates, fallback = '') {
  const map = new Map()

  Object.keys(row).forEach((key) => {
    map.set(normalizeHeader(key), row[key])
  })

  for (const candidate of candidates) {
    const value = map.get(normalizeHeader(candidate))
    if (value !== undefined && value !== null && safeString(value).trim() !== '') {
      return value
    }
  }

  return fallback
}

function excelDateToInput(value) {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return ''
    const yyyy = String(parsed.y)
    const mm = String(parsed.m).padStart(2, '0')
    const dd = String(parsed.d).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const str = safeString(value).trim()
  if (!str) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(str)) return str.replaceAll('.', '-')
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replaceAll('/', '-')

  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return ''

  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseDateOnly(value) {
  const str = safeString(value).trim()
  if (!str) return null

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateInput(date) {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDays(baseDate, days) {
  const nextDate = new Date(baseDate)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function getWeekStartMonday(dateInput = new Date()) {
  const sourceDate =
    typeof dateInput === 'string' ? parseDateOnly(dateInput) ?? new Date() : new Date(dateInput)
  const normalizedDate = new Date(
    sourceDate.getFullYear(),
    sourceDate.getMonth(),
    sourceDate.getDate()
  )
  const day = normalizedDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  normalizedDate.setDate(normalizedDate.getDate() + diff)
  return normalizedDate
}

function getWeekNumberInMonth(dateInput) {
  const sourceDate = typeof dateInput === 'string' ? parseDateOnly(dateInput) : dateInput
  if (!sourceDate) return 1

  const targetDate = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate())
  const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
  const firstWeekStart = getWeekStartMonday(firstDayOfMonth)
  return Math.floor((getWeekStartMonday(targetDate).getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function buildWorkReportWeekMeta(weekStartDate) {
  const monday = getWeekStartMonday(weekStartDate)
  return {
    weekStartDate: formatDateInput(monday),
    year: monday.getFullYear(),
    month: monday.getMonth() + 1,
    weekNumber: getWeekNumberInMonth(monday),
  }
}

function getWorkReportWeekLabel(weekStartDate) {
  const meta = buildWorkReportWeekMeta(weekStartDate)
  const monday = getWeekStartMonday(weekStartDate)
  const sunday = addDays(monday, 6)
  return `${meta.year}년 ${meta.month}월 ${meta.weekNumber}주차 (${String(
    monday.getMonth() + 1
  ).padStart(2, '0')}.${String(monday.getDate()).padStart(2, '0')} ~ ${String(
    sunday.getMonth() + 1
  ).padStart(2, '0')}.${String(sunday.getDate()).padStart(2, '0')})`
}

function getWorkReportWeekDays(weekStartDate) {
  const monday = getWeekStartMonday(weekStartDate)
  return WORK_REPORT_WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(monday, index)
    return {
      label,
      date: formatDateInput(date),
      monthDay: `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
      isToday: formatDateInput(date) === formatDateInput(new Date()),
    }
  })
}

function normalizeAmountValue(value) {
  if (value === null || value === undefined || value === '') return ''
  return safeString(value).replace(/[^\d]/g, '')
}

function formatAmount(value) {
  const raw = normalizeAmountValue(value)
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

function formatAmountDisplay(value) {
  return formatAmount(value)
}

function formatAmountWithWon(value) {
  const formatted = formatAmountDisplay(value)
  return formatted ? `${formatted}원` : '-'
}

function parseAmount(value) {
  const raw = normalizeAmountValue(value)
  return raw ? Number(raw) : 0
}

function parseYearValue(value) {
  const year = safeString(value).replace(/[^\d]/g, '').slice(0, 4)
  return year ? Number(year) : null
}

function toDbDate(value) {
  const str = safeString(value).trim()
  return str || null
}

function normalizeContractPayload(item) {
  return {
    year: parseYearValue(item.year),
    segment: safeString(item.segment).trim(),
    refNo: safeString(item.refNo).trim(),
    contractNo: safeString(item.contractNo).trim(),
    client: safeString(item.client).trim(),
    department: safeString(item.department).trim(),
    contractMethod: safeString(item.contractMethod).trim(),
    contractType: safeString(item.contractType).trim(),
    identNo: safeString(item.identNo).trim(),
    contractDate: toDbDate(item.contractDate),
    dueDate: toDbDate(item.dueDate),
    projectName: safeString(item.projectName).trim(),
    amount: parseAmount(item.amount),
    salesOwner: safeString(item.salesOwner).trim(),
    pm: safeString(item.pm).trim(),
    note: safeString(item.note).trim(),
  }
}

function normalizeEditValue(key, value) {
  if (key === 'amount') return parseAmount(value)
  if (key === 'year') return parseYearValue(value)
  if (key === 'contractDate' || key === 'dueDate') return toDbDate(value)
  return safeString(value).trim()
}

function normalizeKey(value) {
  return safeString(value).trim().replace(/\s+/g, '').toLowerCase()
}

function getContractDuplicateKey(item) {
  const projectKey = normalizeKey(item.projectName)
  if (projectKey) return `project:${projectKey}`

  const contractKey = normalizeKey(item.contractNo)
  if (contractKey) return `contract:${contractKey}`

  return ''
}

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

function getOptions(items, key) {
  return [
    ALL_OPTION,
    ...new Set(
      items
        .map((item) => safeString(item[key]).trim())
        .filter(Boolean)
        .filter((value) => !HIDDEN_MANAGER_VALUES.includes(value))
    ),
  ]
}

function getYearLabel(value) {
  if (value === ALL_OPTION) return value
  const match = safeString(value).match(/\d{4}/)
  return match ? match[0] : safeString(value)
}

function sortContracts(items) {
  return [...items].sort((a, b) => {
    const aDate = a.contractDate || a.dueDate || '1900-01-01'
    const bDate = b.contractDate || b.dueDate || '1900-01-01'
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
}

function getDateDiffFromToday(dateString) {
  const targetDate = parseDateOnly(dateString)
  if (!targetDate) return null

  const today = new Date()
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((targetDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
}

function escapeHtml(text) {
  return safeString(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function readSharedAuthSession() {
  try {
    const isAuthenticated = sessionStorage.getItem(CONTRACT_SHARED_AUTH_KEY) === 'true'
    const expiresAt = Number(sessionStorage.getItem(CONTRACT_SHARED_EXPIRES_AT_KEY) || 0)

    if (isAuthenticated && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return {
        isAuthenticated: true,
        expiresAt,
      }
    }
  } catch {
    // no-op
  }

  try {
    sessionStorage.removeItem(CONTRACT_SHARED_AUTH_KEY)
    sessionStorage.removeItem(CONTRACT_SHARED_EXPIRES_AT_KEY)
  } catch {
    // no-op
  }

  return {
    isAuthenticated: false,
    expiresAt: 0,
  }
}

function writeSharedAuthSession(expiresAt) {
  try {
    sessionStorage.setItem(CONTRACT_SHARED_AUTH_KEY, 'true')
    sessionStorage.setItem(CONTRACT_SHARED_EXPIRES_AT_KEY, String(expiresAt))
  } catch {
    // no-op
  }
}

function clearSharedAuthSession() {
  try {
    sessionStorage.removeItem(CONTRACT_SHARED_AUTH_KEY)
    sessionStorage.removeItem(CONTRACT_SHARED_EXPIRES_AT_KEY)
    clearAuthToken()
  } catch {
    // no-op
  }
}

function normalizeDocumentRow(item) {
  return {
    id: safeString(item.id),
    docDate: safeString(item.docDate ?? item.docdate),
    docNo: safeString(item.docNo ?? item.docno),
    senderReceiver: safeString(item.senderReceiver ?? item.senderreceiver),
    title: safeString(item.title),
    method: safeString(item.method),
    writer: safeString(item.writer),
    note: safeString(item.note),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isDocumentRowEmpty(row) {
  return DOCUMENT_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

function toDocumentPayload(row, timestamp) {
  return {
    docDate: toDbDate(row.docDate),
    docNo: safeString(row.docNo).trim(),
    senderReceiver: safeString(row.senderReceiver).trim(),
    title: safeString(row.title).trim(),
    method: safeString(row.method).trim(),
    writer: safeString(row.writer).trim(),
    note: safeString(row.note).trim(),
    updatedAt: timestamp,
  }
}

function normalizeSalesRow(item) {
  return {
    id: safeString(item.id),
    registerDate: safeString(item.registerDate ?? item.registerdate),
    client: safeString(item.client),
    projectName: safeString(item.projectName ?? item.projectname),
    projectAmount: safeString(item.projectAmount ?? item.projectamount),
    projectCategory: safeString(item.projectCategory ?? item.projectcategory),
    projectStage: safeString(item.projectStage ?? item.projectstage),
    manager: safeString(item.manager),
    projectType: safeString(item.projectType ?? item.projecttype),
    department: safeString(item.department),
    detail: safeString(item.detail),
    source: safeString(item.source),
    salesNote: safeString(item.salesNote ?? item.salesnote),
    actionRequest: safeString(item.actionRequest ?? item.actionrequest),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isSalesRowEmpty(row) {
  return SALES_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

function toSalesPayload(row, timestamp) {
  return {
    registerDate: toDbDate(row.registerDate),
    client: safeString(row.client).trim(),
    projectName: safeString(row.projectName).trim(),
    projectAmount: parseAmount(row.projectAmount),
    projectCategory: safeString(row.projectCategory).trim(),
    projectStage: safeString(row.projectStage).trim(),
    manager: safeString(row.manager).trim(),
    projectType: safeString(row.projectType).trim(),
    department: safeString(row.department).trim(),
    detail: safeString(row.detail).trim(),
    source: safeString(row.source).trim(),
    salesNote: safeString(row.salesNote).trim(),
    actionRequest: safeString(row.actionRequest).trim(),
    updatedAt: timestamp,
  }
}

function normalizeBudgetRow(item) {
  return {
    id: safeString(item.id),
    registerDate: safeString(item.registerDate ?? item.registerdate),
    localGov: safeString(item.localGov ?? item.localgov),
    projectName: safeString(item.projectName ?? item.projectname),
    budgetAmount: safeString(item.budgetAmount ?? item.budgetamount),
    manager: safeString(item.manager),
    projectStage: safeString(item.projectStage ?? item.projectstage),
    department: safeString(item.department),
    detail: safeString(item.detail),
    salesMatch: safeString(item.salesMatch ?? item.salesmatch),
    note: safeString(item.note),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isBudgetRowEmpty(row) {
  return BUDGET_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

function toBudgetPayload(row, timestamp) {
  return {
    registerDate: toDbDate(row.registerDate),
    localGov: safeString(row.localGov).trim(),
    projectName: safeString(row.projectName).trim(),
    budgetAmount: parseAmount(row.budgetAmount),
    manager: safeString(row.manager).trim(),
    projectStage: safeString(row.projectStage).trim(),
    department: safeString(row.department).trim(),
    detail: safeString(row.detail).trim(),
    salesMatch: safeString(row.salesMatch).trim(),
    note: safeString(row.note).trim(),
    updatedAt: timestamp,
  }
}

function normalizeDiscoveryRow(item) {
  return {
    id: safeString(item.id),
    permitDate: safeString(item.permitDate ?? item.permitdate),
    checkStatus: safeString(item.checkStatus ?? item.checkstatus),
    salesTarget: safeString(item.salesTarget ?? item.salestarget),
    projectCategory: safeString(item.projectCategory ?? item.projectcategory),
    localGov: safeString(item.localGov ?? item.localgov),
    client: safeString(item.client),
    projectName: safeString(item.projectName ?? item.projectname),
    projectAmount: safeString(item.projectAmount ?? item.projectamount),
    completionPeriod: safeString(item.completionPeriod ?? item.completionperiod),
    manager: safeString(item.manager),
    note: safeString(item.note),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isDiscoveryRowEmpty(row) {
  return DISCOVERY_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

function toDiscoveryPayload(row, timestamp) {
  return {
    permitDate: toDbDate(row.permitDate),
    checkStatus: safeString(row.checkStatus).trim(),
    salesTarget: safeString(row.salesTarget).trim(),
    projectCategory: safeString(row.projectCategory).trim(),
    localGov: safeString(row.localGov).trim(),
    client: safeString(row.client).trim(),
    projectName: safeString(row.projectName).trim(),
    projectAmount: parseAmount(row.projectAmount),
    completionPeriod: safeString(row.completionPeriod).trim(),
    manager: safeString(row.manager).trim(),
    note: safeString(row.note).trim(),
    updatedAt: timestamp,
  }
}

function normalizeExcludedRow(item) {
  return {
    id: safeString(item.id),
    orderNo: safeString(item.orderNo ?? item.orderno),
    writeDate: safeString(item.writeDate ?? item.writedate),
    openDate: safeString(item.openDate ?? item.opendate),
    category: safeString(item.category),
    keyword: safeString(item.keyword),
    writer: safeString(item.writer),
    projectName: safeString(item.projectName ?? item.projectname),
    client: safeString(item.client),
    projectAmount: safeString(item.projectAmount ?? item.projectamount),
    exclusionReason: safeString(item.exclusionReason ?? item.exclusionreason),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isExcludedRowEmpty(row) {
  return EXCLUDED_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

function toExcludedPayload(row, timestamp) {
  return {
    orderNo: safeString(row.orderNo).trim(),
    writeDate: toDbDate(row.writeDate),
    openDate: toDbDate(row.openDate),
    category: safeString(row.category).trim(),
    keyword: safeString(row.keyword).trim(),
    writer: safeString(row.writer).trim(),
    projectName: safeString(row.projectName).trim(),
    client: safeString(row.client).trim(),
    projectAmount: parseAmount(row.projectAmount),
    exclusionReason: safeString(row.exclusionReason).trim(),
    updatedAt: timestamp,
  }
}

function getRegistryCellSearchValue(column, row) {
  if (column.type === 'amount') {
    const raw = normalizeAmountValue(row[column.key])
    if (!raw) return ''
    return `${raw} ${formatAmountDisplay(raw)}`.toLowerCase()
  }

  return safeString(row[column.key]).trim().toLowerCase()
}

function matchesRegistrySearch(row, columns, keyword) {
  const normalizedKeyword = safeString(keyword).trim().toLowerCase()
  if (!normalizedKeyword || row.isDraft) return true

  return columns.some((column) =>
    getRegistryCellSearchValue(column, row).includes(normalizedKeyword)
  )
}

function getRegistryCellSignatureValue(column, row) {
  if (column.type === 'amount') {
    return normalizeAmountValue(row[column.key])
  }

  if (column.type === 'date') {
    return toDbDate(row[column.key]) ?? ''
  }

  return safeString(row[column.key]).trim()
}

function getRegistryRowSignature(row, columns) {
  return columns
    .map((column) => `${column.key}:${getRegistryCellSignatureValue(column, row)}`)
    .join('|')
}

function getRegistryRowYear(row, dateKey) {
  const value = safeString(row[dateKey]).trim()
  const parsedDate = parseDateOnly(value)
  if (parsedDate) {
    return String(parsedDate.getFullYear())
  }

  const matchedYear = value.match(/\d{4}/)
  return matchedYear ? matchedYear[0] : '미분류'
}

function groupRegistryRowsByYear(rows, dateKey) {
  const groupMap = new Map()
  const orderedGroups = []

  rows.forEach((row) => {
    const year = getRegistryRowYear(row, dateKey)
    if (!groupMap.has(year)) {
      const nextGroup = { year, items: [] }
      groupMap.set(year, nextGroup)
      orderedGroups.push(nextGroup)
    }

    groupMap.get(year).items.push(row)
  })

  return orderedGroups.sort((a, b) => {
    const aNumeric = /^\d{4}$/.test(a.year)
    const bNumeric = /^\d{4}$/.test(b.year)

    if (aNumeric && bNumeric) {
      return Number(b.year) - Number(a.year)
    }

    if (aNumeric) return -1
    if (bNumeric) return 1
    return compareKoreanText(a.year, b.year)
  })
}

function getLatestRegistryYear(groups) {
  const numericYears = groups
    .map((group) => group.year)
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => Number(b) - Number(a))

  return numericYears[0] || groups[groups.length - 1]?.year || ''
}

function isRegistryYearOpen(openState, year, defaultYear) {
  return Object.prototype.hasOwnProperty.call(openState, year)
    ? openState[year]
    : year === defaultYear
}

function isAllVisibleRegistryRowsSelected(rows, selectedIds) {
  const visibleIds = rows.map((row) => row.id)
  return visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
}

function getRegistryPlainDisplayValue(row, column) {
  if (column.type === 'amount') {
    return formatAmountDisplay(row[column.key]) || '-'
  }

  return safeString(row[column.key]).trim() || '-'
}

function parseExternalScheduleContent(value) {
  const raw = safeString(value).trim()
  if (!raw) {
    return {
      content: '',
      destination: '',
    }
  }

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        content: safeString(parsed.content).trim(),
        destination: safeString(parsed.destination).trim(),
      }
    }
  } catch {}

  return {
    content: raw,
    destination: '',
  }
}

function serializeExternalScheduleContent(content, destination) {
  const normalizedContent = safeString(content).trim()
  const normalizedDestination = safeString(destination).trim()

  if (!normalizedContent && !normalizedDestination) {
    return ''
  }

  return JSON.stringify({
    content: normalizedContent,
    destination: normalizedDestination,
  })
}

function getFixedWorkReportManager(section, orderIndex) {
  const normalizedOrderIndex = Number(orderIndex || 1)

  if (section === WORK_REPORT_SECTION_KEYS.di) {
    return WORK_REPORT_DI_MANAGERS[normalizedOrderIndex - 1] || ''
  }

  if (section === WORK_REPORT_SECTION_KEYS.road) {
    return WORK_REPORT_ROAD_MANAGERS[normalizedOrderIndex - 1] || ''
  }

  return ''
}

function normalizeWorkReportRow(item) {
  const section = safeString(item.section ?? item.category)
  const orderIndex = Number(item.order_index ?? item.orderIndex ?? 1)
  const parsedExternalContent =
    section === WORK_REPORT_SECTION_KEYS.external
      ? parseExternalScheduleContent(item.content)
      : { content: safeString(item.content), destination: '' }

  return {
    id: safeString(item.id),
    date: safeString(item.date ?? item.reportDate ?? item.reportdate ?? item.weekStartDate ?? item.weekstartdate),
    user: safeString(item.user ?? item.assignee).trim() || getFixedWorkReportManager(section, orderIndex),
    section,
    content: parsedExternalContent.content,
    destination: parsedExternalContent.destination,
    orderIndex,
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isWorkReportRowEmpty(row) {
  const normalizedSection = safeString(row.section).trim()
  if (normalizedSection === WORK_REPORT_SECTION_KEYS.external) {
    return (
      safeString(row.user).trim() === '' &&
      safeString(row.content).trim() === '' &&
      safeString(row.destination).trim() === ''
    )
  }

  if (
    normalizedSection === WORK_REPORT_SECTION_KEYS.di ||
    normalizedSection === WORK_REPORT_SECTION_KEYS.road
  ) {
    return safeString(row.content).trim() === ''
  }

  return safeString(row.content).trim() === ''
}

function toWorkReportPayload(row, timestamp, includeLegacyColumns = false) {
  const meta = buildWorkReportWeekMeta(row.date || new Date())
  const resolvedUser =
    safeString(row.user).trim() || getFixedWorkReportManager(safeString(row.section).trim(), row.orderIndex)
  const payload = {
    date: toDbDate(row.date),
    user: resolvedUser,
    section: safeString(row.section).trim(),
    content:
      safeString(row.section).trim() === WORK_REPORT_SECTION_KEYS.external
        ? serializeExternalScheduleContent(row.content, row.destination)
        : safeString(row.content).trim(),
    order_index: Number(row.orderIndex || 1),
    updatedAt: timestamp,
  }

  if (!includeLegacyColumns) {
    return payload
  }

  return {
    ...payload,
    reportDate: toDbDate(row.date),
    weekStartDate: meta.weekStartDate,
    reportYear: meta.year,
    reportMonth: meta.month,
    weekNumber: meta.weekNumber,
    assignee: resolvedUser,
    category: safeString(row.section).trim(),
    team: '',
  }
}

function getSalesStageClassName(stage) {
  return SALES_STAGE_TONE_MAP[safeString(stage).trim()]?.className || 'sales-stage-badge'
}

function getSalesStageOptionStyle(stage) {
  return undefined
}

function getDiscoveryCategoryClassName(category) {
  return (
    DISCOVERY_CATEGORY_TONE_MAP[safeString(category).trim()] || 'discovery-category-badge'
  )
}

function getExcludedBadgeStyle(toneMap, value) {
  const tone = toneMap[safeString(value).trim()]
  if (!tone) return null

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    padding: '0 10px',
    borderRadius: 999,
    border: `1px solid ${tone.borderColor}`,
    background: tone.background,
    color: tone.color,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  }
}

function getDdayText(dateString) {
  const diff = getDateDiffFromToday(dateString)
  if (diff === null) return ''
  if (diff < 0) return '준공'
  if (diff === 0) return 'D-Day'
  return `D-${diff}`
}

function formatPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  if (value >= 99.95) return '100%'
  return `${value.toFixed(1)}%`
}

function getMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

function getCategory(contract) {
  const type = safeString(contract.contractType).trim()
  if (type === '55121903') return '전광판'
  if (['43211514', '43211507', '43211902'].includes(type)) return 'BIT'
  if (type === '도로사업') return '도로사업'
  if (type === '유지보수') return '유지보수'
  return null
}

function buildDashboardSummary(contracts) {
  const byYear = {}

  contracts.forEach((item) => {
    const year = item.year || '미분류'
    const category = getCategory(item)
    if (!category) return

    if (!byYear[year]) {
      byYear[year] = {}
      DASHBOARD_CATEGORY_ORDER.forEach((name) => {
        byYear[year][name] = { count: 0, amount: 0 }
      })
    }

    byYear[year][category].count += 1
    byYear[year][category].amount += parseAmount(item.amount)
  })

  const years = Object.keys(byYear)
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => {
      const totalAmount = DASHBOARD_CATEGORY_ORDER.reduce(
        (sum, name) => sum + byYear[year][name].amount,
        0
      )

      return {
        year,
        totalAmount,
        items: DASHBOARD_CATEGORY_ORDER.map((name) => {
          const amount = byYear[year][name].amount
          const ratio = totalAmount > 0 ? (amount / totalAmount) * 100 : 0

          return {
            name,
            count: byYear[year][name].count,
            amount,
            ratio,
          }
        }),
      }
    })

  return { years }
}

function getPersistedRows(rows) {
  return rows.filter((row) => !row.isDraft)
}

function logApiFetchError(label, table, error) {
  console.error(`[${label}] API fetch failed`, {
    table,
    message: error?.message ?? safeString(error),
    code: error?.code ?? '',
    details: error?.details ?? '',
    hint: error?.hint ?? '',
    error,
  })
}

function logApiOperationError(label, error) {
  console.error(`[${label}] API operation failed`, {
    message: error?.message ?? safeString(error),
    code: error?.code ?? '',
    details: error?.details ?? '',
    hint: error?.hint ?? '',
    error,
  })
}

function getDashboardStatusCounts(rows, statusKey) {
  return DASHBOARD_STATUS_LABELS.map((status) => ({
    status,
    count: rows.filter((row) => safeString(row[statusKey]).trim() === status).length,
  }))
}

function getDashboardDisplayDate(value) {
  const raw = safeString(value).trim()
  return raw ? raw.slice(0, 10) : '-'
}

function getDashboardSortTime(row, dateKey) {
  const primaryDate = parseDateOnly(row[dateKey])
  if (primaryDate) return primaryDate.getTime()

  const createdDate = new Date(row.createdAt || row.updatedAt || 0)
  return Number.isNaN(createdDate.getTime()) ? 0 : createdDate.getTime()
}

function getDashboardRecentItems(rows, config) {
  return [...rows]
    .sort((a, b) => getDashboardSortTime(b, config.dateKey) - getDashboardSortTime(a, config.dateKey))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      date: getDashboardDisplayDate(row[config.dateKey] || row.createdAt),
      title: config.getTitle(row),
      meta: config.getMeta(row),
    }))
}

function App() {
  const initialSharedAuth = readSharedAuthSession()
  const [contracts, setContracts] = useState([])
  const [documents, setDocuments] = useState([])
  const [salesRows, setSalesRows] = useState([])
  const [budgetRows, setBudgetRows] = useState([])
  const [discoveryRows, setDiscoveryRows] = useState([])
  const [excludedRows, setExcludedRows] = useState([])
  const [workReportRows, setWorkReportRows] = useState([])
  const [menu, setMenu] = useState('dashboard')
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem(ADMIN_SESSION_KEY) === 'true')
  const [openDashboardYears, setOpenDashboardYears] = useState({})
  const [openContractYears, setOpenContractYears] = useState({})
  const [selectedContractIds, setSelectedContractIds] = useState([])
  const [openBudgetYears, setOpenBudgetYears] = useState({})
  const [openDiscoveryYears, setOpenDiscoveryYears] = useState({})
  const [openExcludedYears, setOpenExcludedYears] = useState({})
  const [openDocumentYears, setOpenDocumentYears] = useState({})
  const [openSalesYears, setOpenSalesYears] = useState({})
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [editingDocumentIds, setEditingDocumentIds] = useState([])
  const [documentEditSnapshots, setDocumentEditSnapshots] = useState({})
  const [isSavingDocuments, setIsSavingDocuments] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [selectedSalesIds, setSelectedSalesIds] = useState([])
  const [editingSalesIds, setEditingSalesIds] = useState([])
  const [salesEditSnapshots, setSalesEditSnapshots] = useState({})
  const [isSavingSales, setIsSavingSales] = useState(false)
  const [salesSearch, setSalesSearch] = useState('')
  const [salesFilters, setSalesFilters] = useState({
    projectCategory: '',
    manager: '',
    projectStage: '',
  })
  const [selectedBudgetIds, setSelectedBudgetIds] = useState([])
  const [editingBudgetIds, setEditingBudgetIds] = useState([])
  const [budgetEditSnapshots, setBudgetEditSnapshots] = useState({})
  const [isSavingBudget, setIsSavingBudget] = useState(false)
  const [budgetSearch, setBudgetSearch] = useState('')
  const [budgetFilters, setBudgetFilters] = useState({
    manager: '',
    projectStage: '',
  })
  const [selectedDiscoveryIds, setSelectedDiscoveryIds] = useState([])
  const [editingDiscoveryIds, setEditingDiscoveryIds] = useState([])
  const [discoveryEditSnapshots, setDiscoveryEditSnapshots] = useState({})
  const [isSavingDiscovery, setIsSavingDiscovery] = useState(false)
  const [discoverySearch, setDiscoverySearch] = useState('')
  const [discoveryFilters, setDiscoveryFilters] = useState({
    manager: '',
    projectCategory: '',
  })
  const [selectedExcludedIds, setSelectedExcludedIds] = useState([])
  const [editingExcludedIds, setEditingExcludedIds] = useState([])
  const [excludedEditSnapshots, setExcludedEditSnapshots] = useState({})
  const [isSavingExcluded, setIsSavingExcluded] = useState(false)
  const [excludedSearch, setExcludedSearch] = useState('')
  const [excludedFilters, setExcludedFilters] = useState({
    category: '',
    keyword: '',
    writer: '',
  })
  const [editingWorkCellKey, setEditingWorkCellKey] = useState('')
  const [editingWorkCellData, setEditingWorkCellData] = useState(null)
  const [workReportDrafts, setWorkReportDrafts] = useState({})
  const [isSavingWorkReports, setIsSavingWorkReports] = useState(false)
  const [generatedWorkWeeks, setGeneratedWorkWeeks] = useState([])
  const [selectedWorkWeek, setSelectedWorkWeek] = useState(() =>
    buildWorkReportWeekMeta(new Date()).weekStartDate
  )
  const [workReportFilters, setWorkReportFilters] = useState({
    assignee: '',
  })
  const [isExcludedGuideCollapsed, setIsExcludedGuideCollapsed] = useState(true)
  const [isDocumentGuideCollapsed, setIsDocumentGuideCollapsed] = useState(true)
  const [manualEvents, setManualEvents] = useState(() => {
    const saved = localStorage.getItem(CALENDAR_STORAGE_KEY)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return []
      }
    }
    return []
  })
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    year: ALL_OPTION,
    contractMethod: ALL_OPTION,
    contractType: ALL_OPTION,
    salesOwner: ALL_OPTION,
    pm: ALL_OPTION,
  })
  const [isAddingRow, setIsAddingRow] = useState(false)
  const [newRow, setNewRow] = useState({ ...emptyContract })
  const [editingCell, setEditingCell] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [eventForm, setEventForm] = useState({ ...emptyEvent })
  const [monthSearch, setMonthSearch] = useState('')
  const [monthTypeFilter, setMonthTypeFilter] = useState(ALL_OPTION)
  const [isCalendarGridCollapsed, setIsCalendarGridCollapsed] = useState(false)
  const [isMonthListCollapsed, setIsMonthListCollapsed] = useState(false)
  const [detailModal, setDetailModal] = useState(null)
  const [isAppAuthenticated, setIsAppAuthenticated] = useState(initialSharedAuth.isAuthenticated)
  const [sharedSessionExpiresAt, setSharedSessionExpiresAt] = useState(initialSharedAuth.expiresAt)
  const [remainingTime, setRemainingTime] = useState(
    initialSharedAuth.isAuthenticated ? Math.max(0, initialSharedAuth.expiresAt - Date.now()) : 0
  )
  const [showSessionWarning, setShowSessionWarning] = useState(
    initialSharedAuth.isAuthenticated &&
      initialSharedAuth.expiresAt - Date.now() > 0 &&
      initialSharedAuth.expiresAt - Date.now() <= CONTRACT_SHARED_WARNING_MS
  )
  const [appPasswordInput, setAppPasswordInput] = useState('')
  const [appLoginError, setAppLoginError] = useState('')
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false)
  const [adminPasswordInput, setAdminPasswordInput] = useState('')
  const [adminLoginError, setAdminLoginError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [registryUploadTarget, setRegistryUploadTarget] = useState('')

  const fileInputRef = useRef(null)
  const registryUploadInputRef = useRef(null)
  const registryUploadTargetRef = useRef('')
  const registryUploadInProgressRef = useRef(false)

  const fetchContracts = async () => {
    try {
      const rows = await contractsApi.list()
      setContracts(rows)
      return rows
    } catch (error) {
      console.error('[계약현황] API fetch failed', error)
      setContracts([])
      return []
    }
  }

  const fetchDocuments = async (preserveDrafts = true) => {
    try {
      const rows = await documentRegisterApi.list()
      setDocuments((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeDocumentRow), ...draftRows]
      })
      setSelectedDocumentIds([])
      return rows
    } catch (error) {
      console.error('[문서수발신대장] API fetch failed', error)
      setDocuments([])
      setSelectedDocumentIds([])
      return []
    }
  }

  const fetchSalesRows = async (preserveDrafts = true) => {
    try {
      const rows = await salesRegisterApi.list()
      setSalesRows((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeSalesRow), ...draftRows]
      })
      setSelectedSalesIds([])
      return rows
    } catch (error) {
      console.error('[영업관리대장] API fetch failed', error)
      setSalesRows([])
      setSelectedSalesIds([])
      return []
    }
  }

  const fetchBudgetRows = async (preserveDrafts = true) => {
    try {
      const rows = await budgetProgressApi.list()
      setBudgetRows((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeBudgetRow), ...draftRows]
      })
      setSelectedBudgetIds([])
      return rows
    } catch (error) {
      console.error('[본예산 진행정보] API fetch failed', error)
      setBudgetRows([])
      setSelectedBudgetIds([])
      return []
    }
  }

  const fetchDiscoveryRows = async (preserveDrafts = true) => {
    try {
      const rows = await projectDiscoveryApi.list()
      setDiscoveryRows((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeDiscoveryRow), ...draftRows]
      })
      setSelectedDiscoveryIds([])
      return rows
    } catch (error) {
      console.error('[건축정보] API fetch failed', error)
      setDiscoveryRows([])
      setSelectedDiscoveryIds([])
      return []
    }
  }

  const fetchExcludedRows = async (preserveDrafts = true) => {
    try {
      const rows = await excludedProjectsApi.list()
      setExcludedRows((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeExcludedRow), ...draftRows]
      })
      setSelectedExcludedIds([])
      return rows
    } catch (error) {
      console.error('[사업검색이력] API fetch failed', error)
      setExcludedRows([])
      setSelectedExcludedIds([])
      return []
    }
  }

  const fetchWorkReportRows = async () => {
    try {
      const rows = await weeklyWorkReportsApi.list()
      setWorkReportRows(rows.map(normalizeWorkReportRow))
      return rows
    } catch (error) {
      console.error('[일일/주간업무보고서] API fetch failed', error)
      setWorkReportRows([])
      return []
    }
  }

  const saveContractToApi = async (formData) => {
    const payload = normalizeContractPayload(formData)

    try {
      const data = await contractsApi.create(payload)
      return data ? [data] : []
    } catch (error) {
      logApiOperationError('계약현황 저장', error)
      return null
    }
  }

  useEffect(() => {
    fetchContracts()
  }, [])

  useEffect(() => {
    if (menu === 'workReports') {
      fetchWorkReportRows(true)
    }
  }, [menu])

  useEffect(() => {
    if (menu === 'documents') {
      fetchDocuments(true)
    }
  }, [menu])

  useEffect(() => {
    if (menu === 'sales') {
      fetchSalesRows(true)
    }
  }, [menu])

  useEffect(() => {
    if (menu === 'budget') {
      fetchBudgetRows(true)
    }
  }, [menu])

  useEffect(() => {
    if (menu === 'discovery') {
      fetchDiscoveryRows(true)
    }
  }, [menu])

  useEffect(() => {
    if (menu === 'excluded') {
      fetchExcludedRows(true)
    }
  }, [menu])

  useEffect(() => {
    if (menu === 'dashboard') {
      fetchContracts()
      fetchDocuments(false)
      fetchSalesRows(false)
      fetchBudgetRows(false)
      fetchDiscoveryRows(false)
      fetchExcludedRows(false)
      fetchWorkReportRows(false)
    }
  }, [menu])

  useEffect(() => {
    if (!toastMessage) return undefined

    const timeoutId = window.setTimeout(() => {
      setToastMessage('')
    }, 2600)

    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  useEffect(() => {
    if (!isAppAuthenticated || !sharedSessionExpiresAt) return undefined

    const checkSession = () => {
      const now = Date.now()
      const nextRemainingTime = Math.max(0, sharedSessionExpiresAt - now)
      setRemainingTime(nextRemainingTime)
      setShowSessionWarning(
        nextRemainingTime > 0 && nextRemainingTime <= CONTRACT_SHARED_WARNING_MS
      )

      if (now >= sharedSessionExpiresAt) {
        clearSharedAuthState()
      }
    }

    checkSession()
    const timer = window.setInterval(checkSession, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [isAppAuthenticated, sharedSessionExpiresAt])

  const filteredContracts = useMemo(() => {
    return sortContracts(
      contracts.filter((item) => {
        const text = [
          item.year,
          item.segment,
          item.refNo,
          item.contractNo,
          item.client,
          item.department,
          item.contractMethod,
          item.contractType,
          item.contractDate,
          item.dueDate,
          item.projectName,
          item.amount,
          item.salesOwner,
          item.pm,
          item.note,
        ]
          .join(' ')
          .toLowerCase()

        const searchMatch = text.includes(search.toLowerCase())
        const yearMatch =
          filters.year === ALL_OPTION || getYearLabel(item.year) === getYearLabel(filters.year)
        const methodMatch =
          filters.contractMethod === ALL_OPTION || item.contractMethod === filters.contractMethod
        const typeMatch =
          filters.contractType === ALL_OPTION || item.contractType === filters.contractType
        const ownerMatch =
          filters.salesOwner === ALL_OPTION || item.salesOwner === filters.salesOwner
        const pmMatch = filters.pm === ALL_OPTION || item.pm === filters.pm

        return searchMatch && yearMatch && methodMatch && typeMatch && ownerMatch && pmMatch
      })
    )
  }, [contracts, filters, search])

  const filteredTotalAmount = useMemo(
    () => filteredContracts.reduce((sum, item) => sum + parseAmount(item.amount), 0),
    [filteredContracts]
  )

  const remainingSessionMinutes = useMemo(() => {
    if (!isAppAuthenticated || !sharedSessionExpiresAt) return 0
    return Math.max(0, Math.ceil(remainingTime / (60 * 1000)))
  }, [isAppAuthenticated, remainingTime, sharedSessionExpiresAt])

  const groupedContracts = useMemo(() => {
    const groups = new Map()

    filteredContracts.forEach((item) => {
      const year = getYearLabel(item.year) || '미분류'
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year).push(item)
    })

    return [...groups.entries()]
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, items]) => ({
        year,
        items: [...items].sort((a, b) => {
          const segmentCompare = compareKoreanText(a.segment, b.segment)
          if (segmentCompare !== 0) return segmentCompare

          const aDate = a.contractDate || a.dueDate || '1900-01-01'
          const bDate = b.contractDate || b.dueDate || '1900-01-01'
          return new Date(bDate).getTime() - new Date(aDate).getTime()
        }),
      }))
  }, [filteredContracts])

  const filteredDocuments = useMemo(() => {
    return documents.filter((row) => matchesRegistrySearch(row, DOCUMENT_COLUMNS, documentSearch))
  }, [documentSearch, documents])

  const filteredSalesRows = useMemo(() => {
    return salesRows.filter((row) => {
      if (!matchesRegistrySearch(row, SALES_COLUMNS, salesSearch)) return false
      if (row.isDraft) return true
      const categoryMatch =
        !salesFilters.projectCategory || row.projectCategory === salesFilters.projectCategory
      const managerMatch = !salesFilters.manager || row.manager === salesFilters.manager
      const stageMatch = !salesFilters.projectStage || row.projectStage === salesFilters.projectStage
      return categoryMatch && managerMatch && stageMatch
    })
  }, [salesFilters.manager, salesFilters.projectCategory, salesFilters.projectStage, salesRows, salesSearch])

  const filteredBudgetRows = useMemo(() => {
    return budgetRows.filter((row) => {
      if (!matchesRegistrySearch(row, BUDGET_COLUMNS, budgetSearch)) return false
      if (row.isDraft) return true
      const managerMatch = !budgetFilters.manager || row.manager === budgetFilters.manager
      const stageMatch = !budgetFilters.projectStage || row.projectStage === budgetFilters.projectStage
      return managerMatch && stageMatch
    })
  }, [budgetFilters.manager, budgetFilters.projectStage, budgetRows, budgetSearch])

  const filteredDiscoveryRows = useMemo(() => {
    return discoveryRows.filter((row) => {
      if (!matchesRegistrySearch(row, DISCOVERY_COLUMNS, discoverySearch)) return false
      if (row.isDraft) return true
      const managerMatch = !discoveryFilters.manager || row.manager === discoveryFilters.manager
      const categoryMatch =
        !discoveryFilters.projectCategory ||
        row.projectCategory === discoveryFilters.projectCategory
      return managerMatch && categoryMatch
    })
  }, [discoveryFilters.manager, discoveryFilters.projectCategory, discoveryRows, discoverySearch])

  const filteredExcludedRows = useMemo(() => {
    return excludedRows.filter((row) => {
      if (!matchesRegistrySearch(row, EXCLUDED_COLUMNS, excludedSearch)) return false
      if (row.isDraft) return true
      const categoryMatch = !excludedFilters.category || row.category === excludedFilters.category
      const keywordMatch = !excludedFilters.keyword || row.keyword === excludedFilters.keyword
      return categoryMatch && keywordMatch
    })
  }, [excludedFilters.category, excludedFilters.keyword, excludedRows, excludedSearch])

  const groupedSalesRows = useMemo(
    () => groupRegistryRowsByYear(filteredSalesRows, 'registerDate'),
    [filteredSalesRows]
  )

  const groupedBudgetRows = useMemo(
    () => groupRegistryRowsByYear(filteredBudgetRows, 'registerDate'),
    [filteredBudgetRows]
  )

  const groupedDiscoveryRows = useMemo(
    () => groupRegistryRowsByYear(filteredDiscoveryRows, 'permitDate'),
    [filteredDiscoveryRows]
  )

  const groupedExcludedRows = useMemo(
    () => groupRegistryRowsByYear(filteredExcludedRows, 'writeDate'),
    [filteredExcludedRows]
  )

  const groupedDocumentRows = useMemo(
    () => groupRegistryRowsByYear(filteredDocuments, 'docDate'),
    [filteredDocuments]
  )

  const workReportWeekOptions = useMemo(() => {
    const weekMap = new Map()

    generatedWorkWeeks.forEach((weekStartDate) => {
      if (!weekMap.has(weekStartDate)) {
        weekMap.set(weekStartDate, buildWorkReportWeekMeta(weekStartDate))
      }
    })

    workReportRows.forEach((row) => {
      const weekStartDate = buildWorkReportWeekMeta(row.date || new Date()).weekStartDate
      if (!weekMap.has(weekStartDate)) {
        weekMap.set(weekStartDate, buildWorkReportWeekMeta(weekStartDate))
      }
    })

    if (!weekMap.has(selectedWorkWeek)) {
      weekMap.set(selectedWorkWeek, buildWorkReportWeekMeta(selectedWorkWeek))
    }

    return [...weekMap.values()].sort(
      (a, b) => new Date(b.weekStartDate).getTime() - new Date(a.weekStartDate).getTime()
    )
  }, [generatedWorkWeeks, selectedWorkWeek, workReportRows])

  const selectedWorkWeekMeta = useMemo(
    () =>
      workReportWeekOptions.find((item) => item.weekStartDate === selectedWorkWeek) ??
      buildWorkReportWeekMeta(selectedWorkWeek),
    [selectedWorkWeek, workReportWeekOptions]
  )
  const dashboardWorkReportWeekMeta = useMemo(() => {
    const currentWeekStartDate = buildWorkReportWeekMeta(new Date()).weekStartDate
    return (
      workReportWeekOptions.find((item) => item.weekStartDate === currentWeekStartDate) ??
      workReportWeekOptions[0] ??
      buildWorkReportWeekMeta(currentWeekStartDate)
    )
  }, [workReportWeekOptions])

  const selectedWorkWeekDays = useMemo(
    () => getWorkReportWeekDays(selectedWorkWeekMeta.weekStartDate),
    [selectedWorkWeekMeta.weekStartDate]
  )

  const filteredWorkReportRows = useMemo(() => {
    return workReportRows.filter((row) => {
      const rowWeekStartDate = buildWorkReportWeekMeta(row.date || new Date()).weekStartDate
      if (rowWeekStartDate !== selectedWorkWeekMeta.weekStartDate) return false
      if (
        workReportFilters.assignee &&
        safeString(row.user).trim() &&
        !safeString(row.user).toLowerCase().includes(workReportFilters.assignee.toLowerCase())
      ) {
        return false
      }
      return true
    })
  }, [
    selectedWorkWeekMeta.weekStartDate,
    workReportFilters.assignee,
    workReportRows,
  ])

  const dashboardSummary = useMemo(() => buildDashboardSummary(contracts), [contracts])
  const dashboardData = useMemo(() => {
    const persistedContracts = getPersistedRows(contracts)
    const persistedSalesRows = getPersistedRows(salesRows)
    const persistedBudgetRows = getPersistedRows(budgetRows)
    const persistedDiscoveryRows = getPersistedRows(discoveryRows)
    const persistedExcludedRows = getPersistedRows(excludedRows)
    const persistedDocuments = getPersistedRows(documents)

    return {
      overview: [
        { key: 'contracts', label: '계약현황', count: persistedContracts.length, menu: 'contracts' },
        { key: 'sales', label: '영업관리대장', count: persistedSalesRows.length, menu: 'sales' },
        { key: 'budget', label: '본예산 진행정보', count: persistedBudgetRows.length, menu: 'budget' },
        { key: 'discovery', label: '건축정보', count: persistedDiscoveryRows.length, menu: 'discovery' },
        { key: 'excluded', label: '사업검색이력', count: persistedExcludedRows.length, menu: 'excluded' },
        { key: 'documents', label: '문서수발신대장', count: persistedDocuments.length, menu: 'documents' },
      ],
      statusGroups: [
        {
          key: 'sales',
          label: '영업관리대장',
          menu: 'sales',
          items: getDashboardStatusCounts(persistedSalesRows, 'projectStage'),
        },
        {
          key: 'budget',
          label: '본예산 진행정보',
          menu: 'budget',
          items: getDashboardStatusCounts(persistedBudgetRows, 'projectStage'),
        },
        {
          key: 'excluded',
          label: '사업검색이력',
          menu: 'excluded',
          items: getDashboardStatusCounts(persistedExcludedRows, 'category'),
        },
      ],
      recentGroups: [
        {
          key: 'sales',
          label: '영업관리대장',
          menu: 'sales',
          items: getDashboardRecentItems(persistedSalesRows, {
            dateKey: 'registerDate',
            getTitle: (row) => safeString(row.projectName || row.client).trim() || '영업 항목',
            getMeta: (row) =>
              [row.client, row.manager || row.projectStage].filter(Boolean).join(' · ') || '-',
          }),
        },
        {
          key: 'budget',
          label: '본예산 진행정보',
          menu: 'budget',
          items: getDashboardRecentItems(persistedBudgetRows, {
            dateKey: 'registerDate',
            getTitle: (row) => safeString(row.projectName || row.localGov).trim() || '본예산 항목',
            getMeta: (row) =>
              [row.localGov, row.manager || row.projectStage].filter(Boolean).join(' · ') || '-',
          }),
        },
        {
          key: 'discovery',
          label: '건축정보',
          menu: 'discovery',
          items: getDashboardRecentItems(persistedDiscoveryRows, {
            dateKey: 'permitDate',
            getTitle: (row) => safeString(row.projectName || row.client).trim() || '건축정보 항목',
            getMeta: (row) =>
              [row.client, row.manager || row.salesTarget].filter(Boolean).join(' · ') || '-',
          }),
        },
        {
          key: 'excluded',
          label: '사업검색이력',
          menu: 'excluded',
          items: getDashboardRecentItems(persistedExcludedRows, {
            dateKey: 'writeDate',
            getTitle: (row) => safeString(row.projectName || row.client).trim() || '검색이력 항목',
            getMeta: (row) =>
              [row.client, row.writer || row.category].filter(Boolean).join(' · ') || '-',
          }),
        },
        {
          key: 'documents',
          label: '문서수발신대장',
          menu: 'documents',
          items: getDashboardRecentItems(persistedDocuments, {
            dateKey: 'docDate',
            getTitle: (row) => safeString(row.title || row.docNo).trim() || '문서 항목',
            getMeta: (row) =>
              [row.senderReceiver, row.writer || row.method].filter(Boolean).join(' · ') || '-',
          }),
        },
      ],
    }
  }, [budgetRows, contracts, discoveryRows, documents, excludedRows, salesRows])
  const defaultDashboardYear = dashboardSummary.years[0]?.year
  const currentRegistryYear = String(new Date().getFullYear())
  const defaultContractYear = groupedContracts.find((group) => group.year === currentRegistryYear)?.year ?? groupedContracts[0]?.year
  const defaultSalesYear = groupedSalesRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedSalesRows)
  const defaultBudgetYear = groupedBudgetRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedBudgetRows)
  const defaultDiscoveryYear = groupedDiscoveryRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedDiscoveryRows)
  const defaultExcludedYear = groupedExcludedRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedExcludedRows)
  const defaultDocumentYear = groupedDocumentRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedDocumentRows)

  const isDashboardYearOpen = (year) =>
    Object.prototype.hasOwnProperty.call(openDashboardYears, year)
      ? openDashboardYears[year]
      : year === defaultDashboardYear

  const isContractYearOpen = (year) =>
    Object.prototype.hasOwnProperty.call(openContractYears, year)
      ? openContractYears[year]
      : year === defaultContractYear

  const isSalesYearOpen = (year) =>
    isRegistryYearOpen(openSalesYears, year, defaultSalesYear)

  const isBudgetYearOpen = (year) =>
    isRegistryYearOpen(openBudgetYears, year, defaultBudgetYear)

  const isDiscoveryYearOpen = (year) =>
    isRegistryYearOpen(openDiscoveryYears, year, defaultDiscoveryYear)

  const isExcludedYearOpen = (year) =>
    isRegistryYearOpen(openExcludedYears, year, defaultExcludedYear)

  const isDocumentYearOpen = (year) =>
    isRegistryYearOpen(openDocumentYears, year, defaultDocumentYear)

  const allContractsSelected = isAllVisibleRegistryRowsSelected(filteredContracts, selectedContractIds)
  const allSalesSelected = isAllVisibleRegistryRowsSelected(filteredSalesRows, selectedSalesIds)
  const allBudgetSelected = isAllVisibleRegistryRowsSelected(filteredBudgetRows, selectedBudgetIds)
  const allDiscoverySelected = isAllVisibleRegistryRowsSelected(
    filteredDiscoveryRows,
    selectedDiscoveryIds
  )
  const allExcludedSelected = isAllVisibleRegistryRowsSelected(
    filteredExcludedRows,
    selectedExcludedIds
  )
  const allDocumentsSelected = isAllVisibleRegistryRowsSelected(filteredDocuments, selectedDocumentIds)

  const calendarItems = useMemo(() => {
    const contractDateItems = contracts
      .filter((item) => item.contractDate)
      .map((item) => ({
        id: `contract-${item.id}`,
        contractId: item.id,
        date: item.contractDate,
        text: `계약: ${item.projectName}`,
        type: 'contract',
        dday: getDdayText(item.contractDate),
        owner: item.salesOwner,
        pm: item.pm,
        contract: item,
      }))

    const dueDateItems = contracts
      .filter((item) => item.dueDate)
      .map((item) => ({
        id: `due-${item.id}`,
        contractId: item.id,
        date: item.dueDate,
        text: `준공: ${item.projectName}`,
        type: 'due',
        dday: getDdayText(item.dueDate),
        owner: item.salesOwner,
        pm: item.pm,
        contract: item,
      }))

    const extraItems = manualEvents.map((item) => ({
      id: `manual-${item.id}`,
      date: item.date,
      text: item.title,
      type: 'manual',
      owner: item.owner,
      note: item.note,
      dday: getDdayText(item.date),
      originalId: item.id,
    }))

    return [...contractDateItems, ...dueDateItems, ...extraItems]
  }, [contracts, manualEvents])

  const monthDays = useMemo(() => {
    const year = calendarCursor.getFullYear()
    const month = calendarCursor.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const lastDay = new Date(year, month + 1, 0).getDate()

    const cells = []
    for (let i = 0; i < firstDay; i += 1) cells.push(null)
    for (let i = 1; i <= lastDay; i += 1) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
    }
    return cells
  }, [calendarCursor])

  const monthEventList = useMemo(() => {
    const year = calendarCursor.getFullYear()
    const month = calendarCursor.getMonth() + 1

    return [...calendarItems]
      .filter((item) => {
        const d = parseDateOnly(item.date)
        const monthMatch = d ? d.getFullYear() === year && d.getMonth() + 1 === month : false
        const typeMatch = monthTypeFilter === ALL_OPTION || item.type === monthTypeFilter
        const searchMatch = `${item.text} ${item.owner || ''} ${item.pm || ''} ${item.note || ''}`
          .toLowerCase()
          .includes(monthSearch.toLowerCase())

        return monthMatch && typeMatch && searchMatch
      })
      .sort((a, b) => {
        const aDate = parseDateOnly(a.date)
        const bDate = parseDateOnly(b.date)
        return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0)
      })
  }, [calendarCursor, calendarItems, monthSearch, monthTypeFilter])

  const persistEvents = (next) => {
    setManualEvents(next)
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next))
  }

  const clearSharedAuthState = () => {
    clearSharedAuthSession()
    setIsAppAuthenticated(false)
    setSharedSessionExpiresAt(0)
    setRemainingTime(0)
    setShowSessionWarning(false)
    setAppPasswordInput('')
    setAppLoginError('')
    setIsAdmin(false)
    setShowAdminLoginModal(false)
    setAdminPasswordInput('')
    setAdminLoginError('')
    localStorage.removeItem(ADMIN_SESSION_KEY)
    setEditingCell(null)
    setEditingValue('')
    setIsAddingRow(false)
  }

  const requireAdmin = () => {
    if (isAdmin) return true
    alert('관리자 로그인 후 편집할 수 있습니다.')
    return false
  }

  const handleAdminLogin = () => {
    if (isAdmin) {
      setIsAdmin(false)
      localStorage.removeItem(ADMIN_SESSION_KEY)
      setShowAdminLoginModal(false)
      setAdminPasswordInput('')
      setAdminLoginError('')
      setToastMessage('일반 모드로 전환되었습니다.')
      setEditingCell(null)
      setEditingValue('')
      setIsAddingRow(false)
      return
    }

    setAdminPasswordInput('')
    setAdminLoginError('')
    setShowAdminLoginModal(true)
  }

  const closeAdminLoginModal = () => {
    setShowAdminLoginModal(false)
    setAdminPasswordInput('')
    setAdminLoginError('')
  }

  const handleAdminLoginSubmit = (e) => {
    e.preventDefault()

    if (adminPasswordInput !== ADMIN_PASSWORD) {
      setAdminLoginError('관리자 비밀번호가 올바르지 않습니다.')
      return
    }

    setIsAdmin(true)
    localStorage.setItem(ADMIN_SESSION_KEY, 'true')
    closeAdminLoginModal()
    setToastMessage('관리자 모드로 전환되었습니다.')
  }

  const handleAppLogin = async (e) => {
    e.preventDefault()
    setAppLoginError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: appPasswordInput }),
      })
      const data = await response.json().catch(() => ({}))

      if (data.auth_disabled) {
        if (appPasswordInput !== SHARED_APP_PASSWORD) {
          setAppLoginError('공용 비밀번호가 올바르지 않습니다.')
          return
        }
        clearAuthToken()
        const expiresAt = Date.now() + CONTRACT_SHARED_SESSION_DURATION_MS
        writeSharedAuthSession(expiresAt)
        setIsAppAuthenticated(true)
        setSharedSessionExpiresAt(expiresAt)
        setRemainingTime(CONTRACT_SHARED_SESSION_DURATION_MS)
        setShowSessionWarning(false)
        setAppPasswordInput('')
        return
      }

      if (!response.ok) {
        const detail = data.detail
        const message =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg || item).join(', ')
              : '로그인에 실패했습니다.'
        setAppLoginError(message)
        return
      }

      if (data.access_token) {
        setAuthToken(data.access_token)
      }

      const expiresAt = Date.now() + CONTRACT_SHARED_SESSION_DURATION_MS
      writeSharedAuthSession(expiresAt)

      setIsAppAuthenticated(true)
      setSharedSessionExpiresAt(expiresAt)
      setRemainingTime(CONTRACT_SHARED_SESSION_DURATION_MS)
      setShowSessionWarning(false)
      setAppPasswordInput('')
    } catch {
      setAppLoginError('서버에 연결할 수 없습니다. API 주소와 네트워크를 확인하세요.')
    }
  }

  useEffect(() => {
    if (!isAppAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: { ...getAuthHeaders() } })
        const data = await res.json()
        if (cancelled) return
        if (data.auth_disabled) return
        if (!data.valid) {
          clearSharedAuthState()
        }
      } catch {
        // 네트워크 오류 시 기존 세션 유지
      }
    })()
    return () => {
      cancelled = true
    }
    // 의도: 로그인 상태가 바뀔 때만 서버 토큰 유효성을 확인합니다.
  }, [isAppAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExtendLogin = () => {
    const expiresAt = Date.now() + CONTRACT_SHARED_SESSION_DURATION_MS
    writeSharedAuthSession(expiresAt)
    setSharedSessionExpiresAt(expiresAt)
    setRemainingTime(CONTRACT_SHARED_SESSION_DURATION_MS)
    setShowSessionWarning(false)
  }

  const handleAppLogout = () => {
    clearSharedAuthState()
  }

  const toggleContractYear = (year) => {
    setOpenContractYears((prev) => ({
      ...prev,
      [year]: !isContractYearOpen(year),
    }))
  }

  const toggleDashboardYear = (year) => {
    setOpenDashboardYears((prev) => ({
      ...prev,
      [year]: !isDashboardYearOpen(year),
    }))
  }

  const toggleSalesYear = (year) => {
    setOpenSalesYears((prev) => ({
      ...prev,
      [year]: !isSalesYearOpen(year),
    }))
  }

  const toggleBudgetYear = (year) => {
    setOpenBudgetYears((prev) => ({
      ...prev,
      [year]: !isBudgetYearOpen(year),
    }))
  }

  const toggleDiscoveryYear = (year) => {
    setOpenDiscoveryYears((prev) => ({
      ...prev,
      [year]: !isDiscoveryYearOpen(year),
    }))
  }

  const toggleExcludedYear = (year) => {
    setOpenExcludedYears((prev) => ({
      ...prev,
      [year]: !isExcludedYearOpen(year),
    }))
  }

  const toggleDocumentYear = (year) => {
    setOpenDocumentYears((prev) => ({
      ...prev,
      [year]: !isDocumentYearOpen(year),
    }))
  }

  const handleExcelImportClick = () => {
    if (!requireAdmin()) return
    fileInputRef.current?.click()
  }

  const handleExcelUpload = async (e) => {
    if (!requireAdmin()) {
      e.target.value = ''
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        alert('업로드할 시트를 찾을 수 없습니다.')
        return
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: true,
      })

      if (!rows.length) {
        alert('업로드할 데이터가 없습니다.')
        return
      }

      const imported = rows
        .map((row) => {
          const contractDate = excelDateToInput(
            getValueByHeader(row, ['계약일자', '계약일', '계약 날짜', '계약날짜'])
          )
          const yearFromDate = contractDate ? contractDate.slice(0, 4) : ''

          return {
            year: safeString(
              getValueByHeader(row, ['사업년도', '사업 년도', '연도', '년도'], yearFromDate)
            )
              .replace(/[^\d]/g, '')
              .slice(0, 4),
            segment: safeString(getValueByHeader(row, ['구분'])).trim(),
            refNo: safeString(
              getValueByHeader(row, ['참고번호', '참고 번호', '공고번호', '공고 번호'])
            ).trim(),
            contractNo: safeString(
              getValueByHeader(row, ['계약번호', '계약 번호', '사업번호', '사업 번호'])
            ).trim(),
            client: safeString(getValueByHeader(row, ['발주처', '수요기관'])).trim(),
            department: safeString(getValueByHeader(row, ['담당부서', '담당 부서'])).trim(),
            contractMethod: safeString(getValueByHeader(row, ['계약방식', '계약 방식'])).trim(),
            contractType: safeString(getValueByHeader(row, ['계약분류', '계약 분류'])).trim(),
            identNo: safeString(getValueByHeader(row, ['식별번호'])).trim(),
            contractDate,
            dueDate: excelDateToInput(
              getValueByHeader(row, ['준공일자', '납기일자', '납기일', '준공일'])
            ),
            projectName: safeString(
              getValueByHeader(row, ['사업명', '공사명', '과업명', '건명'])
            ).trim(),
            amount: parseAmount(
              getValueByHeader(row, ['계약금액', '계약 금액', '금액', '계약금액VAT포함'])
            ),
            salesOwner: safeString(getValueByHeader(row, ['영업담당자', '영업 담당자'])).trim(),
            pm: safeString(getValueByHeader(row, ['현장PM', '현장 PM', 'PM'])).trim(),
            note: safeString(getValueByHeader(row, ['비고', '메모', '참고사항'])).trim(),
          }
        })
        .filter((item) => item.projectName || item.contractNo || item.client)

      if (!imported.length) {
        alert('불러올 수 있는 계약 데이터가 없습니다.')
        return
      }

      const existingKeys = new Set(contracts.map(getContractDuplicateKey).filter(Boolean))
      const uniqueImported = []
      const seenImportKeys = new Set()

      imported.forEach((item) => {
        const key = getContractDuplicateKey(item)
        if (!key || existingKeys.has(key) || seenImportKeys.has(key)) return
        seenImportKeys.add(key)
        uniqueImported.push(item)
      })

      if (!uniqueImported.length) {
        alert(`엑셀에서 ${imported.length}건을 찾았지만 기존 데이터와 중복되어 추가할 신규 사업이 없습니다.`)
        return
      }

      const payload = uniqueImported.map(normalizeContractPayload)
      await contractsApi.bulkCreate(payload)

      await fetchContracts()
      alert(`엑셀 업로드 완료: 신규 ${uniqueImported.length}건 추가, 중복 ${imported.length - uniqueImported.length}건 제외`)
    } catch (error) {
      console.error('엑셀 업로드 중 오류가 발생했습니다.', error)
      alert(`엑셀 업로드 중 오류가 발생했습니다.\n${error?.message ?? error}`)
    } finally {
      e.target.value = ''
    }
  }

  const handleExcelDownload = () => {
    const rows = sortContracts(contracts).map((item) => ({
      사업년도: item.year,
      구분: item.segment,
      참고번호: item.refNo,
      계약번호: item.contractNo,
      발주처: item.client,
      담당부서: item.department,
      계약방식: item.contractMethod,
      계약분류: item.contractType,
      식별번호: item.identNo,
      계약일자: item.contractDate,
      준공일자: item.dueDate,
      사업명: item.projectName,
      계약금액: formatAmountDisplay(item.amount),
      영업담당자: item.salesOwner,
      '현장 PM': item.pm,
      비고: item.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '계약현황')

    const now = new Date()
    const filename = `계약현황_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddDocumentRow = () => {
    if (documents.some((row) => row.isDraft)) {
      setToastMessage('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }
    setDocuments((prev) => [...prev, createDocumentDraftRow()])
    setSelectedDocumentIds([])
  }

  const handleDocumentCellChange = (rowId, key, value) => {
    setDocuments((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: value,
            }
          : row
      )
    )
  }

  const startDocumentEdit = (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return
    if (documents.some((row) => row.isDraft) || (editingDocumentIds.length > 0 && !editingDocumentIds.includes(rowId))) {
      alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }

    setDocumentEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingDocumentIds([rowId])
  }

  const cancelDocumentRow = (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDocuments((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setDocuments((prev) =>
      prev.map((row) => (row.id === rowId ? documentEditSnapshots[rowId] ?? row : row))
    )
    setEditingDocumentIds((prev) => prev.filter((id) => id !== rowId))
    setDocumentEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteDocumentRow = async (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDocuments((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    const ok = window.confirm('이 문서수발신 항목을 삭제하시겠습니까?')
    if (!ok) return

    try {
      await documentRegisterApi.remove(rowId)
    } catch (error) {
      logApiOperationError('문서수발신대장 삭제', error)
      return
    }

    setEditingDocumentIds((prev) => prev.filter((id) => id !== rowId))
    setDocumentEditSnapshots((prev) => removeObjectKey(prev, rowId))
    await fetchDocuments(false)
  }

  const saveDocumentRow = async (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isDocumentRowEmpty(targetRow)) {
      alert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingDocuments(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await documentRegisterApi.create({
          ...toDocumentPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await documentRegisterApi.update(rowId, toDocumentPayload(targetRow, timestamp))
      }

      await fetchDocuments(false)
      setEditingDocumentIds((prev) => prev.filter((id) => id !== rowId))
      setDocumentEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('문서수발신대장 저장', error)
    } finally {
      setIsSavingDocuments(false)
    }
  }

  const toggleDocumentSelection = (rowId) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedDocuments = async () => {
    const validSelectedIds = selectedDocumentIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      alert('삭제할 행을 선택해주세요.')
      return
    }

    const ok = window.confirm('선택한 데이터를 삭제하시겠습니까?')
    if (!ok) return

    const persistedIds = documents
      .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
      .map((row) => row.id)
      .filter((id) => safeString(id).trim() !== '')

    if (persistedIds.length > 0) {
      const remainingDrafts = documents.filter(
        (row) => row.isDraft && !validSelectedIds.includes(row.id)
      )
      try {
        await documentRegisterApi.bulkDelete(persistedIds)
      } catch (error) {
        logApiOperationError('문서수발신대장 선택 삭제', error)
        return
      }

      setDocuments(remainingDrafts)
      setSelectedDocumentIds([])
      setEditingDocumentIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      await fetchDocuments(true)
      return
    }

    setDocuments((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
    setSelectedDocumentIds([])
    setEditingDocumentIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
  }

  const saveDocuments = async () => {
    const rowsToInsert = documents.filter((row) => row.isDraft && !isDocumentRowEmpty(row))
    const rowsToUpdate = documents.filter(
      (row) => !row.isDraft && editingDocumentIds.includes(row.id)
    )
    const hasEmptyDraftRows = documents.some((row) => row.isDraft && isDocumentRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      alert('저장할 행이 없습니다.')
      return
    }

    setIsSavingDocuments(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toDocumentPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await documentRegisterApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            documentRegisterApi.update(row.id, toDocumentPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setDocuments((prev) => prev.filter((row) => !(row.isDraft && isDocumentRowEmpty(row))))
        setSelectedDocumentIds([])
        setEditingDocumentIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchDocuments(false)
      setSelectedDocumentIds([])
      setEditingDocumentIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('문서수발신대장 일괄 저장', error)
    } finally {
      setIsSavingDocuments(false)
    }
  }

  const handleDocumentExcelDownload = () => {
    const rows = filteredDocuments.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.docDate,
      문서번호: row.docNo,
      '수신처 또는 발신처': row.senderReceiver,
      '문서명 또는 제목': row.title,
      '접수 또는 발송형태': row.method,
      '수신자 또는 작성자': row.writer,
      비고: row.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '문서수발신대장')

    const now = new Date()
    const filename = `문서수발신대장_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddSalesRow = () => {
    if (salesRows.some((row) => row.isDraft)) {
      setToastMessage('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }
    setSalesRows((prev) => [...prev, createSalesDraftRow()])
    setSelectedSalesIds([])
  }

  const handleSalesCellChange = (rowId, key, value) => {
    setSalesRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: key === 'projectAmount' ? formatAmount(value) : value,
            }
          : row
      )
    )
  }

  const startSalesEdit = (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return
    if (salesRows.some((row) => row.isDraft) || (editingSalesIds.length > 0 && !editingSalesIds.includes(rowId))) {
      alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }

    setSalesEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingSalesIds([rowId])
  }

  const cancelSalesRow = (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setSalesRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setSalesRows((prev) =>
      prev.map((row) => (row.id === rowId ? salesEditSnapshots[rowId] ?? row : row))
    )
    setEditingSalesIds((prev) => prev.filter((id) => id !== rowId))
    setSalesEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteSalesRow = async (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setSalesRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    const ok = window.confirm('이 영업관리대장 항목을 삭제하시겠습니까?')
    if (!ok) return

    try {
      await salesRegisterApi.remove(rowId)
    } catch (error) {
      logApiOperationError('영업관리대장 삭제', error)
      return
    }

    setEditingSalesIds((prev) => prev.filter((id) => id !== rowId))
    setSalesEditSnapshots((prev) => removeObjectKey(prev, rowId))
    await fetchSalesRows(false)
  }

  const saveSalesRow = async (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isSalesRowEmpty(targetRow)) {
      alert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingSales(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await salesRegisterApi.create({
          ...toSalesPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await salesRegisterApi.update(rowId, toSalesPayload(targetRow, timestamp))
      }

      await fetchSalesRows(false)
      setEditingSalesIds((prev) => prev.filter((id) => id !== rowId))
      setSalesEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('영업관리대장 저장', error)
    } finally {
      setIsSavingSales(false)
    }
  }

  const toggleSalesSelection = (rowId) => {
    setSelectedSalesIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedSalesRows = async () => {
    const validSelectedIds = selectedSalesIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      alert('삭제할 행을 선택해주세요.')
      return
    }

    const ok = window.confirm('선택한 데이터를 삭제하시겠습니까?')
    if (!ok) return

    const persistedIds = salesRows
      .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
      .map((row) => row.id)
      .filter((id) => safeString(id).trim() !== '')

    if (persistedIds.length > 0) {
      const remainingDrafts = salesRows.filter(
        (row) => row.isDraft && !validSelectedIds.includes(row.id)
      )
      try {
        await salesRegisterApi.bulkDelete(persistedIds)
      } catch (error) {
        logApiOperationError('영업관리대장 선택 삭제', error)
        return
      }

      setSalesRows(remainingDrafts)
      setSelectedSalesIds([])
      setEditingSalesIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      await fetchSalesRows(true)
      return
    }

    setSalesRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
    setSelectedSalesIds([])
    setEditingSalesIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
  }

  const saveSalesRows = async () => {
    const rowsToInsert = salesRows.filter((row) => row.isDraft && !isSalesRowEmpty(row))
    const rowsToUpdate = salesRows.filter((row) => !row.isDraft && editingSalesIds.includes(row.id))
    const hasEmptyDraftRows = salesRows.some((row) => row.isDraft && isSalesRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      alert('저장할 행이 없습니다.')
      return
    }

    setIsSavingSales(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toSalesPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await salesRegisterApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            salesRegisterApi.update(row.id, toSalesPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setSalesRows((prev) => prev.filter((row) => !(row.isDraft && isSalesRowEmpty(row))))
        setSelectedSalesIds([])
        setEditingSalesIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchSalesRows(false)
      setSelectedSalesIds([])
      setEditingSalesIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('영업관리대장 일괄 저장', error)
    } finally {
      setIsSavingSales(false)
    }
  }

  const handleSalesExcelDownload = () => {
    const rows = filteredSalesRows.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.registerDate,
      발주처: row.client,
      프로젝트: row.projectName,
      사업금액: formatAmountDisplay(row.projectAmount),
      사업구분: row.projectCategory,
      담당자: row.manager,
      상태: row.projectStage,
      담당부서: row.department,
      세부내용: row.detail,
      출처: row.source,
      영업매칭: row.salesNote,
      '영업 요청사항': row.actionRequest,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '영업관리대장')

    const now = new Date()
    const filename = `영업관리대장_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddBudgetRow = () => {
    if (budgetRows.some((row) => row.isDraft)) {
      setToastMessage('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }
    setBudgetRows((prev) => [...prev, createBudgetDraftRow()])
    setSelectedBudgetIds([])
  }

  const handleBudgetCellChange = (rowId, key, value) => {
    setBudgetRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: key === 'budgetAmount' ? formatAmount(value) : value,
            }
          : row
      )
    )
  }

  const startBudgetEdit = (rowId) => {
    const targetRow = budgetRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return
    if (budgetRows.some((row) => row.isDraft) || (editingBudgetIds.length > 0 && !editingBudgetIds.includes(rowId))) {
      alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }

    setBudgetEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingBudgetIds([rowId])
  }

  const cancelBudgetRow = (rowId) => {
    const targetRow = budgetRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setBudgetRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setBudgetRows((prev) =>
      prev.map((row) => (row.id === rowId ? budgetEditSnapshots[rowId] ?? row : row))
    )
    setEditingBudgetIds((prev) => prev.filter((id) => id !== rowId))
    setBudgetEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteBudgetRow = async (rowId) => {
    const targetRow = budgetRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setBudgetRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    const ok = window.confirm('이 본예산 진행정보 항목을 삭제하시겠습니까?')
    if (!ok) return

    try {
      await budgetProgressApi.remove(rowId)
    } catch (error) {
      logApiOperationError('본예산 진행정보 삭제', error)
      return
    }

    setEditingBudgetIds((prev) => prev.filter((id) => id !== rowId))
    setBudgetEditSnapshots((prev) => removeObjectKey(prev, rowId))
    await fetchBudgetRows(false)
  }

  const saveBudgetRow = async (rowId) => {
    const targetRow = budgetRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isBudgetRowEmpty(targetRow)) {
      alert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingBudget(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await budgetProgressApi.create({
          ...toBudgetPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await budgetProgressApi.update(rowId, toBudgetPayload(targetRow, timestamp))
      }

      await fetchBudgetRows(false)
      setEditingBudgetIds((prev) => prev.filter((id) => id !== rowId))
      setBudgetEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('본예산 진행정보 저장', error)
    } finally {
      setIsSavingBudget(false)
    }
  }

  const toggleBudgetSelection = (rowId) => {
    setSelectedBudgetIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedBudgetRows = async () => {
    const validSelectedIds = selectedBudgetIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      alert('삭제할 행을 선택해주세요.')
      return
    }

    const ok = window.confirm('선택한 데이터를 삭제하시겠습니까?')
    if (!ok) return

    const persistedIds = budgetRows
      .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
      .map((row) => row.id)
      .filter((id) => safeString(id).trim() !== '')

    if (persistedIds.length > 0) {
      const remainingDrafts = budgetRows.filter(
        (row) => row.isDraft && !validSelectedIds.includes(row.id)
      )
      try {
        await budgetProgressApi.bulkDelete(persistedIds)
      } catch (error) {
        logApiOperationError('본예산 진행정보 선택 삭제', error)
        return
      }

      setBudgetRows(remainingDrafts)
      setSelectedBudgetIds([])
      setEditingBudgetIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      await fetchBudgetRows(true)
      return
    }

    setBudgetRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
    setSelectedBudgetIds([])
    setEditingBudgetIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
  }

  const saveBudgetRows = async () => {
    const rowsToInsert = budgetRows.filter((row) => row.isDraft && !isBudgetRowEmpty(row))
    const rowsToUpdate = budgetRows.filter(
      (row) => !row.isDraft && editingBudgetIds.includes(row.id)
    )
    const hasEmptyDraftRows = budgetRows.some((row) => row.isDraft && isBudgetRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      alert('저장할 행이 없습니다.')
      return
    }

    setIsSavingBudget(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toBudgetPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await budgetProgressApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            budgetProgressApi.update(row.id, toBudgetPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setBudgetRows((prev) => prev.filter((row) => !(row.isDraft && isBudgetRowEmpty(row))))
        setSelectedBudgetIds([])
        setEditingBudgetIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchBudgetRows(false)
      setSelectedBudgetIds([])
      setEditingBudgetIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('본예산 진행정보 일괄 저장', error)
    } finally {
      setIsSavingBudget(false)
    }
  }

  const handleBudgetExcelDownload = () => {
    const rows = filteredBudgetRows.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.registerDate,
      지자체: row.localGov,
      프로젝트: row.projectName,
      예산액: formatAmountDisplay(row.budgetAmount),
      담당자: row.manager,
      상태: row.projectStage,
      담당부서: row.department,
      세부내용: row.detail,
      영업매칭: row.salesMatch,
      비고: row.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '본예산 진행정보')

    const now = new Date()
    const filename = `본예산_진행정보_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddDiscoveryRow = () => {
    if (discoveryRows.some((row) => row.isDraft)) {
      setToastMessage('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }
    setDiscoveryRows((prev) => [...prev, createDiscoveryDraftRow()])
    setSelectedDiscoveryIds([])
  }

  const handleDiscoveryCellChange = (rowId, key, value) => {
    setDiscoveryRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: key === 'projectAmount' ? formatAmount(value) : value,
            }
          : row
      )
    )
  }

  const startDiscoveryEdit = (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return
    if (
      discoveryRows.some((row) => row.isDraft) ||
      (editingDiscoveryIds.length > 0 && !editingDiscoveryIds.includes(rowId))
    ) {
      alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }

    setDiscoveryEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingDiscoveryIds([rowId])
  }

  const cancelDiscoveryRow = (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDiscoveryRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setDiscoveryRows((prev) =>
      prev.map((row) => (row.id === rowId ? discoveryEditSnapshots[rowId] ?? row : row))
    )
    setEditingDiscoveryIds((prev) => prev.filter((id) => id !== rowId))
    setDiscoveryEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteDiscoveryRow = async (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDiscoveryRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    const ok = window.confirm('이 건축정보 항목을 삭제하시겠습니까?')
    if (!ok) return

    try {
      await projectDiscoveryApi.remove(rowId)
    } catch (error) {
      logApiOperationError('건축정보 삭제', error)
      return
    }

    setEditingDiscoveryIds((prev) => prev.filter((id) => id !== rowId))
    setDiscoveryEditSnapshots((prev) => removeObjectKey(prev, rowId))
    await fetchDiscoveryRows(false)
  }

  const saveDiscoveryRow = async (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isDiscoveryRowEmpty(targetRow)) {
      alert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingDiscovery(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await projectDiscoveryApi.create({
          ...toDiscoveryPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await projectDiscoveryApi.update(rowId, toDiscoveryPayload(targetRow, timestamp))
      }

      await fetchDiscoveryRows(false)
      setEditingDiscoveryIds((prev) => prev.filter((id) => id !== rowId))
      setDiscoveryEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('건축정보 저장', error)
    } finally {
      setIsSavingDiscovery(false)
    }
  }

  const toggleDiscoverySelection = (rowId) => {
    setSelectedDiscoveryIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedDiscoveryRows = async () => {
    const validSelectedIds = selectedDiscoveryIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      alert('삭제할 행을 선택해주세요.')
      return
    }

    const ok = window.confirm('선택한 데이터를 삭제하시겠습니까?')
    if (!ok) return

    const persistedIds = discoveryRows
      .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
      .map((row) => row.id)
      .filter((id) => safeString(id).trim() !== '')

    if (persistedIds.length > 0) {
      const remainingDrafts = discoveryRows.filter(
        (row) => row.isDraft && !validSelectedIds.includes(row.id)
      )
      try {
        await projectDiscoveryApi.bulkDelete(persistedIds)
      } catch (error) {
        logApiOperationError('건축정보 선택 삭제', error)
        return
      }

      setDiscoveryRows(remainingDrafts)
      setSelectedDiscoveryIds([])
      setEditingDiscoveryIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      await fetchDiscoveryRows(true)
      return
    }

    setDiscoveryRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
    setSelectedDiscoveryIds([])
    setEditingDiscoveryIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
  }

  const saveDiscoveryRows = async () => {
    const rowsToInsert = discoveryRows.filter((row) => row.isDraft && !isDiscoveryRowEmpty(row))
    const rowsToUpdate = discoveryRows.filter(
      (row) => !row.isDraft && editingDiscoveryIds.includes(row.id)
    )
    const hasEmptyDraftRows = discoveryRows.some((row) => row.isDraft && isDiscoveryRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      alert('저장할 행이 없습니다.')
      return
    }

    setIsSavingDiscovery(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toDiscoveryPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await projectDiscoveryApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            projectDiscoveryApi.update(row.id, toDiscoveryPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setDiscoveryRows((prev) => prev.filter((row) => !(row.isDraft && isDiscoveryRowEmpty(row))))
        setSelectedDiscoveryIds([])
        setEditingDiscoveryIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchDiscoveryRows(false)
      setSelectedDiscoveryIds([])
      setEditingDiscoveryIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('건축정보 일괄 저장', error)
    } finally {
      setIsSavingDiscovery(false)
    }
  }

  const handleDiscoveryExcelDownload = () => {
    const rows = filteredDiscoveryRows.filter((row) => !row.isDraft).map((row) => ({
      건축정보일자: row.permitDate,
      확인: row.checkStatus,
      영업자: row.salesTarget,
      사업구분: row.projectCategory,
      발주처: row.client,
      사업명: row.projectName,
      사업금액: formatAmountDisplay(row.projectAmount),
      준공시기: row.completionPeriod,
      담당자: row.manager,
      비고: row.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '건축정보')

    const now = new Date()
    const filename = `건축정보_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddExcludedRow = () => {
    if (excludedRows.some((row) => row.isDraft)) {
      setToastMessage('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }
    setExcludedRows((prev) => [...prev, createExcludedDraftRow()])
    setSelectedExcludedIds([])
  }

  const handleExcludedCellChange = (rowId, key, value) => {
    setExcludedRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: key === 'projectAmount' ? formatAmount(value) : value,
            }
          : row
      )
    )
  }

  const startExcludedEdit = (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return
    if (
      excludedRows.some((row) => row.isDraft) ||
      (editingExcludedIds.length > 0 && !editingExcludedIds.includes(rowId))
    ) {
      alert('현재 편집 중인 행을 먼저 저장하거나 취소해주세요.')
      return
    }

    setExcludedEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingExcludedIds([rowId])
  }

  const cancelExcludedRow = (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setExcludedRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setExcludedRows((prev) =>
      prev.map((row) => (row.id === rowId ? excludedEditSnapshots[rowId] ?? row : row))
    )
    setEditingExcludedIds((prev) => prev.filter((id) => id !== rowId))
    setExcludedEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteExcludedRow = async (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setExcludedRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    const ok = window.confirm('이 사업검색이력 항목을 삭제하시겠습니까?')
    if (!ok) return

    try {
      await excludedProjectsApi.remove(rowId)
    } catch (error) {
      logApiOperationError('사업검색이력 삭제', error)
      return
    }

    setEditingExcludedIds((prev) => prev.filter((id) => id !== rowId))
    setExcludedEditSnapshots((prev) => removeObjectKey(prev, rowId))
    await fetchExcludedRows(false)
  }

  const saveExcludedRow = async (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isExcludedRowEmpty(targetRow)) {
      alert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingExcluded(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await excludedProjectsApi.create({
          ...toExcludedPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await excludedProjectsApi.update(rowId, toExcludedPayload(targetRow, timestamp))
      }

      await fetchExcludedRows(false)
      setEditingExcludedIds((prev) => prev.filter((id) => id !== rowId))
      setExcludedEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('사업검색이력 저장', error)
    } finally {
      setIsSavingExcluded(false)
    }
  }

  const toggleExcludedSelection = (rowId) => {
    setSelectedExcludedIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedExcludedRows = async () => {
    const validSelectedIds = selectedExcludedIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      alert('삭제할 행을 선택해주세요.')
      return
    }

    const ok = window.confirm('선택한 데이터를 삭제하시겠습니까?')
    if (!ok) return

    const persistedIds = excludedRows
      .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
      .map((row) => row.id)
      .filter((id) => safeString(id).trim() !== '')

    if (persistedIds.length > 0) {
      const remainingDrafts = excludedRows.filter(
        (row) => row.isDraft && !validSelectedIds.includes(row.id)
      )
      try {
        await excludedProjectsApi.bulkDelete(persistedIds)
      } catch (error) {
        logApiOperationError('사업검색이력 선택 삭제', error)
        return
      }

      setExcludedRows(remainingDrafts)
      setSelectedExcludedIds([])
      setEditingExcludedIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      await fetchExcludedRows(true)
      return
    }

    setExcludedRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
    setSelectedExcludedIds([])
    setEditingExcludedIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
  }

  const saveExcludedRows = async () => {
    const rowsToInsert = excludedRows.filter((row) => row.isDraft && !isExcludedRowEmpty(row))
    const rowsToUpdate = excludedRows.filter(
      (row) => !row.isDraft && editingExcludedIds.includes(row.id)
    )
    const hasEmptyDraftRows = excludedRows.some((row) => row.isDraft && isExcludedRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      alert('저장할 행이 없습니다.')
      return
    }

    setIsSavingExcluded(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toExcludedPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await excludedProjectsApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            excludedProjectsApi.update(row.id, toExcludedPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setExcludedRows((prev) => prev.filter((row) => !(row.isDraft && isExcludedRowEmpty(row))))
        setSelectedExcludedIds([])
        setEditingExcludedIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchExcludedRows(false)
      setSelectedExcludedIds([])
      setEditingExcludedIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('사업검색이력 일괄 저장', error)
    } finally {
      setIsSavingExcluded(false)
    }
  }

  const handleExcludedExcelDownload = () => {
    const rows = filteredExcludedRows.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.writeDate,
      공개일: row.openDate,
      상태: row.category,
      검색어: row.keyword,
      작성자: row.writer,
      사업명: row.projectName,
      발주처: row.client,
      사업금액: formatAmountDisplay(row.projectAmount),
      '제외 사유': row.exclusionReason,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '사업검색이력')

    const now = new Date()
    const filename = `사업검색이력_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const openRegistryUpload = (target) => {
    console.log('[excel-upload] open file dialog', { target })
    registryUploadTargetRef.current = target
    setRegistryUploadTarget(target)
    if (registryUploadInputRef.current) {
      registryUploadInputRef.current.value = ''
      registryUploadInputRef.current.click()
    }
  }

  const getRegistryUploadConfig = (target) => {
    switch (target) {
      case 'documents':
        return {
          importEndpoint: '/api/document-register/import',
          columns: DOCUMENT_COLUMNS,
          rows: documents,
          createDraftRow: createDocumentDraftRow,
          isEmptyRow: isDocumentRowEmpty,
          toPayload: toDocumentPayload,
          fetchRows: fetchDocuments,
          importRows: documentRegisterApi.importRows,
        }
      case 'sales':
        return {
          importEndpoint: '/api/sales-register/import',
          columns: SALES_COLUMNS,
          rows: salesRows,
          createDraftRow: createSalesDraftRow,
          isEmptyRow: isSalesRowEmpty,
          toPayload: toSalesPayload,
          fetchRows: fetchSalesRows,
          importRows: salesRegisterApi.importRows,
        }
      case 'budget':
        return {
          importEndpoint: '/api/budget-progress/import',
          columns: BUDGET_COLUMNS,
          rows: budgetRows,
          createDraftRow: createBudgetDraftRow,
          isEmptyRow: isBudgetRowEmpty,
          toPayload: toBudgetPayload,
          fetchRows: fetchBudgetRows,
          importRows: budgetProgressApi.importRows,
        }
      case 'discovery':
        return {
          importEndpoint: '/api/project-discovery/import',
          columns: DISCOVERY_COLUMNS,
          rows: discoveryRows,
          createDraftRow: createDiscoveryDraftRow,
          isEmptyRow: isDiscoveryRowEmpty,
          toPayload: toDiscoveryPayload,
          fetchRows: fetchDiscoveryRows,
          importRows: projectDiscoveryApi.importRows,
        }
      case 'excluded':
        return {
          importEndpoint: '/api/excluded-projects/import',
          columns: EXCLUDED_COLUMNS,
          rows: excludedRows,
          createDraftRow: createExcludedDraftRow,
          isEmptyRow: isExcludedRowEmpty,
          toPayload: toExcludedPayload,
          fetchRows: fetchExcludedRows,
          importRows: excludedProjectsApi.importRows,
        }
      default:
        return null
    }
  }

  const buildRegistryImportRows = (rows, columns, createDraftRow, isEmptyRow) => {
    const preparedRows = []

    rows.forEach((sourceRow, index) => {
      const nextRow = {
        ...createDraftRow(),
        isDraft: false,
      }

      columns.forEach((column) => {
        const rawValue = getValueByHeader(sourceRow, [column.label, column.key], '')

        if (column.type === 'date') {
          nextRow[column.key] = excelDateToInput(rawValue)
          return
        }

        if (column.type === 'amount') {
          nextRow[column.key] = formatAmount(rawValue)
          return
        }

        nextRow[column.key] = safeString(rawValue).trim()
      })

      if (!isEmptyRow(nextRow)) {
        preparedRows.push({
          row: nextRow,
          sourceLine: index + 2,
        })
      }
    })

    return preparedRows
  }

  const handleRegistryUploadFileChange = async (e) => {
    if (registryUploadInProgressRef.current) {
      console.log('[excel-upload] duplicate input event skipped')
      return
    }

    registryUploadInProgressRef.current = true
    const file = e.target.files?.[0]
    const target = registryUploadTargetRef.current || registryUploadTarget
    console.log('[excel-upload] 시작', {
      target,
      file: file
        ? {
            name: file.name,
            size: file.size,
            type: file.type,
          }
        : null,
    })
    e.target.value = ''
    registryUploadTargetRef.current = ''
    setRegistryUploadTarget('')

    try {
      if (!file) return

      if (!target) {
        console.error('엑셀 업로드 대상 메뉴를 확인할 수 없습니다.')
        alert('엑셀 업로드 대상 메뉴를 확인할 수 없습니다. 다시 시도해주세요.')
        return
      }

      const config = getRegistryUploadConfig(target)
      if (!config?.importRows) {
        console.error('엑셀 업로드 설정을 찾을 수 없습니다.', { target, config })
        alert('엑셀 업로드 설정을 찾을 수 없습니다. 다시 시도해주세요.')
        return
      }

      console.log('[excel-upload] config 확인', {
        target,
        endpoint: config.importEndpoint,
        hasImportRows: typeof config.importRows === 'function',
      })

      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true, cellDates: false })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        alert('업로드할 시트를 찾을 수 없습니다.')
        return
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: true,
      })

      if (!rows.length) {
        alert('업로드할 데이터가 없습니다.')
        return
      }

      const preparedRows = buildRegistryImportRows(
        rows,
        config.columns,
        config.createDraftRow,
        config.isEmptyRow
      )

      if (!preparedRows.length) {
        alert('업로드할 유효한 데이터가 없습니다.')
        return
      }

      const existingSignatures = new Set(
        config.rows
          .filter((row) => !row.isDraft)
          .map((row) => getRegistryRowSignature(row, config.columns))
      )
      const uploadSignatures = new Set()
      const uniquePreparedRows = []
      let duplicateCount = 0

      preparedRows.forEach((preparedRow) => {
        const signature = getRegistryRowSignature(preparedRow.row, config.columns)
        if (existingSignatures.has(signature) || uploadSignatures.has(signature)) {
          duplicateCount += 1
          return
        }

        uploadSignatures.add(signature)
        uniquePreparedRows.push(preparedRow)
      })

      if (!uniquePreparedRows.length) {
        alert(`신규 0건 업로드, 중복 ${duplicateCount}건 제외되었습니다.`)
        return
      }

      const baseTime = Date.now()
      const payloadRows = uniquePreparedRows.map(({ row }, index) => {
        const timestamp = new Date(baseTime + index).toISOString()
        return {
          ...config.toPayload(row, timestamp),
          createdAt: timestamp,
        }
      })

      try {
        console.log('[excel-upload] API 호출 전', {
          target,
          endpoint: config.importEndpoint,
          rowCount: payloadRows.length,
        })
        await config.importRows(payloadRows)
      } catch (error) {
        console.error('[excel-upload] 업로드 실패', error)
        logApiOperationError('엑셀 업로드 실패', error)
        await config.fetchRows(false)
        alert(error?.message ?? String(error))
        return
      }

      await config.fetchRows(false)
      console.log('[excel-upload] 완료', {
        target,
        importedCount: uniquePreparedRows.length,
        duplicateCount,
      })
      alert('엑셀 업로드가 완료되었습니다.')
    } catch (error) {
      console.error('업로드 중 오류가 발생했습니다.', error)
      alert(error?.message ?? String(error))
    } finally {
      registryUploadInProgressRef.current = false
    }
  }

  useEffect(() => {
    const input = registryUploadInputRef.current
    if (!input) return undefined

    const handleNativeFileEvent = (event) => {
      console.log('[excel-upload] native file input event', { type: event.type })
      handleRegistryUploadFileChange(event)
    }

    input.addEventListener('change', handleNativeFileEvent)
    input.addEventListener('input', handleNativeFileEvent)

    return () => {
      input.removeEventListener('change', handleNativeFileEvent)
      input.removeEventListener('input', handleNativeFileEvent)
    }
  })

  const deleteAllRegistryRows = async ({
    fetchRows,
    clearDraftRows,
    clearEditingIds,
    clearSnapshots,
    clearSelectedIds,
    deleteAllRows,
  }) => {
    if (!isAdmin) return

    const firstConfirm = window.confirm(
      '현재 메뉴의 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
    )
    if (!firstConfirm) return

    const secondConfirm = window.confirm('정말 전체 삭제하시겠습니까?')
    if (!secondConfirm) return

    try {
      await deleteAllRows()
    } catch (error) {
      logApiOperationError('전체 데이터 삭제', error)
      return
    }

    clearDraftRows()
    clearEditingIds()
    clearSnapshots()
    clearSelectedIds()
    await fetchRows(false)
    alert('전체 데이터가 삭제되었습니다.')
  }

  const trackWorkWeek = (weekStartDate) => {
    const normalized = buildWorkReportWeekMeta(weekStartDate).weekStartDate
    setGeneratedWorkWeeks((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
    setSelectedWorkWeek(normalized)
  }

  const handleCreateCurrentWorkWeek = () => {
    trackWorkWeek(buildWorkReportWeekMeta(new Date()).weekStartDate)
  }

  const handleShiftWorkWeek = (offset) => {
    const nextWeek = formatDateInput(
      addDays(getWeekStartMonday(selectedWorkWeekMeta.weekStartDate), offset * 7)
    )
    trackWorkWeek(nextWeek)
  }

  const getWorkReportCellKey = (date, section, orderIndex = 1) => `${date}__${section}__${orderIndex}`

  const getStoredWorkReportEntry = (date, section, orderIndex = 1) =>
    filteredWorkReportRows.find(
      (row) => row.date === date && row.section === section && Number(row.orderIndex || 1) === orderIndex
    )

  const getDisplayedWorkReportEntry = (date, section, orderIndex = 1) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    if (editingWorkCellKey === cellKey && editingWorkCellData) {
      return editingWorkCellData
    }
    return getStoredWorkReportEntry(date, section, orderIndex)
  }

  const startWorkReportCellEdit = (date, section, orderIndex = 1) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    if (editingWorkCellKey === cellKey) return

    const existingEntry = workReportRows.find(
      (row) => row.date === date && row.section === section && Number(row.orderIndex || 1) === orderIndex
    )

    setEditingWorkCellKey(cellKey)
    setEditingWorkCellData(
      existingEntry
        ? { ...existingEntry }
        : createWorkReportDraftRow({
            reportDate: date,
            section,
            user: getFixedWorkReportManager(section, orderIndex) || workReportFilters.assignee,
            orderIndex,
          })
    )
  }

  const handleWorkReportEditorChange = (key, value) => {
    setEditingWorkCellData((prev) =>
      prev
        ? {
            ...prev,
            [key]: key === 'orderIndex' ? Number(value || 1) : value,
          }
        : prev
    )
  }

  const cancelWorkReportEdit = () => {
    setEditingWorkCellKey('')
    setEditingWorkCellData(null)
  }

  const commitWorkReportEdit = async () => {
    const targetRow = editingWorkCellData
    if (!targetRow) return

    if (isWorkReportRowEmpty(targetRow)) {
      if (!targetRow.isDraft && targetRow.id) {
        try {
          await weeklyWorkReportsApi.remove(targetRow.id)
        } catch (error) {
          logApiOperationError('일일/주간업무보고서 삭제', error)
          return
        }
        await fetchWorkReportRows(false)
      }
      cancelWorkReportEdit()
      return
    }

    setIsSavingWorkReports(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await weeklyWorkReportsApi.create({
          ...toWorkReportPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await weeklyWorkReportsApi.update(targetRow.id, toWorkReportPayload(targetRow, timestamp))
      }

      await fetchWorkReportRows(false)
      trackWorkWeek(targetRow.date)
      cancelWorkReportEdit()
    } catch (error) {
      logApiOperationError('일일/주간업무보고서 저장', error)
    } finally {
      setIsSavingWorkReports(false)
    }
  }

  const handleWorkReportPdfDownload = () => {
    const popup = window.open('', '_blank', 'width=1480,height=980')
    if (!popup) {
      alert('팝업을 허용한 뒤 다시 시도해주세요.')
      return
    }

    const cardMarkup = selectedWorkWeekDays
      .map((day) => {
        const mainCheckItems = Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => {
          const entry = getDisplayedWorkReportEntry(day.date, '주요확인사항', index + 1)
          return `<li>${escapeHtml(entry?.content || '') || '&nbsp;'}</li>`
        }).join('')

        const externalEntry = getDisplayedWorkReportEntry(day.date, '외부업무', 1)
        const internalEntry = getDisplayedWorkReportEntry(day.date, '내부업무', 1)
        const contractEntry = getDisplayedWorkReportEntry(day.date, '도급사업', 1)
        const partnerEntry = getDisplayedWorkReportEntry(day.date, '협력사현황', 1)

        return `
          <div class="weekly-card">
            <div class="weekly-card-head">
              <div class="weekly-card-weekday">${escapeHtml(day.label)}</div>
              <div class="weekly-card-date">${escapeHtml(day.date)}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">주요 확인사항</div>
              <ol class="weekly-check-list">${mainCheckItems}</ol>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">외부업무</div>
              <div class="weekly-user">${escapeHtml(externalEntry?.user || '-')}</div>
              <div class="weekly-content">${escapeHtml(externalEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">내부업무</div>
              <div class="weekly-content">${escapeHtml(internalEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">도급사업</div>
              <div class="weekly-content">${escapeHtml(contractEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">협력사현황</div>
              <div class="weekly-content">${escapeHtml(partnerEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
          </div>
        `
      })
      .join('')

    popup.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>일일/주간업무보고서</title>
          <style>
            body { font-family: "Malgun Gothic", sans-serif; margin: 0; padding: 24px; color: #1f2937; background: #fff; }
            .report-shell { border: 1px solid #d6dee8; border-radius: 16px; overflow: hidden; }
            .report-header { padding: 18px 22px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
            .report-title { font-size: 24px; font-weight: 800; margin-bottom: 6px; }
            .report-subtitle { font-size: 13px; color: #475569; }
            .weekly-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; padding: 16px; }
            .weekly-card { border: 1px solid #d8dee7; border-radius: 12px; background: #f8fafc; overflow: hidden; }
            .weekly-card-head { padding: 12px 12px 10px; border-bottom: 1px solid #e5e7eb; background: #ffffff; }
            .weekly-card-weekday { font-size: 13px; font-weight: 800; color: #2563eb; margin-bottom: 4px; }
            .weekly-card-date { font-size: 12px; color: #64748b; }
            .weekly-section { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
            .weekly-section:last-child { border-bottom: none; }
            .weekly-section-title { font-size: 12px; font-weight: 800; color: #334155; margin-bottom: 8px; }
            .weekly-check-list { margin: 0; padding-left: 18px; }
            .weekly-check-list li { min-height: 20px; font-size: 12px; color: #334155; line-height: 1.5; }
            .weekly-user { font-size: 11px; font-weight: 800; color: #2563eb; margin-bottom: 6px; }
            .weekly-content { font-size: 12px; color: #334155; line-height: 1.6; white-space: normal; word-break: break-word; min-height: 20px; }
            @media print { body { padding: 0; } .report-shell { border: none; border-radius: 0; } }
          </style>
        </head>
        <body>
          <div class="report-shell">
            <div class="report-header">
              <div class="report-title">일일/주간업무보고서</div>
              <div class="report-subtitle">${escapeHtml(
                `${getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)} · 담당자 ${
                  workReportFilters.assignee || '전체'
                }`
              )}</div>
            </div>
            <div class="weekly-grid">${cardMarkup}</div>
          </div>
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  const getWorkReportBoardEntry = (date, section, orderIndex = 1) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    const draftEntry = workReportDrafts[cellKey]
    if (draftEntry) return draftEntry

    const storedEntry = getStoredWorkReportEntry(date, section, orderIndex)
    if (storedEntry) return storedEntry

    return createWorkReportDraftRow({
      reportDate: date,
      section,
      user:
        [WORK_REPORT_SECTION_KEYS.external, WORK_REPORT_SECTION_KEYS.di, WORK_REPORT_SECTION_KEYS.road].includes(section) &&
        WORK_REPORT_MANAGER_OPTIONS.includes(workReportFilters.assignee)
          ? workReportFilters.assignee
          : '',
      orderIndex,
    })
  }

  const updateWorkReportBoardEntry = (date, section, orderIndex, patch) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    setWorkReportDrafts((prev) => ({
      ...prev,
      [cellKey]: {
        ...getWorkReportBoardEntry(date, section, orderIndex),
        ...prev[cellKey],
        ...patch,
        date,
        section,
        orderIndex,
      },
    }))
  }

  const saveWorkReportBoardEntry = async (date, section, orderIndex = 1) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    const targetRow = {
      ...getWorkReportBoardEntry(date, section, orderIndex),
      date,
      section,
      orderIndex,
    }

    if (isWorkReportRowEmpty(targetRow)) {
      if (!targetRow.isDraft && targetRow.id) {
        try {
          await weeklyWorkReportsApi.remove(targetRow.id)
        } catch (error) {
          logApiOperationError('일일/주간업무보고서 삭제', error)
          return
        }
        await fetchWorkReportRows(false)
      }

      setWorkReportDrafts((prev) => removeObjectKey(prev, cellKey))
      return
    }

    setIsSavingWorkReports(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await weeklyWorkReportsApi.create({
          ...toWorkReportPayload(targetRow, timestamp, true),
          createdAt: timestamp,
        })
      } else {
        await weeklyWorkReportsApi.update(targetRow.id, toWorkReportPayload(targetRow, timestamp, true))
      }

      await fetchWorkReportRows(false)
      trackWorkWeek(targetRow.date)
      setWorkReportDrafts((prev) => removeObjectKey(prev, cellKey))
    } catch (error) {
      logApiOperationError('일일/주간업무보고서 저장', error)
    } finally {
      setIsSavingWorkReports(false)
    }
  }

  const handleWorkReportBoardBlur = (date, section, orderIndex = 1) => async (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    await saveWorkReportBoardEntry(date, section, orderIndex)
  }

  const handleWorkReportBoardPdfDownload = () => {
    const popup = window.open('', '_blank', 'width=1680,height=980')
    if (!popup) {
      alert('팝업을 허용한 뒤 다시 시도해주세요.')
      return
    }

    const renderPdfText = (value) => escapeHtml(value || '-').replaceAll('\n', '<br />')
    const renderPdfRows = (date, section, rowCount, includeDestination = false) =>
      Array.from({ length: rowCount }, (_, index) => {
        const entry = getWorkReportBoardEntry(date, section, index + 1)
        return `
          <tr>
            <td class="pdf-index">${index + 1}</td>
            <td class="pdf-manager">${escapeHtml(entry.user || '-')}</td>
            <td>${renderPdfText(entry.content || '-')}</td>
            ${includeDestination ? `<td class="pdf-destination">${renderPdfText(entry.destination || '-')}</td>` : ''}
          </tr>
        `
      }).join('')

    const cards = selectedWorkWeekDays
      .map((day) => {
        const checkItems = Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => {
          const entry = getWorkReportBoardEntry(day.date, WORK_REPORT_SECTION_KEYS.checklist, index + 1)
          return `<li>${escapeHtml(entry.content || '') || '&nbsp;'}</li>`
        }).join('')

        const supportProgressRows = Array.from(
          { length: WORK_REPORT_SUPPORT_ITEM_COUNT },
          (_, index) => `
            <tr>
              <td class="pdf-index">${index + 1}</td>
              <td>${renderPdfText(
                getWorkReportBoardEntry(day.date, WORK_REPORT_SECTION_KEYS.supportProgress, index + 1).content || '-'
              )}</td>
            </tr>
          `
        ).join('')
        const supportDoneRows = Array.from(
          { length: WORK_REPORT_SUPPORT_ITEM_COUNT },
          (_, index) => `
            <tr>
              <td class="pdf-index">${index + 1}</td>
              <td>${renderPdfText(
                getWorkReportBoardEntry(day.date, WORK_REPORT_SECTION_KEYS.supportDone, index + 1).content || '-'
              )}</td>
            </tr>
          `
        ).join('')

        return `
          <section class="pdf-day-card">
            <header class="pdf-day-head">
              <div class="pdf-day-weekday">${escapeHtml(day.label)}</div>
              <div class="pdf-day-date">${escapeHtml(day.date)}</div>
            </header>
            <div class="pdf-section">
              <div class="pdf-section-title">주요 확인사항</div>
              <ol class="pdf-check-list">${checkItems}</ol>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">외부일정</div>
              <table class="pdf-table">
                <thead>
                  <tr><th class="pdf-index">#</th><th class="pdf-manager">담당자</th><th>내용</th><th class="pdf-destination">목적지</th></tr>
                </thead>
                <tbody>${renderPdfRows(day.date, WORK_REPORT_SECTION_KEYS.external, WORK_REPORT_EXTERNAL_ROW_COUNT, true)}</tbody>
              </table>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">DI사업</div>
              <table class="pdf-table">
                <thead>
                  <tr><th class="pdf-index">#</th><th class="pdf-manager">담당자</th><th>내용</th></tr>
                </thead>
                <tbody>${renderPdfRows(day.date, WORK_REPORT_SECTION_KEYS.di, WORK_REPORT_DI_ROW_COUNT, false)}</tbody>
              </table>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">도로사업</div>
              <table class="pdf-table">
                <thead>
                  <tr><th class="pdf-index">#</th><th class="pdf-manager">담당자</th><th>내용</th></tr>
                </thead>
                <tbody>${renderPdfRows(day.date, WORK_REPORT_SECTION_KEYS.road, WORK_REPORT_ROAD_ROW_COUNT, false)}</tbody>
              </table>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">영업지원</div>
              <div class="pdf-support-title">진행업무</div>
              <table class="pdf-table pdf-support-table"><tbody>${supportProgressRows}</tbody></table>
              <div class="pdf-support-title">완료업무</div>
              <table class="pdf-table pdf-support-table"><tbody>${supportDoneRows}</tbody></table>
            </div>
          </section>
        `
      })
      .join('')

    popup.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>일일/주간업무보고서</title>
          <style>
            body { font-family: "Malgun Gothic", sans-serif; margin: 0; padding: 24px; color: #1f2937; background: #ffffff; }
            .pdf-shell { border: 1px solid #d6dee8; border-radius: 16px; overflow: hidden; }
            .pdf-header { padding: 18px 22px; border-bottom: 1px solid #dbe4ee; background: #f8fafc; }
            .pdf-title { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
            .pdf-meta { font-size: 13px; color: #475569; }
            .pdf-grid { display: grid; grid-template-columns: repeat(7, minmax(280px, 1fr)); gap: 12px; padding: 16px; }
            .pdf-day-card { border: 1px solid #d8dee7; border-radius: 12px; background: #f9fbfd; overflow: hidden; }
            .pdf-day-head { padding: 12px; border-bottom: 1px solid #dbe4ee; background: #ffffff; }
            .pdf-day-weekday { font-size: 13px; font-weight: 800; color: #1d4f63; margin-bottom: 4px; }
            .pdf-day-date { font-size: 12px; color: #64748b; }
            .pdf-section { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
            .pdf-section:last-child { border-bottom: none; }
            .pdf-section-title { padding: 7px 10px; border-radius: 8px; background: #1f5f74; color: #ffffff; font-size: 12px; font-weight: 800; margin-bottom: 8px; }
            .pdf-check-list { margin: 0; padding-left: 18px; }
            .pdf-check-list li { min-height: 20px; font-size: 12px; line-height: 1.5; }
            .pdf-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .pdf-table th, .pdf-table td { border: 1px solid #dbe4ee; padding: 6px; vertical-align: top; font-size: 11px; }
            .pdf-table th { background: #f8fafc; font-weight: 800; }
            .pdf-index { width: 28px; text-align: center; }
            .pdf-manager { width: 78px; }
            .pdf-destination { width: 88px; }
            .pdf-support-title { margin: 10px 0 6px; font-size: 11px; font-weight: 800; color: #1f5f74; }
            .pdf-support-body { min-height: 48px; font-size: 12px; line-height: 1.6; }
            @media print { body { padding: 0; } .pdf-shell { border: none; border-radius: 0; } }
          </style>
        </head>
        <body>
          <div class="pdf-shell">
            <div class="pdf-header">
              <div class="pdf-title">일일/주간업무보고서</div>
              <div class="pdf-meta">${escapeHtml(
                `${getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)} · 담당자 ${
                  workReportFilters.assignee || '전체'
                }`
              )}</div>
            </div>
            <div class="pdf-grid">${cards}</div>
          </div>
          <script>window.onload = function () { window.print(); };</script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  const openAddRow = () => {
    if (!requireAdmin()) return
    setIsAddingRow(true)
    setNewRow({ ...emptyContract })
    setSelectedContractIds([])
  }

  const cancelAddRow = () => {
    setIsAddingRow(false)
    setNewRow({ ...emptyContract })
  }

  const saveAddRow = async () => {
    if (!requireAdmin()) return

    if (!newRow.projectName.trim()) {
      alert('사업명은 필수입니다.')
      return
    }

    const savedRows = await saveContractToApi(newRow)
    if (!savedRows || savedRows.length === 0) return

    await fetchContracts()
    setIsAddingRow(false)
    setNewRow({ ...emptyContract })
    alert('저장되었습니다.')
  }

  const deleteRow = async (id) => {
    if (!requireAdmin()) return

    const ok = window.confirm('이 계약현황을 삭제하시겠습니까?')
    if (!ok) return

    try {
      await contractsApi.remove(id)
    } catch (error) {
      logApiOperationError('계약현황 삭제', error)
      return
    }

    await fetchContracts()
  }

  const toggleContractSelection = (rowId) => {
    setSelectedContractIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedContracts = async () => {
    if (!requireAdmin()) return

    const validSelectedIds = selectedContractIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      alert('삭제할 데이터를 선택해주세요.')
      return
    }

    const ok = window.confirm('선택한 데이터를 삭제하시겠습니까?')
    if (!ok) return

    try {
      await Promise.all(validSelectedIds.map((id) => contractsApi.remove(id)))
    } catch (error) {
      logApiOperationError('계약현황 선택 삭제', error)
      return
    }

    if (editingCell && validSelectedIds.includes(editingCell.rowId)) {
      cancelEdit()
    }

    setSelectedContractIds([])
    await fetchContracts()
  }

  const startEdit = (rowId, key, value) => {
    if (!isAdmin) return

    setEditingCell({ rowId, key })

    if (key === 'amount') {
      setEditingValue(normalizeAmountValue(value))
      return
    }

    setEditingValue(safeString(value))
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditingValue('')
  }

  const saveEdit = async () => {
    if (!editingCell) return

    const value = normalizeEditValue(editingCell.key, editingValue)

    try {
      await contractsApi.update(editingCell.rowId, { [editingCell.key]: value })
    } catch (error) {
      logApiOperationError('계약현황 수정', error)
      return
    }

    await fetchContracts()
    setEditingCell(null)
    setEditingValue('')
  }

  const moveEdit = (rowId, key, direction) => {
    const currentIndex = CONTRACT_COLUMNS.findIndex((column) => column.key === key)
    if (currentIndex < 0) return

    const nextIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (nextIndex < 0 || nextIndex >= CONTRACT_COLUMNS.length) return

    const targetRow = contracts.find((item) => item.id === rowId)
    const nextColumn = CONTRACT_COLUMNS[nextIndex]
    const nextValue = targetRow?.[nextColumn.key]

    setEditingCell({ rowId, key: nextColumn.key })
    if (nextColumn.key === 'amount') {
      setEditingValue(normalizeAmountValue(nextValue))
      return
    }

    setEditingValue(safeString(nextValue ?? ''))
  }

  const renderEditor = (row, column) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.key === column.key
    if (!isEditing) return null

    const commonProps = {
      className: `cell-inline-editor ${column.align === 'right' ? 'align-right' : ''}`,
      value: editingValue,
      autoFocus: true,
      onChange: (e) => {
        const value = column.key === 'amount' ? normalizeAmountValue(e.target.value) : e.target.value
        setEditingValue(value)
      },
      onBlur: saveEdit,
      onKeyDown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
          return
        }

        if (e.key === 'Tab') {
          e.preventDefault()
          moveEdit(row.id, column.key, e.shiftKey ? 'prev' : 'next')
          return
        }

        if (column.type === 'textarea' && e.shiftKey && e.key === 'Enter') {
          return
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          saveEdit()
        }
      },
    }

    if (column.type === 'date') {
      return <input {...commonProps} type="date" />
    }

    if (column.type === 'textarea') {
      return <textarea {...commonProps} rows={2} />
    }

    return <input {...commonProps} type="text" />
  }

  const addManualEvent = () => {
    if (!requireAdmin()) return

    if (!eventForm.date || !eventForm.title.trim()) {
      alert('날짜와 일정 내용을 입력해주세요.')
      return
    }

    const next = [
      {
        id: Date.now(),
        ...eventForm,
      },
      ...manualEvents,
    ]

    persistEvents(next)
    setEventForm({ ...emptyEvent })
  }

  const deleteManualEvent = (id) => {
    if (!requireAdmin()) return

    const ok = window.confirm('이 일정을 삭제하시겠습니까?')
    if (!ok) return

    persistEvents(manualEvents.filter((item) => item.id !== id))
  }

  const prevMonth = () => {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const openCalendarDetail = (item) => {
    if (item.type === 'manual') {
      setDetailModal({
        title: '일정 상세',
        typeLabel: '기타 일정',
        date: item.date,
        dday: item.dday || '',
        projectName: item.text,
        salesOwner: item.owner || '',
        pm: '',
        client: '',
        department: '',
        contractMethod: '',
        contractType: '',
        identNo: '',
        contractDate: '',
        dueDate: '',
        amount: '',
        note: item.note || '',
      })
      return
    }

    const contract = item.contract
    if (!contract) return

    setDetailModal({
      title: '계약현황 상세',
      typeLabel: item.type === 'contract' ? '계약일자' : '준공일자',
      date: item.date,
      dday: item.dday || '',
      projectName: contract.projectName,
      salesOwner: contract.salesOwner,
      pm: contract.pm,
      client: contract.client,
      department: contract.department,
      contractMethod: contract.contractMethod,
      contractType: contract.contractType,
      identNo: contract.identNo,
      contractDate: contract.contractDate,
      dueDate: contract.dueDate,
      amount: contract.amount,
      note: contract.note,
      contractNo: contract.contractNo,
      year: contract.year,
      refNo: contract.refNo,
      segment: contract.segment,
    })
  }

  const renderAuthCard = ({
    title,
    subtitle,
    passwordValue,
    onPasswordChange,
    onSubmit,
    error,
    submitLabel,
    onCancel,
  }) => (
    <div className="auth-card">
      <div className="auth-card-header">
        <div className="company-logo-box auth-logo-box">
          <img className="company-logo-img" src="/logo.png" alt="스마트DI" />
        </div>
        <div className="auth-card-title">{title}</div>
        <div className="auth-card-subtitle">{subtitle}</div>
      </div>

      <form onSubmit={onSubmit}>
        <input
          type="password"
          className="table-search-input auth-input"
          value={passwordValue}
          onChange={onPasswordChange}
          placeholder="비밀번호 입력"
          autoFocus
        />

        {error && <div className="auth-error-box">{error}</div>}

        <div className="auth-actions">
          {onCancel && (
            <button className="secondary-btn auth-secondary-btn" type="button" onClick={onCancel}>
              취소
            </button>
          )}
          <button className="primary-btn auth-primary-btn" type="submit">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )

  const handleRegistryEditorKeyDown = async (e, column, onSave, onCancel) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }

    if (column.type === 'textarea') {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        await onSave()
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      await onSave()
    }
  }

  const handleRegistryRowBlur = async (e, row, isSaving, onSave, onCancel, isEmptyRow) => {
    if (e.currentTarget.contains(e.relatedTarget) || isSaving) return

    if (row.isDraft && isEmptyRow(row)) {
      onCancel()
      return
    }

    await onSave()
  }

  const renderRegistryEditor = (row, column, onChange, { onSave, onCancel }) => {
    if (column.type === 'textarea') {
      return (
        <textarea
          className={`inline-row-editor cell-inline-editor ${column.align === 'right' ? 'align-right' : ''}`}
          rows={1}
          value={row[column.key] ?? ''}
          onChange={(e) => onChange(row.id, column.key, e.target.value)}
          onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
        />
      )
    }

    if (column.type === 'date') {
      return (
        <input
          className="inline-row-editor cell-inline-editor"
          type="date"
          value={row[column.key] ?? ''}
          onChange={(e) => onChange(row.id, column.key, e.target.value)}
          onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
        />
      )
    }

    if (column.type === 'select') {
      return (
        <select
          className="inline-row-editor cell-inline-editor"
          value={row[column.key] ?? ''}
          onChange={(e) => onChange(row.id, column.key, e.target.value)}
          onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
        >
          <option value="">선택</option>
          {column.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        className={`inline-row-editor cell-inline-editor ${column.align === 'right' ? 'align-right' : ''}`}
        type="text"
        value={row[column.key] ?? ''}
        onChange={(e) => onChange(row.id, column.key, e.target.value)}
        onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
      />
    )
  }

  const renderRegistryDataRow = ({
    row,
    index,
    columns,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
    selectedIds,
    onToggleSelection,
  }) => {
    const isEditing = row.isDraft || editingIds.includes(row.id)

    return (
      <tr
        key={row.id}
        className={index % 2 === 0 ? 'row-even' : 'row-odd'}
        onBlur={(e) =>
          isEditing
            ? handleRegistryRowBlur(e, row, isSaving, onSaveRow, onCancelRow, isEmptyRow)
            : undefined
        }
      >
        <td className="td-align-center registry-check-cell">
          <input
            className="registry-row-checkbox"
            type="checkbox"
            checked={selectedIds.includes(row.id)}
            onChange={() => onToggleSelection(row.id)}
          />
        </td>

        {columns.map((column) => (
          <td
            key={column.key}
            className={`${
              column.align === 'right'
                ? 'td-align-right'
                : column.align === 'left'
                ? 'td-align-left'
                : 'td-align-center'
            } ${column.type === 'textarea' ? 'multiline-cell' : ''}`}
            style={{ width: column.width }}
            onClick={() => {
              if (!isEditing && !row.isDraft) {
                onStartEdit()
              }
            }}
          >
            {isEditing ? (
              renderRegistryEditor(row, column, onChange, {
                onSave: onSaveRow,
                onCancel: onCancelRow,
              })
            ) : (
              <div
                className="cell-display"
                style={{
                  whiteSpace: column.type === 'textarea' ? 'pre-wrap' : 'normal',
                }}
              >
                {getRegistryPlainDisplayValue(row, column)}
              </div>
            )}
          </td>
        ))}
      </tr>
    )
  }

  const renderFlatRegistryRows = ({
    rows,
    columns,
    emptyMessage,
    selectedIds,
    onToggleSelection,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
  }) => {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length + 1} className="empty-cell">
            {emptyMessage}
          </td>
        </tr>
      )
    }

    return rows.map((row, index) =>
      renderRegistryDataRow({
        row,
        index,
        columns,
        editingIds,
        isSaving,
        onStartEdit: () => onStartEdit(row.id),
        onSaveRow: () => onSaveRow(row.id),
        onCancelRow: () => onCancelRow(row.id),
        onChange,
        isEmptyRow,
        selectedIds,
        onToggleSelection,
      })
    )
  }

  const renderGroupedRegistryRows = ({
    groups,
    columns,
    emptyMessage,
    selectedIds,
    onToggleSelection,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
    isYearOpen,
    onToggleYear,
  }) => {
    if (groups.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length + 1} className="empty-cell">
            {emptyMessage}
          </td>
        </tr>
      )
    }

    return groups.flatMap((yearBlock) => {
      const collapsed = !isYearOpen(yearBlock.year)
      const yearRow = (
        <tr className="contract-year-row" key={`year-${yearBlock.year}`}>
          <td colSpan={columns.length + 1}>
            <button
              className="contract-year-toggle"
              type="button"
              onClick={() => onToggleYear(yearBlock.year)}
            >
              <span className="contract-year-sign">{collapsed ? '+' : '-'}</span>
              <span>{yearBlock.year}</span>
              <span className="contract-year-count">
                {yearBlock.items.length.toLocaleString('ko-KR')}건
              </span>
            </button>
          </td>
        </tr>
      )

      if (collapsed) return [yearRow]

      return [
        yearRow,
        ...yearBlock.items.map((row, index) =>
          renderRegistryDataRow({
            row,
            index,
            columns,
            editingIds,
            isSaving,
            onStartEdit: () => onStartEdit(row.id),
            onSaveRow: () => onSaveRow(row.id),
            onCancelRow: () => onCancelRow(row.id),
            onChange,
            isEmptyRow,
            selectedIds,
            onToggleSelection,
          })
        ),
      ]
    })
  }

  const renderWorkReportChecklistItem = (date, orderIndex) => {
    const cellKey = getWorkReportCellKey(date, '주요확인사항', orderIndex)
    const isEditing = editingWorkCellKey === cellKey
    const entry = getDisplayedWorkReportEntry(date, '주요확인사항', orderIndex)

    if (isEditing && editingWorkCellData) {
      return (
        <div
          className="work-report-line-editor"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              commitWorkReportEdit()
            }
          }}
        >
          <input
            className="work-report-line-input"
            type="text"
            value={editingWorkCellData.content}
            autoFocus
            onChange={(e) => handleWorkReportEditorChange('content', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelWorkReportEdit()
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </div>
      )
    }

    return (
      <button
        type="button"
        className={`work-report-check-line ${entry?.content ? 'has-value' : ''}`}
        onClick={() => startWorkReportCellEdit(date, '주요확인사항', orderIndex)}
      >
        {entry?.content || ''}
      </button>
    )
  }

  const renderWorkReportSectionCard = (date, sectionConfig) => {
    const { section, label, type } = sectionConfig
    const cellKey = getWorkReportCellKey(date, section, 1)
    const isEditing = editingWorkCellKey === cellKey
    const entry = getDisplayedWorkReportEntry(date, section, 1)

    if (type === 'checklist') {
      return (
        <div className="work-report-section-card work-report-section-card-checklist">
          <div className="work-report-section-card-title">{label}</div>
          <div className="work-report-check-list">
            {Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => (
              <div key={`${date}-${section}-${index + 1}`} className="work-report-check-item">
                <span className="work-report-check-index">{index + 1}</span>
                {renderWorkReportChecklistItem(date, index + 1)}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (isEditing && editingWorkCellData) {
      return (
        <div
          className="work-report-section-card work-report-section-card-editing"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              commitWorkReportEdit()
            }
          }}
        >
          <div className="work-report-section-card-title">{label}</div>
          {type === 'external' && (
            <select
              className="contract-filter-select work-report-user-select"
              value={editingWorkCellData.user}
              autoFocus
              onChange={(e) => handleWorkReportEditorChange('user', e.target.value)}
            >
              <option value="">담당자</option>
              {WORK_REPORT_EXTERNAL_USER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
          <textarea
            className="work-report-section-textarea"
            rows={type === 'external' ? 3 : 4}
            autoFocus={type !== 'external'}
            value={editingWorkCellData.content}
            placeholder="내용 입력"
            onChange={(e) => handleWorkReportEditorChange('content', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelWorkReportEdit()
              }
            }}
          />
        </div>
      )
    }

    return (
      <button
        type="button"
        className={`work-report-section-card ${entry?.content ? 'has-value' : ''}`}
        onClick={() => startWorkReportCellEdit(date, section, 1)}
      >
        <div className="work-report-section-card-title">{label}</div>
        {type === 'external' && <div className="work-report-section-user">{entry?.user || '담당자'}</div>}
        <div className="work-report-section-content">{entry?.content || ''}</div>
      </button>
    )
  }

  const renderWorkReportChecklistSection = (date) => (
    <section className="work-report-board-section work-report-board-section-blue">
      <div className="work-report-board-section-title">주요 확인사항</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)

          return (
            <div
              key={`${date}-check-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-check"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex, {
                    content: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportManagedSection = (
    date,
    title,
    section,
    rowCount,
    contentClassName,
    fixedManagers = []
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {Array.from({ length: rowCount }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`${date}-${section}-${orderIndex}`}
              className="work-report-board-row"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { user: e.target.value })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportExternalSection = (date) => (
    <section className="work-report-board-section work-report-board-section-blue">
      <div className="work-report-board-section-title">외부일정</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row work-report-board-header-row-external">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-destination-header">목적지</div>
        </div>
        {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

          return (
            <div
              key={`${date}-external-${orderIndex}`}
              className="work-report-board-row work-report-board-row-external"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    user: e.target.value,
                  })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-external"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    content: e.target.value,
                  })
                }
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-destination"
                value={entry.destination}
                placeholder="목적지 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    destination: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportArea = (date, title, section) => {
    const entry = getWorkReportBoardEntry(date, section, 1)

    return (
      <div className="work-report-board-support-block" onBlur={handleWorkReportBoardBlur(date, section, 1)}>
        <div className="work-report-board-support-title">{title}</div>
        <div className="work-report-board-support-row">
          <div className="work-report-board-support-number">
            {WORK_REPORT_SUPPORT_NUMBER_GUIDE.map((numberLabel) => (
              <span key={`${section}-${numberLabel}`}>{numberLabel}</span>
            ))}
          </div>
          <textarea
            className="work-report-board-textarea work-report-board-textarea-support"
            value={entry.content}
            placeholder="내용 입력"
            onChange={(e) => updateWorkReportBoardEntry(date, section, 1, { content: e.target.value })}
          />
        </div>
      </div>
    )
  }

  const renderWorkReportSupportSection = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaList(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaList(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaList = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="?댁슜 ?낅젰"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportChecklistSectionV2 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">주요 확인사항</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)

          return (
            <div
              key={`check-v2-${date}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-check"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex, {
                    content: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportExternalSectionV2 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">외부일정</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row work-report-board-header-row-external">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-destination-header">목적지</div>
        </div>
        {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

          return (
            <div
              key={`external-v2-${date}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-external"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    user: e.target.value,
                  })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-external"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    content: e.target.value,
                  })
                }
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-destination"
                value={entry.destination}
                placeholder="목적지 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    destination: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportFixedManagerSectionV2 = (
    date,
    title,
    section,
    managers,
    contentClassName
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`fixed-v2-${section}-${date}-${orderIndex}`}
              className="work-report-board-row"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <div className="work-report-board-fixed-manager">{managerName}</div>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    user: managerName,
                    content: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaListV2 = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`support-v2-${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV2 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaListV2(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaListV2(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportFixedManagerSectionV3 = (
    date,
    title,
    section,
    managers,
    contentClassName
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`fixed-v3-${section}-${date}-${orderIndex}`}
              className="work-report-board-row"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <div className="work-report-board-fixed-manager">{managerName}</div>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    user: managerName,
                    content: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaListV3 = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`support-v3-${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV3 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaListV3(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaListV3(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportDayBoardV2 = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense">
        {renderWorkReportChecklistSectionV2(day.date)}
        {renderWorkReportExternalSectionV2(day.date)}
        {renderWorkReportFixedManagerSectionV3(
          day.date,
          'DI사업',
          WORK_REPORT_SECTION_KEYS.di,
          WORK_REPORT_DI_MANAGERS,
          'work-report-board-textarea-di'
        )}
        {renderWorkReportFixedManagerSectionV3(
          day.date,
          '도로사업',
          WORK_REPORT_SECTION_KEYS.road,
          WORK_REPORT_ROAD_MANAGERS,
          'work-report-board-textarea-road'
        )}
        {renderWorkReportSupportSectionV3(day.date)}
      </div>
    </div>
  )

  const renderWorkReportDayBoard = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense">
        {renderWorkReportChecklistSection(day.date)}
        {renderWorkReportExternalSection(day.date)}
        {renderWorkReportManagedSection(
          day.date,
          'DI사업',
          WORK_REPORT_SECTION_KEYS.di,
          WORK_REPORT_DI_ROW_COUNT,
          'work-report-board-textarea-di'
        )}
        {renderWorkReportManagedSection(
          day.date,
          '도로사업',
          WORK_REPORT_SECTION_KEYS.road,
          WORK_REPORT_ROAD_ROW_COUNT,
          'work-report-board-textarea-road'
        )}
        {renderWorkReportSupportSection(day.date)}
      </div>
    </div>
  )

  const renderWorkReportChecklistSectionV4 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">주요 확인사항</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)

          return (
            <div
              key={`check-v4-${date}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-check"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex, {
                    content: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportExternalSectionV4 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">외부일정</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row-external-no-index">
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-destination-header">목적지</div>
        </div>
        {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

          return (
            <div
              key={`external-v4-${date}-${orderIndex}`}
              className="work-report-board-row-external-no-index"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
            >
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    user: e.target.value,
                  })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-external"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    content: e.target.value,
                  })
                }
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-destination"
                value={entry.destination}
                placeholder="목적지 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    destination: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportFixedManagerSectionV4 = (
    date,
    title,
    section,
    managers,
    contentClassName
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row-no-index">
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`fixed-v4-${section}-${date}-${orderIndex}`}
              className="work-report-board-row-no-index"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-fixed-manager">{managerName}</div>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    user: managerName,
                    content: e.target.value,
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaListV4 = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`support-v4-${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV4 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaListV4(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaListV4(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportDayBoardV4 = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense">
        {renderWorkReportChecklistSectionV4(day.date)}
        {renderWorkReportExternalSectionV4(day.date)}
        {renderWorkReportFixedManagerSectionV4(
          day.date,
          'DI사업',
          WORK_REPORT_SECTION_KEYS.di,
          WORK_REPORT_DI_MANAGERS,
          'work-report-board-textarea-di'
        )}
        {renderWorkReportFixedManagerSectionV4(
          day.date,
          '도로사업',
          WORK_REPORT_SECTION_KEYS.road,
          WORK_REPORT_ROAD_MANAGERS,
          'work-report-board-textarea-road'
        )}
        {renderWorkReportSupportSectionV4(day.date)}
      </div>
    </div>
  )

  const getWorkReportManagerNames = (value) =>
    safeString(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

  const toggleWorkReportManagerName = (currentValue, managerName) => {
    const currentNames = getWorkReportManagerNames(currentValue)
    const nextNames = currentNames.includes(managerName)
      ? currentNames.filter((name) => name !== managerName)
      : [...currentNames, managerName]

    return WORK_REPORT_EXTERNAL_USER_OPTIONS.filter((option) => nextNames.includes(option)).join(', ')
  }

  const handleWorkReportInlineKeyDown = (e, { multiline = false } = {}) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelWorkReportEdit()
      return
    }

    if (e.key === 'Enter' && (!multiline || e.ctrlKey)) {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const renderWorkReportManagerBadges = (value) => {
    const names = getWorkReportManagerNames(value)
    if (!names.length) {
      return <span className="work-report-report-empty-inline">미지정</span>
    }

    return names.map((name) => (
      <span key={name} className="work-report-report-manager-badge">
        {name}
      </span>
    ))
  }

  const renderWorkReportChecklistSectionV5 = (date) => (
    <section className="work-report-report-section">
      <div className="work-report-report-section-title">주요 확인사항</div>
      <div className="work-report-report-line-list">
        {Array.from({ length: WORK_REPORT_MAIN_CHECK_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const cellKey = getWorkReportCellKey(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)
          const isEditing = editingWorkCellKey === cellKey
          const entry = getDisplayedWorkReportEntry(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)

          if (isEditing && editingWorkCellData) {
            return (
              <div
                key={`check-v5-${date}-${orderIndex}`}
                className="work-report-report-line-edit"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    commitWorkReportEdit()
                  }
                }}
              >
                <span className="work-report-report-line-number">{orderIndex}.</span>
                <input
                  className="work-report-report-input compact"
                  type="text"
                  value={editingWorkCellData.content}
                  autoFocus
                  placeholder="내용 입력"
                  onChange={(e) => handleWorkReportEditorChange('content', e.target.value)}
                  onKeyDown={(e) => handleWorkReportInlineKeyDown(e)}
                />
              </div>
            )
          }

          return (
            <button
              key={`check-v5-${date}-${orderIndex}`}
              type="button"
              className="work-report-report-line-button"
              onClick={() => startWorkReportCellEdit(date, WORK_REPORT_SECTION_KEYS.checklist, orderIndex)}
            >
              <span className="work-report-report-line-number">{orderIndex}.</span>
              <span className={`work-report-report-line-text ${entry?.content ? 'has-value' : 'is-empty'}`}>
                {entry?.content || ' '}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportExternalSectionV5 = (date) => (
    <section className="work-report-report-section">
      <div className="work-report-report-section-title">외부일정</div>
      <div className="work-report-report-table-scroll">
        <div className="work-report-report-table">
          <div className="work-report-report-table-head">
            <div>담당자</div>
            <div>내용</div>
            <div>목적지</div>
          </div>
          {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
            const orderIndex = index + 1
            const cellKey = getWorkReportCellKey(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)
            const isEditing = editingWorkCellKey === cellKey
            const entry = getDisplayedWorkReportEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

            if (isEditing && editingWorkCellData) {
              const selectedManagers = getWorkReportManagerNames(editingWorkCellData.user)
              return (
                <div
                  key={`external-v5-${date}-${orderIndex}`}
                  className="work-report-report-table-row editing"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      commitWorkReportEdit()
                    }
                  }}
                >
                  <div className="work-report-report-manager-editor">
                    <div className="work-report-report-manager-chip-row">
                      {renderWorkReportManagerBadges(editingWorkCellData.user)}
                    </div>
                    <div className="work-report-report-manager-picker">
                      {WORK_REPORT_EXTERNAL_USER_OPTIONS.map((option) => {
                        const checked = selectedManagers.includes(option)
                        return (
                          <label key={option} className="work-report-report-manager-option">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                handleWorkReportEditorChange(
                                  'user',
                                  toggleWorkReportManagerName(editingWorkCellData.user, option)
                                )
                              }
                            />
                            <span>{option}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <textarea
                    className="work-report-report-textarea external"
                    rows={2}
                    autoFocus
                    value={editingWorkCellData.content}
                    placeholder="내용 입력"
                    onChange={(e) => handleWorkReportEditorChange('content', e.target.value)}
                    onKeyDown={(e) => handleWorkReportInlineKeyDown(e, { multiline: true })}
                  />
                  <input
                    className="work-report-report-input destination"
                    type="text"
                    value={editingWorkCellData.destination}
                    placeholder="목적지 입력"
                    onChange={(e) => handleWorkReportEditorChange('destination', e.target.value)}
                    onKeyDown={(e) => handleWorkReportInlineKeyDown(e)}
                  />
                </div>
              )
            }

            return (
              <button
                key={`external-v5-${date}-${orderIndex}`}
                type="button"
                className="work-report-report-table-row"
                onClick={() => startWorkReportCellEdit(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
              >
                <div className="work-report-report-manager-cell">{renderWorkReportManagerBadges(entry?.user)}</div>
                <div className={`work-report-report-content-cell ${entry?.content ? 'has-value' : 'is-empty'}`}>
                  {entry?.content || ' '}
                </div>
                <div className={`work-report-report-destination-cell ${entry?.destination ? 'has-value' : 'is-empty'}`}>
                  {entry?.destination || ' '}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )

  const renderWorkReportManagerSectionV5 = (date, title, section, managers, contentClassName) => (
    <section className="work-report-report-section">
      <div className="work-report-report-section-title">{title}</div>
      <div className="work-report-report-manager-list">
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const cellKey = getWorkReportCellKey(date, section, orderIndex)
          const isEditing = editingWorkCellKey === cellKey
          const entry = getDisplayedWorkReportEntry(date, section, orderIndex)

          if (isEditing && editingWorkCellData) {
            return (
              <div
                key={`manager-v5-${section}-${date}-${orderIndex}`}
                className="work-report-report-manager-block editing"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    commitWorkReportEdit()
                  }
                }}
              >
                <div className="work-report-report-manager-heading">
                  <span className="work-report-report-order-badge">{orderIndex}</span>
                  <span className="work-report-report-manager-badge fixed">{managerName}</span>
                </div>
                <textarea
                  className={`work-report-report-textarea ${contentClassName}`}
                  rows={4}
                  autoFocus
                  value={editingWorkCellData.content}
                  placeholder="내용 입력"
                  onChange={(e) => {
                    handleWorkReportEditorChange('user', managerName)
                    handleWorkReportEditorChange('content', e.target.value)
                  }}
                  onKeyDown={(e) => handleWorkReportInlineKeyDown(e, { multiline: true })}
                />
              </div>
            )
          }

          return (
            <button
              key={`manager-v5-${section}-${date}-${orderIndex}`}
              type="button"
              className="work-report-report-manager-block"
              onClick={() => startWorkReportCellEdit(date, section, orderIndex)}
            >
              <div className="work-report-report-manager-heading">
                <span className="work-report-report-order-badge">{orderIndex}</span>
                <span className="work-report-report-manager-badge fixed">{managerName}</span>
              </div>
              <div className={`work-report-report-block-content ${entry?.content ? 'has-value' : 'is-empty'}`}>
                {entry?.content || ' '}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportListV5 = (date, title, section) => (
    <div className="work-report-report-support-block">
      <div className="work-report-report-subtitle">{title}</div>
      <div className="work-report-report-line-list support">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const cellKey = getWorkReportCellKey(date, section, orderIndex)
          const isEditing = editingWorkCellKey === cellKey
          const entry = getDisplayedWorkReportEntry(date, section, orderIndex)

          if (isEditing && editingWorkCellData) {
            return (
              <div
                key={`support-v5-${date}-${section}-${orderIndex}`}
                className="work-report-report-line-edit"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    commitWorkReportEdit()
                  }
                }}
              >
                <span className="work-report-report-line-number">{orderIndex}.</span>
                <input
                  className="work-report-report-input compact"
                  type="text"
                  value={editingWorkCellData.content}
                  autoFocus
                  placeholder="내용 입력"
                  onChange={(e) => handleWorkReportEditorChange('content', e.target.value)}
                  onKeyDown={(e) => handleWorkReportInlineKeyDown(e)}
                />
              </div>
            )
          }

          return (
            <button
              key={`support-v5-${date}-${section}-${orderIndex}`}
              type="button"
              className="work-report-report-line-button"
              onClick={() => startWorkReportCellEdit(date, section, orderIndex)}
            >
              <span className="work-report-report-line-number">{orderIndex}.</span>
              <span className={`work-report-report-line-text ${entry?.content ? 'has-value' : 'is-empty'}`}>
                {entry?.content || ' '}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV5 = (date) => (
    <section className="work-report-report-section">
      <div className="work-report-report-section-title">영업지원</div>
      <div className="work-report-report-support-wrap">
        {renderWorkReportSupportListV5(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportListV5(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportDayBoardV5 = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense report-mode ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head report-mode">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense report-mode">
        {renderWorkReportChecklistSectionV5(day.date)}
        {renderWorkReportExternalSectionV5(day.date)}
        <section className="work-report-report-section">
          <div className="work-report-report-section-title">업무일지</div>
          <div className="work-report-report-journal-wrap">
            {renderWorkReportManagerSectionV5(
              day.date,
              'DI사업',
              WORK_REPORT_SECTION_KEYS.di,
              WORK_REPORT_DI_MANAGERS,
              'di'
            )}
            {renderWorkReportManagerSectionV5(
              day.date,
              '도로사업',
              WORK_REPORT_SECTION_KEYS.road,
              WORK_REPORT_ROAD_MANAGERS,
              'road'
            )}
            {renderWorkReportSupportSectionV5(day.date)}
          </div>
        </section>
      </div>
    </div>
  )

  if (!isAppAuthenticated) {
    return (
      <div className="app-shell auth-screen">
        {renderAuthCard({
          title: '스마트DI사업부 통합관리',
          subtitle: '공용 비밀번호를 입력한 뒤 시스템에 접속하세요.',
          passwordValue: appPasswordInput,
          onPasswordChange: (e) => {
            setAppPasswordInput(e.target.value)
            if (appLoginError) {
              setAppLoginError('')
            }
          },
          onSubmit: handleAppLogin,
          error: appLoginError,
          submitLabel: '로그인',
        })}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="company-logo-box">
            <img className="company-logo-img" src="/logo.png" alt="스마트DI" />
          </div>

          <div className="menu">
            <button
              className={menu === 'dashboard' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('dashboard')}
            >
              대시보드
            </button>

            <button
              className={menu === 'workReports' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('workReports')}
            >
              일일/주간업무보고서
            </button>

            <button
              className={menu === 'contracts' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('contracts')}
            >
              계약현황
            </button>

            <button
              className={menu === 'calendar' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('calendar')}
            >
              <span className="menu-label-strong">캘린더</span>
            </button>

            <button
              className={menu === 'sales' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('sales')}
            >
              영업관리대장
            </button>

            <button
              className={menu === 'budget' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('budget')}
            >
              본예산 진행정보
            </button>

            <button
              className={menu === 'discovery' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('discovery')}
            >
              건축정보
            </button>

            <button
              className={menu === 'excluded' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('excluded')}
            >
              사업검색이력
            </button>

            <button
              className={menu === 'documents' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('documents')}
            >
              문서수발신대장
            </button>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="viewer-badge">{isAdmin ? '관리자 모드' : '뷰어 모드'}</div>
          <button className="logout-btn" type="button" onClick={handleAdminLogin}>
            {isAdmin ? '관리자 로그아웃' : '관리자 로그인'}
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={handleAppLogout}
            style={{ width: '100%', marginTop: 8 }}
          >
            앱 로그아웃
          </button>
        </div>
      </aside>

      <main className="main-area">
        <div className="top-system-bar">
          <div className="top-system-title">
            <span>스마트DI사업부 통합관리</span>
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <span className="top-system-subtitle">{TOP_SYSTEM_SUBTITLE}</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 30,
                  padding: '0 10px',
                  borderRadius: 999,
                  background: remainingSessionMinutes <= 1 ? '#fef2f2' : '#eef5ff',
                  border: remainingSessionMinutes <= 1 ? '1px solid #fecaca' : '1px solid #cfe0ff',
                  color: remainingSessionMinutes <= 1 ? '#b91c1c' : '#1f4fd1',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                남은 시간 {remainingSessionMinutes}분
              </span>
              <button
                className="secondary-btn"
                type="button"
                onClick={handleExtendLogin}
                style={{ minHeight: 34, padding: '7px 12px' }}
              >
                로그인 연장
              </button>
            </div>
          </div>
        </div>

        <div className="page-title-bar unified-title-bar">
          <h1>{PAGE_TITLE_MAP[menu]}</h1>
        </div>

        <input
          ref={registryUploadInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onClick={(e) => {
            console.log('[excel-upload] file input click')
            e.currentTarget.value = ''
          }}
          onInput={handleRegistryUploadFileChange}
          onChange={handleRegistryUploadFileChange}
          style={{ display: 'none' }}
        />

        {toastMessage && <div className="mode-toast">{toastMessage}</div>}

        {showSessionWarning && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
              padding: '12px 14px',
              border: remainingSessionMinutes <= 1 ? '1px solid #fecaca' : '1px solid #fed7aa',
              borderRadius: 8,
              background: remainingSessionMinutes <= 1 ? '#fef2f2' : '#fff7ed',
              color: remainingSessionMinutes <= 1 ? '#b91c1c' : '#b45309',
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              세션이 곧 만료됩니다 (약 {remainingSessionMinutes}분 남음)
            </div>

            <button
              className="primary-btn"
              type="button"
              onClick={handleExtendLogin}
              style={{ minWidth: 108, whiteSpace: 'nowrap' }}
            >
              로그인 연장
            </button>
          </div>
        )}

        {menu === 'dashboard' && (
          <section className="stat-card">
            <div className="integrated-dashboard">
              <div className="dashboard-section-header">
                <div>
                  <p className="dashboard-section-eyebrow">전체 요약</p>
                  <h2>통합 업무 현황</h2>
                </div>
                <span>각 카드를 클릭하면 해당 메뉴로 이동합니다.</span>
              </div>

              <div className="dashboard-overview-grid">
                {dashboardData.overview.map((item) => (
                  <button
                    className="dashboard-overview-card"
                    type="button"
                    key={item.key}
                    onClick={() => setMenu(item.menu)}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count.toLocaleString('ko-KR')}건</strong>
                  </button>
                ))}
              </div>

              <div className="dashboard-mid-grid">
                <div className="dashboard-panel">
                  <div className="dashboard-panel-header">
                    <div>
                      <p className="dashboard-section-eyebrow">상태별 요약</p>
                      <h3>진행 상태</h3>
                    </div>
                  </div>

                  <div className="dashboard-status-grid">
                    {dashboardData.statusGroups.map((group) => (
                      <button
                        className="dashboard-status-card"
                        type="button"
                        key={group.key}
                        onClick={() => setMenu(group.menu)}
                      >
                        <div className="dashboard-status-card-title">{group.label}</div>
                        <div className="dashboard-status-list">
                          {group.items.map((item) => (
                            <div className="dashboard-status-item" key={`${group.key}-${item.status}`}>
                              <span className={getSalesStageClassName(item.status)}>{item.status}</span>
                              <strong>{item.count.toLocaleString('ko-KR')}</strong>
                            </div>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="dashboard-work-report-card"
                  type="button"
                  onClick={() => {
                    trackWorkWeek(dashboardWorkReportWeekMeta.weekStartDate)
                    setMenu('workReports')
                  }}
                >
                  <span className="dashboard-section-eyebrow">바로가기</span>
                  <strong>일일/주간업무보고서</strong>
                  <span>{getWorkReportWeekLabel(dashboardWorkReportWeekMeta.weekStartDate)}</span>
                  <small>현재 또는 최신 주차 업무보고서로 이동</small>
                </button>
              </div>

              <div className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <p className="dashboard-section-eyebrow">최근 등록 내역</p>
                    <h3>메뉴별 최신 5건</h3>
                  </div>
                </div>

                <div className="dashboard-recent-grid">
                  {dashboardData.recentGroups.map((group) => (
                    <div className="dashboard-recent-card" key={group.key}>
                      <button
                        className="dashboard-recent-title"
                        type="button"
                        onClick={() => setMenu(group.menu)}
                      >
                        {group.label}
                      </button>

                      <div className="dashboard-recent-list">
                        {group.items.length > 0 ? (
                          group.items.map((item) => (
                            <button
                              className="dashboard-recent-item"
                              type="button"
                              key={`${group.key}-${item.id || item.title}-${item.date}`}
                              onClick={() => setMenu(group.menu)}
                            >
                              <span className="dashboard-recent-date">{item.date}</span>
                              <span className="dashboard-recent-main">{item.title}</span>
                              <span className="dashboard-recent-meta">{item.meta}</span>
                            </button>
                          ))
                        ) : (
                          <div className="dashboard-recent-empty">등록 내역이 없습니다.</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dashboard-year-list">
              <div className="dashboard-section-header legacy-contract-dashboard-title">
                <div>
                  <p className="dashboard-section-eyebrow">계약현황 상세</p>
                  <h2>연도별 계약금액 현황</h2>
                </div>
              </div>

              {dashboardSummary.years.map((yearBlock) => {
                const isCollapsed = !isDashboardYearOpen(yearBlock.year)

                return (
                  <section className="dashboard-year-accordion" key={yearBlock.year}>
                    <div className="dashboard-year-summary">
                      <div className="dashboard-year-title">
                        <span>{yearBlock.year}년</span>
                        <span className="dashboard-year-total">
                          총 {yearBlock.totalAmount.toLocaleString('ko-KR')}원
                        </span>
                      </div>

                      <button
                        className="panel-toggle-btn"
                        type="button"
                        aria-label={`${yearBlock.year}년 ${isCollapsed ? '펼치기' : '접기'}`}
                        onClick={() => toggleDashboardYear(yearBlock.year)}
                      >
                        {isCollapsed ? '+' : '-'}
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="dashboard-year-cards">
                        {yearBlock.items.map((item) => (
                          <div className="dashboard-year-card" key={`${yearBlock.year}-${item.name}`}>
                            <div className="graph-card-title">{item.name}</div>

                            <div className="year-card-body">
                              <div
                                className="dashboard-donut"
                                style={{ '--ratio': `${Math.min(item.ratio, 100)}%` }}
                                aria-label={`${item.name} 비율 ${formatPercent(item.ratio)}`}
                              >
                                <span>{formatPercent(item.ratio)}</span>
                              </div>

                              <div className="year-card-metrics">
                                <div className="year-card-metric">
                                  <span className="year-card-label">계약</span>
                                  <strong>{item.count.toLocaleString('ko-KR')}건</strong>
                                </div>

                                <div className="year-card-metric">
                                  <span className="year-card-label">금액</span>
                                  <strong>{item.amount.toLocaleString('ko-KR')}원</strong>
                                </div>

                                <div className="year-card-metric ratio">
                                  <span className="year-card-label">비율</span>
                                  <strong>{formatPercent(item.ratio)}</strong>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </section>
        )}

        {menu === 'workReports' && (
          <section className="stat-card">
            <div className="contracts-header-actions work-report-toolbar">
              <button className="primary-btn" type="button" onClick={handleCreateCurrentWorkWeek}>
                새 주차 생성
              </button>
              <button className="secondary-btn" type="button" onClick={() => handleShiftWorkWeek(-1)}>
                이전 주
              </button>
              <select
                className="contract-filter-select work-report-week-select"
                value={selectedWorkWeek}
                onChange={(e) => trackWorkWeek(e.target.value)}
              >
                {workReportWeekOptions.map((option) => (
                  <option key={option.weekStartDate} value={option.weekStartDate}>
                    {getWorkReportWeekLabel(option.weekStartDate)}
                  </option>
                ))}
              </select>
              <button className="secondary-btn" type="button" onClick={() => handleShiftWorkWeek(1)}>
                다음 주
              </button>
              <input
                className="table-search-input work-report-filter-input"
                type="text"
                placeholder="담당자"
                value={workReportFilters.assignee}
                onChange={(e) =>
                  setWorkReportFilters((prev) => ({ ...prev, assignee: e.target.value }))
                }
              />
              <button className="secondary-btn" type="button" onClick={handleWorkReportBoardPdfDownload}>
                PDF 다운로드
              </button>
            </div>

            <div className="work-report-summary-card">
              <div className="work-report-summary-title">
                {getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)}
              </div>
              <div className="work-report-summary-meta">
                <span>주차 {selectedWorkWeekMeta.weekNumber}주차</span>
                <span>시작일 {selectedWorkWeekMeta.weekStartDate}</span>
                <span>담당자 {workReportFilters.assignee || '전체'}</span>
              </div>
            </div>

            <div className="work-report-week-grid">
              {selectedWorkWeekDays.map((day) => renderWorkReportDayBoardV5(day))}
            </div>

            {isSavingWorkReports && (
              <div className="work-report-saving-indicator">업무보고 내용을 저장하고 있습니다.</div>
            )}

            <div className="work-report-help-text">
              각 항목을 클릭하면 바로 입력할 수 있고, 포커스가 빠질 때 자동 저장됩니다.
            </div>
          </section>
        )}

        {menu === 'contracts' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              {isAdmin && (
                <>
                  <button className="primary-btn" type="button" onClick={openAddRow}>
                    추가
                  </button>

                  <button className="secondary-btn" type="button" onClick={handleExcelImportClick}>
                    엑셀 업로드
                  </button>

                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={deleteSelectedContracts}
                    disabled={selectedContractIds.length === 0}
                  >
                    선택 삭제
                  </button>
                </>
              )}

              <button className="secondary-btn" type="button" onClick={handleExcelDownload}>
                엑셀로 내려받기
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                style={{ display: 'none' }}
              />
            </div>

            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="사업명, 발주처, 계약번호, 담당부서 등 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="table-summary-box">
                <div className="table-summary-label">필터 결과 합계 금액</div>
                <div className="table-summary-value">
                  {filteredTotalAmount.toLocaleString('ko-KR')}원
                </div>
              </div>
            </div>

            <div className="contract-filter-row five-only">
              <select
                className="contract-filter-select"
                value={filters.year}
                onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value }))}
              >
                {getOptions(contracts, 'year').map((option) => (
                  <option key={option} value={option}>
                    {getYearLabel(option)}
                  </option>
                ))}
              </select>

              <select
                className="contract-filter-select"
                value={filters.contractMethod}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, contractMethod: e.target.value }))
                }
              >
                {getOptions(contracts, 'contractMethod').map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                className="contract-filter-select"
                value={filters.contractType}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, contractType: e.target.value }))
                }
              >
                {getOptions(contracts, 'contractType').map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                className="contract-filter-select"
                value={filters.salesOwner}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, salesOwner: e.target.value }))
                }
              >
                {getOptions(contracts, 'salesOwner').map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                className="contract-filter-select"
                value={filters.pm}
                onChange={(e) => setFilters((prev) => ({ ...prev, pm: e.target.value }))}
              >
                {getOptions(contracts, 'pm').map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table registry-table">
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allContractsSelected}
                          onChange={() =>
                            setSelectedContractIds((prev) =>
                              allContractsSelected
                                ? prev.filter((id) => !filteredContracts.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredContracts.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      <th className="col-dday th-align-center">D-Day</th>
                      {CONTRACT_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`${column.className} ${
                            column.align === 'right'
                              ? 'th-align-right'
                              : column.align === 'left'
                              ? 'th-align-left'
                              : 'th-align-center'
                          }`}
                          style={column.width ? { width: column.width } : undefined}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {isAddingRow && (
                      <tr className="inline-add-row">
                        <td className="td-align-center registry-check-cell">
                          <div className="inline-row-actions" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch', minWidth: 52 }}>
                            <button className="mini-save-btn" type="button" onClick={saveAddRow} style={{ width: '100%' }}>
                              저장
                            </button>
                            <button className="mini-cancel-btn" type="button" onClick={cancelAddRow} style={{ width: '100%' }}>
                              취소
                            </button>
                          </div>
                        </td>

                        <td className="col-dday td-align-center">
                          <div className="cell-display dday-cell">{getDdayText(newRow.dueDate)}</div>
                        </td>

                        {CONTRACT_COLUMNS.map((column) => (
                          <td
                            key={column.key}
                            className={`${column.className} ${
                              column.align === 'right'
                                ? 'td-align-right'
                                : column.align === 'left'
                                ? 'td-align-left'
                                : 'td-align-center'
                            }`}
                            style={column.width ? { width: column.width } : undefined}
                          >
                            {column.type === 'textarea' ? (
                              <textarea
                                className={`inline-row-editor cell-inline-editor ${
                                  column.align === 'right' ? 'align-right' : ''
                                }`}
                                rows={1}
                                value={newRow[column.key] ?? ''}
                                onChange={(e) =>
                                  setNewRow((prev) => ({
                                    ...prev,
                                    [column.key]:
                                      column.key === 'amount'
                                        ? formatAmount(e.target.value)
                                        : e.target.value,
                                  }))
                                }
                              />
                            ) : column.type === 'date' ? (
                              <input
                                className="inline-row-editor cell-inline-editor"
                                type="date"
                                value={newRow[column.key] ?? ''}
                                onChange={(e) =>
                                  setNewRow((prev) => ({
                                    ...prev,
                                    [column.key]: e.target.value,
                                  }))
                                }
                              />
                            ) : (
                              <input
                                className={`inline-row-editor cell-inline-editor ${
                                  column.align === 'right' ? 'align-right' : ''
                                }`}
                                type="text"
                                value={newRow[column.key] ?? ''}
                                onChange={(e) =>
                                  setNewRow((prev) => ({
                                    ...prev,
                                    [column.key]:
                                      column.key === 'amount'
                                        ? formatAmount(e.target.value)
                                        : e.target.value,
                                  }))
                                }
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    )}

                    {filteredContracts.length === 0 && !isAddingRow ? (
                      <tr>
                        <td colSpan={CONTRACT_COLUMNS.length + 2} className="empty-cell">
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      groupedContracts.flatMap((yearBlock) => {
                        const collapsed = !isContractYearOpen(yearBlock.year)

                        const yearRow = (
                          <tr className="contract-year-row" key={`year-${yearBlock.year}`}>
                            <td colSpan={CONTRACT_COLUMNS.length + 2}>
                              <button
                                className="contract-year-toggle"
                                type="button"
                                onClick={() => toggleContractYear(yearBlock.year)}
                              >
                                <span className="contract-year-sign">{collapsed ? '+' : '-'}</span>
                                <span>{yearBlock.year}년</span>
                                <span className="contract-year-count">
                                  {yearBlock.items.length.toLocaleString('ko-KR')}건
                                </span>
                              </button>
                            </td>
                          </tr>
                        )

                        if (collapsed) return [yearRow]

                        return [
                          yearRow,
                          ...yearBlock.items.map((item, index) => {
                            return (
                              <tr key={item.id} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                                <td className="td-align-center registry-check-cell">
                                  <input
                                    className="registry-row-checkbox"
                                    type="checkbox"
                                    checked={selectedContractIds.includes(item.id)}
                                    onChange={() => toggleContractSelection(item.id)}
                                  />
                                </td>

                                <td className="col-dday td-align-center">
                                  <div className="cell-display dday-cell">{getDdayText(item.dueDate)}</div>
                                </td>

                                {CONTRACT_COLUMNS.map((column) => {
                                  const isEditing =
                                    editingCell?.rowId === item.id && editingCell?.key === column.key

                                  return (
                                    <td
                                      key={column.key}
                                      className={`${column.className} ${
                                        column.align === 'right'
                                          ? 'td-align-right'
                                          : column.align === 'left'
                                          ? 'td-align-left'
                                          : 'td-align-center'
                                      } ${column.type === 'textarea' ? 'multiline-cell' : ''} ${
                                        column.key === 'note' ? 'note-cell' : ''
                                      } ${isAdmin ? 'editable-cell' : ''}`}
                                      style={column.width ? { width: column.width } : undefined}
                                      onClick={() => startEdit(item.id, column.key, item[column.key])}
                                    >
                                      {isEditing ? (
                                        renderEditor(item, column)
                                      ) : (
                                        <div className="cell-display">
                                          {column.key === 'amount'
                                            ? formatAmountDisplay(item[column.key])
                                            : item[column.key]}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          }),
                        ]
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'sales' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddSalesRow}>
                추가
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('sales')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedSalesRows}
                disabled={selectedSalesIds.length === 0}
              >
                선택 삭제
              </button>
              {isAdmin && (
                <button
                  className="secondary-btn danger-btn"
                  type="button"
                  onClick={() =>
                    deleteAllRegistryRows({
                      fetchRows: fetchSalesRows,
                      clearDraftRows: () => setSalesRows([]),
                      clearEditingIds: () => setEditingSalesIds([]),
                      clearSnapshots: () => setSalesEditSnapshots({}),
                      clearSelectedIds: () => setSelectedSalesIds([]),
                      deleteAllRows: salesRegisterApi.removeAll,
                    })
                  }
                >
                  전체 삭제
                </button>
              )}
              <select
                className="contract-filter-select"
                value={salesFilters.projectCategory}
                onChange={(e) =>
                  setSalesFilters((prev) => ({ ...prev, projectCategory: e.target.value }))
                }
                style={{ width: 132 }}
              >
                <option value="">사업구분</option>
                {SALES_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="contract-filter-select"
                value={salesFilters.manager}
                onChange={(e) => setSalesFilters((prev) => ({ ...prev, manager: e.target.value }))}
                style={{ width: 150 }}
              >
                <option value="">담당자</option>
                {SALES_REGISTER_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="contract-filter-select"
                value={salesFilters.projectStage}
                onChange={(e) =>
                  setSalesFilters((prev) => ({ ...prev, projectStage: e.target.value }))
                }
                style={{ width: 132 }}
              >
                <option value="">상태</option>
                {SALES_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button className="secondary-btn" type="button" onClick={handleSalesExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="검색어를 입력하세요"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
              />
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table registry-table">
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allSalesSelected}
                          onChange={() =>
                            setSelectedSalesIds((prev) =>
                              allSalesSelected
                                ? prev.filter((id) => !filteredSalesRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredSalesRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {SALES_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={
                            column.align === 'right'
                              ? 'th-align-right'
                              : column.align === 'left'
                              ? 'th-align-left'
                              : 'th-align-center'
                          }
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderGroupedRegistryRows({
                      groups: groupedSalesRows,
                      columns: SALES_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedSalesIds,
                      onToggleSelection: toggleSalesSelection,
                      editingIds: editingSalesIds,
                      isSaving: isSavingSales,
                      onStartEdit: startSalesEdit,
                      onSaveRow: saveSalesRow,
                      onCancelRow: cancelSalesRow,
                      onChange: handleSalesCellChange,
                      isEmptyRow: isSalesRowEmpty,
                      isYearOpen: isSalesYearOpen,
                      onToggleYear: toggleSalesYear,
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'budget' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddBudgetRow}>
                추가
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('budget')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedBudgetRows}
                disabled={selectedBudgetIds.length === 0}
              >
                선택 삭제
              </button>
              {isAdmin && (
                <button
                  className="secondary-btn danger-btn"
                  type="button"
                  onClick={() =>
                    deleteAllRegistryRows({
                      fetchRows: fetchBudgetRows,
                      clearDraftRows: () => setBudgetRows([]),
                      clearEditingIds: () => setEditingBudgetIds([]),
                      clearSnapshots: () => setBudgetEditSnapshots({}),
                      clearSelectedIds: () => setSelectedBudgetIds([]),
                      deleteAllRows: budgetProgressApi.removeAll,
                    })
                  }
                >
                  전체 삭제
                </button>
              )}
              <select
                className="contract-filter-select"
                value={budgetFilters.manager}
                onChange={(e) => setBudgetFilters((prev) => ({ ...prev, manager: e.target.value }))}
                style={{ width: 150 }}
              >
                <option value="">담당자</option>
                {SALES_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="contract-filter-select"
                value={budgetFilters.projectStage}
                onChange={(e) =>
                  setBudgetFilters((prev) => ({ ...prev, projectStage: e.target.value }))
                }
                style={{ width: 132 }}
              >
                <option value="">상태</option>
                {SALES_STAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button className="secondary-btn" type="button" onClick={handleBudgetExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="검색어를 입력하세요"
                value={budgetSearch}
                onChange={(e) => setBudgetSearch(e.target.value)}
              />
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table registry-table">
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allBudgetSelected}
                          onChange={() =>
                            setSelectedBudgetIds((prev) =>
                              allBudgetSelected
                                ? prev.filter((id) => !filteredBudgetRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredBudgetRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {BUDGET_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={
                            column.align === 'right'
                              ? 'th-align-right'
                              : column.align === 'left'
                              ? 'th-align-left'
                              : 'th-align-center'
                          }
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderGroupedRegistryRows({
                      groups: groupedBudgetRows,
                      columns: BUDGET_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedBudgetIds,
                      onToggleSelection: toggleBudgetSelection,
                      editingIds: editingBudgetIds,
                      isSaving: isSavingBudget,
                      onStartEdit: startBudgetEdit,
                      onSaveRow: saveBudgetRow,
                      onCancelRow: cancelBudgetRow,
                      onChange: handleBudgetCellChange,
                      isEmptyRow: isBudgetRowEmpty,
                      isYearOpen: isBudgetYearOpen,
                      onToggleYear: toggleBudgetYear,
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'discovery' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddDiscoveryRow}>
                추가
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('discovery')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedDiscoveryRows}
                disabled={selectedDiscoveryIds.length === 0}
              >
                선택 삭제
              </button>
              {isAdmin && (
                <button
                  className="secondary-btn danger-btn"
                  type="button"
                  onClick={() =>
                    deleteAllRegistryRows({
                      fetchRows: fetchDiscoveryRows,
                      clearDraftRows: () => setDiscoveryRows([]),
                      clearEditingIds: () => setEditingDiscoveryIds([]),
                      clearSnapshots: () => setDiscoveryEditSnapshots({}),
                      clearSelectedIds: () => setSelectedDiscoveryIds([]),
                      deleteAllRows: projectDiscoveryApi.removeAll,
                    })
                  }
                >
                  전체 삭제
                </button>
              )}
              <select
                className="contract-filter-select"
                value={discoveryFilters.projectCategory}
                onChange={(e) =>
                  setDiscoveryFilters((prev) => ({ ...prev, projectCategory: e.target.value }))
                }
                style={{ width: 132 }}
              >
                <option value="">사업구분</option>
                {DISCOVERY_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="contract-filter-select"
                value={discoveryFilters.manager}
                onChange={(e) =>
                  setDiscoveryFilters((prev) => ({ ...prev, manager: e.target.value }))
                }
                style={{ width: 150 }}
              >
                <option value="">담당자</option>
                {SALES_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button className="secondary-btn" type="button" onClick={handleDiscoveryExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="검색어를 입력하세요"
                value={discoverySearch}
                onChange={(e) => setDiscoverySearch(e.target.value)}
              />
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table registry-table">
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allDiscoverySelected}
                          onChange={() =>
                            setSelectedDiscoveryIds((prev) =>
                              allDiscoverySelected
                                ? prev.filter((id) => !filteredDiscoveryRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredDiscoveryRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {DISCOVERY_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={
                            column.align === 'right'
                              ? 'th-align-right'
                              : column.align === 'left'
                              ? 'th-align-left'
                              : 'th-align-center'
                          }
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderGroupedRegistryRows({
                      groups: groupedDiscoveryRows,
                      columns: DISCOVERY_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedDiscoveryIds,
                      onToggleSelection: toggleDiscoverySelection,
                      editingIds: editingDiscoveryIds,
                      isSaving: isSavingDiscovery,
                      onStartEdit: startDiscoveryEdit,
                      onSaveRow: saveDiscoveryRow,
                      onCancelRow: cancelDiscoveryRow,
                      onChange: handleDiscoveryCellChange,
                      isEmptyRow: isDiscoveryRowEmpty,
                      isYearOpen: isDiscoveryYearOpen,
                      onToggleYear: toggleDiscoveryYear,
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'excluded' && (
          <section className="stat-card">
            <div className="guide-panel excluded-guide-panel">
              <div className="guide-panel-header">
                <div className="guide-panel-title">안내 문구</div>
                <button
                  className="guide-panel-toggle"
                  type="button"
                  aria-label={`사업검색이력 안내 ${isExcludedGuideCollapsed ? '펼치기' : '접기'}`}
                  onClick={() => setIsExcludedGuideCollapsed((prev) => !prev)}
                >
                  {isExcludedGuideCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isExcludedGuideCollapsed && (
                <div className="guide-panel-body excluded-guide-copy">
                  <div>
                    ※ 기본 제외사항 : 지역제한, 수의계약, 지명경쟁(전자조합추천) / 서울(1억~), 타지역(3억~)
                  </div>
                  <div>
                    ※ 검색 키워드 : 전광판, 미디어, 파사드, 사이니지, 디스플레이, LED, 앞에 키워드+디지털, ITS, VMS
                  </div>
                  <div>
                    ※ 검색 품명(분류번호) : 안내전광판(5512190301), 기상전광판(5512190302), 교통정보전광판(5512190303), 융복합안내전광판(9955121901), 영상정보디스플레이장치(4511189301)
                  </div>
                </div>
              )}
            </div>

            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddExcludedRow}>
                추가
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('excluded')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedExcludedRows}
                disabled={selectedExcludedIds.length === 0}
              >
                선택 삭제
              </button>
              {isAdmin && (
                <button
                  className="secondary-btn danger-btn"
                  type="button"
                  onClick={() =>
                    deleteAllRegistryRows({
                      fetchRows: fetchExcludedRows,
                      clearDraftRows: () => setExcludedRows([]),
                      clearEditingIds: () => setEditingExcludedIds([]),
                      clearSnapshots: () => setExcludedEditSnapshots({}),
                      clearSelectedIds: () => setSelectedExcludedIds([]),
                      deleteAllRows: excludedProjectsApi.removeAll,
                    })
                  }
                >
                  전체 삭제
                </button>
              )}
              <select
                className="contract-filter-select"
                value={excludedFilters.category}
                onChange={(e) => setExcludedFilters((prev) => ({ ...prev, category: e.target.value }))}
                style={{ width: 132 }}
              >
                <option value="">상태</option>
                {EXCLUDED_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="contract-filter-select"
                value={excludedFilters.keyword}
                onChange={(e) => setExcludedFilters((prev) => ({ ...prev, keyword: e.target.value }))}
                style={{ width: 180 }}
              >
                <option value="">검색어</option>
                {EXCLUDED_KEYWORD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button className="secondary-btn" type="button" onClick={handleExcludedExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="검색어를 입력하세요"
                value={excludedSearch}
                onChange={(e) => setExcludedSearch(e.target.value)}
              />
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table registry-table">
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allExcludedSelected}
                          onChange={() =>
                            setSelectedExcludedIds((prev) =>
                              allExcludedSelected
                                ? prev.filter((id) => !filteredExcludedRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredExcludedRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {EXCLUDED_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={
                            column.align === 'right'
                              ? 'th-align-right'
                              : column.align === 'left'
                              ? 'th-align-left'
                              : 'th-align-center'
                          }
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderGroupedRegistryRows({
                      groups: groupedExcludedRows,
                      columns: EXCLUDED_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedExcludedIds,
                      onToggleSelection: toggleExcludedSelection,
                      editingIds: editingExcludedIds,
                      isSaving: isSavingExcluded,
                      onStartEdit: startExcludedEdit,
                      onSaveRow: saveExcludedRow,
                      onCancelRow: cancelExcludedRow,
                      onChange: handleExcludedCellChange,
                      isEmptyRow: isExcludedRowEmpty,
                      isYearOpen: isExcludedYearOpen,
                      onToggleYear: toggleExcludedYear,
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'documents' && (
          <section className="stat-card">
            <div className="guide-panel">
              <div className="guide-panel-header">
                <div className="guide-panel-title">안내 문구</div>
                <button
                  className="guide-panel-toggle"
                  type="button"
                  aria-label={`문서수발신대장 안내 ${isDocumentGuideCollapsed ? '펼치기' : '접기'}`}
                  onClick={() => setIsDocumentGuideCollapsed((prev) => !prev)}
                >
                  {isDocumentGuideCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isDocumentGuideCollapsed && (
                <div className="guide-panel-body">
                  <div className="doc-guide-layout">
                    <div className="doc-guide-pattern">
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>문서번호 체계 안내</div>
                      <div className="doc-guide-code">SIGN-DI-S-260000-01</div>
                      <div className="doc-guide-code">SIGN-DI-R-260000-01</div>
                      <div className="doc-guide-code">SIGN-DI-A-260000-01</div>
                    </div>

                    <div className="doc-guide-owners-wrap">
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>담당자 약어</div>
                      <div className="doc-guide-owners-grid">
                        <div className="doc-guide-owner-col">
                          <div>S1 : 전기웅</div>
                          <div>S2 : 유영무</div>
                          <div>S3 : 김성수</div>
                          <div>S4 : 이재승</div>
                        </div>
                        <div className="doc-guide-owner-col">
                          <div>R1 : 이용자</div>
                          <div>R2 : 박재범</div>
                        </div>
                        <div className="doc-guide-owner-col">
                          <div>A1 : 전재우</div>
                          <div>A2 : 정화영</div>
                          <div>A3 : 정주희</div>
                          <div>A4 : 신상준</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddDocumentRow}>
                추가
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('documents')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedDocuments}
                disabled={selectedDocumentIds.length === 0}
              >
                선택 삭제
              </button>
              {isAdmin && (
                <button
                  className="secondary-btn danger-btn"
                  type="button"
                  onClick={() =>
                    deleteAllRegistryRows({
                      fetchRows: fetchDocuments,
                      clearDraftRows: () => setDocuments([]),
                      clearEditingIds: () => setEditingDocumentIds([]),
                      clearSnapshots: () => setDocumentEditSnapshots({}),
                      clearSelectedIds: () => setSelectedDocumentIds([]),
                      deleteAllRows: documentRegisterApi.removeAll,
                    })
                  }
                >
                  전체 삭제
                </button>
              )}
              <button className="secondary-btn" type="button" onClick={handleDocumentExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar contract-toolbar-simple">
              <input
                className="table-search-input"
                placeholder="검색어를 입력하세요"
                value={documentSearch}
                onChange={(e) => setDocumentSearch(e.target.value)}
              />
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table registry-table">
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allDocumentsSelected}
                          onChange={() =>
                            setSelectedDocumentIds((prev) =>
                              allDocumentsSelected
                                ? prev.filter((id) => !filteredDocuments.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredDocuments.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {DOCUMENT_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={
                            column.align === 'right'
                              ? 'th-align-right'
                              : column.align === 'left'
                              ? 'th-align-left'
                              : 'th-align-center'
                          }
                          style={{ width: column.width }}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderGroupedRegistryRows({
                      groups: groupedDocumentRows,
                      columns: DOCUMENT_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedDocumentIds,
                      onToggleSelection: toggleDocumentSelection,
                      editingIds: editingDocumentIds,
                      isSaving: isSavingDocuments,
                      onStartEdit: startDocumentEdit,
                      onSaveRow: saveDocumentRow,
                      onCancelRow: cancelDocumentRow,
                      onChange: handleDocumentCellChange,
                      isEmptyRow: isDocumentRowEmpty,
                      isYearOpen: isDocumentYearOpen,
                      onToggleYear: toggleDocumentYear,
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'calendar' && (
          <section className="stat-card">
            <div className="calendar-month-bar">
              <button className="month-nav-btn" type="button" onClick={prevMonth}>
                ◀
              </button>
              <div className="calendar-month-title">{getMonthLabel(calendarCursor)}</div>
              <button className="month-nav-btn" type="button" onClick={nextMonth}>
                ▶
              </button>
              <button
                className="panel-toggle-btn calendar-grid-toggle"
                type="button"
                aria-label={`달력 본문 ${isCalendarGridCollapsed ? '펼치기' : '접기'}`}
                onClick={() => setIsCalendarGridCollapsed((prev) => !prev)}
              >
                {isCalendarGridCollapsed ? '+' : '-'}
              </button>
            </div>

            {isAdmin ? (
              <div className="calendar-top-bar">
                <input
                  type="date"
                  className="calendar-input"
                  value={eventForm.date}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
                />
                <input
                  type="text"
                  className="calendar-input"
                  placeholder="일정 내용"
                  value={eventForm.title}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
                />
                <input
                  type="text"
                  className="calendar-input"
                  placeholder="담당자"
                  value={eventForm.owner}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, owner: e.target.value }))}
                />
                <button className="primary-btn" type="button" onClick={addManualEvent}>
                  일정 추가
                </button>
              </div>
            ) : (
              <div className="viewer-only-note">뷰어 모드에서는 일정을 조회할 수만 있습니다.</div>
            )}

            {!isCalendarGridCollapsed && (
              <div className="calendar-grid">
                {monthDays.map((day, index) => (
                  <div key={index} className={day ? 'day-box' : 'day-box empty'}>
                    {day && (
                      <>
                        <div className="day-number">{day.slice(-2)}</div>
                        <div className="day-events">
                          {calendarItems
                            .filter((item) => item.date === day)
                            .map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`event-pill event-pill-button ${
                                  item.type === 'contract'
                                    ? 'contract-event'
                                    : item.type === 'due'
                                    ? 'due-event'
                                    : 'manual-event'
                                }`}
                                onClick={() => openCalendarDetail(item)}
                              >
                                {item.text}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="selected-events-wrap">
              <div className="month-list-header">
                <div className="month-list-title-row">
                  <h3>이 달의 일정</h3>
                </div>

                <div className="month-list-tools">
                  <select
                    className="calendar-filter-select"
                    value={monthTypeFilter}
                    onChange={(e) => setMonthTypeFilter(e.target.value)}
                  >
                    <option value="전체">전체</option>
                    <option value="contract">계약</option>
                    <option value="due">준공</option>
                    <option value="manual">기타</option>
                  </select>

                  <input
                    className="calendar-search-input"
                    type="text"
                    placeholder="계약 / 준공 / 기타 일정 검색"
                    value={monthSearch}
                    onChange={(e) => setMonthSearch(e.target.value)}
                  />

                  <button
                    className="panel-toggle-btn"
                    type="button"
                    aria-label={`이 달의 일정 ${isMonthListCollapsed ? '펼치기' : '접기'}`}
                    onClick={() => setIsMonthListCollapsed((prev) => !prev)}
                  >
                    {isMonthListCollapsed ? '+' : '-'}
                  </button>
                </div>
              </div>

              {!isMonthListCollapsed && (
                <div className="month-event-list">
                  {monthEventList.length === 0 ? (
                    <div className="empty-text">이 달에 등록된 일정이 없습니다.</div>
                  ) : (
                    monthEventList.map((item) => {
                      const listDday =
                        item.type === 'contract' || item.type === 'due'
                          ? safeString(item.dday).startsWith('D+')
                            ? ''
                            : item.dday || ''
                          : item.dday || ''

                      return (
                        <div
                          key={item.id}
                          className="selected-event-card clickable"
                          onClick={() => openCalendarDetail(item)}
                        >
                          <div className="selected-event-click">
                            <div className="selected-event-title">
                              {listDday ? `${listDday} | ` : ''}[{item.date}] {item.text}
                            </div>
                            {item.owner && <div className="selected-event-memo">영업담당자: {item.owner}</div>}
                            {item.pm && <div className="selected-event-memo">현장 PM: {item.pm}</div>}
                            {item.note && <div className="selected-event-memo">{item.note}</div>}
                          </div>

                          {isAdmin && item.type === 'manual' && (
                            <button
                              className="delete-btn"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                deleteManualEvent(item.originalId)
                              }}
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {showAdminLoginModal && (
        <div className="auth-modal-backdrop" onClick={closeAdminLoginModal}>
          <div className="auth-modal-shell" onClick={(e) => e.stopPropagation()}>
            {renderAuthCard({
              title: '관리자 로그인',
              subtitle: '관리자 비밀번호를 입력한 뒤 편집 권한을 활성화하세요.',
              passwordValue: adminPasswordInput,
              onPasswordChange: (e) => {
                setAdminPasswordInput(e.target.value)
                if (adminLoginError) {
                  setAdminLoginError('')
                }
              },
              onSubmit: handleAdminLoginSubmit,
              error: adminLoginError,
              submitLabel: '로그인',
              onCancel: closeAdminLoginModal,
            })}
          </div>
        </div>
      )}

      {detailModal && (
        <div className="modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <h3>{detailModal.title}</h3>
              <button className="modal-close-btn" type="button" onClick={() => setDetailModal(null)}>
                ✕
              </button>
            </div>

            <div className="detail-modal-grid">
              <div className="detail-item">
                <span className="detail-label">구분</span>
                <span className="detail-value">{detailModal.typeLabel || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">등록일자</span>
                <span className="detail-value">{detailModal.date || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">D-Day</span>
                <span className="detail-value">{detailModal.dday || '-'}</span>
              </div>
              <div className="detail-item detail-item-full">
                <span className="detail-label">사업명</span>
                <span className="detail-value">{detailModal.projectName || '-'}</span>
              </div>

              {'contractNo' in detailModal && (
                <>
                  <div className="detail-item">
                    <span className="detail-label">사업년도</span>
                    <span className="detail-value">{detailModal.year || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">구분</span>
                    <span className="detail-value">{detailModal.segment || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">참고번호</span>
                    <span className="detail-value">{detailModal.refNo || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약번호</span>
                    <span className="detail-value">{detailModal.contractNo || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">발주처</span>
                    <span className="detail-value">{detailModal.client || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">담당부서</span>
                    <span className="detail-value">{detailModal.department || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약방식</span>
                    <span className="detail-value">{detailModal.contractMethod || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약분류</span>
                    <span className="detail-value">{detailModal.contractType || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약일자</span>
                    <span className="detail-value">{detailModal.contractDate || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">준공일자</span>
                    <span className="detail-value">{detailModal.dueDate || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약금액</span>
                    <span className="detail-value">{formatAmountWithWon(detailModal.amount)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">영업담당자</span>
                    <span className="detail-value">{detailModal.salesOwner || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">현장 PM</span>
                    <span className="detail-value">{detailModal.pm || '-'}</span>
                  </div>
                </>
              )}

              {detailModal.note && (
                <div className="detail-item detail-item-full">
                  <span className="detail-label">비고</span>
                  <span className="detail-value prewrap">{detailModal.note}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
