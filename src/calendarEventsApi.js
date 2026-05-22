import { API_BASE_URL, apiFetchInit, getAuthHeaders } from './apiClient.js'

export const CALENDAR_EVENTS_API_PATH = '/api/calendar-events'

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
    throw new Error(await readErrorMessage(response))
  }

  if (response.status === 204) return null
  return response.json()
}

export function normalizeCalendarManualEvent(row) {
  if (!row) return null
  const dateStart = String(row.dateStart || '').slice(0, 10)
  const dateEnd = String(row.dateEnd || dateStart || '').slice(0, 10)
  return {
    id: row.id,
    dateStart,
    dateEnd,
    date: dateStart,
    title: row.title ?? '',
    owner: row.owner ?? '',
    pm: row.pm ?? '',
    note: row.note ?? '',
  }
}

export function calendarManualEventToPayload(event) {
  const dateStart = String(event?.dateStart ?? event?.date ?? '').slice(0, 10)
  const dateEnd = String(event?.dateEnd ?? event?.date ?? dateStart).slice(0, 10)
  return {
    dateStart: dateStart || null,
    dateEnd: dateEnd || dateStart || null,
    title: String(event?.title ?? '').trim(),
    owner: String(event?.owner ?? '').trim(),
    pm: String(event?.pm ?? '').trim(),
    note: String(event?.note ?? '').trim(),
  }
}

export const calendarEventsApi = {
  list() {
    return requestJson(CALENDAR_EVENTS_API_PATH)
  },

  create(payload) {
    return requestJson(CALENDAR_EVENTS_API_PATH, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  importRows(events) {
    return requestJson(`${CALENDAR_EVENTS_API_PATH}/import`, {
      method: 'POST',
      body: JSON.stringify({ events }),
    })
  },

  update(id, payload) {
    return requestJson(`${CALENDAR_EVENTS_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  remove(id) {
    return requestJson(`${CALENDAR_EVENTS_API_PATH}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
