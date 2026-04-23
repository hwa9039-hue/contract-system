import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'
import { supabase } from './supabase'

const CONTRACT_COLUMNS = [
  { key: 'year', label: '사업년도', className: 'col-year', align: 'center', type: 'text' },
  { key: 'segment', label: '구분', className: 'col-segment', align: 'center', type: 'text' },
  { key: 'refNo', label: '참고번호', className: 'col-ref', align: 'center', type: 'text' },
  { key: 'contractNo', label: '계약번호', className: 'col-contractno', align: 'center', type: 'text' },
  { key: 'client', label: '발주처', className: 'col-client', align: 'center', type: 'textarea' },
  { key: 'department', label: '담당부서', className: 'col-dept', align: 'center', type: 'textarea' },
  { key: 'contractMethod', label: '계약방식', className: 'col-method', align: 'center', type: 'text' },
  { key: 'contractType', label: '계약분류', className: 'col-type', align: 'center', type: 'text' },
  { key: 'contractDate', label: '계약일자', className: 'col-date', align: 'center', type: 'date' },
  { key: 'dueDate', label: '준공일자', className: 'col-date', align: 'center', type: 'date' },
  { key: 'projectName', label: '사업명', className: 'col-project', align: 'left', type: 'textarea' },
  { key: 'amount', label: '계약금액', className: 'col-amount', align: 'right', type: 'amount' },
  { key: 'salesOwner', label: '영업담당자', className: 'col-owner', align: 'center', type: 'text' },
  { key: 'pm', label: '현장 PM', className: 'col-pm', align: 'center', type: 'text' },
  { key: 'note', label: '비고', className: 'col-note', align: 'left', type: 'textarea' },
]

const DOCUMENT_COLUMNS = [
  { key: 'docDate', label: '일자', align: 'center', type: 'date', width: 120 },
  { key: 'docNo', label: '문서번호', align: 'center', type: 'text', width: 210 },
  { key: 'senderReceiver', label: '수신처 발신처', align: 'center', type: 'textarea', width: 190 },
  { key: 'title', label: '문서명 또는 제목', align: 'left', type: 'textarea', width: 280 },
  { key: 'method', label: '접수형태 발송형태', align: 'center', type: 'text', width: 170 },
  { key: 'writer', label: '수신자 작성자', align: 'center', type: 'text', width: 160 },
  { key: 'note', label: '비고', align: 'left', type: 'textarea', width: 240 },
]

const CALENDAR_STORAGE_KEY = 'contract_manager_calendar_events_v3'
const ADMIN_SESSION_KEY = 'contract_manager_admin_session_v1'
const CONTRACT_BACKUP_LAST_DATE_KEY = 'CONTRACT_BACKUP_LAST_DATE'
const CONTRACT_SHARED_AUTH_KEY = 'CONTRACT_SHARED_AUTH'
const CONTRACT_SHARED_EXPIRES_AT_KEY = 'CONTRACT_SHARED_EXPIRES_AT'
const CONTRACT_SHARED_SESSION_DURATION_MS = 20 * 60 * 1000
const CONTRACT_SHARED_WARNING_MS = 5 * 60 * 1000
const ADMIN_PASSWORD = 'admin'
const SHARED_APP_PASSWORD = import.meta.env.VITE_APP_SHARED_PASSWORD || 'SMARTDI2026!'
const ALL_OPTION = '전체'
const DASHBOARD_CATEGORY_ORDER = ['전광판', 'BIT', '도로사업', '유지보수']

