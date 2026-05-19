import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { createLocalInstallCaseId } from './installCaseLocal.js'

/** 백엔드 router: GET/POST /api/install-cases (백엔드 배포 후 USE_MOCK false) */
export const INSTALL_CASES_API_PATH = '/api/install-cases'

/** 백엔드 미배포 시 UI 테스트용 — 배포 완료 시 false 로 전환 */
export const INSTALL_CASES_USE_MOCK = true

const MOCK_SAVE_DELAY_MS = 1000

function mockDelay(ms = MOCK_SAVE_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mockInstallCaseRow(payload, existingId = null) {
  const timestamp = new Date().toISOString()
  return {
    ...payload,
    id: existingId || createLocalInstallCaseId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export const installCasesApi = {
  /** GET — 모킹 모드: 네트워크 호출 없이 [] (404·타임아웃 없음) */
  async list() {
    if (INSTALL_CASES_USE_MOCK) {
      return []
    }

    const url = `${API_BASE_URL}${INSTALL_CASES_API_PATH}`
    const response = await fetch(
      url,
      apiFetchInit({
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      })
    )
    if (!response.ok) {
      throw new Error(`목록 조회 실패 (${response.status})`)
    }
    const data = await response.json()
    return Array.isArray(data) ? data : []
  },

  /** POST — 모킹: 1초 후 성공 객체 반환 (실제 fetch 없음) */
  async create(payload) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return mockInstallCaseRow(payload)
    }
    const url = `${API_BASE_URL}${INSTALL_CASES_API_PATH}`
    const response = await fetch(
      url,
      apiFetchInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      })
    )
    if (!response.ok) {
      throw new Error(`등록 실패 (${response.status})`)
    }
    return response.json()
  },

  /** PATCH — 모킹: 1초 후 성공 */
  async update(id, patch) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return mockInstallCaseRow({ ...patch, id }, id)
    }
    const url = `${API_BASE_URL}${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`
    const response = await fetch(
      url,
      apiFetchInit({
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(patch),
      })
    )
    if (!response.ok) {
      throw new Error(`수정 실패 (${response.status})`)
    }
    return response.json()
  },

  /** DELETE — 모킹: 1초 후 성공 */
  async remove(id) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return null
    }
    const url = `${API_BASE_URL}${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`
    const response = await fetch(
      url,
      apiFetchInit({
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(),
        },
      })
    )
    if (!response.ok) {
      throw new Error(`삭제 실패 (${response.status})`)
    }
    return null
  },
}
