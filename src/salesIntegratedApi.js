import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

export const SALES_INTEGRATED_API_PATH = '/api/sales-integrated'

/** 화면 필터 톤 → 백엔드 status 쿼리 */
export const SALES_INTEGRATED_STATUS_BY_TONE = {
  red: '검토',
  yellow: '대응중',
  blue: '보고',
  green: '사업공고',
  gray: '종료',
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
      }),
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

function asText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function normalizeIntegratedRow(raw) {
  return {
    id: asText(raw?.id),
    statusColor: asText(raw?.status_color) || 'empty',
    statusLabel: asText(raw?.status_label),
    sourceMenu: asText(raw?.source_menu),
    sourceKey: asText(raw?.source_key),
    date: asText(raw?.date),
    client: asText(raw?.client),
    title: asText(raw?.title),
    amount: asText(raw?.amount),
    manager: asText(raw?.manager),
  }
}

export const salesIntegratedApi = {
  /** GET /api/sales-integrated?status=검토|대응중|보고|사업공고|종료  (생략 시 전체) */
  async list(status = '') {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    const data = await requestJson(`${SALES_INTEGRATED_API_PATH}${query}`)
    const rows = Array.isArray(data) ? data : []
    return rows.map(normalizeIntegratedRow).filter((row) => row.id && row.sourceKey)
  },

  /** GET /api/sales-integrated/{sourceKey}/{id} */
  async detail(sourceKey, id) {
    const data = await requestJson(
      `${SALES_INTEGRATED_API_PATH}/${encodeURIComponent(sourceKey)}/${encodeURIComponent(id)}`,
    )
    const columns = Array.isArray(data?.columns) ? data.columns : []
    return {
      id: asText(data?.id),
      sourceKey: asText(data?.source_key),
      sourceMenu: asText(data?.source_menu),
      statusColor: asText(data?.status_color) || 'empty',
      statusLabel: asText(data?.status_label),
      columns: columns.map((column) => ({
        label: asText(column?.label),
        value: asText(column?.value),
      })),
    }
  },
}
