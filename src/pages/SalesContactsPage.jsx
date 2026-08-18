import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { ROLES, normalizeRole } from '../permissions.js'
import { normalizeSalesContactRow, salesContactsApi } from '../salesContactsApi.js'
import {
  EXCLUDED_INLINE_EDITOR_CLASS,
  TABLE_INLINE_EDITABLE_CELL_CLASS,
} from '../tableInlineInputClass.js'

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
  const raw = safeString(value).trim().toLowerCase()
  // API·수기 입력에서 올 수 있는 비활성 표기들을 모두 동일하게 취급
  if (
    raw === CONTACT_STATUS.INACTIVE ||
    raw === '비활성' ||
    raw === '비활성화' ||
    raw === 'disabled' ||
    raw === 'n' ||
    raw === '0'
  ) {
    return CONTACT_STATUS.INACTIVE
  }
  return CONTACT_STATUS.ACTIVE
}

/** 일반 사용자(user)는 비활성 연락처를 보지 못한다. 관리자·부서장만 전체 조회. */
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
 * 복사 문자열: `회사명 부서명 담당자명 직위 - 휴대폰번호 이메일`
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
  const contactParts = [safeString(row?.phone).trim(), safeString(row?.email).trim()].filter(
    Boolean
  )
  const contact = contactParts.join(' ')
  if (left && contact) return `${left} - ${contact}`
  if (left) return left
  return contact
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

const CONTACT_EDITABLE_CELL_CLASS = `editable-cell ${TABLE_INLINE_EDITABLE_CELL_CLASS}`

/** 영업관리 대장과 동일한 엑셀형 셀 — 클릭 시 투명 편집기, 확정 시 저장 */
function ContactTextCell({ row, field, align = 'center', tdClassName = '', onCommit }) {
  return (
    <td className={`${CONTACT_EDITABLE_CELL_CLASS} ${tdClassName}`.trim()}>
      <EditableTextCell
        value={row[field]}
        align={align}
        className="registry-cell-text-wrap"
        inputClassName={EXCLUDED_INLINE_EDITOR_CLASS}
        onSave={(nextValue) => onCommit(row.id, field, nextValue)}
      />
    </td>
  )
}

/**
 * 영업관리 > 연락처
 * - 수기 입력 표 (입력 후 자동 저장)
 * - user: 분류=활성만 표시 / admin·manager: 전체
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

  /**
   * 셀 편집 확정 반영.
   * rowsRef 를 즉시 갱신해야 뒤이은 저장이 방금 입력한 값을 읽는다.
   */
  const commitField = useCallback(
    (rowId, key, value) => {
      let changed = false
      const next = rowsRef.current.map((row) => {
        if (row.id !== rowId) return row
        changed = true
        if (key === 'status') return { ...row, status: normalizeContactStatus(value) }
        return { ...row, [key]: value }
      })
      if (!changed) return

      rowsRef.current = next
      setRows(next)
      dirtyIdsRef.current.add(rowId)
      flushSave(rowId)
    },
    [flushSave]
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
            ? '관리자·부서장은 활성/비활성 연락처를 모두 볼 수 있습니다.'
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
              <th className="sales-contacts-col--review">심사</th>
              <th className="sales-contacts-col--status">분류</th>
              <th className="sales-contacts-col--linked">연계 사업</th>
              <th>주소</th>
              <th className="sales-contacts-col--notes">비고</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              return (
                <tr key={row.id} className="sales-contacts-data-row">
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
                  <ContactTextCell
                    row={row}
                    field="managerName"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--manager"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="position"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--position"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="phone"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--phone"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="email"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--email"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="division"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--division"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="companyName"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--company"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="department"
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--department sales-contacts-sticky--last"
                    onCommit={commitField}
                  />
                  <ContactTextCell row={row} field="review" onCommit={commitField} />
                  <td className={`${CONTACT_EDITABLE_CELL_CLASS} sales-contacts-col--status`}>
                    <select
                      value={normalizeContactStatus(row.status)}
                      onChange={(e) => commitField(row.id, 'status', e.target.value)}
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
                  <ContactTextCell row={row} field="linkedProject" onCommit={commitField} />
                  <ContactTextCell row={row} field="address" onCommit={commitField} />
                  <ContactTextCell row={row} field="notes" onCommit={commitField} />
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
