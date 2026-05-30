import { useMemo } from 'react'
import { decodeWorkReportWireText } from './workReportWire.js'
import {
  WORK_REPORT_MANAGER_OPTIONS,
  WorkReportExternalManagerMultiSelect,
  parseManagerMultiSelectValue,
  serializeManagerMultiSelectValue,
} from './workReportManagerMultiSelect.jsx'

export const MEETING_MINUTES_AGENDA_FIXED_ROWS = 20

/** @deprecated MEETING_MINUTES_AGENDA_FIXED_ROWS 사용 */
export const MEETING_MINUTES_AGENDA_DEFAULT_ROWS = MEETING_MINUTES_AGENDA_FIXED_ROWS

export const WORK_REPORT_MEETING_MINUTES_SECTION = '회의록'

const MEETING_MINUTES_SESSION_KEY_PREFIX = 'cms-meeting-mm3:'
const MEETING_MINUTES_DOC_PREFIX = 'mm3\n'
const MEETING_MINUTES_DOC_VERSION = 3

/** Cloudflare WAF 회피 + 탭 혼동 방지 (회의내용·담당자 구분) */
const MEETING_MINUTES_STORAGE_VERSION = 2
const MEETING_MINUTES_TEXT_PREFIX = 'mm2\n'
const MEETING_MINUTES_FIELD_SEP = '\u001f'

export function getMeetingMinutesSessionStorageKey(weekStartDate) {
  const date = safeString(weekStartDate).trim().slice(0, 10)
  return date ? `${MEETING_MINUTES_SESSION_KEY_PREFIX}${date}` : ''
}

export function readMeetingMinutesSessionBackup(weekStartDate) {
  try {
    const key = getMeetingMinutesSessionStorageKey(weekStartDate)
    if (!key) return ''
    return sessionStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function writeMeetingMinutesSessionBackup(weekStartDate, content) {
  try {
    const key = getMeetingMinutesSessionStorageKey(weekStartDate)
    if (!key) return
    if (!safeString(content).trim()) {
      sessionStorage.removeItem(key)
      return
    }
    sessionStorage.setItem(key, content)
  } catch {
    // no-op
  }
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function parseJsonIfString(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  try {
    let parsed = JSON.parse(trimmed)
    if (typeof parsed === 'string') {
      const nested = parsed.trim()
      if (nested.startsWith('{') || nested.startsWith('[')) {
        try {
          parsed = JSON.parse(nested)
        } catch {
          /* keep outer parse result */
        }
      }
    }
    return parsed
  } catch {
    return value
  }
}

function isMeetingMinutesDocumentShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.v === MEETING_MINUTES_DOC_VERSION) return true
  if (value.v === MEETING_MINUTES_STORAGE_VERSION && Array.isArray(value.rows)) return true
  return Array.isArray(value.agenda) || Array.isArray(value.rows) || Array.isArray(value.items)
}

function looksLikeJsonGarbage(text) {
  const trimmed = safeString(text).trim()
  if (!trimmed) return false
  if (trimmed.startsWith(MEETING_MINUTES_DOC_PREFIX)) return true
  if (trimmed.startsWith(MEETING_MINUTES_TEXT_PREFIX)) return true
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) return true
  return trimmed.includes('"agenda"') || trimmed.includes('"meetingDate"') || trimmed.includes('"attendees"')
}

function extractAgendaFromParsedObject(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.agenda)) return parsed.agenda
  if (Array.isArray(parsed.rows)) return parsed.rows
  if (Array.isArray(parsed.items)) return parsed.items
  return null
}

