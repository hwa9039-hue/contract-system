import { API_BASE_URL, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { compressInstallCaseImage } from './installCaseImage.js'
import { createLocalInstallCaseId } from './installCaseLocal.js'

/** 백엔드 router: GET/POST /api/install-cases */
export const INSTALL_CASES_API_PATH = '/api/install-cases'

export const INSTALL_CASES_USE_MOCK = false

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

function stripOversizedDataUrl(payload) {
  const next = { ...payload }
  const hero = String(next.heroImage || '')
  if (hero.startsWith('data:') && hero.length > 200_000) {
    next.heroImage = ''
  }
  return next
}

async function requestJson(path, options = {}) {
  const { headers: optHeaders, ...rest } = options
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    apiFetchInit({
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(optHeaders || {}),
      },
    })
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

async function requestForm(path, { method = 'POST', formData } = {}) {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    apiFetchInit({
      method,
      headers: {
        ...getAuthHeaders(),
      },
      body: formData,
    })
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export function resolveInstallCaseHeroImage(src) {
  const value = String(src || '').trim()
  if (!value) return ''
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }
  if (value.startsWith('/api/')) {
    return `${API_BASE_URL}${value}`
  }
  return value
}

export const installCasesApi = {
  async list() {
    if (INSTALL_CASES_USE_MOCK) {
      return []
    }

    const data = await requestJson(INSTALL_CASES_API_PATH)
    return Array.isArray(data) ? data : []
  },

  async create(payload, imageFile = null) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return mockInstallCaseRow(payload)
    }

    if (imageFile) {
      const compressed = await compressInstallCaseImage(imageFile)
      const form = new FormData()
      const { heroImage: _ignored, ...rest } = payload
      form.append('payload', JSON.stringify(rest))
      form.append('image', compressed, compressed.name)
      return requestForm(`${INSTALL_CASES_API_PATH}/form`, {
        method: 'POST',
        formData: form,
      })
    }

    return requestJson(INSTALL_CASES_API_PATH, {
      method: 'POST',
      body: JSON.stringify(stripOversizedDataUrl(payload)),
    })
  },

  async update(id, patch, imageFile = null) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return mockInstallCaseRow({ ...patch, id }, id)
    }

    if (imageFile) {
      const compressed = await compressInstallCaseImage(imageFile)
      const form = new FormData()
      const { heroImage: _ignored, ...rest } = patch
      form.append('payload', JSON.stringify(rest))
      form.append('image', compressed, compressed.name)
      return requestForm(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}/form`, {
        method: 'PATCH',
        formData: form,
      })
    }

    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(stripOversizedDataUrl(patch)),
    })
  },

  async remove(id) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return null
    }

    return requestJson(`${INSTALL_CASES_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
