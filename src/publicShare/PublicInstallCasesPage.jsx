import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../apiClient.js'
import { resolveInstallCaseHeroImage } from '../installCasesApi.js'
import { InstallCaseMediaCarousel } from '../installCaseMediaUi.jsx'
import { isInstallCaseVideo } from '../installCaseMedia.js'
import {
  MAJOR_CATEGORY_OPTIONS,
  MIDDLE_CATEGORY_OPTIONS,
  MINOR_CATEGORY_OPTIONS,
  buildSpecRows,
  formatCardSubline,
  formatYearDetail,
  getMajorLabel,
  getMiddleLabel,
  getMinorLabel,
  getThumbnailSources,
  matchesSearch,
  normalizePublicInstallCase,
  sortInstallCases,
  withSelectPlaceholder,
} from './installCaseView.js'
import './PublicInstallCases.css'

/** 로그인 없이 읽는 전용 API. 인증 헤더·쿠키를 일부러 보내지 않는다. */
const PUBLIC_INSTALL_CASES_URL = `${API_BASE_URL}/api/public/install-cases`

function decodeShareExpiryDate(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    const exp = Number(json.exp)
    if (!Number.isFinite(exp)) return null
    return new Date(exp * 1000)
  } catch {
    return null
  }
}

function formatShareExpiryLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type) => parts.find((part) => part.type === type)?.value || ''
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  const hour = pick('hour')
  const minute = pick('minute')
  if (!year || !month || !day || !hour || !minute) return ''
  return `${year}년 ${month}월 ${day}일 ${hour}:${minute}`
}

function PhotoSign() {
  return (
    <span className="public-share-photo-sign" aria-hidden="true">
      SIGNTELECOM
    </span>
  )
}

function CardMedia({ sources }) {
  const candidates = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const item of sources || []) {
      const resolved = String(resolveInstallCaseHeroImage(item) || '').trim()
      if (!resolved || seen.has(resolved)) continue
      seen.add(resolved)
      out.push(resolved)
    }
    return out
  }, [sources])

  const key = candidates.join('\0')
  const [activeIndex, setActiveIndex] = useState(0)
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    setActiveIndex(0)
    setExhausted(false)
  }, [key])

  const mediaSrc = exhausted ? '' : candidates[activeIndex] || ''
  const handleError = () => {
    if (activeIndex + 1 < candidates.length) setActiveIndex((prev) => prev + 1)
    else setExhausted(true)
  }

  if (!mediaSrc) {
    return (
      <div className="install-case-card-media install-case-card-media--empty">
        <div className="install-case-card-media-empty">이미지 없음</div>
        <div className="install-case-card-media-overlay" aria-hidden />
      </div>
    )
  }

  const isVideo = isInstallCaseVideo(mediaSrc)
  return (
    <div className="install-case-card-media">
      {isVideo ? (
        <video src={mediaSrc} muted playsInline preload="metadata" aria-hidden tabIndex={-1} onError={handleError} />
      ) : (
        <img src={mediaSrc} alt="" loading="lazy" draggable={false} onError={handleError} />
      )}
      {isVideo ? (
        <div className="install-case-card-video-badge" aria-hidden>
          ▶
        </div>
      ) : null}
      <PhotoSign />
      <div className="install-case-card-media-overlay" aria-hidden />
    </div>
  )
}

