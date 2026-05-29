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

export function getDefaultMeetingMinutesDocument() {
  return {
    title: '',
    meetingDate: '',
    attendees: [],
    body: '',
  }
}

function normalizeMeetingMinutesDocument(raw = {}, entry) {
  const attendees = parseManagerMultiSelectValue(
    raw.attendees ?? raw.attendee ?? entry?.user ?? entry?.assignees
  )
  return {
    title: safeString(raw.title ?? raw.meetingTitle).trim(),
    meetingDate: safeString(raw.meetingDate ?? raw.meetingDateTime ?? raw.date).trim(),
    attendees,
    body: safeString(raw.body ?? raw.content ?? raw.text),
  }
}

function tryParseMeetingMinutesDocJson(decoded) {
  const trimmed = safeString(decoded).trim()
  if (!trimmed) return null

  let jsonText = trimmed
  if (trimmed.startsWith(MEETING_MINUTES_DOC_PREFIX)) {
    jsonText = trimmed.slice(MEETING_MINUTES_DOC_PREFIX.length).trim()
  }
  if (!jsonText.startsWith('{')) return null

  try {
    const parsed = JSON.parse(jsonText)
    if (parsed?.v === MEETING_MINUTES_DOC_VERSION) {
      return normalizeMeetingMinutesDocument(parsed, null)
    }
  } catch {
    return null
  }
  return null
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

export function parseMeetingMinutesFromEntry(entry) {
  const raw = safeString(entry?.content).trim()
  const decoded = decodeWorkReportWireText(raw)

  const docFromWire = tryParseMeetingMinutesDocJson(decoded)
  if (docFromWire) {
    return {
      meta: getDefaultMeetingMinutesData().meta,
      agenda: documentToLegacyAgenda(docFromWire),
    }
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

  if (decoded.startsWith('{')) {
    try {
      const parsed = JSON.parse(decoded)
      if (parsed?.v === MEETING_MINUTES_DOC_VERSION) {
        const doc = normalizeMeetingMinutesDocument(parsed, entry)
        return {
          meta: getDefaultMeetingMinutesData().meta,
          agenda: documentToLegacyAgenda(doc),
        }
      }
      if (parsed?.v === MEETING_MINUTES_STORAGE_VERSION && Array.isArray(parsed.rows)) {
        return {
          meta: getDefaultMeetingMinutesData().meta,
          agenda: normalizeMeetingMinutesAgenda(parsed.rows),
        }
      }

      const agendaSource = Array.isArray(parsed?.agenda)
        ? parsed.agenda
        : Array.isArray(parsed?.items)
          ? parsed.items
          : null
      if (parsed?.meta && agendaSource) {
        return {
          meta: parseMeetingMinutesMeta(parsed.meta, entry),
          agenda: normalizeMeetingMinutesAgenda(agendaSource),
        }
      }
    } catch {
      /* legacy plain text */
    }
  }

  const legacyContent = decoded
  const legacyMeta = {
    meetingDateTime: safeString(entry?.destination).trim(),
    location: '',
    attendees: '',
    author: safeString(entry?.user).trim(),
  }
  if (!legacyContent && !legacyMeta.meetingDateTime && !legacyMeta.author) {
    return getDefaultMeetingMinutesData()
  }
  return {
    meta: legacyMeta,
    agenda: normalizeMeetingMinutesAgenda(
      legacyContent ? [{ content: legacyContent, assignee: '', dueDate: '' }] : []
    ),
  }
}

function documentToLegacyAgenda(doc) {
  const body = safeString(doc.body).trim()
  if (!body) return getDefaultMeetingMinutesAgenda()
  return normalizeMeetingMinutesAgenda([{ content: body, assignee: '', dueDate: '' }])
}

function migrateLegacyParsedToDocument(parsed, entry) {
  const meta = parsed?.meta || getDefaultMeetingMinutesData().meta
  const agenda = normalizeMeetingMinutesAgenda(parsed?.agenda)
  const lines = []
  for (let index = 0; index < agenda.length; index += 1) {
    const row = agenda[index]
    const content = safeString(row.content).trim()
    const assignee = safeString(row.assignee).trim()
    if (!content && !assignee) continue
    lines.push(assignee ? `${content} (담당: ${assignee})` : content)
  }
  const attendees = parseManagerMultiSelectValue(entry?.user ?? entry?.assignees)
  const metaDate = safeString(meta.meetingDateTime).trim()
  return normalizeMeetingMinutesDocument(
    {
      title: metaDate ? '' : '',
      meetingDate: metaDate,
      attendees: attendees.length ? attendees : parseManagerMultiSelectValue(meta.attendees),
      body: lines.join('\n'),
    },
    entry
  )
}

export function parseMeetingMinutesDocumentFromEntry(entry) {
  const raw = safeString(entry?.content).trim()
  const decoded = decodeWorkReportWireText(raw)
  const direct = tryParseMeetingMinutesDocJson(decoded)
  if (direct) return normalizeMeetingMinutesDocument(direct, entry)
  return migrateLegacyParsedToDocument(parseMeetingMinutesFromEntry(entry), entry)
}

export function serializeMeetingMinutesDocumentContent(doc) {
  const normalized = normalizeMeetingMinutesDocument(doc, null)
  if (isMeetingMinutesDocumentEmpty(normalized)) return ''
  const payload = {
    v: MEETING_MINUTES_DOC_VERSION,
    title: normalized.title,
    meetingDate: normalized.meetingDate,
    body: normalized.body,
  }
  return `${MEETING_MINUTES_DOC_PREFIX}${JSON.stringify(payload)}`
}

export function isMeetingMinutesDocumentEmpty(doc) {
  const normalized = normalizeMeetingMinutesDocument(doc, null)
  return (
    !safeString(normalized.title).trim() &&
    !safeString(normalized.meetingDate).trim() &&
    !safeString(normalized.body).trim() &&
    !normalized.attendees.length
  )
}

export function isMeetingMinutesDataEmpty(data) {
  if (!data) return true
  if (data.title !== undefined || data.body !== undefined || data.meetingDate !== undefined) {
    return isMeetingMinutesDocumentEmpty(data)
  }
  return isMeetingMinutesDocumentEmpty(migrateLegacyParsedToDocument(data, null))
}

export function meetingMinutesAgendaMatches(leftContent, rightContent) {
  const leftDoc = parseMeetingMinutesDocumentFromEntry({ content: leftContent })
  const rightDoc = parseMeetingMinutesDocumentFromEntry({ content: rightContent })
  return (
    safeString(leftDoc.title).trim() === safeString(rightDoc.title).trim() &&
    safeString(leftDoc.meetingDate).trim() === safeString(rightDoc.meetingDate).trim() &&
    safeString(leftDoc.body) === safeString(rightDoc.body) &&
    meetingMinutesAssigneeKey(leftDoc.attendees) === meetingMinutesAssigneeKey(rightDoc.attendees)
  )
}

function serializeMeetingMinutesTextBody(agenda) {
  const rows = normalizeMeetingMinutesAgenda(agenda)
  const lines = []
  for (let index = 0; index < rows.length; index += 1) {
    const text = sanitizeMeetingMinutesCell(rows[index].content)
    const person = sanitizeMeetingMinutesCell(
      serializeManagerMultiSelectValue(rows[index].assignees ?? rows[index].assignee)
    )
    if (!text && !person) continue
    lines.push(
      `${index}${MEETING_MINUTES_FIELD_SEP}${text}${MEETING_MINUTES_FIELD_SEP}${person}`
    )
  }
  return lines.join('\n')
}

export function serializeMeetingMinutesPatch(data) {
  const doc = data?.title !== undefined || data?.body !== undefined
    ? normalizeMeetingMinutesDocument(data, null)
    : migrateLegacyParsedToDocument(data, null)
  return {
    content: serializeMeetingMinutesDocumentContent(doc),
    user: serializeManagerMultiSelectValue(doc.attendees),
    destination: safeString(doc.meetingDate),
  }
}

export function isLegacyMeetingMinutesEntry(entry) {
  const raw = safeString(entry?.content).trim()
  return raw.startsWith(MEETING_MINUTES_TEXT_PREFIX)
}

export function isMeetingMinutesDocEntry(entry) {
  const raw = safeString(entry?.content).trim()
  return raw.startsWith(MEETING_MINUTES_DOC_PREFIX)
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
  const entry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  if (entry && isMeetingMinutesDocEntry(entry)) {
    return parseMeetingMinutesDocumentFromEntry(entry)
  }

  if (!weekHasPerRowMeetingMinutes(weekStartDate, getEntry)) {
    const legacyAgenda = getLegacyMeetingMinutesAgendaFromGetEntry(weekStartDate, getEntry)
    if (legacyAgenda) {
      return migrateLegacyParsedToDocument(
        { meta: getDefaultMeetingMinutesData().meta, agenda: legacyAgenda },
        entry
      )
    }
  }

  if (weekHasPerRowMeetingMinutes(weekStartDate, getEntry)) {
    const lines = []
    const attendeeSet = new Set()
    for (let index = 0; index < MEETING_MINUTES_AGENDA_FIXED_ROWS; index += 1) {
      const rowEntry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, index + 1)
      const content = safeString(rowEntry?.content).trim()
      const assignees = parseManagerMultiSelectValue(rowEntry?.user)
      assignees.forEach((name) => attendeeSet.add(name))
      const assigneeLabel = serializeManagerMultiSelectValue(assignees)
      if (!content && !assigneeLabel) continue
      lines.push(assigneeLabel ? `${content} (담당: ${assigneeLabel})` : content)
    }
    return normalizeMeetingMinutesDocument(
      {
        title: '',
        meetingDate: '',
        attendees: [...attendeeSet],
        body: lines.join('\n'),
      },
      entry
    )
  }

  if (entry) return parseMeetingMinutesDocumentFromEntry(entry)
  return getDefaultMeetingMinutesDocument()
}

export function getDashboardMeetingMinutesDisplayRows(weekStartDate, getEntry) {
  const doc = loadMeetingMinutesDocument(weekStartDate, getEntry)
  if (isMeetingMinutesDocumentEmpty(doc)) return []
  const preview =
    safeString(doc.title).trim() ||
    safeString(doc.body)
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ||
    ''
  if (!preview) return []
  return [
    {
      content: preview,
      assignee: serializeManagerMultiSelectValue(doc.attendees),
    },
  ]
}

export function buildMeetingMinutesPdfMarkup(
  weekStartDate,
  getBoardEntry,
  escapeHtml,
  { includeHeading = true } = {}
) {
  const doc = loadMeetingMinutesDocument(weekStartDate, getBoardEntry)
  if (isMeetingMinutesDocumentEmpty(doc)) return ''

  const title = safeString(doc.title).trim() || '회의록'
  const meetingDate = safeString(doc.meetingDate).trim()
  const attendees = serializeManagerMultiSelectValue(doc.attendees)
  const bodyHtml = escapeHtml(safeString(doc.body)).replaceAll('\n', '<br />') || '&nbsp;'

  const metaParts = []
  if (meetingDate) metaParts.push(`일시: ${escapeHtml(meetingDate)}`)
  if (attendees) metaParts.push(`참석자: ${escapeHtml(attendees)}`)

  return `
    <section class="pdf-meeting-minutes pdf-meeting-minutes--document">
      <h3 class="pdf-meeting-title">${escapeHtml(title)}</h3>
      ${metaParts.length ? `<div class="pdf-meeting-meta">${metaParts.join(' · ')}</div>` : ''}
      <div class="pdf-meeting-body">${bodyHtml}</div>
    </section>
  `
}

export function WorkReportMeetingMinutesSection({
  weekStartDate,
  getEntry,
  updateEntry,
  onSave,
  isSaving = false,
}) {
  const document = useMemo(
    () => loadMeetingMinutesDocument(weekStartDate, getEntry),
    [weekStartDate, getEntry]
  )

  const patchDocument = (patch) => {
    const next = normalizeMeetingMinutesDocument({ ...document, ...patch }, null)
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
        user: serializeManagerMultiSelectValue(next.attendees),
        assignees: next.attendees,
      }
    })
  }

  return (
    <section className="work-report-report-section work-report-meeting-minutes-panel meeting-minutes-doc">
      <input
        className="meeting-minutes-doc__title"
        type="text"
        value={document.title}
        placeholder="회의 제목"
        onChange={(e) => patchDocument({ title: e.target.value })}
      />

      <div className="meeting-minutes-doc__meta">
        <label className="meeting-minutes-doc__meta-field">
          <span className="meeting-minutes-doc__meta-label">일시</span>
          <input
            className="meeting-minutes-doc__meta-input"
            type="date"
            value={document.meetingDate}
            onChange={(e) => patchDocument({ meetingDate: e.target.value })}
          />
        </label>
        <label className="meeting-minutes-doc__meta-field meeting-minutes-doc__meta-field--attendees">
          <span className="meeting-minutes-doc__meta-label">참석자</span>
          <WorkReportExternalManagerMultiSelect
            value={document.attendees}
            options={WORK_REPORT_MANAGER_OPTIONS}
            onChange={(nextCsv) =>
              patchDocument({ attendees: parseManagerMultiSelectValue(nextCsv) })
            }
          />
        </label>
      </div>

      <textarea
        className="meeting-minutes-doc__body"
        value={document.body}
        placeholder="회의 내용을 자유롭게 작성하세요."
        onChange={(e) => patchDocument({ body: e.target.value })}
      />

      {typeof onSave === 'function' && (
        <div className="meeting-minutes-doc__actions">
          <button
            className="primary-btn"
            type="button"
            disabled={isSaving}
            onClick={() => onSave()}
          >
            저장
          </button>
        </div>
      )}
    </section>
  )
}
