import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MOCK_EMAIL_EXPORT_LOGS,
  emailExportLogsApi,
  formatSentAt,
  normalizeEmailExportLog,
} from '../emailExportLogsApi.js'
import { computeFixedPortalPosition, fixedPortalStyle } from '../portalMenuPosition.js'
import { buildStyledExcelFilename, downloadStyledExcel } from '../styledExcelDownload.js'
import { resolveSenderName } from '../userNameMap.js'

const EXPORT_EXCEL_COLUMNS = [
  { header: '구분', key: 'seq', minWidth: 8 },
  { header: '보낸일시', key: 'sentAt', minWidth: 18 },
  { header: '보낸사람', key: 'sender', minWidth: 28 },
  { header: '성명', key: 'name', minWidth: 12 },
  { header: '제목', key: 'subject', minWidth: 40 },
  { header: '첨부파일', key: 'files', minWidth: 40 },
]

/**
 * 첨부파일 칸 — 연락처의 '연계 사업'과 같은 모양.
 * 첫 파일은 파란 칩, 2개 이상이면 '+N' 배지가 붙고 배지에 마우스를 올리면 전체 파일 목록이 뜬다.
 */
function AttachmentChips({ files }) {
  const moreRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)

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
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  if (files.length === 0) return null

  if (files.length === 1) {
    return (
      <span className="sales-contacts-linked-chips" aria-label={files[0]}>
        <span className="sales-contacts-linked-chip" title={files[0]}>
          {files[0]}
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
            {files.map((name, index) => (
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
    <span className="sales-contacts-linked-chips" aria-label={files.join(', ')}>
      <span className="sales-contacts-linked-chip" title={files[0]}>
        {files[0]}
      </span>
      <span
        ref={moreRef}
        className="sales-contacts-linked-more"
        tabIndex={0}
        aria-label={`첨부파일 ${files.length}개: ${files.join(', ')}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        +{files.length - 1}
      </span>
      {tooltip}
    </span>
  )
}

/**
 * 문서관리 > 견적 · 설계 반출 현황
 * Gmail 연동 자동화로 쌓인 반출 메일 목록(읽기 전용).
 * 백엔드(GET /api/emails/export-logs)가 아직 없으면 예시 데이터로 화면을 채운다.
 */
export default function QuoteDesignExportPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [excelError, setExcelError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await emailExportLogsApi.list()
        if (cancelled) return
        setRows(list)
        setUsingMock(false)
      } catch {
        // 백엔드 미완성(404 등)·연결 실패 → 화면 확인용 예시 데이터로 대체
        if (cancelled) return
        setRows(MOCK_EMAIL_EXPORT_LOGS.map(normalizeEmailExportLog))
        setUsingMock(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 최신 메일이 위로 오게 정렬한다. (보낸일시를 해석할 수 없으면 맨 아래)
  const sortedRows = useMemo(() => {
    const time = (row) => {
      const t = new Date(row.sentAt).getTime()
      return Number.isNaN(t) ? -Infinity : t
    }
    return [...rows].sort((a, b) => time(b) - time(a))
  }, [rows])

  // 검색: 보낸일시·보낸사람·성명·제목·첨부파일명 어디에 있어도 찾는다.
  const visibleRows = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    if (!keyword) return sortedRows
    return sortedRows.filter((row) =>
      [
        formatSentAt(row.sentAt),
        row.sender,
        resolveSenderName(row.sender),
        row.subject,
        ...row.attachments,
      ]
        .join('\n')
        .toLowerCase()
        .includes(keyword)
    )
  }, [sortedRows, searchQuery])

  const handleExcelDownload = useCallback(async () => {
    try {
      setExcelError('')
      await downloadStyledExcel({
        sheetName: '견적 · 설계 반출 현황',
        filename: buildStyledExcelFilename('견적설계반출현황'),
        columns: EXPORT_EXCEL_COLUMNS,
        rows: visibleRows.map((row, index) => ({
          seq: index + 1,
          sentAt: formatSentAt(row.sentAt),
          sender: row.sender,
          name: resolveSenderName(row.sender),
          subject: row.subject,
          files: row.attachments.join(', '),
        })),
      })
    } catch {
      setExcelError('엑셀 다운로드에 실패했습니다.')
    }
  }, [visibleRows])

  return (
    <section className="stat-card sales-contacts-page" aria-label="견적 · 설계 반출 현황">
      <div className="sales-contacts-toolbar">
        <button className="secondary-btn" type="button" onClick={handleExcelDownload}>
          엑셀 다운로드
        </button>
        <input
          className="table-search-input sales-contacts-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="보낸사람, 성명, 제목, 첨부파일 등 검색"
          aria-label="견적 · 설계 반출 현황 검색"
        />
      </div>
      {excelError ? (
        <p className="sales-contacts-save-status is-error" role="alert">
          {excelError}
        </p>
      ) : null}
      {usingMock ? (
        <p className="sales-contacts-page-desc" role="status">
          서버 연동 전이라 예시 데이터를 표시하고 있습니다.
        </p>
      ) : null}

      <div className="sales-contacts-table-wrap">
        <table className="excel-table registry-table email-export-table">
          <colgroup>
            <col className="email-export-col--seq" />
            <col className="email-export-col--sent" />
            <col className="email-export-col--sender" />
            <col className="email-export-col--name" />
            <col className="email-export-col--subject" />
            <col className="email-export-col--files" />
          </colgroup>
          <thead>
            <tr>
              <th className="th-align-center">구분</th>
              <th className="th-align-center">보낸일시</th>
              <th className="th-align-center">보낸사람</th>
              <th className="th-align-center">성명</th>
              <th className="th-align-center">제목</th>
              <th className="th-align-center">첨부파일</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              return (
                <tr key={row.id} className={index % 2 === 0 ? 'row-even' : 'row-odd'}>
                  <td className="email-export-cell--center">{index + 1}</td>
                  <td className="email-export-cell--center">{formatSentAt(row.sentAt)}</td>
                  <td className="email-export-cell--center">
                    {/* 링크가 아닌 일반 텍스트: 클릭 불가 */}
                    <span className="pointer-events-none select-none">{row.sender}</span>
                  </td>
                  <td className="email-export-cell--center">{resolveSenderName(row.sender)}</td>
                  <td className="email-export-cell--text" title={row.subject}>
                    {row.subject}
                  </td>
                  <td className="email-export-cell--files">
                    <AttachmentChips files={row.attachments} />
                  </td>
                </tr>
              )
            })}
            {!loading && visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="email-export-cell--empty">
                  {searchQuery.trim() ? '검색 결과가 없습니다.' : '반출 내역이 없습니다.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
