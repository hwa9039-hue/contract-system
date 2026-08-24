/**
 * 상세 화면 무제한 다중 첨부.
 * - 프론트는 maxFiles / maxSize 검사를 두지 않는다. File[] 를 그대로 쌓는다.
 * - 제출 시 application/json 이 아니라 multipart/form-data (FormData) 로 보낸다.
 *
 * 백엔드(FastAPI) 운영 안내:
 * - UploadFile 은 read() 한 방이 아니라 shutil.copyfileobj 처럼 청크로 저장해야 메모리 폭주를 막는다.
 * - Nginx 앞단이면 client_max_body_size 를 키우거나 0(무제한)으로 두지 않으면 대용량·다건이 413 으로 끊긴다.
 */

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function formatAttachmentSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function normalizePersistedAttachments(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const id = safeString(item.id).trim()
      const name = safeString(item.name || item.filename || item.storedName).trim()
      if (!id || !name) return null
      const size = Number(item.size)
      return {
        id,
        name,
        size: Number.isFinite(size) && size >= 0 ? size : 0,
        persisted: true,
        file: null,
      }
    })
    .filter(Boolean)
}

export function mergeAttachmentLists(persistedRaw, localItems) {
  const persisted = normalizePersistedAttachments(persistedRaw)
  const local = Array.isArray(localItems) ? localItems.filter((item) => item && item.file instanceof File) : []
  return [...persisted, ...local]
}

export function getAttachmentCount(row) {
  if (Array.isArray(row?.attachmentItems)) return row.attachmentItems.length
  if (Array.isArray(row?.files)) return row.files.length
  return 0
}

export function addLocalAttachmentFiles(currentItems, fileList) {
  const current = Array.isArray(currentItems) ? currentItems : []
  const incoming = Array.from(fileList || []).filter((file) => file instanceof File)
  if (!incoming.length) return current
  const next = [...current]
  incoming.forEach((file) => {
    next.push({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: file.name,
      size: file.size,
      persisted: false,
      file,
    })
  })
  return next
}

export function removeAttachmentItem(currentItems, itemId) {
  const id = safeString(itemId).trim()
  return (Array.isArray(currentItems) ? currentItems : []).filter((item) => safeString(item?.id).trim() !== id)
}

export function attachmentsNeedSync(items, persistedRaw) {
  const list = Array.isArray(items) ? items : []
  if (list.some((item) => item?.file instanceof File)) return true
  const keep = list
    .filter((item) => item?.persisted && item.id)
    .map((item) => String(item.id))
    .sort()
  const prev = normalizePersistedAttachments(persistedRaw)
    .map((item) => String(item.id))
    .sort()
  if (keep.length !== prev.length) return true
  return keep.some((id, index) => id !== prev[index])
}

export function splitAttachmentsForUpload(items) {
  const list = Array.isArray(items) ? items : []
  return {
    keepFileIds: list.filter((item) => item?.persisted && item.id).map((item) => String(item.id)),
    files: list.map((item) => item?.file).filter((file) => file instanceof File),
  }
}

export function buildAttachmentsFormData(items) {
  const { keepFileIds, files } = splitAttachmentsForUpload(items)
  const form = new FormData()
  const payload = { keepFileIds }
  form.append('payload', JSON.stringify(payload))
  form.append('keepFileIds', JSON.stringify(keepFileIds))
  files.forEach((file) => {
    form.append('files', file, file.name)
  })
  return form
}
