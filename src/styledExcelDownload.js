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

/** 금액 계열 열: 숫자로 바꾸고 `#,##0` + 우측 정렬 */
const AMOUNT_HEADER_RE = /금액|단가|합계|가격|원가|매출|매입|공급가|부가세|수량|잔액|예산|비용|수수료|이익|총액/
/** 숫자형 ID 열: 숫자로 바꾸고 콤마 없는 `0` 서식, 정렬은 기존(가운데) 유지 */
const NUMERIC_ID_HEADER_RE = /식별번호|참고번호|문서번호|일련번호|순번|^번호$|^no\.?$|^id$/i
/** 값이 숫자처럼 보여도 문자 그대로 둬야 하는 열 (연락처·사업자번호·계좌 등) */
const PROTECTED_HEADER_RE = /전화|휴대폰|연락처|팩스|fax|사업자|법인번호|주민|계좌|우편/i
/** 1,234 / -1,234,567.89 처럼 천 단위 콤마가 들어간 숫자 */
const GROUPED_NUMBER_RE = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/
/** 앞자리 0이 없는 순수 숫자 (0으로 시작하는 코드·하이픈 들어간 번호는 걸러진다) */
const PLAIN_NUMBER_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/

/** 엑셀 열 너비 1 ≈ 7px (기본 글꼴), 행 높이는 pt(= px × 0.75) */
const PX_PER_COLUMN_WIDTH_UNIT = 7
const COLUMN_WIDTH_PADDING_PX = 5
const PT_PER_PX = 0.75
const EMU_PER_PX = 9525

function safeExcelText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function amountNumberFormat(number) {
  return Number.isInteger(number) ? '#,##0' : '#,##0.##'
}

/** 15자리를 넘는 정수는 엑셀에서 뒷자리가 0으로 깨지므로 숫자로 바꾸지 않는다. */
function isExcelSafeNumber(number) {
  return Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number))
}

/**
 * 셀 값이 숫자로 보이면 { value: Number, numFmt, horizontal? } 를, 아니면 null 을 돌려준다.
 * - 금액 열: 숫자·콤마 금액 모두 Number, `#,##0`, 우측 정렬
 * - 숫자형 ID 열(식별번호 등): 순수 숫자만 Number, `0`, 정렬은 그대로
 * - 그 밖의 열: 천 단위 콤마가 들어간 값만 금액처럼 처리
 * - 연락처·사업자번호 열, 하이픈 포함·앞자리 0 값은 문자 그대로 둔다.
 */
