/**
 * Cloudflare WAF: PATCH/POST 본문의 `"content":"…"` 값이 ~55자를 넘으면 500(브라우저는 CORS/Failed to fetch).
 * 회의록(mm2)은 `body`(wr1) 또는 `reportPayloadParts`로 전송합니다.
 */

export const WORK_REPORT_WIRE_PREFIX = 'wr1:'

/** WAF 안전 한도(문자 단위). 배열 조각은 이 길이 이하로 분할 */
export const REPORT_PAYLOAD_PART_MAX = 48

const MEETING_MINUTES_TEXT_PREFIX = 'mm2\n'
const MEETING_MINUTES_DOC_PREFIX = 'mm3\n'

function isMeetingMinutesWireContent(raw) {
  return raw.startsWith(MEETING_MINUTES_TEXT_PREFIX) || raw.startsWith(MEETING_MINUTES_DOC_PREFIX)
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

export function encodeWorkReportWireBody(text) {
  const raw = text == null ? '' : String(text)
  if (!raw) return ''
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return `${WORK_REPORT_WIRE_PREFIX}${btoa(binary)}`
}

export function splitReportPayloadParts(text) {
  const raw = text == null ? '' : String(text)
  if (!raw) return []
  if (raw.length <= REPORT_PAYLOAD_PART_MAX) return [raw]

  // 48자 고정 분할 — join 시 newlines·구분자(\u001f)가 그대로 복원됨 (줄 단위 분할은 join 시 \n 소실)
  const parts = []
  for (let i = 0; i < raw.length; i += REPORT_PAYLOAD_PART_MAX) {
    parts.push(raw.slice(i, i + REPORT_PAYLOAD_PART_MAX))
  }
  return parts
}

function stripWireContentFields(payload) {
  const { content, body, reportPayloadParts, ...rest } = payload
  return rest
}

/** 회의록·긴 본문 저장 시 시도할 wire 형식 순서 */
export function buildWorkReportWireVariants(payload) {
  if (!payload || typeof payload !== 'object') return [payload]
  const rest = stripWireContentFields(payload)
  const raw = String(payload.content ?? payload.body ?? '').trim()
  if (!raw) return [rest]

  const variants = []
  if (isMeetingMinutesWireContent(raw)) {
    variants.push({ ...rest, body: encodeWorkReportWireBody(raw) })
    variants.push({ ...rest, reportPayloadParts: splitReportPayloadParts(raw) })
    if (raw.length <= REPORT_PAYLOAD_PART_MAX) {
      variants.push({ ...rest, content: raw })
    }
    return variants
  }

  if (raw.length > REPORT_PAYLOAD_PART_MAX) {
    variants.push({ ...rest, body: encodeWorkReportWireBody(raw) })
    variants.push({ ...rest, reportPayloadParts: splitReportPayloadParts(raw) })
    return variants
  }

  return [{ ...rest, content: raw }]
}

/** API 전송용 (첫 번째 wire 변형) */
export function toWeeklyWorkReportWirePayload(payload) {
  const variants = buildWorkReportWireVariants(payload)
  return variants[0] || payload
}