function DetailModal({ row, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const specRows = buildSpecRows(row.specs)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="install-case-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-install-case-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="install-case-detail-modal-header">
          <h3 id="public-install-case-title" className="install-case-detail-modal-title">
            {row.projectName}
          </h3>
          <div className="install-case-detail-modal-actions">
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </div>
        </div>
        <div className="install-case-detail-modal-body">
          <div className="install-case-detail-inner">
            <div className="install-case-detail-hero-zone">
              <div className="install-case-detail-hero">
                <InstallCaseMediaCarousel
                  sources={row.heroImages.length > 0 ? row.heroImages : [row.heroImage].filter(Boolean)}
                  fallbackHeroImage={row.heroImage}
                  photoSign={<PhotoSign />}
                />
              </div>
            </div>
            <div className="install-case-detail-lower-shell">
              <div className="install-case-detail-lower">
                <div className="install-case-detail-info-col">
                  <dl className="install-case-detail-meta">
                    <div className="install-case-meta-row">
                      <dt>사업년도</dt>
                      <dd>{formatYearDetail(row.year)}</dd>
                    </div>
                    <div className="install-case-meta-row">
                      <dt>대분류</dt>
                      <dd>{getMajorLabel(row.environment)}</dd>
                    </div>
                    <div className="install-case-meta-row">
                      <dt>중분류</dt>
                      <dd>{getMiddleLabel(row.middleCategory)}</dd>
                    </div>
                    <div className="install-case-meta-row">
                      <dt>소분류</dt>
                      <dd>{getMinorLabel(row.audience)}</dd>
                    </div>
                    <div className="install-case-meta-row">
                      <dt>용도</dt>
                      <dd>{row.purpose}</dd>
                    </div>
                    <div className="install-case-meta-row">
                      <dt>발주처</dt>
                      <dd>{row.client}</dd>
                    </div>
                  </dl>
                </div>
                <div className="install-case-detail-specs-col">
                  <dl className="install-case-detail-meta">
                    {specRows.map((spec) => (
                      <div
                        className={`install-case-meta-row${spec.setStart ? ' install-case-meta-row--set-start' : ''}`}
                        key={spec.key}
                      >
                        <dt>{spec.label}</dt>
                        <dd>{spec.text}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 외부 공유용 설치사례 뷰어 — 읽기 전용.
 * 사이드바·헤더 같은 관리자 레이아웃 없이 이 콘텐츠만 화면을 채운다.
 * 등록·수정·삭제 버튼과 그 핸들러는 이 파일 어디에도 없다.
 */
export default function PublicInstallCasesPage() {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error | expired
  const [expiryLabel, setExpiryLabel] = useState('')
  const [majorFilter, setMajorFilter] = useState('')
  const [middleFilter, setMiddleFilter] = useState('')
  const [minorFilter, setMinorFilter] = useState('')
  const [search, setSearch] = useState('')
  const [detailRow, setDetailRow] = useState(null)

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')?.trim() || ''
    if (!token) {
      setRows([])
      setExpiryLabel('')
      setStatus('expired')
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(
          `${PUBLIC_INSTALL_CASES_URL}?token=${encodeURIComponent(token)}`,
          {
            method: 'GET',
            credentials: 'omit',
            headers: { Accept: 'application/json' },
          },
        )
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) {
            setRows([])
            setExpiryLabel('')
            setStatus('expired')
          }
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (cancelled) return
        const headerExp = Number(response.headers.get('X-Share-Expires-At'))
        const expiryDate =
          Number.isFinite(headerExp) && headerExp > 0 ? new Date(headerExp * 1000) : decodeShareExpiryDate(token)
        const list = Array.isArray(data) ? data : []
        setRows(sortInstallCases(list.map(normalizePublicInstallCase)))
        setExpiryLabel(formatShareExpiryLabel(expiryDate))
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (majorFilter && row.environment !== majorFilter) return false
        if (middleFilter && row.middleCategory !== middleFilter) return false
        if (minorFilter && row.audience !== minorFilter) return false
        return matchesSearch(row, search)
      }),
    [rows, majorFilter, middleFilter, minorFilter, search],
  )

  const hasFilter = Boolean(majorFilter || middleFilter || minorFilter || search.trim())
  const emptyMessage =
    status === 'error'
      ? '설치사례를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : status === 'loading'
        ? '불러오는 중...'
        : rows.length === 0 && !hasFilter
          ? '조회된 설치사례가 없습니다.'
          : '조건에 맞는 설치사례가 없습니다.'

  if (status === 'expired') {
    return (
      <main className="public-share-root">
        <section className="public-share-expired" role="alert">
          <p>이 공유 링크는 유효 기간이 만료되었거나 잘못된 접근입니다.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="public-share-root">
      {expiryLabel ? (
        <p className="public-share-expiry-banner" role="status">
          안내: 이 공유 링크는 {expiryLabel}까지 유효합니다.
        </p>
      ) : null}
      <section className="stat-card stat-card--install-cases public-share-card" aria-label="설치사례">
        <div className="install-cases-toolbar">
          <div className="install-cases-filters">
            <select
              className="contract-filter-select install-cases-select"
              value={majorFilter}
              onChange={(event) => setMajorFilter(event.target.value)}
              aria-label="대분류 필터"
            >
              {withSelectPlaceholder(MAJOR_CATEGORY_OPTIONS, '대분류').map((opt) => (
                <option key={opt.value || 'major-all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="contract-filter-select install-cases-select"
              value={middleFilter}
              onChange={(event) => setMiddleFilter(event.target.value)}
              aria-label="중분류 필터"
            >
              {withSelectPlaceholder(MIDDLE_CATEGORY_OPTIONS, '중분류').map((opt) => (
                <option key={opt.value || 'middle-all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="contract-filter-select install-cases-select"
              value={minorFilter}
              onChange={(event) => setMinorFilter(event.target.value)}
              aria-label="소분류 필터"
            >
              {withSelectPlaceholder(MINOR_CATEGORY_OPTIONS, '소분류').map((opt) => (
                <option key={opt.value || 'minor-all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="table-search-input install-cases-search-input"
              placeholder="사업명·사업년도·분류·용도·발주처·규격으로 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="설치사례 검색"
            />
          </div>
        </div>

        <div className="install-cases-gallery">
          {filteredRows.map((row) => (
            <div key={row.id} className="install-case-card-shell">
              <button type="button" className="install-case-card" onClick={() => setDetailRow(row)}>
                <div className="install-case-card-thumb">
                  <CardMedia sources={getThumbnailSources(row)} />
                </div>
                <div className="install-case-card-body">
                  <div className="install-case-card-title">{row.projectName}</div>
                  <div className="install-case-card-meta">{formatCardSubline(row)}</div>
                </div>
              </button>
            </div>
          ))}
        </div>

        {filteredRows.length === 0 && <div className="install-cases-empty">{emptyMessage}</div>}
      </section>

      {detailRow ? <DetailModal row={detailRow} onClose={() => setDetailRow(null)} /> : null}
    </main>
  )
}
