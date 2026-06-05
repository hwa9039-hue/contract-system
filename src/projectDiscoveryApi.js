import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { ApiRequestError, readApiErrorMessage } from './apiErrors.js'
import { sanitizeRegistryImportPayload } from './excelSheetUtils.js'
import { normalizeRegistryImportResponse } from './excelImportResponse.js'

/**
 * 백엔드 라우터(backend/app/routers/project_discovery.py) 기준 경로.
 */
export const DISCOVERY_API_PATHS = {
  list: '/api/project-discovery',
  import: '/api/project-discovery/import',
  bulkDelete: '/api/project-discovery/bulk-delete',
}

const DISCOVERY_STORAGE_KEY = 'cms_project_discovery_rows'

function resolveDiscoveryApiMock() {
  const env = import.meta.env.VITE_DISCOVERY_API_MOCK
  if (env === 'true' || env === '1') return true
  if (env === 'false' || env === '0') return false
  return false
}

/** POST 실패(404 등) 시 로컬 저장 폴백만 사용할 때 true */
export const DISCOVERY_API_USE_MOCK = resolveDiscoveryApiMock()

const MOCK_SAVE_DELAY_MS = 1000

function mockDelay(ms = MOCK_SAVE_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function loadStoredDiscoveryRows() {
  try {
    const raw = localStorage.getItem(DISCOVERY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredDiscoveryRows(rows) {
  try {
    localStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []))
  } catch (error) {
    console.warn('[건축정보] localStorage 저장 실패', error)
  }
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

export const projectDiscoveryApi = {
  get useMock() {
    return DISCOVERY_API_USE_MOCK
  },

  async list() {
    try {
      const rows = await requestJson(DISCOVERY_API_PATHS.list)
      if (Array.isArray(rows) && rows.length) {
        saveStoredDiscoveryRows(rows)
        return rows
      }
    } catch (error) {
      console.warn('[건축정보] GET 실패 — 로컬 캐시 사용', error)
    }
    return loadStoredDiscoveryRows()
  },

  async create(payload) {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      const created = mockImportedRows([payload])[0]
      saveStoredDiscoveryRows([...loadStoredDiscoveryRows(), created])
      return created
    }
    return requestJson(DISCOVERY_API_PATHS.list, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async update(id, patch) {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      const rows = loadStoredDiscoveryRows().map((row) =>
        String(row.id) === String(id) ? { ...row, ...patch, id: row.id } : row
      )
      saveStoredDiscoveryRows(rows)
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
      saveStoredDiscoveryRows(loadStoredDiscoveryRows().filter((row) => String(row.id) !== String(id)))
      return null
    }
    return requestJson(`${DISCOVERY_API_PATHS.list}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  async bulkDelete(ids) {
    const idSet = new Set(ids.map(String))
    const applyLocalDelete = () => {
      const next = loadStoredDiscoveryRows().filter((row) => !idSet.has(String(row.id)))
      saveStoredDiscoveryRows(next)
      return next
    }

    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      applyLocalDelete()
      return { deleted: ids.length }
    }

    try {
      const result = await requestJson(DISCOVERY_API_PATHS.bulkDelete, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      applyLocalDelete()
      return result
    } catch (error) {
      applyLocalDelete()
      console.warn('[건축정보] bulkDelete API 실패 — 로컬 캐시에서 삭제 반영', error)
      return { deleted: ids.length, localOnly: true }
    }
  },

  async removeAll() {
    if (DISCOVERY_API_USE_MOCK) {
      await mockDelay(300)
      saveStoredDiscoveryRows([])
      return { deleted: 0 }
    }
    return requestJson(DISCOVERY_API_PATHS.list, {
      method: 'DELETE',
    })
  },

  async importRows(rows) {
    const data = sanitizeRegistryImportPayload(rows)
    try {
      console.log('Upload Payload:', data)
      console.log('[excel-upload] POST', `${API_BASE_URL}${DISCOVERY_API_PATHS.import}`, {
        rowCount: data.length,
      })
      const raw = await requestJson(DISCOVERY_API_PATHS.import, {
        method: 'POST',
        body: JSON.stringify({ rows: data }),
      })
      return normalizeRegistryImportResponse(raw)
    } catch (error) {
      console.warn('[건축정보] POST import 실패 — 로컬 저장 폴백', error)
      if (DISCOVERY_API_USE_MOCK) {
        await mockDelay(MOCK_SAVE_DELAY_MS)
      }
      const created = mockImportedRows(data)
      saveStoredDiscoveryRows([...loadStoredDiscoveryRows(), ...created])
      return normalizeRegistryImportResponse({ rows: created, duplicateItems: [] })
    }
  },
}
