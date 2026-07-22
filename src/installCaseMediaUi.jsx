import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  INSTALL_CASE_MAX_MEDIA_COUNT,
  resolveInstallCaseHeroImage,
} from './installCasesApi.js'
import {
  formatInstallCaseMediaMaxSize,
  getInstallCaseMediaMaxBytes,
  isInstallCaseMediaFile,
  isInstallCaseVideo,
  isInstallCaseVideoFile,
  INSTALL_CASE_MEDIA_ACCEPT,
} from './installCaseMedia.js'

function safeString(value) {
  if (value == null) return ''
  return String(value)
}

let mediaItemSeq = 0
function nextMediaItemId(prefix = 'ic-media') {
  mediaItemSeq += 1
  return `${prefix}-${Date.now()}-${mediaItemSeq}`
}

/** 기존 URL / 신규 File 을 하나의 미리보기 아이템으로 */
export function buildInstallCaseMediaItemsFromRow(row) {
  const urls = []
  if (Array.isArray(row?.heroImages)) {
    for (const url of row.heroImages) {
      const text = safeString(url).trim()
      if (text) urls.push(text)
    }
  }
  if (!urls.length) {
    const single = safeString(row?.heroImage).trim()
    if (single) urls.push(single)
  }
  return urls.slice(0, INSTALL_CASE_MAX_MEDIA_COUNT).map((url) => {
    const resolved = resolveInstallCaseHeroImage(url)
    return {
      id: nextMediaItemId('existing'),
      kind: 'existing',
      url,
      previewUrl: resolved,
      isVideo: isInstallCaseVideo(resolved),
      file: null,
    }
  })
}

export function getInstallCaseMediaKeepUrls(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.kind === 'existing' && safeString(item.url).trim())
    .map((item) => safeString(item.url).trim())
}

export function getInstallCaseMediaNewFiles(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.kind === 'new' && item.file)
    .map((item) => item.file)
}

