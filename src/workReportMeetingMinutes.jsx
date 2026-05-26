import { useMemo } from 'react'
import { decodeWorkReportWireText } from './workReportWire.js'

export const MEETING_MINUTES_AGENDA_FIXED_ROWS = 20

/** @deprecated MEETING_MINUTES_AGENDA_FIXED_ROWS 사용 */
export const MEETING_MINUTES_AGENDA_DEFAULT_ROWS = MEETING_MINUTES_AGENDA_FIXED_ROWS

export const WORK_REPORT_MEETING_MINUTES_SECTION = '회의록'

const MEETING_MINUTES_SESSION_KEY_PREFIX = 'cms-meeting-mm2:'

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

/** Cloudflare WAF 회피 + 탭 혼동 방지 (회의내용·담당자 구분) */
const MEETING_MINUTES_STORAGE_VERSION = 2
const MEETING_MINUTES_TEXT_PREFIX = 'mm2\n'
const MEETING_MINUTES_FIELD_SEP = '\u001f'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function normalizeMeetingMinutesAgenda(agenda) {
  const rows = Array.isArray(agenda) ? agenda : []
  return Array.from({ length: MEETING_MINUTES_AGENDA_FIXED_ROWS }, (_, index) => {
    const row = rows[index]
    if (Array.isArray(row)) {
      return {
        content: safeString(row[0]),
        assignee: safeString(row[1]),
        dueDate: safeString(row[2]),
      }
    }
    return {
      content: safeString(row?.content ?? row?.text),
      assignee: safeString(row?.assignee ?? row?.person),
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

/** `0↟내용↟담당자` — 마지막 구분자 기준으로 담당자 분리(내용에 탭이 있어도 안전) */
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
      agenda[idx] = {
        content: safeString(row.content).trim(),
        assignee: safeString(row.assignee).trim(),
        dueDate: '',
      }
    }
    return agenda
  }

  return parsed.map((row) => ({
    content: safeString(row.content).trim(),
    assignee: safeString(row.assignee).trim(),
    dueDate: '',
  }))
}

export function parseMeetingMinutesFromEntry(entry) {
  const raw = safeString(entry?.content).trim()
  const decoded = decodeWorkReportWireText(raw)

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

export function isMeetingMinutesDataEmpty(data) {
  return !normalizeMeetingMinutesAgenda(data?.agenda).some(
    (row) => safeString(row.content).trim() || safeString(row.assignee).trim()
  )
}

/** 저장 검증: 행 단위 내용·담당자가 동일한지 (mm2 직렬화 문자열 차이 무시) */
export function meetingMinutesAgendaMatches(leftContent, rightContent) {
  const leftAgenda = normalizeMeetingMinutesAgenda(
    parseMeetingMinutesFromEntry({ content: leftContent }).agenda
  )
  const rightAgenda = normalizeMeetingMinutesAgenda(
    parseMeetingMinutesFromEntry({ content: rightContent }).agenda
  )
  for (let index = 0; index < MEETING_MINUTES_AGENDA_FIXED_ROWS; index += 1) {
    const left = leftAgenda[index] || {}
    const right = rightAgenda[index] || {}
    if (safeString(left.content).trim() !== safeString(right.content).trim()) return false
    if (safeString(left.assignee).trim() !== safeString(right.assignee).trim()) return false
  }
  return true
}

function serializeMeetingMinutesTextBody(agenda) {
  const rows = normalizeMeetingMinutesAgenda(agenda)
  const lines = []
  for (let index = 0; index < rows.length; index += 1) {
    const text = sanitizeMeetingMinutesCell(rows[index].content)
    const person = sanitizeMeetingMinutesCell(rows[index].assignee)
    if (!text && !person) continue
    lines.push(
      `${index}${MEETING_MINUTES_FIELD_SEP}${text}${MEETING_MINUTES_FIELD_SEP}${person}`
    )
  }
  return lines.join('\n')
}

export function serializeMeetingMinutesPatch(data) {
  const textBody = serializeMeetingMinutesTextBody(data.agenda)
  return {
    content: textBody ? `${MEETING_MINUTES_TEXT_PREFIX}${textBody}` : '',
    user: safeString(data.meta?.author),
    destination: safeString(data.meta?.meetingDateTime),
  }
}

export function buildMeetingMinutesPdfMarkup(
  weekStartDate,
  getBoardEntry,
  escapeHtml,
  { includeHeading = true } = {}
) {
  const entry = getBoardEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  const data = parseMeetingMinutesFromEntry(entry)
  if (isMeetingMinutesDataEmpty(data)) return ''

  const agendaRows = normalizeMeetingMinutesAgenda(data.agenda)
    .map((row, index) => {
      const content = safeString(row.content).trim()
      const assignee = safeString(row.assignee).trim()
      return `
        <tr>
          <td class="pdf-meeting-index">${index + 1}</td>
          <td class="pdf-meeting-content">${escapeHtml(content).replaceAll('\n', '<br />') || '&nbsp;'}</td>
          <td class="pdf-meeting-assignee">${escapeHtml(assignee) || '&nbsp;'}</td>
        </tr>
      `
    })
    .join('')

  return `
    <section class="pdf-meeting-minutes">
      ${includeHeading ? '<h3 class="pdf-meeting-title">회의록</h3>' : ''}
      <table class="pdf-table pdf-meeting-agenda-table">
        <thead>
          <tr>
            <th class="pdf-meeting-index">#</th>
            <th>회의록</th>
            <th class="pdf-meeting-assignee">담당자</th>
          </tr>
        </thead>
        <tbody>
          ${agendaRows}
        </tbody>
      </table>
    </section>
  `
}

export function WorkReportMeetingMinutesSection({
  weekStartDate,
  getEntry,
  updateEntry,
  onBlur,
}) {
  const entry = getEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  const data = useMemo(() => parseMeetingMinutesFromEntry(entry), [entry.content, entry.user, entry.destination])
  const agendaRows = useMemo(() => normalizeMeetingMinutesAgenda(data.agenda), [data.agenda])

  const patchAgendaRow = (index, patch) => {
    updateEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1, (prevEntry) => {
      const currentData = parseMeetingMinutesFromEntry(prevEntry)
      const agenda = normalizeMeetingMinutesAgenda(currentData.agenda).map((row, i) =>
        i === index ? { ...row, ...patch } : row
      )
      return {
        ...prevEntry,
        ...serializeMeetingMinutesPatch({ ...currentData, agenda }),
      }
    })
  }

  return (
    <section className="work-report-report-section work-report-meeting-minutes-panel">
      <div className="work-report-report-table work-report-report-table--meeting">
        <div className="work-report-report-table-head work-report-report-table-head-meeting">
          <div>#</div>
          <div>회의록</div>
          <div>담당자</div>
        </div>
        {agendaRows.map((row, index) => (
          <div
            key={`meeting-agenda-${index + 1}`}
            className="work-report-report-table-row editable work-report-report-table-row-meeting"
            onBlur={onBlur}
          >
            <div className="work-report-report-line-number">{index + 1}</div>
            <div className="work-report-report-cell">
              <textarea
                className="work-report-report-field work-report-report-field--grow"
                rows={2}
                value={row.content}
                placeholder="내용 입력"
                onChange={(e) => patchAgendaRow(index, { content: e.target.value })}
              />
            </div>
            <div className="work-report-report-cell work-report-report-cell--meeting-assignee">
              <input
                type="text"
                className="work-report-report-field work-report-report-field--center"
                value={row.assignee}
                placeholder="담당자"
                onChange={(e) => patchAgendaRow(index, { assignee: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
