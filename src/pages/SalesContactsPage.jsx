import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AutoGrowTextarea } from '../AutoGrowTextarea.jsx'
import { EditableTextCell } from '../EditableTextCell.jsx'
import { computeFixedPortalPosition, fixedPortalStyle } from '../portalMenuPosition.js'
import { ROLES, normalizeRole } from '../permissions.js'
import { normalizeSalesContactRow, salesContactsApi } from '../salesContactsApi.js'
import {
  EXCLUDED_INLINE_EDITOR_CLASS,
  TABLE_INLINE_EDITABLE_CELL_CLASS,
  TABLE_INLINE_INPUT_STANDARD_CLASS,
} from '../tableInlineInputClass.js'
import {
  TABLE_CELL_EMPTY_LABEL,
  isTableCellEmpty,
  tableCellStateClass,
} from '../tableCellEmptyState.js'

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

function matchesContactSearch(row, query) {
  const q = safeString(query).trim().toLowerCase()
  if (!q) return true
  const statusLabel =
    normalizeContactStatus(row.status) === CONTACT_STATUS.INACTIVE ? '비활성' : '활성'
  const haystack = [
    row.seq,
    row.managerName,
    row.position,
    row.phone,
    row.email,
    row.division,
    row.companyName,
    row.department,
    row.review,
    statusLabel,
    row.linkedProject,
    row.address,
    row.notes,
  ]
    .map((value) => safeString(value).toLowerCase())
    .join(' ')
  return haystack.includes(q)
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
 * 연계 사업 — 한 건 = 한 줄(Enter).
 * 공백이 있는 사업명(예: 경기도 교통정보센터 IPWALL 납품 및 영업)은 쪼개지 않는다.
 */
function parseLinkedProjectTags(value) {
  return safeString(value)
    .split(/\r?\n/u)
    .map((part) => part.trim().replace(/^[-–—•·.\s]+/u, '').trim())
    .filter(Boolean)
}

/** 편집기용: 한 줄에 한 건, 앞에 · 표시 */
function formatLinkedProjectsForEdit(value) {
  const tags = parseLinkedProjectTags(value)
  if (tags.length === 0) return '· '
  return tags.map((name) => `· ${name}`).join('\n')
}

/** 저장용: 빈 줄 제거 후 줄바꿈으로 정규화 */
function normalizeLinkedProjectsForSave(value) {
  return parseLinkedProjectTags(value).join('\n')
}

function LinkedProjectView({ tags }) {
  const moreRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)

  const hiddenTags = tags.slice(1)

  const updatePosition = useCallback(() => {
    if (!moreRef.current) return
    setPosition(
      computeFixedPortalPosition(moreRef.current, {
        gap: 8,
        minWidth: 160,
        maxHeight: 240,
        preferBelowMinSpace: 72,
      })
    )
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const onMove = () => updatePosition()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, updatePosition])

  if (tags.length === 1) {
    return (
      <span className="sales-contacts-linked-list" aria-label={tags[0]}>
        <span className="sales-contacts-linked-item" title={tags[0]}>
          <span className="sales-contacts-linked-dot" aria-hidden="true">
            ·
          </span>
          <span className="sales-contacts-linked-item-text">{tags[0]}</span>
        </span>
      </span>
    )
  }

  const tooltip =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="sales-contacts-linked-more-tooltip sales-contacts-linked-more-tooltip--portal"
            role="tooltip"
            style={fixedPortalStyle(position, { zIndex: 12000, matchWidth: false, minWidth: 160 })}
          >
            {tags.map((name, index) => (
              <span key={`${name}-${index}`} className="sales-contacts-linked-more-tooltip-item">
                <span className="sales-contacts-linked-dot" aria-hidden="true">
                  ·
                </span>
                <span>{name}</span>
              </span>
            ))}
          </div>,
          document.body
        )
      : null

  return (
    <span className="sales-contacts-linked-chips" aria-label={tags.join(', ')}>
      <span className="sales-contacts-linked-chip" title={tags[0]}>
        {tags[0]}
      </span>
      <span
        ref={moreRef}
        className="sales-contacts-linked-more"
        tabIndex={0}
        aria-label={`연계 사업 ${tags.length}건: ${tags.join(', ')}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        +{hiddenTags.length}
      </span>
      {tooltip}
    </span>
  )
}

/**
 * 연계 사업 셀
 * - 보기: 1건이면 · 목록, 2건 이상이면 칩 1개 + [+N]
 * - 편집: Enter 저장, Shift+Enter 다음 건(줄바꿈)
 */
function ContactLinkedProjectCell({ row, tdClassName = '', onCommit }) {
  const stored = safeString(row.linkedProject)
  const tags = useMemo(() => parseLinkedProjectTags(stored), [stored])

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(() => formatLinkedProjectsForEdit(stored))

  useEffect(() => {
    if (!isEditing) {
      setDraft(formatLinkedProjectsForEdit(stored))
    }
  }, [stored, isEditing])

  const isEmpty = tags.length === 0
  const stateClass = tableCellStateClass(isEmpty)

  const handleCommit = () => {
    setIsEditing(false)
    const next = normalizeLinkedProjectsForSave(draft)
    const current = normalizeLinkedProjectsForSave(stored)
    if (next !== current) {
      onCommit(row.id, 'linkedProject', next)
    }
  }

  const handleCancel = () => {
    setDraft(formatLinkedProjectsForEdit(stored))
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <td className={`${CONTACT_EDITABLE_CELL_CLASS} ${tdClassName}`.trim()}>
        <AutoGrowTextarea
          className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} registry-cell-autogrow-textarea sales-contacts-linked-textarea${
            EXCLUDED_INLINE_EDITOR_CLASS ? ` ${EXCLUDED_INLINE_EDITOR_CLASS}` : ''
          }`.trim()}
          style={{ textAlign: 'left' }}
          value={draft}
          rows={Math.max(2, draft.split('\n').length)}
          autoFocus
          placeholder={'· 사업명\nShift+Enter로 다음 건 추가'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              handleCancel()
              return
            }
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault()
              const el = e.target
              const start = el.selectionStart ?? draft.length
              const end = el.selectionEnd ?? draft.length
              const next = `${draft.slice(0, start)}\n· ${draft.slice(end)}`
              setDraft(next)
              requestAnimationFrame(() => {
                const cursor = start + 3
                el.selectionStart = cursor
                el.selectionEnd = cursor
              })
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCommit()
            }
          }}
        />
      </td>
    )
  }

  return (
    <td className={`${CONTACT_EDITABLE_CELL_CLASS} ${tdClassName}`.trim()}>
      <div
        className={`cell-display editable-text-cell-display editable-text-cell-display--left ${stateClass} ${
          isEmpty ? 'table-cell-empty-placeholder' : ''
        } registry-cell-text-wrap sales-contacts-linked-edit`.trim()}
        role="button"
        tabIndex={0}
        title="클릭하여 편집 · Shift+Enter로 다음 건 추가"
        onClick={(e) => {
          e.stopPropagation()
          setIsEditing(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsEditing(true)
          }
        }}
      >
        {isEmpty ? TABLE_CELL_EMPTY_LABEL : <LinkedProjectView tags={tags} />}
      </div>
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
  const [searchQuery, setSearchQuery] = useState('')
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
    const byStatus = showInactive
      ? rows
      : rows.filter((row) => normalizeContactStatus(row.status) === CONTACT_STATUS.ACTIVE)
    return byStatus.filter((row) => matchesContactSearch(row, searchQuery))
  }, [rows, showInactive, searchQuery])

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
        <input
          className="table-search-input sales-contacts-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="담당자, 회사, 연락처 등 검색"
          aria-label="연락처 검색"
        />
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
              <th className="sales-contacts-sticky sales-contacts-sticky--department">부서명</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--status">분류</th>
              <th className="sales-contacts-sticky sales-contacts-sticky--linked sales-contacts-sticky--last">
                연계 사업
              </th>
              <th className="sales-contacts-col--review">심사</th>
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
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--department"
                    onCommit={commitField}
                  />
                  <td
                    className={`${CONTACT_EDITABLE_CELL_CLASS} sales-contacts-sticky sales-contacts-sticky--status`}
                  >
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
                  <ContactLinkedProjectCell
                    row={row}
                    tdClassName="sales-contacts-sticky sales-contacts-sticky--linked sales-contacts-sticky--last"
                    onCommit={commitField}
                  />
                  <ContactTextCell
                    row={row}
                    field="review"
                    tdClassName="sales-contacts-col--review"
                    onCommit={commitField}
                  />
                  <ContactTextCell row={row} field="address" onCommit={commitField} />
                  <ContactTextCell
                    row={row}
                    field="notes"
                    tdClassName="sales-contacts-col--notes"
                    onCommit={commitField}
                  />
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