function coerceMeetingMinutesRawObject(raw) {
  let data = parseJsonIfString(raw)
  if (typeof data === 'string' && data.trim().startsWith('{')) {
    data = parseJsonIfString(data)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (typeof data.agenda === 'string') {
    const agenda = parseJsonIfString(data.agenda)
    if (Array.isArray(agenda)) {
      data = { ...data, agenda }
    }
  }
  if (typeof data.attendees === 'string') {
    const attendees = parseJsonIfString(data.attendees)
    if (Array.isArray(attendees)) {
      data = { ...data, attendees }
    }
  }
  return data
}

export function getDefaultMeetingMinutesDocument() {
  return {
    agenda: getDefaultMeetingMinutesAgenda(),
  }
}

function bodyLinesToAgenda(body) {
  const lines = safeString(body).split('\n')
  const rows = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return { content: '', assignee: '', dueDate: '' }
    const match = trimmed.match(/^(.+?)\s*\(담당:\s*(.+)\)\s*$/)
    if (match) {
      return { content: match[1].trim(), assignee: match[2].trim(), dueDate: '' }
    }
    return { content: trimmed, assignee: '', dueDate: '' }
  })
  return normalizeMeetingMinutesAgenda(rows)
}

function normalizeMeetingMinutesDocument(raw = {}) {
  const source = coerceMeetingMinutesRawObject(raw) ?? raw
  if (Array.isArray(source)) {
    return { agenda: normalizeMeetingMinutesAgenda(source) }
  }
  const agendaFromRaw = extractAgendaFromParsedObject(source)
  if (agendaFromRaw) {
    return { agenda: normalizeMeetingMinutesAgenda(agendaFromRaw) }
  }
  const legacyBody = safeString(source.body ?? source.content ?? source.text)
  if (legacyBody.trim() && !looksLikeJsonGarbage(legacyBody)) {
    return { agenda: bodyLinesToAgenda(legacyBody) }
  }
  return getDefaultMeetingMinutesDocument()
}

function tryParseMeetingMinutesDocJson(decoded) {
  try {
    const trimmed = safeString(decoded).trim()
    if (!trimmed) return null

    let jsonText = trimmed
    if (trimmed.startsWith(MEETING_MINUTES_DOC_PREFIX)) {
      jsonText = trimmed.slice(MEETING_MINUTES_DOC_PREFIX.length).trim()
    }
    if (!jsonText.startsWith('{') && !jsonText.startsWith('"')) return null

    const parsed = coerceMeetingMinutesRawObject(jsonText)
    if (!parsed || !isMeetingMinutesDocumentShape(parsed)) return null
    return normalizeMeetingMinutesDocument(parsed)
  } catch {
    return null
  }
}

function meetingMinutesAssigneeKey(value) {
  return parseManagerMultiSelectValue(value)
    .slice()
    .sort()
    .join('\u0001')
}

export function normalizeMeetingMinutesAgenda(agenda) {
  const rows = Array.isArray(agenda) ? agenda : []
  return Array.from({ length: MEETING_MINUTES_AGENDA_FIXED_ROWS }, (_, index) => {
    const row = rows[index]
    if (Array.isArray(row)) {
      const assignees = parseManagerMultiSelectValue(row[1])
      return {
        content: safeString(row[0]),
        assignee: serializeManagerMultiSelectValue(assignees),
        assignees,
        dueDate: safeString(row[2]),
      }
    }
    const assignees = parseManagerMultiSelectValue(row?.assignees ?? row?.assignee ?? row?.person)
    return {
      content: safeString(row?.content ?? row?.text),
      assignee: serializeManagerMultiSelectValue(assignees),
      assignees,
      dueDate: safeString(row?.dueDate ?? row?.due),
    }
  })
}

export function getDefaultMeetingMinutesAgenda() {
  return normalizeMeetingMinutesAgenda([])
}

export function getDefaultMeetingMinutesData() {
  return {
    meta: {
      meetingDateTime: '',
      location: '',
      attendees: '',
      author: '',
    },
    agenda: getDefaultMeetingMinutesAgenda(),
  }
}

function parseMeetingMinutesMeta(meta = {}, entry) {
  return {
    meetingDateTime: safeString(meta.meetingDateTime ?? meta.meetingAt ?? entry?.destination).trim(),
    location: safeString(meta.location ?? meta.place).trim(),
    attendees: safeString(meta.attendees).trim(),
    author: safeString(meta.author ?? entry?.user).trim(),
  }
}

