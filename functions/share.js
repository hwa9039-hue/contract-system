import { renderInstallCasePreview } from './_shared/installCasePreview.js'

/** /share — 예전 308 리다이렉트가 도착하는 주소. 로그인으로 보내지 않는다. */
export function onRequest(context) {
  return renderInstallCasePreview(context)
}
