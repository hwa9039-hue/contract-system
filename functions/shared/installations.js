import { renderInstallCasePreview } from '../_shared/installCasePreview.js'

/** /shared/installations — 기간이 있는 외부 공유 링크. */
export function onRequest(context) {
  return renderInstallCasePreview(context)
}