function sanitizeMeetingMinutesCell(value) {
  return safeString(value)
    .replace(/\u001f/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim()
}

function parseIndexedTabLine(trimmed) {
  const firstTab = trimmed.indexOf('\t')
  if (firstTab <= 0 || !/^\d+$/.test(trimmed.slice(0, firstTab))) return null

  const rowIndex = Number(trimmed.slice(0, firstTab))
  const rest = trimmed.slice(firstTab + 1)
  const lastTab = rest.lastIndexOf('\t')
  if (lastTab === -1) {
    return {
      rowIndex,
      content: safeString(rest).trim(),
      assignee: '',
      dueDate: '',
    }
  }
  return {
    rowIndex,
    content: safeString(rest.slice(0, lastTab)).trim(),
    assignee: safeString(rest.slice(lastTab + 1)).trim(),
    dueDate: '',
  }
}

function parseMeetingMinutesTextLine(line) {
  const trimmed = safeString(line).trimEnd()
  if (!trimmed) return null

  if (trimmed.includes(MEETING_MINUTES_FIELD_SEP)) {
    const parts = trimmed.split(MEETING_MINUTES_FIELD_SEP)
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      return {
        rowIndex: Number(parts[0]),
        content: safeString(parts[1]).trim(),
        assignee: safeString(parts[2]).trim(),
        dueDate: safeString(parts[3] || '').trim(),
      }
    }
    if (parts.length === 2) {
      return {
        rowIndex: null,
        content: safeString(parts[0]).trim(),
        assignee: safeString(parts[1]).trim(),
        dueDate: '',
      }
    }
  }

  const indexedTab = parseIndexedTabLine(trimmed)
  if (indexedTab) return indexedTab

  const tabIndex = trimmed.indexOf('\t')
  if (tabIndex === -1) {
    return { rowIndex: null, content: trimmed, assignee: '', dueDate: '' }
  }
  return {
    rowIndex: null,
    content: safeString(trimmed.slice(0, tabIndex)).trim(),
    assignee: safeString(trimmed.slice(tabIndex + 1)).trim(),
    dueDate: '',
  }
}

function parseMeetingMinutesTextRows(raw) {
  const body = safeString(raw).trim()
  if (!body.startsWith(MEETING_MINUTES_TEXT_PREFIX)) return null
  const lines = body
    .slice(MEETING_MINUTES_TEXT_PREFIX.length)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')

  const parsed = lines.map(parseMeetingMinutesTextLine).filter(Boolean)
  if (!parsed.length) return []

  const useIndexed = parsed.some(
    (row) => row.rowIndex != null && Number.isFinite(row.rowIndex) && row.rowIndex >= 0
  )

  if (useIndexed) {
    const agenda = getDefaultMeetingMinutesAgenda()
    for (const row of parsed) {
      const idx = row.rowIndex
      if (idx == null || idx < 0 || idx >= MEETING_MINUTES_AGENDA_FIXED_ROWS) continue
      const assignees = parseManagerMultiSelectValue(row.assignee)
      agenda[idx] = {
        content: safeString(row.content).trim(),
        assignee: serializeManagerMultiSelectValue(assignees),
        assignees,
        dueDate: '',
      }
    }
    return agenda
  }

  return parsed.map((row) => {
    const assignees = parseManagerMultiSelectValue(row.assignee)
    return {
      content: safeString(row.content).trim(),
      assignee: serializeManagerMultiSelectValue(assignees),
      assignees,
      dueDate: '',
    }
  })
}

function meetingMinutesDocumentToLegacyData(doc) {
  const normalized = normalizeMeetingMinutesDocument(doc)
  return {
    meta: getDefaultMeetingMinutesData().meta,
    agenda: documentToLegacyAgenda(normalized),
  }
}

