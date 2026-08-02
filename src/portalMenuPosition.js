/**
 * body { zoom } 환경에서 Portal + position:fixed 메뉴 좌표 보정.
 * getBoundingClientRect()는 화면(시각) 좌표, zoom된 body 안 fixed는 CSS 좌표라
 * rect / zoom 으로 맞춰야 앵커 바로 아래에 붙는다.
 */

export function getBodyCssZoom() {
  try {
    const raw = getComputedStyle(document.body).zoom
    if (!raw || raw === 'normal') return 1
    const parsed = parseFloat(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  } catch {
    return 1
  }
}

/** 앵커의 zoom 보정 CSS 좌표 rect */
export function getAnchorRectCss(anchorEl) {
  if (!anchorEl) return null
  const rect = anchorEl.getBoundingClientRect()
  const zoom = getBodyCssZoom()
  return {
    top: rect.top / zoom,
    bottom: rect.bottom / zoom,
    left: rect.left / zoom,
    right: rect.right / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
    zoom,
    viewportWidth: window.innerWidth / zoom,
    viewportHeight: window.innerHeight / zoom,
  }
}

/**
 * 앵커 바로 아래(공간 부족 시 위)에 붙는 fixed 포털 좌표.
 * @param {HTMLElement | null} anchorEl
 * @param {{ gap?: number, minWidth?: number, maxHeight?: number, preferBelowMinSpace?: number }} [options]
 */
export function computeFixedPortalPosition(anchorEl, options = {}) {
  const {
    gap = 8,
    minWidth = 0,
    maxHeight: maxHeightCap = 320,
    preferBelowMinSpace = 96,
  } = options

  const box = getAnchorRectCss(anchorEl)
  if (!box) return null

  const spaceBelow = box.viewportHeight - box.bottom - gap
  const spaceAbove = box.top - gap
  const openUpward = spaceBelow < preferBelowMinSpace && spaceAbove > spaceBelow

  const maxHeight = Math.max(
    96,
    Math.min(maxHeightCap, openUpward ? spaceAbove : Math.max(spaceBelow, 96))
  )
  const width = Math.max(box.width, minWidth)
  let left = box.left
  left = Math.min(left, box.viewportWidth - width - 8)
  left = Math.max(8, left)

  if (openUpward) {
    return {
      top: null,
      bottom: box.viewportHeight - box.top + gap,
      left,
      width,
      maxHeight,
      openUpward: true,
    }
  }

  return {
    top: box.bottom + gap,
    bottom: null,
    left,
    width,
    maxHeight,
    openUpward: false,
  }
}

/** React style 객체용 px 문자열 헬퍼
 * @param {ReturnType<typeof computeFixedPortalPosition>} position
 * @param {{ zIndex?: number, matchWidth?: boolean, minWidth?: string | number }} [extra]
 */
export function fixedPortalStyle(position, extra = {}) {
  const { matchWidth = true, minWidth, zIndex = 10000, ...rest } = extra
  if (!position) {
    return { position: 'fixed', zIndex, ...rest }
  }
  const style = {
    position: 'fixed',
    top: position.openUpward ? 'auto' : `${position.top}px`,
    bottom: position.openUpward ? `${position.bottom}px` : 'auto',
    left: `${position.left}px`,
    maxHeight: position.maxHeight != null ? `${position.maxHeight}px` : undefined,
    zIndex,
    ...rest,
  }
  if (matchWidth && position.width != null) {
    style.width = `${position.width}px`
    style.minWidth = `${position.width}px`
  } else if (minWidth != null) {
    style.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth
  }
  return style
}
