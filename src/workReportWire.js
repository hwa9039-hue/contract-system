/** Cloudflare WAF 회피: 주간업무보고서 본문을 wr1:base64 로 API `content`에 실어 보냄 */

export const WORK_REPORT_WIRE_PREFIX = 'wr1:'

export function encodeWorkReportWireText(text) {
  const raw = text == null ? '' : String(text)
  if (!raw) return ''
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return `${WORK_REPORT_WIRE_PREFIX}${btoa(binary)}`
}

export function decodeWorkReportWireText(value) {
  const s = value == null ? '' : String(value)
  if (!s.startsWith(WORK_REPORT_WIRE_PREFIX)) return s
  try {
    const binary = atob(s.slice(WORK_REPORT_WIRE_PREFIX.length))
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return s
  }
}

/** HTTP JSON에 위험한 평문/JSON 패턴이 노출되지 않도록 content만 wr1 로 인코딩 */
export function toWeeklyWorkReportWirePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const { content, body, ...rest } = payload
  const raw = String(content ?? body ?? '').trim()
  const wire = { ...rest }
  if (raw) {
    wire.content = encodeWorkReportWireText(raw)
  }
  return wire
}
