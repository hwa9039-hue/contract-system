import { useEffect, useState } from 'react'

const DESKTOP_TABLE_QUERY = '(min-width: 768px)'

/** md(768px) 이상이면 표, 미만이면 카드만 그리기 위해 한 번만 구독한다. */
export function useDesktopTableLayout() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DESKTOP_TABLE_QUERY).matches : true
  )

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_TABLE_QUERY)
    const apply = () => setIsDesktop(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  return isDesktop
}