export function parseMeetingMinutesFromEntry(entry) {
  try {
    const raw = safeString(entry?.content).trim()
    const decoded = decodeWorkReportWireText(raw)

    const docFromWire = tryParseMeetingMinutesDocJson(decoded)
    if (docFromWire) {
      return meetingMinutesDocumentToLegacyData(docFromWire)
    }

    const textRows = parseMeetingMinutesTextRows(decoded)
    if (textRows) {
      const agenda =
        Array.isArray(textRows) && textRows.length === MEETING_MINUTES_AGENDA_FIXED_ROWS
          ? textRows
          : normalizeMeetingMinutesAgenda(textRows)
      return {
        meta: getDefaultMeetingMinutesData().meta,
        agenda,
      }
    }

    if (decoded.startsWith('{') || decoded.startsWith('"') || decoded.startsWith('[')) {
      const parsed = coerceMeetingMinutesRawObject(decoded)
      if (parsed && typeof parsed === 'object') {
        const agendaSource = extractAgendaFromParsedObject(parsed)
        if (agendaSource) {
          return {
            meta: getDefaultMeetingMinutesData().meta,
            agenda: normalizeMeetingMinutesAgenda(agendaSource),
          }
        }
        if (parsed.meta && Array.isArray(parsed.agenda)) {
          return {
            meta: parseMeetingMinutesMeta(parsed.meta, entry),
            agenda: normalizeMeetingMinutesAgenda(parsed.agenda),
          }
        }
      }

      return getDefaultMeetingMinutesData()
    }

    if (looksLikeJsonGarbage(decoded)) {
      return getDefaultMeetingMinutesData()
    }

    const legacyContent = decoded
    if (!legacyContent.trim()) {
      return getDefaultMeetingMinutesData()
    }
    return {
      meta: getDefaultMeetingMinutesData().meta,
      agenda: normalizeMeetingMinutesAgenda([{ content: legacyContent, assignee: '', dueDate: '' }]),
    }
  } catch {
    return getDefaultMeetingMinutesData()
  }
}

function documentToLegacyAgenda(doc) {
  return normalizeMeetingMinutesAgenda(doc?.agenda)
}

function migrateLegacyParsedToDocument(parsed) {
  return normalizeMeetingMinutesDocument({ agenda: parsed?.agenda })
}

export function parseMeetingMinutesDocumentFromEntry(entry) {
  try {
    const raw = safeString(entry?.content).trim()
    const decoded = decodeWorkReportWireText(raw)
    const direct = tryParseMeetingMinutesDocJson(decoded)
    if (direct) return normalizeMeetingMinutesDocument(direct)
    return migrateLegacyParsedToDocument(parseMeetingMinutesFromEntry(entry))
  } catch {
    return getDefaultMeetingMinutesDocument()
  }
}

export function serializeMeetingMinutesDocumentContent(doc) {
  const normalized = normalizeMeetingMinutesDocument(doc)
  if (isMeetingMinutesDocumentEmpty(normalized)) return ''
  const payload = {
    v: MEETING_MINUTES_DOC_VERSION,
    agenda: normalized.agenda.map((row) => ({
      content: safeString(row.content),
      assignee: safeString(row.assignee),
      dueDate: safeString(row.dueDate),
    })),
  }
  return `${MEETING_MINUTES_DOC_PREFIX}${JSON.stringify(payload)}`
}

function isMeetingMinutesAgendaRowEmpty(row) {
  return (
    !safeString(row?.content).trim() &&
    !safeString(row?.assignee).trim() &&
    !safeString(row?.dueDate).trim() &&
    !parseManagerMultiSelectValue(row?.assignees ?? row?.assignee).length
  )
}

export function isMeetingMinutesDocumentEmpty(doc) {
  const normalized = normalizeMeetingMinutesDocument(doc)
  return !normalized.agenda.some((row) => !isMeetingMinutesAgendaRowEmpty(row))
}

export function isMeetingMinutesDataEmpty(data) {
  if (!data) return true
  if (data.agenda !== undefined || data.body !== undefined) {
    return isMeetingMinutesDocumentEmpty(data)
  }
  return isMeetingMinutesDocumentEmpty(migrateLegacyParsedToDocument(data))
}

function meetingMinutesAgendaRowsMatch(leftAgenda, rightAgenda) {
  const left = normalizeMeetingMinutesAgenda(leftAgenda)
  const right = normalizeMeetingMinutesAgenda(rightAgenda)
  return left.every((row, index) => {
    const other = right[index]
    return (
      safeString(row.content) === safeString(other.content) &&
      meetingMinutesAssigneeKey(row.assignees ?? row.assignee) ===
        meetingMinutesAssigneeKey(other.assignees ?? other.assignee) &&
      safeString(row.dueDate) === safeString(other.dueDate)
    )
  })
}

