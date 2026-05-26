import { useMemo } from 'react'

export const MEETING_MINUTES_AGENDA_FIXED_ROWS = 20

/** @deprecated MEETING_MINUTES_AGENDA_FIXED_ROWS 사용 */
export const MEETING_MINUTES_AGENDA_DEFAULT_ROWS = MEETING_MINUTES_AGENDA_FIXED_ROWS

export const WORK_REPORT_MEETING_MINUTES_SECTION = '회의록'

/** Cloudflare WAF가 JSON 키(content/assignee/agenda) 조합을 차단 → mm2(탭 구분 텍스트) 우선 */
const MEETING_MINUTES_STORAGE_VERSION = 2
const MEETING_MINUTES_TEXT_PREFIX = 'mm2\n'

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

function parseMeetingMinutesTextLine(line) {
  const trimmed = safeString(line).trimEnd()
  if (!trimmed) return null

  const parts = trimmed.split('\t')
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
    const rowIndex = Number(parts[0])
    return {
      rowIndex,
      content: parts.slice(1, -1).join('\t').trim(),
      assignee: safeString(parts[parts.length - 1]).trim(),
      dueDate: '',
    }
  }

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
  const textRows = parseMeetingMinutesTextRows(raw)
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

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
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

  const legacyContent = raw
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

function serializeMeetingMinutesTextBody(agenda) {
  const rows = normalizeMeetingMinutesAgenda(agenda)
  const sanitizeCell = (value) =>
    safeString(value)
      .replace(/\t/g, ' ')
      .replace(/\r?\n/g, ' ')
      .trim()

  const lines = []
  for (let index = 0; index < rows.length; index += 1) {
    const text = sanitizeCell(rows[index].content)
    const person = sanitizeCell(rows[index].assignee)
    if (!text && !person) continue
    lines.push(`${index}\t${text}\t${person}`)
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
      return serializeMeetingMinutesPatch({ ...currentData, agenda })
    })
  }

  return (
    <section className="work-report-meeting-minutes-section" onBlur={onBlur}>
      <div className="meeting-minutes-table-scroll">
        <table className="meeting-minutes-agenda-table">
          <thead>
            <tr>
              <th className="meeting-minutes-col-index">#</th>
              <th className="meeting-minutes-col-content">회의록</th>
              <th className="meeting-minutes-col-assignee">담당자</th>
            </tr>
          </thead>
          <tbody>
            {agendaRows.map((row, index) => (
              <tr key={`meeting-agenda-${index + 1}`} className="meeting-minutes-agenda-row">
                <td className="meeting-minutes-col-index">{index + 1}</td>
                <td className="meeting-minutes-col-content">
                  <textarea
                    className="meeting-minutes-cell-textarea work-report-report-field"
                    rows={2}
                    value={row.content}
                    placeholder="회의 내용"
                    onChange={(e) => patchAgendaRow(index, { content: e.target.value })}
                  />
                </td>
                <td className="meeting-minutes-col-assignee">
                  <input
                    type="text"
                    className="meeting-minutes-cell-input meeting-minutes-cell-input--center work-report-report-field"
                    value={row.assignee}
                    placeholder="담당자"
                    onChange={(e) => patchAgendaRow(index, { assignee: e.target.value })}
                    onBlur={onBlur}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
