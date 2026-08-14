import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ROLES, normalizeRole } from '../permissions.js'
import { normalizeSalesContactRow, salesContactsApi } from '../salesContactsApi.js'

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

const CONTACT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
})

const CONTACT_STATUS_OPTIONS = [
  { value: CONTACT_STATUS.ACTIVE, label: '활성' },
  { value: CONTACT_STATUS.INACTIVE, label: '비활성' },
]

function normalizeContactStatus(value) {
  return value === CONTACT_STATUS.INACTIVE ? CONTACT_STATUS.INACTIVE : CONTACT_STATUS.ACTIVE
}

function canViewInactiveContacts(role) {
  const normalized = normalizeRole(role)
  return normalized === ROLES.ADMIN || normalized === ROLES.MANAGER
}

function createContactRow(seq, id, sortOrder = seq) {
  return {
    id,
    seq,
    sortOrder,
    managerName: '',
    position: '',
    phone: '',
    email: '',
    division: '',
    companyName: '',
    department: '',
    review: '',
    status: CONTACT_STATUS.ACTIVE,
    linkedProject: '',
    address: '',
    notes: '',
  }
}

function nextSortOrder(rows) {
  const max = rows.reduce((acc, row) => {
    const value = Number(row?.sortOrder)
    return Number.isFinite(value) ? Math.max(acc, value) : acc
  }, 0)
  return max + 1
}

function isPersistedContactId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    safeString(id).trim()
  )
}

function renumberContactRows(rows) {
  return rows.map((row, index) => ({ ...row, seq: index + 1 }))
}

/**
 * 복사 문자열: `회사명 부서명 담당자명 직위 - 휴대폰번호`
 * 빈 값은 건너뛰고 공백/구분자만 남지 않게 정리한다.
 */
function buildContactCopyText(row) {
  const left = [
    safeString(row?.companyName).trim(),
    safeString(row?.department).trim(),
    safeString(row?.managerName).trim(),
    safeString(row?.position).trim(),
  ]
    .filter(Boolean)
    .join(' ')
  const phone = safeString(row?.phone).trim()
  if (left && phone) return `${left} - ${phone}`
  if (left) return left
  return phone
}

