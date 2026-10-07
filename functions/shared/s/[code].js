import { renderInstallCasePreview } from '../../_shared/installCasePreview.js'

/** /shared/s/:code — 6자리 공유 코드. 로그인으로 보내지 않는다. */
export function onRequest(context) {
  return renderInstallCasePreview(context, { shortCode: context.params?.code || '' })
}
