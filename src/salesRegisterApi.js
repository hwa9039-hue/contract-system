import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { ApiRequestError, readApiErrorMessage } from './apiErrors.js'
import { sanitizeRegistryImportPayload } from './excelSheetUtils.js'
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
    response = await apiFetch(url, apiFetchInit({
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    }))
  } catch (err) {
    if (err instanceof ApiRequestError) throw err
    throw new ApiRequestError(
      err?.message ? `네트워크 오류: ${err.message}` : '서버에 연결할 수 없습니다.',
      { url, cause: err }
    )
  }

  if (!response.ok) {
    throw new ApiRequestError(await readApiErrorMessage(response), {
      status: response.status,
      url,
    })
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
  /** 영업관리대장 요약(summary) 전용 갱신 — GET 응답 키(summary)와 동일한 PATCH body */
  updateSummary(id, summaryOrPatch) {
    const rowId = String(id ?? '').trim()
    if (!rowId) {
      return Promise.reject(new Error('유효하지 않은 행 ID'))
    }
    const patch = resolveSalesSummaryPatchBody(summaryOrPatch)
    if (!Object.keys(patch).length) {
      return Promise.reject(new Error('요약 저장 Payload가 비어 있습니다.'))
    }
    console.log('[영업관리대장] 요약 저장 Payload:', patch)
    return this.update(rowId, patch)
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
    const data = sanitizeRegistryImportPayload(rows)
    console.log('Sales Import Payload:', data)
    console.log('[excel-upload] POST', `${API_BASE_URL}/api/sales-register/import`, { rowCount: data.length })
    return requestJson('/api/sales-register/import', {
      method: 'POST',
      body: JSON.stringify({ rows: data }),
    })
      .then(normalizeRegistryImportResponse)
      .catch(async (error) => {
        if (error?.status !== 404) throw error

        console.warn(
          '[excel-upload] /api/sales-register/import not found. Falling back to row-by-row POST.',
          error
        )
        const createdRows = []
        for (const row of data) {
          createdRows.push(await this.create(row))
        }
        return normalizeRegistryImportResponse({ rows: createdRows, duplicateItems: [] })
      })
  },
}