export function coerceExcelNumericCell(value, header) {
  const headerText = safeExcelText(header)
  if (PROTECTED_HEADER_RE.test(headerText)) return null
  const amountHeader = AMOUNT_HEADER_RE.test(headerText)
  const idHeader = !amountHeader && NUMERIC_ID_HEADER_RE.test(headerText)

  if (typeof value === 'number') {
    if (!isExcelSafeNumber(value)) return null
    if (amountHeader) return { value, numFmt: amountNumberFormat(value), horizontal: 'right' }
    if (idHeader && Number.isInteger(value)) return { value, numFmt: '0' }
    return null
  }
  if (typeof value !== 'string') return null
  let text = value.trim()
  if (!text) return null
  if (amountHeader) text = text.replace(/^₩\s*/, '').replace(/\s*원$/, '')

  if (GROUPED_NUMBER_RE.test(text)) {
    const number = Number(text.replace(/,/g, ''))
    if (!isExcelSafeNumber(number)) return null
    return { value: number, numFmt: amountNumberFormat(number), horizontal: 'right' }
  }
  if (!PLAIN_NUMBER_RE.test(text)) return null
  const number = Number(text)
  if (!isExcelSafeNumber(number)) return null
  if (amountHeader) return { value: number, numFmt: amountNumberFormat(number), horizontal: 'right' }
  if (idHeader && Number.isInteger(number)) return { value: number, numFmt: '0' }
  return null
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

/** 화면 컬럼 정의 앞쪽부터 연속으로 sticky 인 열 개수 (엑셀은 왼쪽 연속 구간만 고정할 수 있다). */
export function countLeadingStickyColumns(columns, isSticky = (column) => Boolean(column?.sticky)) {
  let count = 0
  for (const column of Array.isArray(columns) ? columns : []) {
    if (!isSticky(column)) break
    count += 1
  }
  return count
}

export function columnsFromExcelRowKeys(keys) {
  return (Array.isArray(keys) ? keys : []).map((key) => ({
    header: key,
    key,
    minWidth: inferExcelColumnMinWidth(key),
  }))
}

function sameExcelCellValue(a, b) {
  const normalize = (value) => (value === null || value === undefined ? '' : value)
  return normalize(a) === normalize(b)
}

/** 그룹 키가 같은 연속 데이터 행 묶음마다, 값이 전부 같은 병합 대상 열을 세로 병합한다. */
function mergeGroupedRowCells(worksheet, columnDefs, dataRowCount, rowGroupKeys, mergeColumnKeys) {
  if (!Array.isArray(rowGroupKeys) || !Array.isArray(mergeColumnKeys) || !mergeColumnKeys.length) return
  const columnNumbers = mergeColumnKeys
    .map((key) => columnDefs.findIndex((column) => column.key === key) + 1)
    .filter((columnNumber) => columnNumber > 0)
  if (!columnNumbers.length) return

  let start = 0
  while (start < dataRowCount) {
    const groupKey = safeExcelText(rowGroupKeys[start]).trim()
    let end = start
    while (
      groupKey &&
      end + 1 < dataRowCount &&
      safeExcelText(rowGroupKeys[end + 1]).trim() === groupKey
    ) {
      end += 1
    }
    if (end > start) {
      // 데이터 행 index 0 = 엑셀 2행 (1행은 헤더)
      const top = start + 2
      const bottom = end + 2
      for (const columnNumber of columnNumbers) {
        const masterValue = worksheet.getRow(top).getCell(columnNumber).value
        let allSame = true
        for (let rowNumber = top + 1; rowNumber <= bottom; rowNumber += 1) {
          if (!sameExcelCellValue(worksheet.getRow(rowNumber).getCell(columnNumber).value, masterValue)) {
            allSame = false
            break
          }
        }
        if (!allSame) continue
        worksheet.mergeCells(top, columnNumber, bottom, columnNumber)
        const master = worksheet.getRow(top).getCell(columnNumber)
        master.alignment = { ...master.alignment, vertical: 'middle' }
      }
    }
    start = end + 1
  }
}

/**
 * 값은 모든 행에 채워 둔 채(필터용), 바로 윗줄과 값이 같으면 글자를 흰색으로 숨겨 병합된 것처럼 보이게 한다.
 * 정렬 후에도 다시 계산되도록 조건부 서식으로 넣는다. groupColumnKeys 열들도 윗줄과 같을 때만 숨겨
 * 서로 다른 계약이 우연히 같은 값(같은 발주처 등)을 가져도 이어 붙어 보이지 않게 한다.
 */
function addHideRepeatedValueFormatting(worksheet, columnDefs, dataRowCount, hideColumnKeys, groupColumnKeys) {
  if (!Array.isArray(hideColumnKeys) || !hideColumnKeys.length || dataRowCount < 2) return
  const letterOf = (key) => {
    const columnNumber = columnDefs.findIndex((column) => column.key === key) + 1
    return columnNumber > 0 ? worksheet.getColumn(columnNumber).letter : ''
  }
  // 데이터 1행 = 엑셀 2행, 비교는 3행부터
  const firstRow = 3
  const lastRow = dataRowCount + 1
  const groupLetters = (Array.isArray(groupColumnKeys) ? groupColumnKeys : []).map(letterOf).filter(Boolean)
  const groupConditions = groupLetters.map((letter) => `$${letter}${firstRow}=$${letter}${firstRow - 1}`)

  for (const key of hideColumnKeys) {
    const letter = letterOf(key)
    if (!letter) continue
    const conditions = [
      `${letter}${firstRow}<>""`,
      `${letter}${firstRow}=${letter}${firstRow - 1}`,
      ...groupConditions,
    ]
    worksheet.addConditionalFormatting({
      ref: `${letter}${firstRow}:${letter}${lastRow}`,
      rules: [
        {
          type: 'expression',
          formulae: [`AND(${conditions.join(',')})`],
          style: { font: { color: { argb: 'FFFFFFFF' } } },
        },
      ],
    })
  }
}

/**
 * exceljs로 헤더 배경·굵은 글씨·테두리·가운데 정렬을 입힌 뒤 파일로 저장한다.
 * 행 데이터(매핑·마스킹 결과)는 호출 측에서 만든 값을 넣되, 숫자로 보이는 값은
 * Number 로 바꾸고 `#,##0` 서식을 입혀 엑셀에서 바로 합계를 낼 수 있게 한다.
 *
 * image 를 주면 image.key 열의 각 행 셀에 image.items[행 index] 사진을 넣고
 * 그 열 너비·데이터 행 높이를 사진 크기에 맞춰 늘린다.
 *
 * 열 정의의 numFmt 는 그 열의 숫자 셀 서식을, horizontal 은 그 열 데이터 셀의 가로 정렬을 덮어쓴다.
 *
 * 1행(헤더)은 항상 틀고정한다. freezeColumnCount 를 주면 왼쪽에서 그 개수만큼 열도 함께 고정한다
 * (화면 표의 좌측 sticky 열 개수를 넘긴다).
 *
 * rowGroupKeys(행마다 하나, 빈 값은 그룹 없음)와 mergeColumnKeys 를 주면
 * 그룹 키가 같은 연속 행에서 값이 모두 같은 열을 세로로 병합하고 세로 가운데 정렬한다.
 *
 * hideRepeatedColumnKeys 를 주면 병합 대신, 그 열 값이 바로 윗줄과 같을 때 글자를 흰색으로 숨긴다
 * (값은 그대로라 엑셀 필터가 모든 행에서 동작한다). hideRepeatGroupColumnKeys 열들도 윗줄과 같아야 숨긴다.
 *
 * @param {{
 *   sheetName: string,
 *   filename: string,
 *   columns: {
 *     header: string,
 *     key: string,
 *     minWidth?: number,
 *     numFmt?: string,
 *     horizontal?: 'left' | 'center' | 'right',
 *   }[],
 *   rows?: Record<string, unknown>[],
 *   rowGroupKeys?: string[],
 *   mergeColumnKeys?: string[],
 *   hideRepeatedColumnKeys?: string[],
 *   hideRepeatGroupColumnKeys?: string[],
 *   freezeColumnCount?: number,
 *   image?: {
 *     key: string,
 *     width: number,
 *     height: number,
 *     paddingPx?: number,
 *     items: ({ base64: string, extension: 'jpeg' | 'png' } | null)[],
 *   },
 * }} options
 */
export async function downloadStyledExcel({
  sheetName,
  filename,
  columns,
  rows,
  image,
  rowGroupKeys,
  mergeColumnKeys,
  hideRepeatedColumnKeys,
  hideRepeatGroupColumnKeys,
  freezeColumnCount = 0,
}) {
  const workbook = new ExcelJS.Workbook()
  const columnDefs = Array.isArray(columns) ? columns : []
  const xSplit = Math.min(columnDefs.length, Math.max(0, Math.floor(Number(freezeColumnCount) || 0)))
  const worksheet = workbook.addWorksheet(sheetName || 'Sheet1', {
    views: [{ state: 'frozen', xSplit, ySplit: 1 }],
  })
  const dataRows = Array.isArray(rows) ? rows : []
  const imageColumnIndex = image ? columnDefs.findIndex((column) => column.key === image.key) : -1
  const imagePaddingPx = Math.max(0, Number(image?.paddingPx ?? 8))
  const imageColumnPx = imageColumnIndex >= 0 ? image.width + imagePaddingPx * 2 : 0
  const imageRowPx = imageColumnIndex >= 0 ? image.height + imagePaddingPx * 2 : 0

  worksheet.columns = columnDefs.map((column, columnIndex) => ({
    header: column.header,
    key: column.key,
    width:
      columnIndex === imageColumnIndex
        ? Math.ceil((imageColumnPx - COLUMN_WIDTH_PADDING_PX) / PX_PER_COLUMN_WIDTH_UNIT)
        : resolveExcelColumnWidth(
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
    excelRow.height = rowNumber > 1 && imageRowPx ? imageRowPx * PT_PER_PX : 22
    for (let columnNumber = 1; columnNumber <= lastColumnNumber; columnNumber += 1) {
      const cell = excelRow.getCell(columnNumber)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = THIN_BORDER
      if (rowNumber > 1) {
        const columnDef = columnDefs[columnNumber - 1]
        const numeric = coerceExcelNumericCell(cell.value, columnDef?.header)
        if (numeric) {
          cell.value = numeric.value
          cell.numFmt = numeric.numFmt
          if (numeric.horizontal) {
            cell.alignment = { ...cell.alignment, horizontal: numeric.horizontal }
          }
        }
        if (columnDef?.numFmt && typeof cell.value === 'number') cell.numFmt = columnDef.numFmt
        if (columnDef?.horizontal) {
          cell.alignment = { ...cell.alignment, horizontal: columnDef.horizontal }
        }
      }
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

  mergeGroupedRowCells(worksheet, columnDefs, dataRows.length, rowGroupKeys, mergeColumnKeys)
  addHideRepeatedValueFormatting(
    worksheet,
    columnDefs,
    dataRows.length,
    hideRepeatedColumnKeys,
    hideRepeatGroupColumnKeys
  )

  if (imageColumnIndex >= 0) {
    const actualColumnPx =
      Math.floor(worksheet.getColumn(imageColumnIndex + 1).width * PX_PER_COLUMN_WIDTH_UNIT) +
      COLUMN_WIDTH_PADDING_PX
    const offsetXPx = Math.max(0, Math.round((actualColumnPx - image.width) / 2))
    const items = Array.isArray(image.items) ? image.items : []
    dataRows.forEach((_, rowIndex) => {
      const item = items[rowIndex]
      if (!item?.base64) return
      const imageId = workbook.addImage({ base64: item.base64, extension: item.extension || 'jpeg' })
      // exceljs 의 소수 col/row 앵커는 오프셋을 잘못 계산하므로 EMU 값을 직접 넣는다.
      worksheet.addImage(imageId, {
        tl: {
          nativeCol: imageColumnIndex,
          nativeColOff: offsetXPx * EMU_PER_PX,
          nativeRow: rowIndex + 1,
          nativeRowOff: imagePaddingPx * EMU_PER_PX,
        },
        ext: { width: image.width, height: image.height },
        editAs: 'oneCell',
      })
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
}