export function meetingMinutesAgendaMatches(leftContent, rightContent) {
  const leftDoc = parseMeetingMinutesDocumentFromEntry({ content: leftContent })
  const rightDoc = parseMeetingMinutesDocumentFromEntry({ content: rightContent })
  return meetingMinutesAgendaRowsMatch(leftDoc.agenda, rightDoc.agenda)
}

function serializeMeetingMinutesTextBody(agenda) {
  const rows = normalizeMeetingMinutesAgenda(agenda)
  const lines = []
  for (let index = 0; index < rows.length; index += 1) {
    const text = sanitizeMeetingMinutesCell(rows[index].content)
    const person = sanitizeMeetingMinutesCell(
      serializeManagerMultiSelectValue(rows[index].assignees ?? rows[index].assignee)
    )
    const due = sanitizeMeetingMinutesCell(rows[index].dueDate)
    if (!text && !person && !due) continue
    lines.push(
      `${index}${MEETING_MINUTES_FIELD_SEP}${text}${MEETING_MINUTES_FIELD_SEP}${person}${MEETING_MINUTES_FIELD_SEP}${due}`
    )
  }
  return lines.join('\n')
}

export function serializeMeetingMinutesPatch(data) {
  const doc =
    data?.agenda !== undefined || data?.body !== undefined
      ? normalizeMeetingMinutesDocument(data)
      : migrateLegacyParsedToDocument(data)
  return {
    content: serializeMeetingMinutesDocumentContent(doc),
    user: '',
    destination: '',
  }
}

export function isLegacyMeetingMinutesEntry(entry) {
  const raw = safeString(entry?.content).trim()
  return raw.startsWith(MEETING_MINUTES_TEXT_PREFIX)
}

export function isMeetingMinutesDocEntry(entry) {
  const raw = safeString(entry?.content).trim()
  if (raw.startsWith(MEETING_MINUTES_DOC_PREFIX)) return true
  const decoded = decodeWorkReportWireText(raw)
  if (!decoded.startsWith('{') && !decoded.startsWith('"')) return false
  const parsed = coerceMeetingMinutesRawObject(decoded)
  return Boolean(parsed && isMeetingMinutesDocumentShape(parsed))
}

export function getLegacyMeetingMinutesAgenda(weekStartDate, workReportRows) {
  const rows = Array.isArray(workReportRows) ? workReportRows : []
  const section = WORK_REPORT_MEETING_MINUTES_SECTION
  const dateKey = safeString(weekStartDate).trim().slice(0, 10)
  if (!dateKey) return null

  const matches = rows.filter((row) => {
    if (safeString(row.section).trim() !== section) return false
    if (Number(row.orderIndex || 1) !== 1) return false
    const rowDateKey = safeString(row.date).trim().slice(0, 10)
    if (!rowDateKey) return false
    const rowWeekStart = formatWeekStartMonday(rowDateKey)
    return rowWeekStart === formatWeekStartMonday(dateKey) || rowDateKey === dateKey
  })
  if (!matches.length) return null

  const latest = matches.reduce((best, row) => {
    const rowTs = safeString(row?.updatedAt || row?.createdAt)
    const bestTs = safeString(best?.updatedAt || best?.createdAt)
    return rowTs > bestTs ? row : best
  })
  if (!isLegacyMeetingMinutesEntry(latest)) return null
  return normalizeMeetingMinutesAgenda(parseMeetingMinutesFromEntry(latest).agenda)
}

function formatWeekStartMonday(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function weekHasPerRowMeetingMinutes(weekStartDate, getEntry) {
  for (let orderIndex = 2; orderIndex <= MEETING_MINUTES_AGENDA_FIXED_ROWS; orderIndex += 1) {
    const entry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, orderIndex)
    if (safeString(entry?.content).trim() || safeString(entry?.user).trim()) return true
  }
  const row1 = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  if (!row1) return false
  if (isLegacyMeetingMinutesEntry(row1) || isMeetingMinutesDocEntry(row1)) return false
  return Boolean(safeString(row1.content).trim() || safeString(row1.user).trim())
}

