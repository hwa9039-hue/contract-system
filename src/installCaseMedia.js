/** 설치사례 hero 미디어(이미지·동영상) 공통 유틸 */

export const INSTALL_CASE_MEDIA_ACCEPT =
  'image/*,video/mp4,video/webm,video/ogg'

export const INSTALL_CASE_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const INSTALL_CASE_MAX_VIDEO_BYTES = 100 * 1024 * 1024

const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov)(\?|#|$)/i
const VIDEO_HERO_RE = /\/hero\.(mp4|webm|ogg)(\?|#|$)/i

export function isInstallCaseVideo(src) {
  const value = String(src || '').trim()
  if (!value) return false
  if (VIDEO_EXT_RE.test(value) || VIDEO_HERO_RE.test(value)) return true
  return false
}

export function isInstallCaseMediaFile(file) {
  if (!(file instanceof File)) return false
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/') || type.startsWith('video/')) return true
  const name = String(file.name || '').toLowerCase()
  return /\.(jpe?g|png|gif|webp|bmp|mp4|webm|ogg|mov)$/.test(name)
}

export function isInstallCaseVideoFile(file) {
  if (!(file instanceof File)) return false
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('video/')) return true
  const name = String(file.name || '').toLowerCase()
  return /\.(mp4|webm|ogg|mov)$/.test(name)
}

export function getInstallCaseMediaMaxBytes(file) {
  return isInstallCaseVideoFile(file)
    ? INSTALL_CASE_MAX_VIDEO_BYTES
    : INSTALL_CASE_MAX_IMAGE_BYTES
}

export function formatInstallCaseMediaMaxSize(file) {
  const mb = getInstallCaseMediaMaxBytes(file) / (1024 * 1024)
  return `${mb}MB`
}
