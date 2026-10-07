import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../App.css'
import { installProductionGuard } from '../productionGuard.js'
import PublicInstallCasesPage from './PublicInstallCasesPage.jsx'

/** 카카오톡·메신저 미리보기와 브라우저 탭에 쓰는 제목. share.html 의 og:title 과 같아야 한다. */
export const PUBLIC_SHARE_PAGE_TITLE = '(주)싸인텔레콤 설치사례'

function ensureMeta(attrName, attrValue, content) {
  const selector = `meta[${attrName}="${attrValue}"]`
  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attrName, attrValue)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

/**
 * 외부 공유 주소 진입점. AuthProvider·사이드바·헤더·워터마크 없이 뷰어만 올린다.
 * 로그인 상태나 저장된 토큰은 읽지도 보내지도 않는다.
 * 우클릭·개발자 도구 단축키 차단은 내부 시스템과 같은 installProductionGuard 를 쓴다.
 */
export function mountPublicShare(rootElement) {
  document.title = PUBLIC_SHARE_PAGE_TITLE
  ensureMeta('property', 'og:title', PUBLIC_SHARE_PAGE_TITLE)
  ensureMeta('property', 'og:type', 'website')
  ensureMeta('name', 'robots', 'noindex, nofollow')
  installProductionGuard()

  createRoot(rootElement).render(
    <StrictMode>
      <PublicInstallCasesPage />
    </StrictMode>,
  )
}
