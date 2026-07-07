import { useLayoutEffect, useRef } from 'react'

/**
 * 내용 길이에 맞춰 세로로 자동으로 늘어나는 controlled <textarea>.
 *
 * - 값이 짧을 때는 CSS 의 min-height(기본 2~3줄 높이)를 그대로 유지한다.
 *   (scrollHeight 는 항상 clientHeight 이상이고, clientHeight 는 min-height 이상이므로
 *    자동 계산 높이가 기본 높이 밑으로 내려가지 않는다.)
 * - 내용이 길어지면 scrollHeight 만큼 높이를 늘려 세로 스크롤바 없이 전체 글이 보인다.
 * - 폭이 바뀌어 줄바꿈이 달라지면(반응형/창 크기 조절) 높이를 다시 계산한다.
 *
 * 기존 <textarea> 자리에 그대로 교체할 수 있도록 className·onKeyDown·placeholder 등
 * 모든 props 를 그대로 전달한다.
 */
export function AutoGrowTextarea({ value, onChange, className = '', style, ...rest }) {
  const ref = useRef(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    // 먼저 auto 로 되돌려 축소를 허용한 뒤 실제 콘텐츠 높이(scrollHeight)로 맞춘다.
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // 값 변경·최초 마운트 시 높이 재계산 (paint 전 실행으로 깜빡임 방지)
  useLayoutEffect(() => {
    resize()
  }, [value])

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

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={onChange}
      // 콘텐츠 높이에 정확히 맞추므로 내부 스크롤은 숨긴다.
      style={{ overflowY: 'hidden', resize: 'none', ...style }}
      {...rest}
    />
  )
}
