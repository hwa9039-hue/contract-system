import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../App.css'
import PublicInstallCasesPage from './PublicInstallCasesPage.jsx'

/**
 * 외부 공유 주소 진입점. AuthProvider·사이드바·헤더·워터마크 없이 뷰어만 올린다.
 * 로그인 상태나 저장된 토큰은 읽지도 보내지도 않는다.
 */
export function mountPublicShare(rootElement) {
  document.title = '설치사례'

  // 검색 엔진에 잡히지 않게 한다.
  const robots = document.createElement('meta')
  robots.name = 'robots'
  robots.content = 'noindex, nofollow'
  document.head.appendChild(robots)

  createRoot(rootElement).render(
    <StrictMode>
      <PublicInstallCasesPage />
    </StrictMode>,
  )
}
