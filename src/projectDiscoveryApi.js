import { API_BASE_URL, getAuthHeaders, apiFetchInit } from './apiClient.js'
import { readApiErrorMessage } from './apiErrors.js'

/**
 * 백엔드 라우터(backend/app/routers/project_discovery.py) 기준 경로.
 * architecture / building 등 다른 이름의 API는 이 프로젝트·운영 서버에 없음.
 */
export const DISCOVERY_API_PATHS = {
  list: '/api/project-discovery',
  import: '/api/project-discovery/import',
  bulkDelete: '/api/project-discovery/bulk-delete',
}

function resolveDiscoveryApiMock() {
  const env = import.meta.env.VITE_DISCOVERY_API_MOCK
  if (env === 'true' || env === '1') return true
  if (env === 'false' || env === '0') return false
  /** 운영 API(api.signtelecom-smartdi.com)에 project-discovery 미배포 → 기본 mock */
  return import.meta.env.PROD
}

/** true 이면 GET/POST 없이 임시 성공 처리 (배포 후 VITE_DISCOVERY_API_MOCK=false) */
export const DISCOVERY_API_USE_MOCK = resolveDiscoveryApiMock()

const MOCK_SAVE_DELAY_MS = 1000

function mockDelay(ms = MOCK_SAVE_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mockImportedRows(rows) {
  const base = Date.now()
  return rows.map((row, index) => ({
    id: `mock-discovery-${base}-${index}`,
    permitDate: row.permitDate ?? '',
    checkStatus: row.checkStatus ?? '',
    salesTarget: row.salesTarget ?? '',
    projectCategory: row.projectCategory ?? '',
    localGov: row.localGov ?? '',
    client: row.client ?? '',
    projectName: row.projectName ?? '',
    projectAmount: row.projectAmount ?? '',
    completionPeriod: row.completionPeriod ?? '',
    manager: row.manager ?? '',
    note: row.note ?? '',
    createdAt: row.createdAt ?? new Date(base + index).toISOString(),
    updatedAt: row.updatedAt ?? new Date(base + index).toISOString(),
  }))
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

export const projectDiscoveryApi = {
  get useMock() {
    return DISCOVERY_API_USE_MOCK
  },

  async list() {
    if (DISCOVERY_API_USE_MOCK) {
      console.info('[건축정보] API mock — GET', DISCOVERY_API_PATHS.list, '(요청 생략)')
      return []
    }
    return requestJson(DISCOVERY_API_PATHS.list)
  },

  async create(payload) {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      return mockImportedRows([payload])[0]
    }
    return requestJson(DISCOVERY_API_PATHS.list, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async update(id, patch) {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      return { id, ...patch }
    }
    return requestJson(`${DISCOVERY_API_PATHS.list}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  async remove(id) {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(200)
      return null
    }
    return requestJson(`${DISCOVERY_API_PATHS.list}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  async bulkDelete(ids) {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      return { deleted: ids.length }
    }
    return requestJson(DISCOVERY_API_PATHS.bulkDelete, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },

  async removeAll() {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      return { deleted: 0 }
    }
    return requestJson(DISCOVERY_API_PATHS.list, {
      method: 'DELETE',
    })
  },

  async importRows(rows) {
    if (DISCOVERY_API_USE_MOCK) {
      console.info('[건축정보] API mock — POST', DISCOVERY_API_PATHS.import, {
        rowCount: rows.length,
      })
      await mockDelay(MOCK_SAVE_DELAY_MS)
      return mockImportedRows(rows)
    }
    console.log('[excel-upload] POST', `${API_BASE_URL}${DISCOVERY_API_PATHS.import}`, {
      rowCount: rows.length,
    })
    return requestJson(DISCOVERY_API_PATHS.import, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    })
  },
}
