import { API_BASE_URL, apiFetch, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { compressInstallCaseImage } from './installCaseImage.js'
import { isInstallCaseVideoFile } from './installCaseMedia.js'
import { createLocalInstallCaseId } from './installCaseLocal.js'

/** 백엔드 router: GET/POST /api/install-cases */
export const INSTALL_CASES_API_PATH = '/api/install-cases'
export const INSTALL_CASE_MAX_MEDIA_COUNT = 10

export const INSTALL_CASES_USE_MOCK = false

const MOCK_SAVE_DELAY_MS = 1000

function mockDelay(ms = MOCK_SAVE_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mockInstallCaseRow(payload, existingId = null) {
  const timestamp = new Date().toISOString()
  const heroImages = normalizeHeroImagesList(payload?.heroImages, payload?.heroImage)
  return {
    ...payload,
    heroImages,
    heroImage: heroImages[0] || '',
    id: existingId || createLocalInstallCaseId(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function normalizeHeroImagesList(heroImages, heroImage = '') {
  const items = []
  if (Array.isArray(heroImages)) {
    for (const item of heroImages) {
      const text = String(item || '').trim()
      if (text) items.push(text)
    }
  }
  if (!items.length) {
    const single = String(heroImage || '').trim()
    if (single) items.push(single)
  }
  const deduped = []
  const seen = new Set()
  for (const url of items) {
    if (seen.has(url)) continue
    seen.add(url)
    deduped.push(url)
  }
  return deduped.slice(0, INSTALL_CASE_MAX_MEDIA_COUNT)
}

function stripOversizedDataUrl(payload) {
  const next = { ...payload }
  const hero = String(next.heroImage || '')
  if (hero.startsWith('data:') && hero.length > 200_000) {
    next.heroImage = ''
  }
  if (Array.isArray(next.heroImages)) {
    next.heroImages = next.heroImages.filter((url) => {
      const text = String(url || '')
      return !(text.startsWith('data:') && text.length > 200_000)
    })
  }
  return next
}

async function readErrorMessage(response) {
  const raw = await response.text()
  if (!raw) return `Request failed with status ${response.status}`
  try {
    const parsed = JSON.parse(raw)
    const detail = parsed?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((item) => item?.msg || item?.message || String(item)).join(', ')
    }
    return raw
  } catch {
    return raw
  }
}

async function requestJson(path, options = {}) {
  const { headers: optHeaders, ...rest } = options
  const response = await apiFetch(
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
    throw new Error(await readErrorMessage(response))
  }

  if (response.status === 204) return null
  return response.json()
}

async function requestForm(path, { method = 'POST', formData } = {}) {
  const response = await apiFetch(
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
    throw new Error(await readErrorMessage(response))
  }

  if (response.status === 204) return null
  return response.json()
}

export function resolveInstallCaseHeroImage(src) {
  const value = String(src || '').trim()
  if (!value) return ''
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')) {
    return value
  }
  if (value.startsWith('/api/')) {
    return `${API_BASE_URL}${value}`
  }
  if (value.startsWith('/uploads/')) {
    return `${API_BASE_URL}${value}`
  }
  return value
}

export function resolveInstallCaseHeroImages(row) {
  return normalizeHeroImagesList(row?.heroImages, row?.heroImage).map((url) =>
    resolveInstallCaseHeroImage(url)
  )
}

async function prepareInstallCaseMediaFile(file) {
  if (isInstallCaseVideoFile(file)) {
    return file
  }
  return compressInstallCaseImage(file)
}

async function prepareInstallCaseMediaFiles(files) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  const prepared = []
  for (const file of list.slice(0, INSTALL_CASE_MAX_MEDIA_COUNT)) {
    prepared.push(await prepareInstallCaseMediaFile(file))
  }
  return prepared
}

function buildMediaFormData(payload, imageFiles, { keepImages } = {}) {
  const form = new FormData()
  const { heroImage: _h, heroImages: _hs, keepImages: _k, ...rest } = payload || {}
  const body = { ...rest }
  if (Array.isArray(keepImages)) {
    body.keepImages = keepImages
  }
  form.append('payload', JSON.stringify(body))
  for (const file of imageFiles) {
    form.append('images', file, file.name)
  }
  return form
}

export const installCasesApi = {
  async list() {
    if (INSTALL_CASES_USE_MOCK) {
      return []
    }

    const data = await requestJson(INSTALL_CASES_API_PATH)
    return Array.isArray(data) ? data : []
  },

  async create(payload, imageFiles = null) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return mockInstallCaseRow(payload)
    }

    const files = Array.isArray(imageFiles)
      ? imageFiles.filter(Boolean)
      : imageFiles
        ? [imageFiles]
        : []

    if (files.length) {
      const prepared = await prepareInstallCaseMediaFiles(files)
      const form = buildMediaFormData(payload, prepared)
      return requestForm(`${INSTALL_CASES_API_PATH}/form`, {
        method: 'POST',
        formData: form,
      })
    }

    const heroImages = normalizeHeroImagesList(payload?.heroImages, payload?.heroImage)
    return requestJson(INSTALL_CASES_API_PATH, {
      method: 'POST',
      body: JSON.stringify(
        stripOversizedDataUrl({
          ...payload,
          heroImages,
          heroImage: heroImages[0] || '',
        })
      ),
    })
  },

  async update(id, patch, imageFiles = null, keepImages = null) {
    if (INSTALL_CASES_USE_MOCK) {
      await mockDelay()
      return mockInstallCaseRow({ ...patch, id }, id)
    }

    const files = Array.isArray(imageFiles)
      ? imageFiles.filter(Boolean)
      : imageFiles
        ? [imageFiles]
        : []
    const hasKeep = Array.isArray(keepImages)
    const shouldUseForm = files.length > 0 || hasKeep

    if (shouldUseForm) {
      const prepared = files.length ? await prepareInstallCaseMediaFiles(files) : []
      const form = buildMediaFormData(patch, prepared, {
        keepImages: hasKeep ? keepImages : undefined,
      })
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
