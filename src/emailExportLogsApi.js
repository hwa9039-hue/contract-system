import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

/** 견적 · 설계 반출 현황 (Gmail 연동 자동화 데이터) */
export const EMAIL_EXPORT_LOGS_API_PATH = '/api/emails/export-logs'

/**
 * 백엔드가 아직 없을 때 화면 확인용으로 쓰는 예시 데이터.
 * 실제 API 가 응답하면 이 데이터는 쓰이지 않는다.
 * 서버 응답 형식(가정):
 *   [{ id, sentAt: ISO 문자열, sender: 이메일, recipient: 수신자 이메일들, subject: 제목,
 *      bodySummary: 본문 요약, attachments: [파일명 또는 { filename }] }]
 */
export const MOCK_EMAIL_EXPORT_LOGS = [
  {
    id: 'mock-1',
    sentAt: '2026-10-06T12:00:00+09:00',
    sender: 'hy9039@signtelecom.com',
    recipient: 'hy9039@gmail.com',
    subject: 'ㄱㄴㄷ',
    bodySummary:
      '안녕하세요. 요청하신 ㄱㄴㄷ 건 관련 자료를 첨부드립니다. 000.ppt는 개요 설명 자료이고, 00000.hwp는 상세 내역입니다. 검토 후 의견 부탁드립니다.',
    attachments: ['000.ppt', '00000.hwp', 'ㄱㄴㄷ_도면.dwg'],
  },
  {
    id: 'mock-2',
    sentAt: '2026-10-05T16:42:00+09:00',
    sender: 'hy9039@gmail.com',
    recipient: 'client01@example.co.kr, kk2331@signtelecom.com',
    subject: '신축 공장 통신 설비 견적 요청 회신',
    bodySummary: '문의 주신 신축 공장 통신 설비 견적서를 보내드립니다. 유효기간은 발행일로부터 30일입니다.',
    attachments: ['견적서_최종.pdf'],
  },
  {
    id: 'mock-3',
    sentAt: '2026-10-02T09:15:00+09:00',
    sender: 'jhjoung@signtelecom.com',
    recipient: 'partner01@example.co.kr',
    subject: '1차 설계도서 송부드립니다 (구내통신 / CCTV)',
    bodySummary: '1차 설계도서를 송부드립니다. 도면, 설계내역서, 물량산출서가 포함되어 있습니다.',
    attachments: ['도면.dwg', '설계내역서.xlsx', '물량산출서.pdf'],
  },
  {
    id: 'mock-4',
    sentAt: '2026-09-30T18:03:00+09:00',
    sender: 'partner01@example.co.kr',
    recipient: 'sskim@signtelecom.com',
    subject: '변경 설계 반영본',
    bodySummary: '',
    attachments: [],
  },
]

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 첨부 항목(문자열 또는 {filename|fileName|name})에서 파일명만 뽑는다. */
function attachmentToFilename(item) {
  if (typeof item === 'string') return item.trim()
  if (!item || typeof item !== 'object') return ''
  return safeString(item.filename ?? item.fileName ?? item.name).trim()
}

/** 서버 행(camelCase / snake_case 모두 허용)을 화면용 형태로 맞춘다. */
export function normalizeEmailExportLog(row, index = 0) {
  const source = row && typeof row === 'object' ? row : {}
  const rawAttachments = Array.isArray(source.attachments) ? source.attachments : []
  return {
    id: safeString(source.id ?? `row-${index}`),
    sentAt: safeString(source.sentAt ?? source.sent_at ?? source.date),
    sender: safeString(source.sender ?? source.from ?? source.sender_email).trim(),
    recipient: safeString(source.recipient ?? source.to).trim(),
    subject: safeString(source.subject ?? source.title),
    bodySummary: safeString(source.bodySummary ?? source.body_summary).trim(),
    attachments: rawAttachments.map(attachmentToFilename).filter(Boolean),
  }
}

/** 보낸일시를 YYYY-MM-DD HH:mm (브라우저 로컬 시간대) 로 표시한다. 해석 불가하면 원문을 그대로 돌려준다. */
export function formatSentAt(value) {
  const raw = safeString(value).trim()
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

async function requestJson(path) {
  const url = `${API_BASE_URL}${path}`
  let response
  try {
    response = await apiFetch(
      url,
      apiFetchInit({
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
    )
  } catch (err) {
    throw new Error(`서버에 연결할 수 없습니다. (${url}) ${err?.message || err}`)
  }
  if (!response.ok) {
    const error = new Error(await readApiErrorMessage(response))
    error.status = response.status
    throw error
  }
  return response.json()
}

export const emailExportLogsApi = {
  /** GET /api/emails/export-logs — 배열 또는 { items: [] } 모두 허용 */
  async list() {
    const data = await requestJson(EMAIL_EXPORT_LOGS_API_PATH)
    const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
    return rows.map(normalizeEmailExportLog)
  },
}
