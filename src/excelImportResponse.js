/**
 * 대장·건축정보 등 POST /import 응답 정규화.
 * - 신규: { rows: [...], duplicateItems: [...] }
 * - 레거시: 배열만 (rows 로 간주)
 */
export function normalizeRegistryImportResponse(data) {
  if (Array.isArray(data)) return { rows: data, duplicateItems: [] }
  if (data && typeof data === 'object') {
    return {
      rows: Array.isArray(data.rows) ? data.rows : [],
      duplicateItems: Array.isArray(data.duplicateItems) ? data.duplicateItems : [],
    }
  }
  return { rows: [], duplicateItems: [] }
}

/**
 * @param {string} intro 첫 줄 요약
 * @param {unknown[]} duplicateItems 중복·제외 항목 표시 문자열
 * @param {{ maxList?: number }} [opts]
 */
export function buildExcelImportAlertBody(intro, duplicateItems, opts = {}) {
  const maxList = opts.maxList ?? 50
  const list = (Array.isArray(duplicateItems) ? duplicateItems : [])
    .map((t) => String(t == null ? '' : t).trim())
    .filter(Boolean)
  if (!list.length) return intro
  const lines = list.slice(0, maxList).map((t) => `- ${t}`)
  const more = list.length > maxList ? `\n… 외 ${list.length - maxList}건` : ''
  return `${intro}\n\n[중복 항목 리스트]\n${lines.join('\n')}${more}`
}
