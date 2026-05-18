import { useMemo } from 'react'

export const MEETING_MINUTES_AGENDA_DEFAULT_ROWS = 5

export const WORK_REPORT_MEETING_MINUTES_SECTION = '회의록'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function getDefaultMeetingMinutesAgenda(count = MEETING_MINUTES_AGENDA_DEFAULT_ROWS) {
  return Array.from({ length: count }, () => ({
    content: '',
    assignee: '',
    dueDate: '',
  }))
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
        const agenda =
          parsed.agenda.length > 0
            ? parsed.agenda.map((row) => ({
                content: safeString(row?.content),
                assignee: safeString(row?.assignee),
                dueDate: safeString(row?.dueDate),
              }))
            : getDefaultMeetingMinutesAgenda()
        return {
          meta: {
            meetingDateTime: safeString(parsed.meta.meetingDateTime),
            location: safeString(parsed.meta.location),
            attendees: safeString(parsed.meta.attendees),
            author: safeString(parsed.meta.author),
          },
          agenda,
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
    agenda: legacyContent
      ? [{ content: legacyContent, assignee: '', dueDate: '' }, ...getDefaultMeetingMinutesAgenda(4)]
      : getDefaultMeetingMinutesAgenda(),
  }
}

export function isMeetingMinutesDataEmpty(data) {
  const meta = data?.meta || {}
  if (
    safeString(meta.meetingDateTime).trim() ||
    safeString(meta.location).trim() ||
    safeString(meta.attendees).trim() ||
    safeString(meta.author).trim()
  ) {
    return false
  }
  return !(data?.agenda || []).some(
    (row) =>
      safeString(row?.content).trim() ||
      safeString(row?.assignee).trim() ||
      safeString(row?.dueDate).trim()
  )
}

export function serializeMeetingMinutesPatch(data) {
  return {
    content: JSON.stringify(data),
    user: safeString(data.meta.author),
    destination: safeString(data.meta.meetingDateTime),
  }
}

export function buildMeetingMinutesPdfMarkup(weekStartDate, getBoardEntry, escapeHtml) {
  const entry = getBoardEntry(weekStartDate, WORK_REPORT_MEETING_MINUTES_SECTION, 1)
  const data = parseMeetingMinutesFromEntry(entry)
  if (isMeetingMinutesDataEmpty(data)) return ''

  const meta = data.meta
  const agendaRows = data.agenda
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

  return `
    <section class="pdf-meeting-minutes">
      <h3 class="pdf-meeting-title">회의록</h3>
      <table class="pdf-table pdf-meeting-info-table">
        <tbody>
          <tr>
            <th scope="row">일시</th>
            <td>${escapeHtml(meta.meetingDateTime) || '&nbsp;'}</td>
            <th scope="row">장소</th>
            <td>${escapeHtml(meta.location) || '&nbsp;'}</td>
          </tr>
          <tr>
            <th scope="row">참석자</th>
            <td>${escapeHtml(meta.attendees) || '&nbsp;'}</td>
            <th scope="row">작성자(담당자)</th>
            <td>${escapeHtml(meta.author) || '&nbsp;'}</td>
          </tr>
        </tbody>
      </table>
      <table class="pdf-table pdf-meeting-agenda-table">
        <thead>
          <tr>
            <th class="pdf-meeting-index">#</th>
            <th>주요 회의 내용 및 결정사항</th>
            <th class="pdf-meeting-assignee">담당자</th>
            <th class="pdf-meeting-due">조치기한</th>
          </tr>
        </thead>
        <tbody>
          ${
            agendaRows ||
            '<tr><td colspan="4" class="pdf-meeting-empty">&nbsp;</td></tr>'
          }
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
  const data = useMemo(
    () => parseMeetingMinutesFromEntry(entry),
    [entry.content, entry.user, entry.destination]
  )

  const saveData = (nextData) => {
    updateEntry(
      weekStartDate,
      WORK_REPORT_MEETING_MINUTES_SECTION,
      1,
      serializeMeetingMinutesPatch(nextData)
    )
  }

  const patchMeta = (field, value) => {
    saveData({
      ...data,
      meta: { ...data.meta, [field]: value },
    })
  }

  const patchAgendaRow = (index, patch) => {
    saveData({
      ...data,
      agenda: data.agenda.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    })
  }

  const addAgendaRow = () => {
    saveData({
      ...data,
      agenda: [...data.agenda, { content: '', assignee: '', dueDate: '' }],
    })
  }

  return (
    <section className="work-report-meeting-minutes-section" onBlur={onBlur}>
      <h3 className="work-report-meeting-minutes-title">회의록</h3>

      <table className="meeting-minutes-info-table">
        <tbody>
          <tr>
            <th scope="row">일시</th>
            <td>
              <input
                type="text"
                className="meeting-minutes-cell-input work-report-report-field"
                value={data.meta.meetingDateTime}
                placeholder="예: 2026-05-15 14:00"
                onChange={(e) => patchMeta('meetingDateTime', e.target.value)}
              />
            </td>
            <th scope="row">장소</th>
            <td>
              <input
                type="text"
                className="meeting-minutes-cell-input work-report-report-field"
                value={data.meta.location}
                placeholder="회의 장소"
                onChange={(e) => patchMeta('location', e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <th scope="row">참석자</th>
            <td>
              <input
                type="text"
                className="meeting-minutes-cell-input work-report-report-field"
                value={data.meta.attendees}
                placeholder="참석자"
                onChange={(e) => patchMeta('attendees', e.target.value)}
              />
            </td>
            <th scope="row">작성자(담당자)</th>
            <td>
              <input
                type="text"
                className="meeting-minutes-cell-input work-report-report-field"
                value={data.meta.author}
                placeholder="작성자"
                onChange={(e) => patchMeta('author', e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <table className="meeting-minutes-agenda-table">
        <thead>
          <tr>
            <th className="meeting-minutes-col-index">#</th>
            <th>주요 회의 내용 및 결정사항</th>
            <th className="meeting-minutes-col-assignee">담당자</th>
            <th className="meeting-minutes-col-due">조치기한</th>
          </tr>
        </thead>
        <tbody>
          {data.agenda.map((row, index) => (
            <tr key={`meeting-agenda-${index}`}>
              <td className="meeting-minutes-col-index">{index + 1}</td>
              <td>
                <textarea
                  className="meeting-minutes-cell-textarea work-report-report-field"
                  rows={3}
                  value={row.content}
                  placeholder="회의 내용 및 결정사항"
                  onChange={(e) => patchAgendaRow(index, { content: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="meeting-minutes-cell-input work-report-report-field"
                  value={row.assignee}
                  placeholder="담당자"
                  onChange={(e) => patchAgendaRow(index, { assignee: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="meeting-minutes-cell-input work-report-report-field"
                  value={row.dueDate}
                  placeholder="조치기한"
                  onChange={(e) => patchAgendaRow(index, { dueDate: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="work-report-meeting-minutes-actions">
        <button type="button" className="secondary-btn" onClick={addAgendaRow}>
          안건 추가
        </button>
      </div>
    </section>
  )
}