function getLegacyMeetingMinutesAgendaFromGetEntry(weekStartDate, getEntry) {
  const entry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  if (!isLegacyMeetingMinutesEntry(entry)) return null
  return normalizeMeetingMinutesAgenda(parseMeetingMinutesFromEntry(entry).agenda)
}

export function loadMeetingMinutesAgenda(weekStartDate, getEntry) {
  const doc = loadMeetingMinutesDocument(weekStartDate, getEntry)
  return documentToLegacyAgenda(doc)
}

export function loadMeetingMinutesDocument(weekStartDate, getEntry) {
  try {
    return loadMeetingMinutesDocumentUnsafe(weekStartDate, getEntry)
  } catch {
    return getDefaultMeetingMinutesDocument()
  }
}

function loadMeetingMinutesDocumentUnsafe(weekStartDate, getEntry) {
  const entry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  if (entry && isMeetingMinutesDocEntry(entry)) {
    return parseMeetingMinutesDocumentFromEntry(entry)
  }

  if (!weekHasPerRowMeetingMinutes(weekStartDate, getEntry)) {
    const legacyAgenda = getLegacyMeetingMinutesAgendaFromGetEntry(weekStartDate, getEntry)
    if (legacyAgenda) {
      return normalizeMeetingMinutesDocument({ agenda: legacyAgenda })
    }
  }

  if (weekHasPerRowMeetingMinutes(weekStartDate, getEntry)) {
    const agenda = getDefaultMeetingMinutesAgenda()
    for (let index = 0; index < MEETING_MINUTES_AGENDA_FIXED_ROWS; index += 1) {
      const rowEntry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, index + 1)
      const rowContent = safeString(rowEntry?.content)
      if (index === 0 && looksLikeJsonGarbage(rowContent)) {
        const parsedDoc = tryParseMeetingMinutesDocJson(decodeWorkReportWireText(rowContent))
        if (parsedDoc) return parsedDoc
        continue
      }
      const assignees = parseManagerMultiSelectValue(rowEntry?.user)
      agenda[index] = {
        content: rowContent,
        assignee: serializeManagerMultiSelectValue(assignees),
        assignees,
        dueDate: safeString(rowEntry?.destination ?? rowEntry?.deadline),
      }
    }
    return normalizeMeetingMinutesDocument({ agenda })
  }

  if (entry) return parseMeetingMinutesDocumentFromEntry(entry)
  return getDefaultMeetingMinutesDocument()
}

export function getDashboardMeetingMinutesDisplayRows(weekStartDate, getEntry) {
  const doc = loadMeetingMinutesDocument(weekStartDate, getEntry)
  if (isMeetingMinutesDocumentEmpty(doc)) return []
  const filledRows = normalizeMeetingMinutesAgenda(doc.agenda).filter(
    (row) => !isMeetingMinutesAgendaRowEmpty(row)
  )
  if (filledRows.length) {
    return filledRows.slice(0, 3).map((row) => ({
      content: safeString(row.content).trim(),
      assignee: safeString(row.assignee).trim(),
      dueDate: safeString(row.dueDate).trim(),
    }))
  }
  return []
}

export function buildMeetingMinutesPdfMarkup(
  weekStartDate,
  getBoardEntry,
  escapeHtml,
  { includeHeading = true } = {}
) {
  const doc = loadMeetingMinutesDocument(weekStartDate, getBoardEntry)
  if (isMeetingMinutesDocumentEmpty(doc)) return ''

  const agendaRows = normalizeMeetingMinutesAgenda(doc.agenda)
    .map((row, index) => {
      const content = safeString(row.content).trim()
      const assignee = safeString(row.assignee).trim()
      const dueDate = safeString(row.dueDate).trim()
      if (!content && !assignee && !dueDate) return ''
      return `
        <tr>
          <td class="pdf-meeting-index">${index + 1}</td>
          <td class="pdf-meeting-content">${escapeHtml(content).replaceAll('\n', '<br />') || '&nbsp;'}</td>
          <td class="pdf-meeting-assignee">${escapeHtml(assignee) || '&nbsp;'}</td>
          <td class="pdf-meeting-due">${escapeHtml(dueDate) || '&nbsp;'}</td>
        </tr>
      `
    })
    .filter(Boolean)
    .join('')

  const agendaTable = agendaRows
    ? `
      <table class="pdf-table pdf-meeting-agenda-table">
        <thead>
          <tr>
            <th class="pdf-meeting-index">#</th>
            <th>회의 내용</th>
            <th class="pdf-meeting-assignee">담당자</th>
            <th class="pdf-meeting-due">기한</th>
          </tr>
        </thead>
        <tbody>${agendaRows}</tbody>
      </table>
    `
    : ''

  return `
    <section class="pdf-meeting-minutes pdf-meeting-minutes--document">
      ${agendaTable}
    </section>
  `
}

