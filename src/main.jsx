import './index.css'
import { isPublicSharePath } from './publicShare/publicSharePaths.js'

const rootElement = document.getElementById('root')

// 진입 주소로 먼저 갈라서, 외부 공유 주소에서는 관리자 시스템 코드를 아예 불러오지 않는다.
// (인증 예외는 이 목록에 있는 주소에만 적용된다. 그 외 모든 주소는 기존처럼 로그인이 필요하다.)
if (isPublicSharePath(window.location.pathname)) {
  import('./publicShare/mountPublicShare.jsx').then(({ mountPublicShare }) => {
    mountPublicShare(rootElement)
  })
} else {
  import('./mountAdminApp.jsx').then(({ mountAdminApp }) => {
    mountAdminApp(rootElement)
  })
}
