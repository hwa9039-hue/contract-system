import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const CHECKLIST_BULLET_PREFIX = '• '

function checklistText(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function checklistLineBounds(value, cursor) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const nextBreak = value.indexOf('\n', cursor)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  return { lineStart, lineEnd, line: value.slice(lineStart, lineEnd) }
}

function isEmptyChecklistBullet(line) {
  const trimmed = checklistText(line).trimEnd()
  return trimmed === '•' || trimmed === '-' || trimmed === '• ' || trimmed === '- '
}

function placeChecklistCursor(el, cursor) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        el.selectionStart = cursor
        el.selectionEnd = cursor
      } catch {
        /* ignore */
      }
    })
  })
}

function applyChecklistBullet(prevValue, rawNext) {
  const prev = checklistText(prevValue)
  const next = checklistText(rawNext)
  if (prev !== '' || next === '' || next.startsWith(CHECKLIST_BULLET_PREFIX)) return next
  return `${CHECKLIST_BULLET_PREFIX}${next}`
}

const WORK_REPORT_ROW_SELECTOR =
  '.work-report-board-row, .work-report-board-row-external, .work-report-board-row-journal, .work-report-board-row-simple, .work-report-board-row-no-index, .work-report-board-row-external-no-index'

/**
 * 내용 길이에 맞춰 세로로 자동으로 늘어나는 controlled <textarea>.
 *
 * - 값이 짧을 때는 CSS 의 min-height(기본 2~3줄 높이)를 그대로 유지한다.
 *   (scrollHeight 는 항상 clientHeight 이상이고, clientHeight 는 min-height 이상이므로
 *    자동 계산 높이가 기본 높이 밑으로 내려가지 않는다.)
 * - 내용이 길어지면 scrollHeight 만큼 높이를 늘려 세로 스크롤바 없이 전체 글이 보인다.
 * - syncToRow=true인 기존 표에서는 형제 셀 높이를 함께 반영할 수 있다.
 * - 행 중심 Grid처럼 CSS가 행 높이를 담당하는 화면에서는 syncToRow=false로 콘텐츠 높이만 측정한다.
 * - 폭이 바뀌어 줄바꿈이 달라지면(반응형/창 크기 조절) 높이를 다시 계산한다.
 *
 * 기존 <textarea> 자리에 그대로 교체할 수 있도록 className·onKeyDown·placeholder 등
 * 모든 props 를 그대로 전달한다.
 */
export function AutoGrowTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  className = '',
  style,
  syncToRow = true,
  fillRow = false,
  buffered = false,
  checklistBullets = false,
  ...rest
}) {
  const ref = useRef(null)
  const [draft, setDraft] = useState(() => checklistText(value))
  const draftRef = useRef(draft)
  const focusedRef = useRef(false)
  const dirtyRef = useRef(false)
  const shownValue = buffered ? draft : value

  useEffect(() => {
    if (!buffered) return
    const next = checklistText(value)
    if (next === draftRef.current) {
      dirtyRef.current = false
      return
    }
    if (focusedRef.current || dirtyRef.current) return
    draftRef.current = next
    setDraft(next)
  }, [buffered, value])

  const publish = (next, sourceEvent) => {
    const text = checklistText(next)
    if (buffered) {
      dirtyRef.current = true
      draftRef.current = text
      setDraft(text)
    }
    if (typeof onChange !== 'function') return
    if (sourceEvent && sourceEvent.target?.value === text) {
      onChange(sourceEvent)
      return
    }
    onChange({ target: { value: text } })
  }

  const shouldSyncToRow =
    syncToRow && Boolean(className.includes('work-report-board-textarea'))

  const resize = () => {
    const el = ref.current
    if (!el) return
    // 먼저 auto 로 되돌리고 이전 콘텐츠 min-height를 지워 축소도 허용한다.
    el.style.height = 'auto'
    if (fillRow) el.style.minHeight = ''
    let nextHeight = el.scrollHeight
    if (shouldSyncToRow) {
      const row = el.closest(WORK_REPORT_ROW_SELECTOR)
      if (row) {
        nextHeight = Math.max(nextHeight, row.clientHeight)
      }
    }
    if (fillRow) {
      // 콘텐츠 높이는 행의 최소 높이를 결정하고, 실제 박스는 Grid 셀 높이를 채운다.
      // 부모 행 높이는 읽지 않으므로 형제 셀과 높이가 서로 증폭되지 않는다.
      el.style.minHeight = `${nextHeight}px`
      el.style.height = '100%'
      return
    }
    el.style.height = `${nextHeight}px`
  }

  // 일반 칸은 paint 전에 높이를 맞춘다.
  useLayoutEffect(() => {
    if (buffered) return
    resize()
  }, [shownValue, buffered])

  // 주간업무 입력 중에는 글자가 먼저 그려지고, 높이 계산은 다음 프레임으로 미룬다.
  useEffect(() => {
    if (!buffered) return
    const frame = requestAnimationFrame(() => resize())
    return () => cancelAnimationFrame(frame)
  }, [shownValue, buffered])

  // 폭이 변할 때만(창 크기·레이아웃 변경) 높이 재계산 — 높이 변경으로 인한 무한 루프 방지
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth
      if (width !== lastWidth) {
        lastWidth = width
        resize()
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 표 행 높이가 형제 셀 때문에 변할 때 내용 칸도 행 높이를 채우도록 동기화
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !shouldSyncToRow || typeof ResizeObserver === 'undefined') return
    const row = el.closest(WORK_REPORT_ROW_SELECTOR)
    if (!row) return
    const rowObserver = new ResizeObserver(() => resize())
    rowObserver.observe(row)
    resize()
    return () => rowObserver.disconnect()
  }, [shouldSyncToRow])

  const handleFocus = (event) => {
    focusedRef.current = true
    if (checklistBullets && checklistText(draftRef.current) === '') {
      publish(CHECKLIST_BULLET_PREFIX)
      placeChecklistCursor(event.currentTarget, CHECKLIST_BULLET_PREFIX.length)
    }
    onFocus?.(event)
  }

  const handleChange = (event) => {
    const rawNext = event.target.value
    const next = checklistBullets ? applyChecklistBullet(draftRef.current, rawNext) : rawNext
    publish(next, event)
  }

  const handleBlur = (event) => {
    focusedRef.current = false
    onBlur?.(event)
  }

  const handleKeyDown = (event) => {
    if (!checklistBullets) {
      onKeyDown?.(event)
      return
    }
    if (event.key === 'Escape') return
    if (event.key === 'Enter' && event.shiftKey) {
      const el = event.currentTarget
      const current = checklistText(el.value)
      const start = Number(el.selectionStart) || 0
      const end = Number(el.selectionEnd) || start
      const { lineStart, lineEnd, line } = checklistLineBounds(current, start)
      event.preventDefault()
      if (isEmptyChecklistBullet(line)) {
        const next =
          lineStart === 0 && lineEnd === current.length
            ? ''
            : `${current.slice(0, lineStart)}${current.slice(lineEnd)}`
        publish(next)
        placeChecklistCursor(el, lineStart)
        return
      }
      const insert = `\n${CHECKLIST_BULLET_PREFIX}`
      publish(`${current.slice(0, start)}${insert}${current.slice(end)}`)
      placeChecklistCursor(el, start + insert.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget?.blur?.()
    }
  }

  return (
    <textarea
      ref={ref}
      className={className}
      value={shownValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      // 콘텐츠 높이에 정확히 맞추므로 내부 스크롤은 숨긴다.
      style={{ overflowY: 'hidden', resize: 'none', ...style }}
      {...rest}
    />
  )
}