/** 등록/수정: 다중 미디어 선택 + 썸네일 미리보기 */
export function InstallCaseMultiMediaField({
  items,
  onChange,
  onInvalidFileType,
  onFileTooLarge,
  onLimitExceeded,
  label = '이미지/동영상 (최대 10개)',
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const list = Array.isArray(items) ? items : []
  const remaining = Math.max(0, INSTALL_CASE_MAX_MEDIA_COUNT - list.length)

  useEffect(() => {
    return () => {
      for (const item of list) {
        if (item?.kind === 'new' && item.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, [])

  const appendFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean)
    if (!incoming.length) return

    const accepted = []
    for (const file of incoming) {
      if (!isInstallCaseMediaFile(file)) {
        if (typeof onInvalidFileType === 'function') onInvalidFileType()
        continue
      }
      const maxBytes = getInstallCaseMediaMaxBytes(file)
      if (file.size > maxBytes) {
        if (typeof onFileTooLarge === 'function') onFileTooLarge(file, maxBytes)
        continue
      }
      accepted.push(file)
    }
    if (!accepted.length) return

    if (accepted.length > remaining) {
      if (typeof onLimitExceeded === 'function') onLimitExceeded(INSTALL_CASE_MAX_MEDIA_COUNT)
    }
    const take = accepted.slice(0, remaining)
    if (!take.length) return

    const nextItems = take.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      return {
        id: nextMediaItemId('new'),
        kind: 'new',
        url: '',
        previewUrl,
        isVideo: isInstallCaseVideoFile(file),
        file,
      }
    })
    onChange([...list, ...nextItems])
  }

  const removeAt = (id) => {
    const target = list.find((item) => item.id === id)
    if (target?.kind === 'new' && target.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl)
    }
    onChange(list.filter((item) => item.id !== id))
  }

  return (
    <div className="install-case-multi-media">
      <div className="install-case-dropzone-label">{label}</div>
      <div
        className={`install-case-dropzone install-case-multi-dropzone${
          dragOver ? ' install-case-dropzone--active' : ''
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (remaining > 0) inputRef.current?.click()
          }
        }}
        onClick={() => {
          if (remaining > 0) inputRef.current?.click()
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
          appendFiles(e.dataTransfer?.files)
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="install-case-dropzone-input"
          accept={INSTALL_CASE_MEDIA_ACCEPT}
          multiple
          disabled={remaining <= 0}
          aria-label={label}
          onChange={(e) => {
            appendFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="install-case-dropzone-placeholder">
          <span className="install-case-dropzone-icon" aria-hidden>
            ＋
          </span>
          <span className="install-case-dropzone-hint">
            {remaining > 0
              ? `클릭 또는 드래그로 추가 (남은 ${remaining}개)`
              : `최대 ${INSTALL_CASE_MAX_MEDIA_COUNT}개까지 등록되었습니다`}
          </span>
        </div>
      </div>

      {list.length > 0 ? (
        <ul className="install-case-media-thumbs" aria-label="선택한 미디어 미리보기">
          {list.map((item, index) => (
            <li key={item.id} className="install-case-media-thumb">
              {item.isVideo ? (
                <video src={item.previewUrl} muted preload="metadata" playsInline />
              ) : (
                <img src={item.previewUrl} alt="" />
              )}
              <span className="install-case-media-thumb-index">{index + 1}</span>
              <button
                type="button"
                className="install-case-media-thumb-remove"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  removeAt(item.id)
                }}
                aria-label={`${index + 1}번 미디어 삭제`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 상세 모달: 다중 미디어 캐러셀 (currentIndex로 슬라이드) */
export function InstallCaseMediaCarousel({ sources }) {
  const urls = useMemo(() => {
    const list = Array.isArray(sources) ? sources : []
    const out = []
    const seen = new Set()
    for (const src of list) {
      const resolved = String(resolveInstallCaseHeroImage(src) || '').trim()
      if (!resolved) continue
      if (/picsum\.photos/i.test(resolved) || /seed\/newinstallh/i.test(resolved)) continue
      if (seen.has(resolved)) continue
      seen.add(resolved)
      out.push(resolved)
    }
    return out
  }, [sources])

  const [currentIndex, setCurrentIndex] = useState(0)
  const total = urls.length
  const safeIndex = total > 0 ? ((currentIndex % total) + total) % total : 0
  const currentSrc = total > 0 ? urls[safeIndex] : ''
  const showNav = total > 1

  useEffect(() => {
    setCurrentIndex(0)
  }, [urls.join('|')])

  const goPrev = () => {
    if (total <= 1) return
    setCurrentIndex((prev) => (prev - 1 + total) % total)
  }

  const goNext = () => {
    if (total <= 1) return
    setCurrentIndex((prev) => (prev + 1) % total)
  }

  useEffect(() => {
    if (!showNav) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- total/showNav only
  }, [showNav, total])

  if (!currentSrc) {
    return (
      <div className="install-case-carousel install-case-carousel--empty">
        <div className="install-case-carousel-empty">미디어 없음</div>
      </div>
    )
  }

  const isVideo = isInstallCaseVideo(currentSrc)

  return (
    <div
      className="install-case-carousel"
      aria-roledescription="carousel"
      aria-label={`설치사례 미디어 ${safeIndex + 1} / ${total}`}
    >
      <div className="install-case-carousel-stage">
        {isVideo ? (
          <video
            key={currentSrc}
            className="install-case-carousel-media"
            src={currentSrc}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            key={currentSrc}
            className="install-case-carousel-media"
            src={currentSrc}
            alt={`설치사례 사진 ${safeIndex + 1}`}
          />
        )}

        {showNav ? (
          <>
            <button
              type="button"
              className="install-case-carousel-nav install-case-carousel-nav--prev"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                goPrev()
              }}
              aria-label="이전 사진"
            >
              ‹
            </button>
            <button
              type="button"
              className="install-case-carousel-nav install-case-carousel-nav--next"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                goNext()
              }}
              aria-label="다음 사진"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {showNav ? (
        <div className="install-case-carousel-footer">
          <div className="install-case-carousel-dots" role="tablist" aria-label="사진 인디케이터">
            {urls.map((_, i) => (
              <button
                key={`dot-${i}`}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                className={`install-case-carousel-dot${i === safeIndex ? ' is-active' : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setCurrentIndex(i)
                }}
                aria-label={`${i + 1}번째 사진`}
              />
            ))}
          </div>
          <div className="install-case-carousel-count" aria-live="polite">
            {safeIndex + 1} / {total}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { formatInstallCaseMediaMaxSize }
