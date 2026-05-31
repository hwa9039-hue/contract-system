import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'
import { normalizeRegistryImportResponse } from './excelImportResponse.js'

/**
 * GET /api/sales-register → normalizeSalesRow / toSalesPayload 와 동일한 API·DB 필드명.
 * (sales_register_rows.summary, 응답 JSON 키: summary)
 */
export const SALES_REGISTER_SUMMARY_FIELD = 'summary'

/** 요약 모달 저장용 PATCH body — 키 이름을 GET 응답과 동일하게 고정 */
export function buildSalesRegisterSummaryPatch(summaryText) {
  const value = summaryText == null ? '' : String(summaryText)
  return { [SALES_REGISTER_SUMMARY_FIELD]: value }
}

function resolveSalesSummaryPatchBody(summaryOrPatch) {
  if (
    typeof summaryOrPatch === 'object' &&
    summaryOrPatch !== null &&
    !Array.isArray(summaryOrPatch) &&
    Object.prototype.hasOwnProperty.call(summaryOrPatch, SALES_REGISTER_SUMMARY_FIELD)
  ) {
    return buildSalesRegisterSummaryPatch(summaryOrPatch[SALES_REGISTER_SUMMARY_FIELD])
  }
  return buildSalesRegisterSummaryPatch(summaryOrPatch)
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`
  const { headers: optHeaders, ...rest } = options
  let response
  try {
    response = await fetch(url, apiFetchInit({
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    }))
  } catch (err) {
    throw new Error(`서버에 연결할 수 없습니다. (${url}) ${err?.message || err}`)
  }

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response))
  }

  if (response.status === 204) return null
  return response.json()
}

export const salesRegisterApi = {
  list() {
    return requestJson('/api/sales-register')
  },
  create(payload) {
    return requestJson('/api/sales-register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  update(id, patch) {
    return requestJson(`/api/sales-register/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  /** 영업관리대장 요약(summary) 전용 갱신 — summary 키만 담은 PATCH body */
  async updateSummary(id, summaryOrPatch) {
    const rowId = String(id ?? '').trim()
    if (!rowId) {
      return Promise.reject(new Error('유효하지 않은 행 ID'))
    }
    const patch = resolveSalesSummaryPatchBody(summaryOrPatch)
    const body = JSON.stringify(patch)
    if (body === '{}') {
      return Promise.reject(new Error('요약 저장 Payload가 비어 있습니다.'))
    }
    console.log('[영업관리대장] 요약 저장 Payload:', patch)
    const basePath = `/api/sales-register/${encodeURIComponent(rowId)}`
    const requestOpts = { method: 'PATCH', body }
    try {
      return await requestJson(basePath, requestOpts)
    } catch (err) {
      const message = String(err?.message || err)
      if (!message.includes('No fields to update')) {
        throw err
      }
      console.warn('[영업관리대장] 요약 저장 — 기본 PATCH 실패, /summary 엔드포인트로 재시도')
      return requestJson(`${basePath}/summary`, requestOpts)
    }
  },
  /** 영업관리대장 세부내용( detail ) 히스토리 전용 갱신 */
  updateDetail(id, detail) {
    const rowId = String(id ?? '').trim()
    if (!rowId) {
      return Promise.reject(new Error('유효하지 않은 행 ID'))
    }
    const detailValue = detail == null ? '' : String(detail)
    const path = `/api/sales-register/${encodeURIComponent(rowId)}`
    return requestJson(path, {
      method: 'PATCH',
      body: JSON.stringify({ detail: detailValue }),
    })
  },
  remove(id) {
    return requestJson(`/api/sales-register/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  bulkDelete(ids) {
    return requestJson('/api/sales-register/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  removeAll() {
    return requestJson('/api/sales-register', {
      method: 'DELETE',
    })
  },
  importRows(rows) {
    console.log('[excel-upload] POST', `${API_BASE_URL}/api/sales-register/import`, { rowCount: rows.length })
    return requestJson('/api/sales-register/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }).then(normalizeRegistryImportResponse)
  },
}