async function copyTextToClipboard(text) {
  const value = safeString(text)
  if (!value) return false

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    /* 권한 거부·비보안 컨텍스트 → 폴백 */
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/**
 * 영업정보 > 연락처
 * - 수기 입력 표 (입력 후 자동 저장)
 * - user: 분류=활성만 표시 / admin·manager: 전체(+비활성 회색)
 * - 행 복사 → 클립보드
 */
export default function SalesContactsPage({ role = ROLES.USER }) {
  const normalizedRole = normalizeRole(role)
  const showInactive = canViewInactiveContacts(normalizedRole)

  const [rows, setRows] = useState([])
  const [toast, setToast] = useState({ message: '', tone: '' })
  const [loadError, setLoadError] = useState('')

  const rowsRef = useRef(rows)
  const saveTimersRef = useRef({})
  const dirtyIdsRef = useRef(new Set())
  const persistInFlightRef = useRef(new Set())

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const visibleRows = useMemo(() => {
    if (showInactive) return rows
    return rows.filter((row) => normalizeContactStatus(row.status) === CONTACT_STATUS.ACTIVE)
  }, [rows, showInactive])

  const showLocalToast = useCallback((message, tone = 'success') => {
    setToast({ message: safeString(message), tone })
    window.setTimeout(() => {
      setToast((prev) => (prev.message === message ? { message: '', tone: '' } : prev))
    }, 2200)
  }, [])

  const persistRow = useCallback(async (rowId) => {
    const row = rowsRef.current.find((item) => item.id === rowId)
    if (!row) return

    persistInFlightRef.current.add(rowId)
    dirtyIdsRef.current.delete(rowId)
    try {
      let saved
      if (isPersistedContactId(row.id)) {
        saved = await salesContactsApi.update(row.id, row)
      } else {
        saved = await salesContactsApi.create(row)
      }
      const normalized = normalizeSalesContactRow(saved, row.seq)
      setRows((prev) =>
        prev.map((item) => {
          if (item.id !== rowId && item.id !== normalized.id) return item
          if (dirtyIdsRef.current.has(rowId) || dirtyIdsRef.current.has(normalized.id)) {
            return { ...item, id: normalized.id, sortOrder: normalized.sortOrder }
          }
          return { ...normalized, seq: item.seq }
        })
      )
      setLoadError('')

      if (dirtyIdsRef.current.has(rowId) || dirtyIdsRef.current.has(normalized.id)) {
        dirtyIdsRef.current.delete(rowId)
        dirtyIdsRef.current.add(normalized.id)
        window.setTimeout(() => {
          persistRow(normalized.id)
        }, 0)
      }
    } catch (error) {
      dirtyIdsRef.current.add(rowId)
      setLoadError(`저장에 실패했습니다. ${safeString(error?.message)}`)
    } finally {
      persistInFlightRef.current.delete(rowId)
    }
  }, [])

  const scheduleSave = useCallback(
    (rowId) => {
      dirtyIdsRef.current.add(rowId)
      const timers = saveTimersRef.current
      if (timers[rowId]) window.clearTimeout(timers[rowId])
      timers[rowId] = window.setTimeout(() => {
        delete timers[rowId]
        persistRow(rowId)
      }, 450)
    },
    [persistRow]
  )

  const flushSave = useCallback(
    (rowId) => {
      const timers = saveTimersRef.current
      if (timers[rowId]) {
        window.clearTimeout(timers[rowId])
        delete timers[rowId]
      }
      if (dirtyIdsRef.current.has(rowId) && !persistInFlightRef.current.has(rowId)) {
        persistRow(rowId)
      }
    },
    [persistRow]
  )

  useEffect(() => {
    let cancelled = false

    async function loadRows() {
      setLoadError('')
      try {
        const list = await salesContactsApi.list()
        if (cancelled) return
        const normalized = (Array.isArray(list) ? list : []).map((row, index) =>
          normalizeSalesContactRow(row, index + 1)
        )
        setRows(normalized.length ? normalized : [createContactRow(1, 'draft-1', 1)])
      } catch (error) {
        if (cancelled) return
        setLoadError(safeString(error?.message) || '연락처를 불러오지 못했습니다.')
        setRows([createContactRow(1, 'draft-1', 1)])
      }
    }

    loadRows()
    return () => {
      cancelled = true
      Object.values(saveTimersRef.current).forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const handleFieldChange = (rowId, key, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        if (key === 'status') {
          return { ...row, status: normalizeContactStatus(value) }
        }
        return { ...row, [key]: value }
      })
    )
    scheduleSave(rowId)
  }

  const handleAddRow = async () => {
    const sortOrder = nextSortOrder(rowsRef.current)
    const draft = createContactRow(rowsRef.current.length + 1, `draft-${Date.now()}`, sortOrder)
    try {
      const created = await salesContactsApi.create(draft)
      const normalized = normalizeSalesContactRow(created, rowsRef.current.length + 1)
      setRows((prev) => renumberContactRows([...prev, normalized]))
      setLoadError('')
    } catch (error) {
      setRows((prev) => renumberContactRows([...prev, draft]))
      scheduleSave(draft.id)
      setLoadError(`등록에 실패했습니다. ${safeString(error?.message)}`)
    }
  }

  const handleRemoveRow = async (rowId) => {
    const target = rowsRef.current.find((row) => row.id === rowId)
    const remaining = rowsRef.current.filter((row) => row.id !== rowId)

    if (target && isPersistedContactId(target.id)) {
      try {
        await salesContactsApi.bulkDelete([target.id])
        setLoadError('')
      } catch (error) {
        setLoadError(`삭제에 실패했습니다. ${safeString(error?.message)}`)
        return
      }
    }

    if (remaining.length === 0) {
      setRows([createContactRow(1, `draft-${Date.now()}`, 1)])
      return
    }
    setRows(renumberContactRows(remaining))
  }

  const handleCopyRow = async (row) => {
    const text = buildContactCopyText(row)
    if (!text) {
      showLocalToast('복사할 연락처 정보가 없습니다.', 'error')
      return
    }
    const ok = await copyTextToClipboard(text)
    showLocalToast(ok ? '복사되었습니다' : '복사에 실패했습니다.', ok ? 'success' : 'error')
  }

  return (
    <section className="stat-card sales-contacts-page" aria-label="연락처">
      <div className="sales-contacts-toolbar">
        <button type="button" className="primary-btn" onClick={handleAddRow}>
          등록
        </button>
        {loadError ? (
          <p className="sales-contacts-save-status is-error" role="alert">
            {loadError}
          </p>
        ) : null}
        <p className="sales-contacts-page-desc">
          {showInactive
            ? '관리자·부서장은 활성/비활성 연락처를 모두 볼 수 있습니다. 비활성 행은 회색으로 표시됩니다.'
            : '사용자 권한에서는 분류가 활성인 연락처만 표시됩니다.'}
        </p>
      </div>

      <div className="sales-contacts-table-wrap">
        <table className="sales-contacts-table excel-table registry-table">
          <thead>
            <tr>
              <th className="sales-contacts-sticky sales-contacts-sticky--action">삭제</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--copy">복사</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--seq">번호</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--manager">담당자명</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--position">직위</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--phone">휴대폰</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--email">이메일</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--division">구분</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--company">회사명</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--department sales-contacts-sticky--last">
                부서명
              </th>
              <th>심사</th>
              <th>분류</th>
              <th>연계 사업</th>
              <th>주소</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isInactive = normalizeContactStatus(row.status) === CONTACT_STATUS.INACTIVE
              return (
                <tr
                  key={row.id}
                  className={`sales-contacts-data-row${isInactive ? ' is-inactive' : ''}`}
                >
                  <td className="sales-contacts-sticky sales-contacts-sticky--action">
                    <button
                      type="button"
                      className="sales-contacts-remove-btn"
                      onClick={() => handleRemoveRow(row.id)}
                      aria-label={`${row.seq}번 행 삭제`}
                    >
                      ×
                    </button>
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--copy">
                    <button
                      type="button"
                      className="sales-contacts-copy-btn"
                      onClick={() => handleCopyRow(row)}
                      title="연락처 복사"
                      aria-label={`${row.seq}번 연락처 복사`}
                    >
                      📋
                    </button>
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--seq sales-contacts-cell--locked">
                    {row.seq}
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--manager">
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.managerName}
                      onChange={(e) => handleFieldChange(row.id, 'managerName', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 담당자명`}
                    />
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--position">
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.position}
                      onChange={(e) => handleFieldChange(row.id, 'position', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 직위`}
                    />
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--phone">
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      inputMode="tel"
                      value={row.phone}
                      onChange={(e) => handleFieldChange(row.id, 'phone', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 휴대폰`}
                    />
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--email">
                    <input
                      className="sales-contacts-cell-input"
                      type="email"
                      value={row.email}
                      onChange={(e) => handleFieldChange(row.id, 'email', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 이메일`}
                    />
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--division">
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.division}
                      onChange={(e) => handleFieldChange(row.id, 'division', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 구분`}
                    />
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--company">
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.companyName}
                      onChange={(e) => handleFieldChange(row.id, 'companyName', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 회사명`}
                    />
                  </td>
                  <td className="sales-contacts-sticky sales-contacts-sticky--department sales-contacts-sticky--last">
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.department}
                      onChange={(e) => handleFieldChange(row.id, 'department', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 부서명`}
                    />
                  </td>
                  <td>
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.review}
                      onChange={(e) => handleFieldChange(row.id, 'review', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 심사`}
                    />
                  </td>
                  <td>
                    <select
                      className="sales-contacts-cell-input sales-contacts-cell-select"
                      value={normalizeContactStatus(row.status)}
                      onChange={(e) => handleFieldChange(row.id, 'status', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 분류`}
                      disabled={!showInactive}
                    >
                      {CONTACT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.linkedProject}
                      onChange={(e) => handleFieldChange(row.id, 'linkedProject', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 연계 사업`}
                    />
                  </td>
                  <td>
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.address}
                      onChange={(e) => handleFieldChange(row.id, 'address', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 주소`}
                    />
                  </td>
                  <td>
                    <input
                      className="sales-contacts-cell-input"
                      type="text"
                      value={row.notes}
                      onChange={(e) => handleFieldChange(row.id, 'notes', e.target.value)}
                      onBlur={() => flushSave(row.id)}
                      aria-label={`${row.seq}번 비고`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {toast.message ? (
        <div
          className={`sales-contacts-toast${toast.tone ? ` is-${toast.tone}` : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  )
}
