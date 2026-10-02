import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from '../../apiClient.js'

const ACTION_LABELS = {
  SECURITY_VIOLATION: '보안경고',
  LOGIN: '로그인',
  DATA_ACTION: '데이터',
}

const ACTION_CLASS = {
  SECURITY_VIOLATION: 'is-security',
  LOGIN: 'is-login',
  DATA_ACTION: 'is-data',
}

function formatOccurredAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export default function AuditLogPage({ onClose }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [appliedName, setAppliedName] = useState('')
  const [rows, setRows] = useState([])
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    const params = new URLSearchParams()
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    if (appliedName.trim()) params.set('name', appliedName.trim())
    const query = params.toString()
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/audit-logs${query ? `?${query}` : ''}`,
        apiFetchInit({ headers: { ...getAuthHeaders() } }),
      )
      const data = await response.json().catch(() => [])
      if (!response.ok) {
        setRows([])
        setLoadError(response.status === 403 ? '관리자만 조회할 수 있습니다.' : '로그를 불러오지 못했습니다.')
        return
      }
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setRows([])
      setLoadError('로그를 불러오지 못했습니다. 로컬 API 서버가 켜져 있는지 확인하세요.')
    } finally {
      setIsLoading(false)
    }
  }, [appliedName, dateFrom, dateTo])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  return (
    <section className="stat-card stat-card--audit-log">
      <div className="audit-log-head">
        <div>
          <h2>시스템 로그 관리</h2>
          <p>로그인, 저장·삭제, 개발자 도구 접근 시도를 시간순으로 봅니다.</p>
        </div>
        {onClose ? (
          <button type="button" className="audit-log-modal-close" onClick={onClose}>
            닫기
          </button>
        ) : null}
      </div>

      <form
        className="audit-log-filters"
        onSubmit={(event) => {
          event.preventDefault()
          setAppliedName(nameQuery)
        }}
      >
        <label>
          시작일
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          종료일
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <label>
          사용자 이름
          <input
            type="search"
            value={nameQuery}
            placeholder="이름 검색"
            onChange={(event) => setNameQuery(event.target.value)}
          />
        </label>
        <button type="submit">검색</button>
      </form>

      {loadError ? <p className="audit-log-error">{loadError}</p> : null}
      {isLoading ? <p className="audit-log-muted">불러오는 중...</p> : null}

      <div className="audit-log-table-wrap">
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>발생 일시</th>
              <th>접속자</th>
              <th>접속 IP</th>
              <th>분류</th>
              <th>상세 내용</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={5}>기록된 로그가 없습니다.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatOccurredAt(row.occurredAt)}</td>
                  <td>{row.actorName || row.actorId || '-'}</td>
                  <td>{row.ipAddress || '-'}</td>
                  <td>
                    <span className={`audit-log-kind ${ACTION_CLASS[row.actionType] || ''}`}>
                      {ACTION_LABELS[row.actionType] || row.actionType}
                    </span>
                  </td>
                  <td>{row.description}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
