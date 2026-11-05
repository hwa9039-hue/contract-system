const PIN_PROFILE_KEY = 'cms_pin_profile'
const PIN_PASSED_KEY = 'cms_pin_passed'
const PIN_SETUP_SKIPPED_KEY = 'cms_pin_setup_skipped'

export function readPinProfile() {
  try {
    const raw = window.localStorage.getItem(PIN_PROFILE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const accountId = String(data?.accountId || '').trim().toLowerCase()
    if (!accountId) return null
    return {
      accountId,
      displayName: String(data?.displayName || '').trim(),
      pinEnabled: Boolean(data?.pinEnabled),
    }
  } catch {
    return null
  }
}

export function writePinProfile(profile) {
  const accountId = String(profile?.accountId || '').trim().toLowerCase()
  if (!accountId) return
  window.localStorage.setItem(
    PIN_PROFILE_KEY,
    JSON.stringify({
      accountId,
      displayName: String(profile?.displayName || '').trim(),
      pinEnabled: Boolean(profile?.pinEnabled),
    }),
  )
}

export function clearPinProfile() {
  window.localStorage.removeItem(PIN_PROFILE_KEY)
}

export function markPinPassed() {
  window.sessionStorage.setItem(PIN_PASSED_KEY, '1')
}

export function hasPinPassed() {
  return window.sessionStorage.getItem(PIN_PASSED_KEY) === '1'
}

export function clearPinPassed() {
  window.sessionStorage.removeItem(PIN_PASSED_KEY)
}

export function skipPinSetup() {
  window.sessionStorage.setItem(PIN_SETUP_SKIPPED_KEY, '1')
}

export function hasSkippedPinSetup() {
  return window.sessionStorage.getItem(PIN_SETUP_SKIPPED_KEY) === '1'
}
