import { useMemo } from 'react'

export const MEETING_MINUTES_AGENDA_FIXED_ROWS = 20

/** @deprecated MEETING_MINUTES_AGENDA_FIXED_ROWS 사용 */
export const MEETING_MINUTES_AGENDA_DEFAULT_ROWS = MEETING_MINUTES_AGENDA_FIXED_ROWS

export const WORK_REPORT_MEETING_MINUTES_SECTION = '회의록'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function normalizeMeetingMinutesAgenda(agenda) {
  const rows = Array.isArray(agenda) ? agenda : []
  return Array.from({ length: MEETING_MINUTES_AGENDA_FIXED_ROWS }, (_, index) => ({
    content: safeString(rows[index]?.content),
    assignee: safeString(rows[index]?.assignee),
    dueDate: safeString(rows[index]?.dueDate),
  }))
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

export function parseMeetingMinutesFromEntry(entry) {
  const raw = safeString(entry?.content).trim()
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.meta && Array.isArray(parsed.agenda)) {
        return {
          meta: {
            meetingDateTime: safeString(parsed.meta.meetingDateTime),
            location: safeString(parsed.meta.location),
            attendees: safeString(parsed.meta.attendees),
            author: safeString(parsed.meta.author),
          },
          agenda: normalizeMeetingMinutesAgenda(parsed.agenda),
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
      legacyContent
        ? [{ content: legacyContent, assignee: '', dueDate: '' }]
        : []
    ),
  }
}

export function isMeetingMinutesDataEmpty(data) {
  return !normalizeMeetingMinutesAgenda(data?.agenda).some(
    (row) =>
      safeString(row.content).trim() ||
      safeString(row.assignee).trim() ||
      safeString(row.dueDate).trim()
  )
}

export function serializeMeetingMinutesPatch(data) {
  return {
    content: JSON.stringify({
      ...data,
      agenda: normalizeMeetingMinutesAgenda(data.agenda),
    }),
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
      const dueDate = safeString(row.dueDate).trim()
      return `
        <tr>
          <td class="pdf-meeting-index">${index + 1}</td>
          <td class="pdf-meeting-content">${escapeHtml(content).replaceAll('\n', '<br />') || '&nbsp;'}</td>
          <td class="pdf-meeting-assignee">${escapeHtml(assignee) || '&nbsp;'}</td>
          <td class="pdf-meeting-due">${escapeHtml(dueDate) || '&nbsp;'}</td>
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
            <th class="pdf-meeting-due">업무기한</th>
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

  const saveData = (nextData) => {
    updateEntry(
      weekStartDate,
      WORK_REPORT_MEETING_MINUTES_SECTION,
      1,
      serializeMeetingMinutesPatch(nextData)
    )
  }

  const patchAgendaRow = (index, patch) => {
    saveData({
      ...data,
      agenda: agendaRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    })
  }

  return (
    <section className="work-report-meeting-minutes-section" onBlur={onBlur}>
      <div className="meeting-minutes-table-scroll">
        <table className="meeting-minutes-agenda-table">
          <thead>
            <tr>
              <th className="meeting-minutes-col-index">#</th>
              <th>회의록</th>
              <th className="meeting-minutes-col-assignee">담당자</th>
              <th className="meeting-minutes-col-due">업무기한</th>
            </tr>
          </thead>
          <tbody>
            {agendaRows.map((row, index) => (
              <tr key={`meeting-agenda-${index + 1}`} className="meeting-minutes-agenda-row">
                <td className="meeting-minutes-col-index">{index + 1}</td>
                <td>
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
                  />
                </td>
                <td className="meeting-minutes-col-due">
                  <input
                    type="text"
                    className="meeting-minutes-cell-input meeting-minutes-cell-input--center work-report-report-field"
                    value={row.dueDate}
                    placeholder="2000-00-00"
                    onChange={(e) => patchAgendaRow(index, { dueDate: e.target.value })}
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
