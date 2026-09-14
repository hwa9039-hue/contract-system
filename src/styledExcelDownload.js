import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const HEADER_FILL_ARGB = 'FFEEEEEE'
const HEADER_FONT_ARGB = 'FF333333'
const BORDER_ARGB = 'FFBFBFBF'
const MAX_COLUMN_WIDTH = 60

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: BORDER_ARGB } },
  left: { style: 'thin', color: { argb: BORDER_ARGB } },
  bottom: { style: 'thin', color: { argb: BORDER_ARGB } },
  right: { style: 'thin', color: { argb: BORDER_ARGB } },
}

function safeExcelText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** 모든 메뉴 엑셀 파일명을 `메뉴명_YYYYMMDD.xlsx`로 맞춘다. */
export function buildStyledExcelFilename(menuLabel, date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${menuLabel}_${y}${m}${d}.xlsx`
}

/** 한글은 영문보다 넓게 잡혀서, 글자 수보다 약간 넓게 잰다. */
export function measureExcelDisplayWidth(value) {
  let width = 0
  for (const char of safeExcelText(value)) {
    width += char.charCodeAt(0) > 127 ? 2 : 1
  }
  return width
}

export function inferExcelColumnMinWidth(header) {
  const text = safeExcelText(header)
  if (/주소/.test(text)) return 40
  if (/휴대폰|전화/.test(text)) return 15
  if (/이메일|메일/.test(text)) return 22
  if (/세부내용|비고|특이사항|내용/.test(text)) return 24
  if (/연계/.test(text)) return 18
  if (/금액|단가/.test(text)) return 16
  if (/일자|날짜|시기|납기/.test(text)) return 14
  if (/번호/.test(text)) return 10
  return Math.max(10, Math.min(20, measureExcelDisplayWidth(text) + 3))
}

export function resolveExcelColumnWidth(header, values, minWidth) {
  const floor = minWidth ?? inferExcelColumnMinWidth(header)
  const longest = Math.max(
    measureExcelDisplayWidth(header),
    ...(Array.isArray(values) ? values : []).map(measureExcelDisplayWidth)
  )
  return Math.min(MAX_COLUMN_WIDTH, Math.max(floor, longest + 3))
}

export function columnsFromExcelRowKeys(keys) {
  return (Array.isArray(keys) ? keys : []).map((key) => ({
    header: key,
    key,
    minWidth: inferExcelColumnMinWidth(key),
  }))
}

/**
 * exceljs로 헤더 배경·굵은 글씨·테두리·가운데 정렬을 입힌 뒤 파일로 저장한다.
 * 행 데이터(매핑·마스킹 결과)는 호출 측에서 만든 값을 그대로 넣는다.
 *
 * @param {{
 *   sheetName: string,
 *   filename: string,
 *   columns: { header: string, key: string, minWidth?: number }[],
 *   rows?: Record<string, unknown>[],
 * }} options
 */
export async function downloadStyledExcel({ sheetName, filename, columns, rows }) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName || 'Sheet1')
  const columnDefs = Array.isArray(columns) ? columns : []
  const dataRows = Array.isArray(rows) ? rows : []

  worksheet.columns = columnDefs.map((column) => ({
    header: column.header,
    key: column.key,
    width: resolveExcelColumnWidth(
      column.header,
      dataRows.map((row) => row?.[column.key]),
      column.minWidth ?? inferExcelColumnMinWidth(column.header)
    ),
  }))

  dataRows.forEach((row) => {
    worksheet.addRow(row)
  })

  const lastRowNumber = Math.max(1, dataRows.length + 1)
  const lastColumnNumber = columnDefs.length

  for (let rowNumber = 1; rowNumber <= lastRowNumber; rowNumber += 1) {
    const excelRow = worksheet.getRow(rowNumber)
    excelRow.height = 22
    for (let columnNumber = 1; columnNumber <= lastColumnNumber; columnNumber += 1) {
      const cell = excelRow.getCell(columnNumber)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = THIN_BORDER
      if (rowNumber === 1) {
        cell.font = { bold: true, color: { argb: HEADER_FONT_ARGB } }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: HEADER_FILL_ARGB },
        }
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
}
