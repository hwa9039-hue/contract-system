import { renderInstallCasePreview } from '../_shared/installCasePreview.js'

/** /share/installations — 외부 공유 버튼이 복사하는 주소. */
export function onRequest(context) {
  return renderInstallCasePreview(context)
}