const emptyContract = {
  year: '',
  segment: '',
  refNo: '',
  contractNo: '',
  client: '',
  department: '',
  contractMethod: '',
  contractType: '',
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

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
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

function normalizeContractForSupabase(item) {
  return {
    year: parseYearValue(item.year),
    segment: safeString(item.segment).trim(),
    refNo: safeString(item.refNo).trim(),
    contractNo: safeString(item.contractNo).trim(),
    client: safeString(item.client).trim(),
    department: safeString(item.department).trim(),
    contractMethod: safeString(item.contractMethod).trim(),
    contractType: safeString(item.contractType).trim(),
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
  return [ALL_OPTION, ...new Set(items.map((item) => safeString(item[key]).trim()).filter(Boolean))]
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

function formatTodayBackupKey() {
  const today = new Date()
  const yyyy = String(today.getFullYear())
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getElapsedDaysFromDate(dateString) {
  const baseDate = parseDateOnly(dateString)
  if (!baseDate) return null

  const today = new Date()
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.floor((currentDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24))
  return diff < 0 ? 0 : diff
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

function getDdayText(dateString) {
  const diff = getDateDiffFromToday(dateString)
  if (diff === null) return ''
  if (diff < 0) return `D+${Math.abs(diff)}`
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

function App() {
  const initialSharedAuth = readSharedAuthSession()
  const [contracts, setContracts] = useState([])
  const [documents, setDocuments] = useState([])
  const [menu, setMenu] = useState('dashboard')
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem(ADMIN_SESSION_KEY) === 'true')
  const [openDashboardYears, setOpenDashboardYears] = useState({})
  const [openContractYears, setOpenContractYears] = useState({})
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [editingDocumentIds, setEditingDocumentIds] = useState([])
  const [isSavingDocuments, setIsSavingDocuments] = useState(false)
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
  const [lastBackupDate, setLastBackupDate] = useState(() => {
    try {
      return localStorage.getItem(CONTRACT_BACKUP_LAST_DATE_KEY) || ''
    } catch {
      return ''
    }
  })
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

  const fileInputRef = useRef(null)

  const fetchContracts = async () => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .order('year', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setContracts(data ?? [])
  }

  const fetchDocuments = async (preserveDrafts = true) => {
    const { data, error } = await supabase
      .from('document_register')
      .select('*')
      .order('createdAt', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setDocuments((prev) => {
      const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
      return [...draftRows, ...(data ?? []).map(normalizeDocumentRow)]
    })
    setSelectedDocumentIds([])
  }

  const saveContractToSupabase = async (formData) => {
    const payload = normalizeContractForSupabase(formData)

    const { data, error } = await supabase.from('contracts').insert([payload]).select()

    if (error) {
      alert(error.message)
      return null
    }

    return data
  }

  useEffect(() => {
    fetchContracts()
  }, [])

  useEffect(() => {
    if (menu === 'documents') {
      fetchDocuments(true)
    }
  }, [menu])

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

  const backupWarning = useMemo(() => {
    if (!lastBackupDate) {
      return {
        show: true,
        message: '⚠ 백업 이력이 없습니다. 지금 백업 다운로드를 진행하세요.',
      }
    }

    const elapsedDays = getElapsedDaysFromDate(lastBackupDate)
    if (elapsedDays === null) {
      return {
        show: true,
        message: '⚠ 백업 이력이 없습니다. 지금 백업 다운로드를 진행하세요.',
      }
    }

    if (elapsedDays >= 7) {
      return {
        show: true,
        message: '⚠ 최근 7일 이상 백업이 없습니다. 백업 다운로드를 진행하세요.',
      }
    }

    return {
      show: false,
      message: '',
    }
  }, [lastBackupDate])

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

  const dashboardSummary = useMemo(() => buildDashboardSummary(contracts), [contracts])
  const defaultDashboardYear = dashboardSummary.years[0]?.year
  const defaultContractYear = groupedContracts[0]?.year

  const isDashboardYearOpen = (year) =>
    Object.prototype.hasOwnProperty.call(openDashboardYears, year)
      ? openDashboardYears[year]
      : year === defaultDashboardYear

  const isContractYearOpen = (year) =>
    Object.prototype.hasOwnProperty.call(openContractYears, year)
      ? openContractYears[year]
      : year === defaultContractYear

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
      setEditingCell(null)
      setEditingValue('')
      setIsAddingRow(false)
      return
    }

    const password = window.prompt('관리자 비밀번호를 입력하세요.')
    if (password === null) return

    if (password !== ADMIN_PASSWORD) {
      alert('비밀번호가 올바르지 않습니다.')
      return
    }

    setIsAdmin(true)
    localStorage.setItem(ADMIN_SESSION_KEY, 'true')
  }

  const handleAppLogin = (e) => {
    e.preventDefault()

    if (appPasswordInput !== SHARED_APP_PASSWORD) {
      setAppLoginError('공용 비밀번호가 올바르지 않습니다.')
      return
    }

    const expiresAt = Date.now() + CONTRACT_SHARED_SESSION_DURATION_MS
    writeSharedAuthSession(expiresAt)

    setIsAppAuthenticated(true)
    setSharedSessionExpiresAt(expiresAt)
    setRemainingTime(CONTRACT_SHARED_SESSION_DURATION_MS)
    setShowSessionWarning(false)
    setAppPasswordInput('')
    setAppLoginError('')
  }

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
        alert('엑셀 시트를 찾을 수 없습니다.')
        return
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: true,
      })

      if (!rows.length) {
        alert('엑셀 데이터가 없습니다.')
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
            refNo: safeString(getValueByHeader(row, ['참고번호', '참고 번호'])).trim(),
            contractNo: safeString(getValueByHeader(row, ['계약번호', '계약 번호'])).trim(),
            client: safeString(getValueByHeader(row, ['발주처', '수요기관'])).trim(),
            department: safeString(getValueByHeader(row, ['담당부서', '담당 부서'])).trim(),
            contractMethod: safeString(getValueByHeader(row, ['계약방식', '계약 방식'])).trim(),
            contractType: safeString(getValueByHeader(row, ['계약분류', '계약 분류'])).trim(),
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

      const payload = uniqueImported.map(normalizeContractForSupabase)

      const { error } = await supabase.from('contracts').insert(payload)

      if (error) {
        alert(error.message)
        return
      }

      await fetchContracts()
      alert(`엑셀 업로드 완료: 신규 ${uniqueImported.length}건 추가, 중복 ${imported.length - uniqueImported.length}건 제외`)
    } catch {
      alert('엑셀 업로드 중 오류가 발생했습니다.')
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

  const handleBackupDownload = () => {
    const rows = sortContracts(contracts).map((item) => ({
      ID: item.id,
      사업년도: item.year,
      구분: item.segment,
      참고번호: item.refNo,
      계약번호: item.contractNo,
      발주처: item.client,
      담당부서: item.department,
      계약방식: item.contractMethod,
      계약분류: item.contractType,
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
    XLSX.utils.book_append_sheet(workbook, worksheet, '백업')

    const now = new Date()
    const filename = `contract_backup_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)

    const todayKey = formatTodayBackupKey()
    try {
      localStorage.setItem(CONTRACT_BACKUP_LAST_DATE_KEY, todayKey)
    } catch {
      // no-op
    }
    setLastBackupDate(todayKey)
  }

  const handleAddDocumentRow = () => {
    setDocuments((prev) => [createDocumentDraftRow(), ...prev])
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
    setEditingDocumentIds((prev) => (prev.includes(rowId) ? prev : [...prev, rowId]))
  }

  const toggleDocumentSelection = (rowId) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedDocuments = async () => {
    if (selectedDocumentIds.length === 0) {
      alert('삭제할 행을 선택하세요.')
      return
    }

    const ok = window.confirm('선택한 문서 행을 삭제하시겠습니까?')
    if (!ok) return

    const persistedIds = documents
      .filter((row) => selectedDocumentIds.includes(row.id) && !row.isDraft)
      .map((row) => row.id)

    if (persistedIds.length > 0) {
      const remainingDrafts = documents.filter(
        (row) => row.isDraft && !selectedDocumentIds.includes(row.id)
      )
      const { error } = await supabase.from('document_register').delete().in('id', persistedIds)

      if (error) {
        alert(error.message)
        return
      }

      setDocuments(remainingDrafts)
      setEditingDocumentIds((prev) => prev.filter((id) => !selectedDocumentIds.includes(id)))
      await fetchDocuments(true)
      return
    }

    setDocuments((prev) => prev.filter((row) => !selectedDocumentIds.includes(row.id)))
    setSelectedDocumentIds([])
    setEditingDocumentIds((prev) => prev.filter((id) => !selectedDocumentIds.includes(id)))
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

        const { error } = await supabase.from('document_register').insert(insertPayload)
        if (error) {
          alert(error.message)
          return
        }
      }

      if (rowsToUpdate.length > 0) {
        const updateResults = await Promise.all(
          rowsToUpdate.map((row) =>
            supabase
              .from('document_register')
              .update(toDocumentPayload(row, timestamp))
              .eq('id', row.id)
          )
        )

        const failedUpdate = updateResults.find((result) => result.error)
        if (failedUpdate?.error) {
          alert(failedUpdate.error.message)
          return
        }
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setDocuments((prev) => prev.filter((row) => !(row.isDraft && isDocumentRowEmpty(row))))
        setSelectedDocumentIds([])
        setEditingDocumentIds([])
        alert('저장되었습니다.')
        return
      }

      await fetchDocuments(false)
      setSelectedDocumentIds([])
      setEditingDocumentIds([])
      alert('저장되었습니다.')
    } finally {
      setIsSavingDocuments(false)
    }
  }

  const openAddRow = () => {
    if (!requireAdmin()) return
    setIsAddingRow(true)
    setNewRow({ ...emptyContract })
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

    const savedRows = await saveContractToSupabase(newRow)
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

    const { error } = await supabase.from('contracts').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

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

    const { error } = await supabase
      .from('contracts')
      .update({ [editingCell.key]: value })
      .eq('id', editingCell.rowId)

    if (error) {
      alert(error.message)
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

  if (!isAppAuthenticated) {
    return (
      <div
        className="app-shell"
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            width: 'min(420px, 100%)',
            background: 'rgba(255, 255, 255, 0.96)',
            border: '1px solid rgba(220, 227, 237, 0.92)',
            borderRadius: 12,
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
            padding: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div className="company-logo-box" style={{ width: '100%', marginBottom: 0 }}>
              <img className="company-logo-img" src="/logo.png" alt="스마트DI" />
            </div>
            <div
              style={{
                fontFamily: 'SUIT, Pretendard, sans-serif',
                fontSize: 22,
                fontWeight: 800,
                color: '#1f2937',
                textAlign: 'center',
              }}
            >
              스마트DI사업부 통합관리
            </div>
            <div
              style={{
                fontSize: 13,
                color: '#64748b',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              공용 비밀번호를 입력한 뒤 시스템에 접속하세요.
            </div>
          </div>

          <form onSubmit={handleAppLogin}>
            <input
              type="password"
              className="table-search-input"
              value={appPasswordInput}
              onChange={(e) => {
                setAppPasswordInput(e.target.value)
                if (appLoginError) {
                  setAppLoginError('')
                }
              }}
              placeholder="공용 비밀번호 입력"
              autoFocus
            />

            {appLoginError && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {appLoginError}
              </div>
            )}

            <button
              className="primary-btn"
              type="submit"
              style={{
                width: '100%',
                marginTop: 14,
                minHeight: 44,
              }}
            >
              로그인
            </button>
          </form>
        </div>
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
              <span className="top-system-subtitle">계약현황 · 일정관리 · 문서수발신대장</span>
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
          <h1>
            {menu === 'dashboard' && '대시보드'}
            {menu === 'contracts' && '계약현황'}
            {menu === 'calendar' && '캘린더'}
            {menu === 'documents' && '문서수발신대장'}
          </h1>
        </div>

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
            <div className="dashboard-year-list">
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

        {menu === 'contracts' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              {isAdmin && (
                <>
                  <button className="primary-btn" type="button" onClick={openAddRow}>
                    계약현황 추가
                  </button>

                  <button className="secondary-btn" type="button" onClick={handleExcelImportClick}>
                    엑셀 불러오기
                  </button>
                </>
              )}

              <button className="secondary-btn" type="button" onClick={handleExcelDownload}>
                엑셀로 내려받기
              </button>

              <button className="secondary-btn" type="button" onClick={handleBackupDownload}>
                백업 다운로드
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

            {backupWarning.show && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: 42,
                  marginBottom: 12,
                  padding: '10px 12px',
                  border: '1px solid #f5c77a',
                  borderRadius: 8,
                  background: '#fff8e8',
                  color: '#9a5b00',
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                {backupWarning.message}
              </div>
            )}

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
                <table className="contract-table excel-table">
                  <thead>
                    <tr>
                      <th className="col-action th-align-center">작업</th>
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
                        <td className="col-action td-align-center">
                          <div className="inline-row-actions">
                            <button className="mini-save-btn" type="button" onClick={saveAddRow}>
                              저장
                            </button>
                            <button className="mini-cancel-btn" type="button" onClick={cancelAddRow}>
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
                          등록된 계약이 없습니다.
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
                                <td className="col-action td-align-center">
                                  {isAdmin ? (
                                    <div className="row-action-group">
                                      <button
                                        className="row-icon-btn edit"
                                        type="button"
                                        title="수정"
                                        aria-label="수정"
                                        onClick={() => startEdit(item.id, 'projectName', item.projectName)}
                                      >
                                        ✎
                                      </button>
                                      <button
                                        className="row-icon-btn delete"
                                        type="button"
                                        title="삭제"
                                        aria-label="삭제"
                                        onClick={() => deleteRow(item.id)}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="viewer-action-mark">보기</span>
                                  )}
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

        {menu === 'documents' && (
          <section className="stat-card">
            <div
              style={{
                marginBottom: 14,
                padding: '16px 18px',
                borderRadius: 10,
                border: '1px solid #d7e3ff',
                background: '#f8fbff',
                color: '#334155',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div
                className="doc-guide-layout"
              >
                <div
                  className="doc-guide-pattern"
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>문서번호 체계 안내</div>
                  <div className="doc-guide-code">SIGN-DI-S-260000-01</div>
                  <div className="doc-guide-code">SIGN-DI-R-260000-01</div>
                  <div className="doc-guide-code">SIGN-DI-A-260000-01</div>
                </div>

                <div
                  className="doc-guide-owners-wrap"
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>담당자 약어</div>
                  <div className="doc-guide-owners-grid">
                    <div className="doc-guide-owner-col">
                      <div>S1 : 전기웅 이사</div>
                      <div>S2 : 유영우 부장</div>
                      <div>S3 : 김성수 과장</div>
                      <div>S4 : 이재승 대리</div>
                    </div>
                    <div className="doc-guide-owner-col">
                      <div>R1 : 이용자 부장</div>
                      <div>R2 : 박재범 과장</div>
                    </div>
                    <div className="doc-guide-owner-col">
                      <div>A1 : 전재우 차장</div>
                      <div>A2 : 정화영 대리</div>
                      <div>A3 : 정주희 대리</div>
                      <div>A4 : 문병현 대리</div>
                      <div>A5 : 전유찬 대리</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="contracts-header-actions">
              <button
                className="primary-btn"
                type="button"
                onClick={handleAddDocumentRow}
              >
                추가
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={saveDocuments}
                disabled={isSavingDocuments}
                style={isSavingDocuments ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
              >
                {isSavingDocuments ? '저장 중...' : '저장'}
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedDocuments}
                disabled={selectedDocumentIds.length === 0}
                style={
                  selectedDocumentIds.length === 0
                    ? { opacity: 0.55, cursor: 'not-allowed' }
                    : undefined
                }
              >
                삭제
              </button>
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll">
                <table className="contract-table excel-table">
                  <thead>
                    <tr>
                      <th className="th-align-center" style={{ width: 64 }}>
                        선택
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
                          style={column.width ? { width: column.width } : undefined}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={DOCUMENT_COLUMNS.length + 1} className="empty-cell">
                          등록된 문서수발신 이력이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      documents.map((row, index) => (
                        <tr key={row.id} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                          <td className="td-align-center">
                            <input
                              type="checkbox"
                              checked={selectedDocumentIds.includes(row.id)}
                              onChange={() => toggleDocumentSelection(row.id)}
                              style={{ width: 16, height: 16 }}
                            />
                          </td>

                          {DOCUMENT_COLUMNS.map((column) => (
                            <td
                              key={column.key}
                              className={`${
                                column.align === 'right'
                                  ? 'td-align-right'
                                  : column.align === 'left'
                                  ? 'td-align-left'
                                  : 'td-align-center'
                              } ${column.type === 'textarea' ? 'multiline-cell' : ''}`}
                              style={column.width ? { width: column.width } : undefined}
                              onClick={() => {
                                if (!row.isDraft && !editingDocumentIds.includes(row.id)) {
                                  startDocumentEdit(row.id)
                                }
                              }}
                            >
                              {row.isDraft || editingDocumentIds.includes(row.id) ? (
                                column.type === 'textarea' ? (
                                  <textarea
                                    className={`inline-row-editor cell-inline-editor ${
                                      column.align === 'right' ? 'align-right' : ''
                                    }`}
                                    rows={1}
                                    value={row[column.key] ?? ''}
                                    onChange={(e) =>
                                      handleDocumentCellChange(row.id, column.key, e.target.value)
                                    }
                                  />
                                ) : column.type === 'date' ? (
                                  <input
                                    className="inline-row-editor cell-inline-editor"
                                    type="date"
                                    value={row[column.key] ?? ''}
                                    onChange={(e) =>
                                      handleDocumentCellChange(row.id, column.key, e.target.value)
                                    }
                                  />
                                ) : (
                                  <input
                                    className={`inline-row-editor cell-inline-editor ${
                                      column.align === 'right' ? 'align-right' : ''
                                    }`}
                                    type="text"
                                    value={row[column.key] ?? ''}
                                    onChange={(e) =>
                                      handleDocumentCellChange(row.id, column.key, e.target.value)
                                    }
                                  />
                                )
                              ) : (
                                <div
                                  className="cell-display"
                                  style={{
                                    whiteSpace: column.type === 'textarea' ? 'pre-wrap' : 'normal',
                                    cursor: 'text',
                                  }}
                                >
                                  {safeString(row[column.key]).trim() || '-'}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
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
