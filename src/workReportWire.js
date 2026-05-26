/**
 * Cloudflare WAF: PATCH/POST 본문의 `"content":"…"` 값이 ~55자를 넘으면 500(브라우저는 CORS/Failed to fetch).
 * 긴 본문은 `reportPayloadParts`(48자 단위)로만 보냅니다. 줄(mm2 행) 단위로 끊어 탭·담당자가 깨지지 않게 합니다.
 */

export const WORK_REPORT_WIRE_PREFIX = 'wr1:'

/** WAF 안전 한도(문자 단위). 배열 조각은 이 길이 이하로 분할 */
export const REPORT_PAYLOAD_PART_MAX = 48

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

function splitReportPayloadParts(text) {
  const raw = text == null ? '' : String(text)
  if (!raw) return []
  if (raw.length <= REPORT_PAYLOAD_PART_MAX) return [raw]

  if (raw.includes('\n')) {
    const lines = raw.split('\n')
    const parts = []
    let buffer = ''

    for (const line of lines) {
      const candidate = buffer ? `${buffer}\n${line}` : line
      if (candidate.length <= REPORT_PAYLOAD_PART_MAX) {
        buffer = candidate
        continue
      }

      if (buffer) {
        parts.push(buffer)
        buffer = ''
      }

      if (line.length <= REPORT_PAYLOAD_PART_MAX) {
        buffer = line
        continue
      }

      for (let i = 0; i < line.length; i += REPORT_PAYLOAD_PART_MAX) {
        parts.push(line.slice(i, i + REPORT_PAYLOAD_PART_MAX))
      }
    }

    if (buffer) parts.push(buffer)
    return parts
  }

  const parts = []
  for (let i = 0; i < raw.length; i += REPORT_PAYLOAD_PART_MAX) {
    parts.push(raw.slice(i, i + REPORT_PAYLOAD_PART_MAX))
  }
  return parts
}

/** API 전송용: 짧으면 content, 길면 reportPayloadParts 만 사용 */
export function toWeeklyWorkReportWirePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const { content, body, reportPayloadParts, ...rest } = payload
  const raw = String(content ?? body ?? '').trim()
  const wire = { ...rest }

  if (!raw) {
    return wire
  }

  if (raw.length <= REPORT_PAYLOAD_PART_MAX) {
    wire.content = raw
    return wire
  }

  wire.reportPayloadParts = Array.isArray(reportPayloadParts)
    ? reportPayloadParts
    : splitReportPayloadParts(raw)
  return wire
}
