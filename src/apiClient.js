export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export const AUTH_TOKEN_KEY = 'cms_api_token'

export function getAuthHeaders() {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    // no-op
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    // no-op
  }
}
