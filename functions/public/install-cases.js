import { renderInstallCasePreview } from '../_shared/installCasePreview.js'

/** /public/install-cases — 같은 공개 화면의 다른 주소. */
export function onRequest(context) {
  return renderInstallCasePreview(context)
}