export function WorkReportMeetingMinutesSection({
  weekStartDate,
  getEntry,
  updateEntry,
}) {
  const boardEntry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  const document = useMemo(
    () => loadMeetingMinutesDocument(weekStartDate, getEntry),
    [weekStartDate, getEntry, boardEntry?.content]
  )
  const agendaRows = useMemo(
    () => normalizeMeetingMinutesAgenda(document.agenda),
    [document.agenda]
  )

  const patchDocument = (patch) => {
    const next = normalizeMeetingMinutesDocument({ ...document, ...patch })
    updateEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1, (prevEntry) => {
      const base =
        prevEntry ||
        ({
          date: weekStartDate,
          section: WORK_REPORT_MEETING_MINUTES_SECTION,
          orderIndex: 1,
          content: '',
          user: '',
        })
      return {
        ...base,
        date: weekStartDate,
        section: WORK_REPORT_MEETING_MINUTES_SECTION,
        orderIndex: 1,
        content: serializeMeetingMinutesDocumentContent(next),
        user: '',
        assignees: [],
      }
    })
  }

  const patchAgendaRow = (index, patch) => {
    const nextAgenda = agendaRows.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const nextAssignees =
        patch.assignees !== undefined
          ? parseManagerMultiSelectValue(patch.assignees)
          : patch.assignee !== undefined
            ? parseManagerMultiSelectValue(patch.assignee)
            : row.assignees
      return {
        ...row,
        content: patch.content !== undefined ? patch.content : row.content,
        assignee: serializeManagerMultiSelectValue(nextAssignees),
        assignees: nextAssignees,
        dueDate: patch.dueDate !== undefined ? patch.dueDate : row.dueDate,
      }
    })
    patchDocument({ agenda: nextAgenda })
  }

  return (
    <section className="work-report-report-section work-report-meeting-minutes-panel meeting-minutes-doc">
      <div className="meeting-minutes-doc__agenda">
        <div className="meeting-minutes-doc__agenda-head" aria-hidden="true">
          <span className="meeting-minutes-doc__agenda-head-num">구분</span>
          <span className="meeting-minutes-doc__agenda-head-content">회의 내용</span>
          <span className="meeting-minutes-doc__agenda-head-assignee">담당자</span>
          <span className="meeting-minutes-doc__agenda-head-due">기한</span>
        </div>
        {agendaRows.map((row, index) => (
          <div key={`meeting-agenda-${index + 1}`} className="meeting-minutes-doc__agenda-row">
            <span className="meeting-minutes-doc__agenda-num">{index + 1}</span>
            <textarea
              className="meeting-minutes-doc__agenda-content"
              rows={1}
              value={row.content}
              placeholder="내용 입력"
              onChange={(e) => patchAgendaRow(index, { content: e.target.value })}
            />
            <div className="meeting-minutes-doc__agenda-assignee">
              <WorkReportExternalManagerMultiSelect
                value={row.assignees ?? row.assignee}
                options={WORK_REPORT_MANAGER_OPTIONS}
                onChange={(nextCsv) =>
                  patchAgendaRow(index, { assignees: parseManagerMultiSelectValue(nextCsv) })
                }
              />
            </div>
            <input
              className="meeting-minutes-doc__agenda-due"
              type="date"
              value={row.dueDate}
              onChange={(e) => patchAgendaRow(index, { dueDate: e.target.value })}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
