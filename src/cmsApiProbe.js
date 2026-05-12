import { API_BASE_URL } from './apiClient.js'

/** 브라우저 콘솔에서 API 주소·헬스·로그인 흐름을 확인할 때 사용하는 접두사 */
export const CMS_API_LOG_PREFIX = '[CMS/API]'

function probeEnabledFromStorage() {
  try {
    return sessionStorage.getItem('cms_api_probe') === '1'
  } catch {
    return false
  }
}

/** URL `?cmsApiProbe=1` 또는 빌드 시 `VITE_CMS_API_PROBE=true` */
export function isCmsApiProbeEnabled() {
  if (import.meta.env.VITE_CMS_API_PROBE === 'true') return true
  return probeEnabledFromStorage()
}

/**
 * 운영 사이트에서 한 번만 열면 됨:
 *   https://contract.signtelecom-smartdi.com/?cmsApiProbe=1
 * 이후 같은 탭에서는 sessionStorage로 유지되며, 끄려면 개발자도구에서
 * sessionStorage.removeItem('cms_api_probe') 후 새로고침.
 */
export function bootstrapCmsApiProbe() {
  if (typeof window === 'undefined') return

  try {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('cmsApiProbe') === '1') {
      sessionStorage.setItem('cms_api_probe', '1')
      console.info(
        CMS_API_LOG_PREFIX,
        'Probe ON: health + login steps will log here. Disable: sessionStorage.removeItem("cms_api_probe") then refresh.'
      )
    }
  } catch {
    // ignore
  }

  if (!isCmsApiProbeEnabled()) return

  console.info(CMS_API_LOG_PREFIX, 'resolved API_BASE_URL =', API_BASE_URL)
  void runCmsApiHealthProbe()
}

export async function runCmsApiHealthProbe() {
  const url = `${API_BASE_URL}/api/health`
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  console.info(CMS_API_LOG_PREFIX, 'GET', url)

  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' })
    const ms =
      typeof performance !== 'undefined' ? Math.round(performance.now() - started) : undefined
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text.slice(0, 240)
    }
    console.info(CMS_API_LOG_PREFIX, 'health result', { ok: res.ok, status: res.status, ms, body })
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    const ms =
      typeof performance !== 'undefined' ? Math.round(performance.now() - started) : undefined
    console.error(CMS_API_LOG_PREFIX, 'health FAILED (network/CORS/tunnel)', {
      ms,
      message: err?.message || String(err),
    })
    return { ok: false, error: err }
  }
}

export function logCmsApiLogin(step, detail) {
  if (!isCmsApiProbeEnabled()) return
  console.info(CMS_API_LOG_PREFIX, 'login', step, detail)
}
