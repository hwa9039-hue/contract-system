import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react'
import { ContractColumnHeaderFilter } from './ContractColumnHeaderFilter.jsx'
import {
  buildContractColumnFilterOptions,
  contractMatchesColumnFilters,
  contractMatchesSearch,
  filterContractRowsByActiveFilters,
  hasActiveContractColumnFilters,
} from './contractColumnFilter.js'
import {
  buildDiscoveryColumnFilterOptions,
  discoveryMatchesColumnFilters,
  filterDiscoveryRowsByActiveFilters,
  normalizeDiscoveryColumnFilterSelection,
} from './discoveryColumnFilter.js'
import {
  buildExcludedColumnFilterOptions,
  excludedMatchesColumnFilters,
  filterExcludedRowsByActiveFilters,
  normalizeExcludedColumnFilterSelection,
} from './excludedColumnFilter.js'
import {
  buildDocumentColumnFilterOptions,
  documentMatchesColumnFilters,
  filterDocumentRowsByActiveFilters,
  normalizeDocumentColumnFilterSelection,
} from './documentColumnFilter.js'
import {
  buildSalesColumnFilterOptions,
  filterSalesRowsByActiveFilters,
  normalizeSalesColumnFilterSelection,
  salesMatchesColumnFilters,
} from './salesColumnFilter.js'
import {
  buildContactsManageColumnFilterOptions,
  contactsManageMatchesColumnFilters,
  filterContactsManageRowsByActiveFilters,
  normalizeContactsManageColumnFilterSelection,
} from './contactsManageColumnFilter.js'
import * as XLSX from 'xlsx'
import './App.css'
import { contractsApi } from './contractsApi'
import { contactsManageApi } from './contactsManageApi.js'
import { documentRegisterApi } from './documentRegisterApi'
import { excludedProjectsApi } from './excludedProjectsApi'
import { buildExcelImportAlertBody } from './excelImportResponse.js'
import {
  DISCOVERY_API_PATHS,
  DISCOVERY_API_USE_MOCK,
  projectDiscoveryApi,
  saveStoredDiscoveryRows,
} from './projectDiscoveryApi'
import { salesRegisterApi } from './salesRegisterApi'
import { weeklyWorkReportsApi } from './weeklyWorkReportsApi'
import UnitPriceManagement from './pages/UnitPriceManagement.jsx'
import { decodeWorkReportWireText } from './workReportWire.js'
import {
  WORK_REPORT_MANAGER_OPTIONS,
  WorkReportExternalManagerMultiSelect,
  parseManagerMultiSelectValue,
  serializeManagerMultiSelectValue,
} from './workReportManagerMultiSelect.jsx'
import {
  RegistryImportanceBadge,
  RegistryImportanceDot,
  getImportanceStatusFromRow,
  getImportanceStyle,
  normalizeStatusForImportance,
  resolveRegistryImportanceStatus,
} from './registryImportance.jsx'
import { ImportanceLegend } from './ImportanceLegend.jsx'
import { EditableTextCell, isEditableTextColumn } from './EditableTextCell.jsx'
import {
  getTableAlignClass,
  getTableBodyAlignClass,
  getTableColumnLayoutClass,
  isLongTextTableColumn,
} from './tableColumnLayout.js'
import {
  TABLE_INLINE_EDITABLE_CELL_CLASS,
  TABLE_INLINE_INPUT_STANDARD_CLASS,
} from './tableInlineInputClass.js'
import { installCasesApi, resolveInstallCaseHeroImage } from './installCasesApi'
import {
  INSTALL_CASE_MEDIA_ACCEPT,
  formatInstallCaseMediaMaxSize,
  getInstallCaseMediaMaxBytes,
  isInstallCaseMediaFile,
  isInstallCaseVideo,
  isInstallCaseVideoFile,
} from './installCaseMedia'
import { materialsBoardApi, downloadMaterialsBoardBlobUrl } from './materialsBoardApi'
import {
  calendarEventsApi,
  calendarManualEventToPayload,
  normalizeCalendarManualEvent,
} from './calendarEventsApi'
import { API_BASE_URL, apiFetchInit, getAuthHeaders } from './apiClient.js'
import { useAuth } from './AuthContext.jsx'
import { CONTRACT_SHARED_WARNING_MS } from './authSession.js'
import {
  CONTRACT_EXCEL_HEADER_KEYWORDS,
  sheetToJsonWithSmartHeader,
  sheetToJsonWithDiscoveryDynamicHeader,
  DISCOVERY_EXCEL_FORMAT_ERROR,
  DISCOVERY_EXCEL_NO_DATA_ERROR,
} from './excelSheetUtils.js'
import {
  WorkReportMeetingMinutesSection,
  buildMeetingMinutesPdfMarkup,
  isMeetingMinutesDataEmpty,
  parseMeetingMinutesFromEntry,
  getDashboardMeetingMinutesDisplayRows,
} from './workReportMeetingMinutes.jsx'

const CONTRACT_COLUMNS = [
  { key: 'year', label: '사업년도', className: 'col-year', align: 'center', type: 'text', width: 112 },
  { key: 'refNo', label: '참고번호', className: 'col-ref', align: 'center', type: 'text', width: 110 },
  { key: 'client', label: '발주처', className: 'col-client', align: 'center', type: 'textarea', width: 150 },
  { key: 'department', label: '담당부서', className: 'col-dept', align: 'center', type: 'textarea', width: 130 },
  { key: 'contractMethod', label: '계약방식', className: 'col-method', align: 'center', type: 'text', width: 132 },
  { key: 'contractType', label: '계약분류', className: 'col-type', align: 'center', type: 'text', width: 122 },
  { key: 'identNo', label: '식별번호', className: 'col-ident-no', align: 'center', type: 'text', width: 250 },
  { key: 'contractDate', label: '계약일자', className: 'col-date', align: 'center', type: 'date', width: 128 },
  { key: 'dueDate', label: '준공일자', className: 'col-date', align: 'center', type: 'date', width: 128 },
  { key: 'projectName', label: '사업명', className: 'col-project', align: 'left', type: 'textarea', width: 360, widthGrow: true },
  { key: 'amount', label: '계약금액', className: 'col-amount', align: 'right', type: 'amount', width: 146 },
  { key: 'salesOwner', label: '영업담당자', className: 'col-owner', align: 'center', type: 'text', width: 136 },
  { key: 'pm', label: '현장 PM', className: 'col-pm', align: 'center', type: 'text', width: 124 },
  { key: 'note', label: '비고', className: 'col-note', align: 'left', type: 'textarea', width: 190, widthGrow: true },
]

const DOCUMENT_COLUMNS = [
  {
    key: 'docDate',
    label: '등록일',
    align: 'center',
    type: 'date',
    widthClass: 'documents-w-28',
    cellClass: 'documents-col-tight documents-w-28',
  },
  {
    key: 'docNo',
    label: '문서번호',
    align: 'center',
    type: 'text',
    widthClass: 'documents-w-p12',
    cellClass: 'documents-col-tight documents-w-p12',
  },
  {
    key: 'senderReceiver',
    label: '수신처 또는 발신처',
    align: 'center',
    type: 'textarea',
    widthClass: 'documents-w-p16',
    cellClass: 'documents-col-party documents-w-p16',
  },
  {
    key: 'title',
    label: '문서명 또는 제목',
    align: 'left',
    type: 'textarea',
    widthClass: 'documents-w-p30',
    cellClass: 'documents-col-title documents-w-p30',
  },
  {
    key: 'method',
    label: '접수 또는 발송형태',
    align: 'center',
    type: 'text',
    widthClass: 'documents-w-36',
    cellClass: 'documents-col-tight documents-w-36',
  },
  {
    key: 'writer',
    label: '수신자 또는 작성자',
    align: 'center',
    type: 'text',
    widthClass: 'documents-w-32',
    cellClass: 'documents-col-tight documents-w-32',
  },
  {
    key: 'note',
    label: '비고',
    align: 'center',
    type: 'text',
    widthClass: 'documents-w-28',
    headerClass: 'documents-note-header th-align-center',
    cellClass: 'documents-col-note documents-w-28',
  },
]

const CONTACTS_MANAGE_COLUMNS = [
  {
    key: 'category',
    label: '구분',
    align: 'center',
    type: 'text',
    widthClass: 'contacts-w-category',
    cellClass: 'contacts-col-tight contacts-w-category',
  },
  {
    key: 'business_content',
    label: '사업내용',
    align: 'left',
    type: 'textarea',
    widthClass: 'contacts-w-business',
    cellClass: 'contacts-modal-text-cell contacts-w-business',
    modalEditor: true,
  },
  {
    key: 'manager_name',
    label: '담당자',
    align: 'center',
    type: 'text',
    widthClass: 'contacts-w-manager',
    cellClass: 'contacts-col-tight contacts-w-manager',
  },
  {
    key: 'position',
    label: '직위',
    align: 'center',
    type: 'text',
    widthClass: 'contacts-w-position',
    cellClass: 'contacts-col-tight contacts-w-position',
  },
  {
    key: 'phone',
    label: '전화번호',
    align: 'center',
    type: 'text',
    widthClass: 'contacts-w-phone',
    cellClass: 'contacts-col-tight contacts-w-phone',
  },
  {
    key: 'email',
    label: '이메일',
    align: 'left',
    type: 'text',
    widthClass: 'contacts-w-email',
    cellClass: 'contacts-col-tight contacts-w-email',
  },
  {
    key: 'notes',
    label: '비고',
    align: 'left',
    type: 'textarea',
    widthClass: 'contacts-w-notes',
    cellClass: 'contacts-modal-text-cell contacts-w-notes',
    modalEditor: true,
  },
]

const SALES_STAGE_OPTIONS = [
  '대기',
  '대응중',
  '확인필요',
  '보류',
  '마감',
  '계약',
  '발주계획',
  '사전규격',
  '입찰공고',
]
const SALES_MANAGER_OPTIONS = ['전기웅', '유영무', '김성수', '이재승', '이용자', '박재범', '신상준']
const SALES_REGISTER_MANAGER_OPTIONS = ['전기웅', '유영무', '김성수', '이재승', '이용자', '박재범']
/** 영업관리대장: 연도 하위 접이 그룹(마감·계약) 표시명 */
const SALES_CONTRACT_CLOSED_GROUP_LABEL = '계약&마감'
const SALES_CONTRACT_CLOSED_STAGES = new Set(['마감', '계약'])

function normalizeSalesProjectStage(stage) {
  const trimmed = safeString(stage).trim()
  return trimmed === '완료' ? '마감' : trimmed
}

/** API·레거시 그룹명 → 화면 표시명 (마감된 건 / 완료된 건 등 강제 치환) */
function formatSalesContractClosedGroupLabel(label) {
  const text = safeString(label).trim()
  if (
    !text ||
    text === '마감된 건' ||
    text === '완료된 건' ||
    text === '계약&마감된 건' ||
    text === '마감' ||
    text === '완료'
  ) {
    return SALES_CONTRACT_CLOSED_GROUP_LABEL
  }
  return text
}
const DISCOVERY_CATEGORY_TONE_MAP = {
  '장기 사업': 'discovery-category-badge discovery-long',
  '단기 사업': 'discovery-category-badge discovery-short',
}

const SALES_COLUMNS = [
  {
    key: 'importance',
    label: '중요도',
    align: 'center',
    type: 'importance',
    statusKey: 'projectStage',
    width: 120,
  },
  { key: 'registerDate', label: '등록일', align: 'center', type: 'date', width: 108 },
  { key: 'client', label: '발주처', align: 'center', type: 'text', width: 170 },
  { key: 'projectName', label: '사업명', align: 'left', type: 'textarea', width: 340 },
  {
    key: 'projectAmount',
    label: '사업금액',
    align: 'right',
    type: 'amount',
    width: 150,
    headerClass: 'sales-amount-header',
    cellClass: 'sales-amount-cell',
  },
  { key: 'manager', label: '담당자', align: 'center', type: 'select', options: SALES_REGISTER_MANAGER_OPTIONS, width: 112 },
  { key: 'projectStage', label: '상태', align: 'center', type: 'select', options: SALES_STAGE_OPTIONS, width: 102 },
  {
    key: 'department',
    label: '담당부서',
    align: 'center',
    type: 'text',
    width: 380,
    cellClass: 'sales-department-cell',
  },
  {
    key: 'detail',
    label: '세부내용',
    align: 'left',
    type: 'textarea',
    width: 920,
    cellClass: 'sales-modal-text-cell sales-detail-cell',
  },
  { key: 'source', label: '출처', align: 'center', type: 'text', width: 140 },
]

const DISCOVERY_CATEGORY_OPTIONS = ['장기 사업', '단기 사업']
const DISCOVERY_SALES_TARGET_OPTIONS = SALES_MANAGER_OPTIONS
const DISCOVERY_COLUMNS = [
  {
    key: 'permitDate',
    label: '건축정보일자',
    align: 'center',
    type: 'date',
    widthClass: 'discovery-w-32',
    cellClass: 'discovery-col-tight discovery-w-32',
  },
  {
    key: 'checkStatus',
    label: '확인',
    align: 'center',
    type: 'text',
    widthClass: 'discovery-w-24',
    cellClass: 'discovery-col-tight discovery-w-24',
  },
  {
    key: 'salesTarget',
    label: '영업자',
    align: 'center',
    type: 'select',
    options: DISCOVERY_SALES_TARGET_OPTIONS,
    widthClass: 'discovery-w-24',
    cellClass: 'discovery-col-tight discovery-w-24',
  },
  {
    key: 'projectCategory',
    label: '사업구분',
    align: 'center',
    type: 'select',
    options: DISCOVERY_CATEGORY_OPTIONS,
    widthClass: 'discovery-w-24',
    cellClass: 'discovery-col-tight discovery-w-24',
  },
  {
    key: 'client',
    label: '발주처',
    align: 'center',
    type: 'text',
    widthClass: 'discovery-w-32',
    cellClass: 'discovery-col-tight discovery-w-32',
  },
  {
    key: 'projectName',
    label: '사업명',
    align: 'left',
    type: 'text',
    widthClass: 'discovery-w-p20',
    cellClass: 'discovery-col-project discovery-w-p20',
  },
  {
    key: 'projectAmount',
    label: '사업금액',
    align: 'right',
    type: 'amount',
    widthClass: 'discovery-w-40',
    headerClass: 'discovery-amount-header th-align-center',
    cellClass: 'discovery-col-amount discovery-w-40 discovery-amount-cell td-align-right',
  },
  {
    key: 'completionPeriod',
    label: '준공시기',
    align: 'center',
    type: 'text',
    widthClass: 'discovery-w-32',
    cellClass: 'discovery-col-tight discovery-w-32',
  },
  {
    key: 'manager',
    label: '담당자',
    align: 'center',
    type: 'text',
    widthClass: 'discovery-w-40',
    cellClass: 'discovery-col-manager discovery-w-40',
  },
  {
    key: 'note',
    label: '세부내용',
    align: 'left',
    type: 'textarea',
    widthClass: 'discovery-w-p30',
    cellClass: 'discovery-col-detail discovery-w-p30',
  },
]

const EXCLUDED_CATEGORY_OPTIONS = ['발주계획', '사전규격', '입찰공고', '정보공개']
const EXCLUDED_KEYWORD_OPTIONS = [
  '(N)안내전광판',
  '(N)기상전광판',
  '(N)교통정보전광판',
  '(N)융복합안내전광판',
  '(N)영상정보디스플레이장치',
  '전광판',
  '미디어',
  '파사드',
  '사이니지',
  'LED',
  '액정모니터',
  '디스플레이',
  '공사',
]
const EXCLUDED_WRITER_OPTIONS = ['이용자', '정화영', '이재승', '정주희', '신상준']
const EXCLUDED_CATEGORY_TONE_MAP = {
  발주계획: { background: '#fff1e8', color: '#c2410c', borderColor: '#fdba74' },
  사전규격: { background: '#eaf1ff', color: '#1f4fd1', borderColor: '#bfd0ff' },
  입찰공고: { background: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  정보공개: { background: '#f7fee7', color: '#4d7c0f', borderColor: '#d9f99d' },
}
const EXCLUDED_KEYWORD_TONE_MAP = {
  '(N)안내전광판': { background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' },
  '(N)기상전광판': { background: '#fff8db', color: '#a16207', borderColor: '#f6d56c' },
  '(N)교통정보전광판': { background: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  '(N)융복합안내전광판': { background: '#eaf1ff', color: '#1f4fd1', borderColor: '#bfd0ff' },
  '(N)영상정보디스플레이장치': { background: '#7f1d1d', color: '#ffffff', borderColor: '#7f1d1d' },
  전광판: { background: '#f3f4f6', color: '#4b5563', borderColor: '#d1d5db' },
  미디어: { background: '#374151', color: '#ffffff', borderColor: '#374151' },
  파사드: { background: '#ede0d4', color: '#7c2d12', borderColor: '#d6ccc2' },
  사이니지: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
  LED: { background: '#f3e8ff', color: '#7e22ce', borderColor: '#d8b4fe' },
  액정모니터: { background: '#e0e7ff', color: '#3730a3', borderColor: '#c7d2fe' },
  디스플레이: { background: '#ede0d4', color: '#7c2d12', borderColor: '#d6ccc2' },
  공사: { background: '#dbeafe', color: '#1d4ed8', borderColor: '#93c5fd' },
}
const EXCLUDED_WRITER_TONE_MAP = {
  이용자: { background: '#fff1e8', color: '#c2410c', borderColor: '#fdba74' },
  정화영: { background: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  이재승: { background: '#eaf1ff', color: '#1f4fd1', borderColor: '#bfd0ff' },
  정주희: { background: '#f3e8ff', color: '#7e22ce', borderColor: '#d8b4fe' },
  신상준: { background: '#dcfce7', color: '#166534', borderColor: '#86efac' },
}
const EXCLUDED_COLUMNS = [
  {
    key: 'importance',
    label: '중요도',
    align: 'center',
    type: 'importance',
    statusKey: 'category',
    widthClass: 'excluded-w-28',
    cellClass: 'excluded-col-tight excluded-w-28',
  },
  {
    key: 'writeDate',
    label: '등록일',
    align: 'center',
    type: 'date',
    widthClass: 'excluded-w-28',
    cellClass: 'excluded-col-tight excluded-w-28',
  },
  {
    key: 'category',
    label: '상태',
    align: 'center',
    type: 'select',
    options: EXCLUDED_CATEGORY_OPTIONS,
    widthClass: 'excluded-w-24',
    cellClass: 'excluded-col-tight excluded-w-24',
  },
  {
    key: 'writer',
    label: '작성자',
    align: 'center',
    type: 'text',
    widthClass: 'excluded-w-24',
    cellClass: 'excluded-col-tight excluded-w-24',
  },
  {
    key: 'projectName',
    label: '사업명',
    align: 'left',
    type: 'text',
    widthClass: 'excluded-w-p18',
    cellClass: 'excluded-col-project excluded-w-p18',
  },
  {
    key: 'client',
    label: '발주처',
    align: 'center',
    type: 'text',
    widthClass: 'excluded-w-32',
    cellClass: 'excluded-col-tight excluded-w-32',
  },
  {
    key: 'projectAmount',
    label: '사업금액',
    align: 'right',
    type: 'amount',
    widthClass: 'excluded-w-36',
    headerClass: 'excluded-amount-header th-align-center',
    cellClass: 'excluded-col-amount excluded-w-36 excluded-amount-cell td-align-right',
  },
  {
    key: 'exclusionReason',
    label: '제외 사유',
    align: 'left',
    type: 'textarea',
    widthClass: 'excluded-w-p38',
    cellClass: 'excluded-col-reason excluded-w-p38',
  },
]

const WORK_REPORT_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const WORK_REPORT_MAIN_CHECK_COUNT = 5
const WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX = 1
const WORK_REPORT_EXTERNAL_ROW_COUNT = 5
const WORK_REPORT_DI_ROW_COUNT = 4
const WORK_REPORT_ROAD_ROW_COUNT = 2
const WORK_REPORT_SUPPORT_ITEM_COUNT = 10
const WORK_REPORT_SUPPORT_NUMBER_GUIDE = Array.from(
  { length: WORK_REPORT_SUPPORT_ITEM_COUNT },
  (_, index) => String(index + 1)
)
const WORK_REPORT_EXTERNAL_USER_OPTIONS = WORK_REPORT_MANAGER_OPTIONS
const WORK_REPORT_SECTION_KEYS = {
  checklist: '주요확인사항',
  external: '외부일정',
  di: 'DI사업',
  road: '도로사업',
  supportProgress: '영업지원_진행업무',
  supportDone: '영업지원_완료업무',
  meetingMinutes: '회의록',
}

/** 주간업무보고서 PDF/인쇄 팝업 공통 스타일 */
const WORK_REPORT_PDF_PRINT_STYLES = `
  @page { size: A4 landscape; margin: 10mm; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    color: #1f2937;
    background: #ffffff;
    font-family: 'Pretendard', 'SUIT', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  .pdf-print-root {
    width: 100%;
    padding: 0;
  }
  .pdf-shell {
    width: 100%;
    max-width: 100%;
    border: 1px solid #d6dee8;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
  }
  .pdf-header {
    padding: 14px 18px;
    border-bottom: 1px solid #dbe4ee;
    background: #f8fafc;
  }
  .pdf-title {
    font-size: 20px;
    font-weight: 800;
    margin-bottom: 4px;
    color: #0f172a;
  }
  .pdf-meta {
    font-size: 12px;
    color: #475569;
  }
  .pdf-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    padding: 8px;
    align-items: stretch;
  }
  .pdf-day-card {
    min-width: 0;
    border: 1px solid #d8dee7;
    border-radius: 8px;
    background: #f9fbfd;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pdf-day-head {
    padding: 8px 10px;
    border-bottom: 1px solid #dbe4ee;
    background: #ffffff;
  }
  .pdf-day-weekday {
    font-size: 11px;
    font-weight: 800;
    color: #1d4f63;
    margin-bottom: 2px;
  }
  .pdf-day-date {
    font-size: 10px;
    color: #64748b;
  }
  .pdf-section {
    padding: 6px 8px;
    border-bottom: 1px solid #e5e7eb;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pdf-section:last-child {
    border-bottom: none;
  }
  .pdf-section-title {
    padding: 5px 8px;
    border-radius: 6px;
    background: #1f5f74 !important;
    color: #ffffff !important;
    font-size: 10px;
    font-weight: 800;
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .pdf-check-list {
    margin: 0;
    padding-left: 16px;
  }
  .pdf-check-list li {
    min-height: 16px;
    font-size: 9px;
    line-height: 1.45;
    word-break: keep-all;
    overflow-wrap: break-word;
  }
  .pdf-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .pdf-table th,
  .pdf-table td {
    border: 1px solid #dbe4ee;
    padding: 4px 5px;
    vertical-align: top;
    font-size: 8.5px;
    line-height: 1.4;
    word-break: keep-all;
    overflow-wrap: break-word;
    white-space: normal;
    hyphens: none;
  }
  .pdf-table th {
    background: #eef4ff !important;
    color: #1e3a5f !important;
    font-weight: 800;
  }
  .pdf-index {
    width: 10%;
    text-align: center;
  }
  .pdf-manager {
    width: 22%;
  }
  .pdf-destination {
    width: 20%;
  }
  .pdf-deadline {
    width: 14%;
    text-align: center;
  }
  .pdf-support-title {
    margin: 6px 0 4px;
    font-size: 9px;
    font-weight: 800;
    color: #1f5f74;
  }
  .report-shell {
    width: 100%;
    max-width: 100%;
    border: 1px solid #d6dee8;
    border-radius: 12px;
    overflow: hidden;
    background: #ffffff;
  }
  .weekly-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    padding: 8px;
  }
  .weekly-card {
    min-width: 0;
    border: 1px solid #d8dee7;
    border-radius: 8px;
    background: #f9fbfd;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .weekly-section-title {
    padding: 5px 8px;
    border-radius: 6px;
    background: #1f5f74 !important;
    color: #ffffff !important;
    font-size: 10px;
    font-weight: 800;
    margin-bottom: 6px;
  }
  .weekly-content,
  .weekly-check-list li {
    word-break: keep-all;
    overflow-wrap: break-word;
    font-size: 9px;
    line-height: 1.45;
  }
  @media print {
    html, body {
      width: 100%;
      height: auto;
      font-family: 'Pretendard', 'SUIT', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .pdf-print-root {
      padding: 0;
    }
    .pdf-shell,
    .report-shell {
      border: none;
      border-radius: 0;
      max-width: 100%;
    }
    .pdf-grid,
    .weekly-grid {
      gap: 4px;
      padding: 4px 0;
    }
    .pdf-day-card,
    .pdf-section,
    .weekly-card,
    .weekly-section,
    .pdf-meeting-minutes {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
  .pdf-meeting-minutes {
    margin: 10px 8px 8px;
    padding: 8px;
    border: 1px solid #dbe4ee;
    border-radius: 8px;
    background: #ffffff;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pdf-meeting-title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 800;
    color: #0f172a;
  }
  .pdf-meeting-info-table th[scope="row"] {
    width: 12%;
    text-align: center;
    background: #f8fafc !important;
    font-weight: 800;
  }
  .pdf-meeting-index {
    width: 6%;
    text-align: center;
  }
  .pdf-meeting-assignee {
    width: 14%;
    text-align: center;
  }
  .pdf-meeting-due {
    width: 14%;
    text-align: center;
  }
`

const WORK_REPORT_PDF_PRINT_FONT_LINK =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css'

const WORK_REPORT_PDF_PRINT_ONLOAD_SCRIPT = `
  (function () {
    function fitAndPrint() {
      var shell = document.querySelector('.pdf-shell');
      if (!shell) {
        window.print();
        return;
      }
      var pageWidthPx = Math.round((297 - 20) / 25.4 * 96);
      shell.style.transform = '';
      shell.style.zoom = '';
      shell.style.width = '100%';
      var naturalWidth = shell.scrollWidth;
      if (naturalWidth > pageWidthPx) {
        var scale = pageWidthPx / naturalWidth;
        if ('zoom' in shell.style) {
          shell.style.zoom = String(scale);
        } else {
          shell.style.transform = 'scale(' + scale + ')';
          shell.style.transformOrigin = 'top left';
          document.body.style.height = Math.ceil(shell.offsetHeight * scale) + 'px';
        }
      }
      window.setTimeout(function () { window.print(); }, 150);
    }
    function start() {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(fitAndPrint).catch(fitAndPrint);
      } else {
        fitAndPrint();
      }
    }
    if (document.readyState === 'complete') {
      start();
    } else {
      window.addEventListener('load', start);
    }
  })();
`

const CALENDAR_STORAGE_KEY = 'contract_manager_calendar_events_v4'
const CALENDAR_STORAGE_KEY_LEGACY_V3 = 'contract_manager_calendar_events_v3'
/** 달력 열 순서: 일요일(0) ~ 토요일(6) */
const CALENDAR_WEEKDAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 매년 반복되는 양력 법정 공휴일(월·일). 대체공휴일 등은 아래 LUNAR_AND_BRIDGE 목록에 포함 */
const KOREA_FIXED_LEGAL_HOLIDAY_MD = [
  [1, 1],
  [3, 1],
  [5, 5],
  [6, 6],
  [8, 15],
  [10, 3],
  [10, 9],
  [12, 25],
]

/**
 * 설·추석·석가탄신일 연휴 및 대체공휴일 등(ISO yyyy-mm-dd).
 * 연도별 공표가 바뀌면 행정안전부 달력에 맞춰 갱신하세요.
 */
const KOREA_LUNAR_AND_BRIDGE_HOLIDAY_ISO = [
  '2024-02-09',
  '2024-02-10',
  '2024-02-11',
  '2024-02-12',
  '2024-05-15',
  '2024-09-16',
  '2024-09-17',
  '2024-09-18',
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-03-03',
  '2025-05-06',
  '2025-10-05',
  '2025-10-06',
  '2025-10-07',
  '2025-10-08',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-03-02',
  '2026-05-24',
  '2026-05-25',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2027-02-05',
  '2027-02-06',
  '2027-02-07',
  '2027-02-08',
  '2027-02-09',
  '2027-05-03',
  '2027-09-14',
  '2027-09-15',
  '2027-09-16',
  '2028-01-26',
  '2028-01-27',
  '2028-01-28',
  '2028-05-16',
  '2028-10-01',
  '2028-10-02',
  '2028-10-03',
  '2029-02-12',
  '2029-02-13',
  '2029-02-14',
  '2029-05-21',
  '2029-09-21',
  '2029-09-22',
  '2029-09-23',
  '2030-02-02',
  '2030-02-03',
  '2030-02-04',
  '2030-05-09',
  '2030-09-10',
  '2030-09-11',
  '2030-09-12',
  '2031-02-22',
  '2031-02-23',
  '2031-02-24',
  '2031-05-28',
  '2031-09-29',
  '2031-09-30',
  '2031-10-01',
  '2032-02-10',
  '2032-02-11',
  '2032-02-12',
  '2032-05-16',
  '2032-09-17',
  '2032-09-18',
  '2032-09-19',
]

function buildKoreaPublicHolidaySet() {
  const s = new Set(KOREA_LUNAR_AND_BRIDGE_HOLIDAY_ISO)
  for (let y = 2018; y <= 2040; y += 1) {
    for (const [m, d] of KOREA_FIXED_LEGAL_HOLIDAY_MD) {
      s.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return s
}

const KOREA_PUBLIC_HOLIDAY_SET = buildKoreaPublicHolidaySet()

function isKoreanPublicHoliday(isoYmd) {
  return Boolean(isoYmd && KOREA_PUBLIC_HOLIDAY_SET.has(isoYmd))
}

function getCalendarEventTypeClassName(type) {
  if (type === 'contract') return 'selected-event-type--contract'
  if (type === 'due') return 'selected-event-type--due'
  return 'selected-event-type--manual'
}

function getCalendarEventPillTypeClass(type) {
  if (type === 'contract') return 'contract-event'
  if (type === 'due') return 'due-event'
  return 'manual-event'
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 기타 일정: 저장 행 → 정규화된 시작·종료(yyyy-mm-dd), 단일일은 동일 */
function normalizeManualEventRangeInPlace(event) {
  const ds0 = safeString(event?.dateStart ?? event?.date).trim()
  const de0 = safeString(event?.dateEnd ?? event?.date ?? event?.dateStart).trim() || ds0
  const pd = parseDateOnly(ds0)
  const pe = parseDateOnly(de0)
  if (!pd) return { dateStart: '', dateEnd: '', date: '' }
  let s = formatDateInput(pd)
  let e = formatDateInput(pe && !Number.isNaN(pe.getTime()) ? pe : pd)
  if (parseDateOnly(s) > parseDateOnly(e)) {
    const t = s
    s = e
    e = t
  }
  return { dateStart: s, dateEnd: e, date: s }
}

function formatCalendarManualRangeLabel(dateStart, dateEnd) {
  const { dateStart: ds, dateEnd: de } = normalizeManualEventRangeInPlace({
    dateStart: dateStart,
    dateEnd: dateEnd,
    date: dateStart,
  })
  if (!ds) return '-'
  if (de && de !== ds) return `${ds} ~ ${de}`
  return ds
}

function calendarItemOverlapsCalendarMonth(item, year, month) {
  const monthStart = formatDateInput(new Date(year, month - 1, 1))
  const monthEnd = formatDateInput(new Date(year, month, 0))
  let rangeStart
  let rangeEnd
  if (item.type === 'manual') {
    const r = normalizeManualEventRangeInPlace(item)
    rangeStart = r.dateStart
    rangeEnd = r.dateEnd
  } else {
    const d = safeString(item.date).trim()
    rangeStart = d
    rangeEnd = d
  }
  if (!rangeStart) return false
  return rangeStart <= monthEnd && rangeEnd >= monthStart
}

function isConsecutiveCalendarYmd(prevYmd, nextYmd) {
  const a = parseDateOnly(prevYmd)
  const b = parseDateOnly(nextYmd)
  if (!a || !b) return false
  const n = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  n.setDate(n.getDate() + 1)
  return formatDateInput(n) === nextYmd
}

function assignCalendarSpanLaneRows(segments) {
  if (!segments.length) return { placed: [], laneCount: 0 }
  const sorted = [...segments].sort((a, b) => {
    const wa = a.endCol - a.startCol
    const wb = b.endCol - b.startCol
    if (wb !== wa) return wb - wa
    return a.startCol - b.startCol
  })
  const laneRanges = []
  const placed = []
  for (const seg of sorted) {
    let lane = 0
    while (lane < 200) {
      if (!laneRanges[lane]) laneRanges[lane] = []
      const ranges = laneRanges[lane]
      const clash = ranges.some((r) => !(r.end < seg.startCol || r.start > seg.endCol))
      if (!clash) {
        ranges.push({ start: seg.startCol, end: seg.endCol })
        placed.push({ ...seg, lane })
        break
      }
      lane += 1
    }
  }
  return { placed, laneCount: laneRanges.length }
}

/** 주(7칸) 안에서 기타 일정 다중일 구간 → 스팬 바(그리드 열) */
function buildWeekManualSpanBarPlacements(weekDays, calendarItems) {
  const segments = []
  for (const item of calendarItems) {
    if (item.type !== 'manual') continue
    const { dateStart: ds, dateEnd: de } = normalizeManualEventRangeInPlace(item)
    if (!ds || !de || ds === de) continue
    let i = 0
    while (i < 7) {
      const d = weekDays[i]
      if (!d || d < ds || d > de) {
        i += 1
        continue
      }
      const startCol = i
      let endCol = i
      for (let j = i + 1; j < 7; j += 1) {
        const d2 = weekDays[j]
        if (!d2 || d2 < ds || d2 > de) break
        const dPrev = weekDays[j - 1]
        if (!dPrev || !isConsecutiveCalendarYmd(dPrev, d2)) break
        endCol = j
      }
      const startDay = weekDays[startCol]
      const endDay = weekDays[endCol]
      segments.push({
        item,
        startCol,
        endCol,
        isCapLeft: startDay === ds,
        isCapRight: endDay === de,
      })
      i = endCol + 1
    }
  }
  return assignCalendarSpanLaneRows(segments)
}

function loadManualEventsFromLocalStorage() {
  const tryParse = (raw) => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  const fromV4 = tryParse(localStorage.getItem(CALENDAR_STORAGE_KEY))
  if (fromV4) return fromV4.map((row) => ({ ...row, ...normalizeManualEventRangeInPlace(row) }))
  const fromV3 = tryParse(localStorage.getItem(CALENDAR_STORAGE_KEY_LEGACY_V3))
  if (fromV3) return fromV3.map((row) => ({ ...row, ...normalizeManualEventRangeInPlace(row) }))
  return []
}

function clearLocalCalendarManualEventsStorage() {
  try {
    localStorage.removeItem(CALENDAR_STORAGE_KEY)
    localStorage.removeItem(CALENDAR_STORAGE_KEY_LEGACY_V3)
  } catch {
    /* ignore */
  }
}

const INSTALL_CASE_FORM_DRAFT_STORAGE_KEY = 'contract_manager_install_case_form_draft_v1'
const INSTALL_CASE_FORM_DRAFT_DEBOUNCE_MS = 400
/** localStorage 용량 보호: data URL 초과 시 이미지는 제외하고 폼 필드만 저장 */
const INSTALL_CASE_FORM_DRAFT_MAX_IMAGE_LEN = 800_000

/** 계약 필터: 값이 비어 있으면 해당 축으로는 필터하지 않음(기존 "전체"와 동일). */
const ALL_OPTION = ''

/** 캘린더 우측「이 달의 일정」: Select 값·`item.category`·표시 라벨을 동일 한글로 통일 (`type`은 달력 pill/CSS용 contract|due|manual 유지) */
const CALENDAR_MONTH_LIST_CATEGORY = Object.freeze({
  ALL: '전체',
  CONTRACT: '계약',
  DUE: '준공',
  MANUAL: '기타',
})

function calendarMonthListEventPassesCategoryFilter(item, selectedCategory) {
  if (!item) return false
  if (selectedCategory === CALENDAR_MONTH_LIST_CATEGORY.ALL) return true
  return item.category === selectedCategory
}

const DASHBOARD_CATEGORY_ORDER = ['전광판', 'BIT', '도로사업', '유지보수']
const PAGE_TITLE_MAP = {
  dashboard: '대시보드',
  workReports: '주간업무보고서',
  meetingMinutes: '회의록',
  contracts: '계약현황',
  calendar: '캘린더',
  sales: '영업관리대장',
  discovery: '건축정보',
  excluded: '사업검색이력',
  documents: '문서수발신대장',
  contactsManage: '연락처',
  installCases: '설치사례',
  unitPrice: '단가관리',
  materialsBoard: '게시판',
}

const ADMIN_ONLY_MENU_KEYS = new Set(['contactsManage', 'unitPrice'])
const UNIT_PRICE_MENU_PATH = '/unit-price'
function isWorkReportRelatedMenu(menuKey) {
  return menuKey === 'workReports' || menuKey === 'meetingMinutes'
}

const ACTIVE_MENU_STORAGE_KEY = 'cms-active-menu'
const SIDEBAR_GROUPS_EXPANDED_KEY = 'cms-sidebar-groups-expanded'

const SIDEBAR_MENU_GROUPS = [
  {
    id: 'work',
    label: '업무관리',
    items: [
      { key: 'workReports', label: '주간업무보고서' },
      { key: 'meetingMinutes', label: '회의록' },
      { key: 'calendar', label: '캘린더' },
    ],
  },
  {
    id: 'sales',
    label: '영업관리',
    items: [
      { key: 'contracts', label: '계약현황' },
      { key: 'sales', label: '영업관리대장' },
      { key: 'discovery', label: '건축정보' },
      { key: 'excluded', label: '사업검색이력' },
      { key: 'documents', label: '문서수발신대장' },
      { key: 'contactsManage', label: '연락처' },
    ],
  },
]

const ALL_MENU_KEYS = [
  'dashboard',
  ...SIDEBAR_MENU_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
  'materialsBoard',
  'installCases',
  'unitPrice',
]

function resolveInitialMenu() {
  try {
    if (typeof window !== 'undefined' && window.location.pathname === UNIT_PRICE_MENU_PATH) {
      return 'unitPrice'
    }
  } catch {
    /* ignore */
  }
  return loadStoredMenu()
}

function getMenuGroupIdForMenu(menuKey) {
  for (const group of SIDEBAR_MENU_GROUPS) {
    if (group.items.some((item) => item.key === menuKey)) return group.id
  }
  return null
}

function loadStoredMenu() {
  try {
    const saved = localStorage.getItem(ACTIVE_MENU_STORAGE_KEY)
    if (saved && ALL_MENU_KEYS.includes(saved)) return saved
  } catch {
    /* ignore */
  }
  return 'dashboard'
}

function loadExpandedMenuGroups(menuKey) {
  const expanded = { work: true, sales: true }
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_EXPANDED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.work === 'boolean') expanded.work = parsed.work
      }
    }
  } catch {
    /* ignore */
  }
  const activeGroupId = getMenuGroupIdForMenu(menuKey)
  if (activeGroupId) expanded[activeGroupId] = true
  expanded.sales = true
  return expanded
}

function persistExpandedMenuGroups(groups) {
  try {
    localStorage.setItem(SIDEBAR_GROUPS_EXPANDED_KEY, JSON.stringify(groups))
  } catch {
    /* ignore */
  }
}

function compareMaterialsBoardPosts(a, b) {
  const dateCmp = safeString(b.registeredAt).localeCompare(safeString(a.registeredAt))
  if (dateCmp !== 0) return dateCmp
  return safeString(b.id).localeCompare(safeString(a.id))
}

const MATERIALS_BOARD_MOCK_SAVE_MS = 1000

function formatMaterialsBoardRegisteredAt(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const MATERIALS_BOARD_SEED = [
  {
    id: 'mb-5',
    title: '2025년 LED 전광판 견적 가이드',
    content: 'LED 전광판 견적 산출 시 참고할 수 있는 가이드 문서입니다.',
    files: [{ name: 'LED_견적_가이드_2025.pdf', size: 2457600 }],
    registeredAt: '2025-05-12',
  },
  {
    id: 'mb-4',
    title: '실내용 모듈 규격 비교표',
    content: '실내용 모듈 주요 제품군별 크기·Pitch 비교표입니다.',
    files: [{ name: '실내_모듈_규격비교.xlsx', size: 512000 }],
    registeredAt: '2025-05-08',
  },
  {
    id: 'mb-3',
    title: '현장 시공 체크리스트 (양식)',
    content: '현장 시공 전·중·후 점검 항목을 정리한 체크리스트 양식입니다.',
    files: [{ name: '시공_체크리스트_v3.hwp', size: 89000 }],
    registeredAt: '2025-04-22',
  },
  {
    id: 'mb-2',
    title: '유지보수 계약서 샘플',
    content: '유지보수 계약 시 사용할 수 있는 표준 계약서 샘플입니다.',
    files: [{ name: '유지보수_계약서_샘플.docx', size: 156000 }],
    registeredAt: '2025-04-10',
  },
  {
    id: 'mb-1',
    title: '프로젝트 도면·시방서 압축본',
    content: '프로젝트 관련 도면 및 시방서 파일 압축본입니다.',
    files: [{ name: 'OO시청_도면패키지.zip', size: 12582912 }],
    registeredAt: '2025-03-28',
  },
]

const MATERIALS_BOARD_FOLDER_ALL = '__all__'
const MATERIALS_BOARD_BUILTIN_FOLDERS = ['기타']
const MATERIALS_BOARD_RESERVED_FOLDER_NAMES = new Set([
  '전체',
  '기타',
  '공지사항',
  '영업자료',
  '기술문서',
])
const MATERIALS_BOARD_CUSTOM_FOLDERS_KEY = 'cms-materials-board-custom-folders'

function loadMaterialsBoardCustomFolders() {
  try {
    const raw = localStorage.getItem(MATERIALS_BOARD_CUSTOM_FOLDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => safeString(typeof item === 'string' ? item : item?.label).trim())
      .filter(Boolean)
      .filter((name) => !MATERIALS_BOARD_RESERVED_FOLDER_NAMES.has(name))
  } catch {
    return []
  }
}

function persistMaterialsBoardCustomFolders(names) {
  try {
    localStorage.setItem(MATERIALS_BOARD_CUSTOM_FOLDERS_KEY, JSON.stringify(names))
  } catch {
    /* ignore */
  }
}

function buildMaterialsBoardFolderNav(customFolders) {
  const custom = customFolders
    .map((name) => safeString(name).trim())
    .filter((name) => name && !MATERIALS_BOARD_BUILTIN_FOLDERS.includes(name))
  return [
    { id: MATERIALS_BOARD_FOLDER_ALL, label: '전체' },
    ...MATERIALS_BOARD_BUILTIN_FOLDERS.map((label) => ({ id: label, label })),
    ...custom.map((label) => ({ id: label, label })),
  ]
}

function getMaterialsBoardPostFolder(row) {
  // 서버/로컬 데이터에서 folder 키가 누락되고 folderId 로만 오는 케이스까지 수용
  const folder = safeString(row?.folder).trim()
  if (folder) return folder
  const folderId = safeString(row?.folderId).trim()
  if (folderId) return folderId
  return '기타'
}

function getMaterialsBoardAssignableFolders(customFolders) {
  const custom = customFolders
    .map((name) => safeString(name).trim())
    .filter((name) => name && !MATERIALS_BOARD_BUILTIN_FOLDERS.includes(name))
  return [...MATERIALS_BOARD_BUILTIN_FOLDERS, ...custom]
}

function isMaterialsBoardFolderNameTaken(name, customFolders, excludeName = '') {
  const trimmed = safeString(name).trim()
  const exclude = safeString(excludeName).trim()
  if (!trimmed || trimmed === '전체') return true
  if (trimmed !== exclude && MATERIALS_BOARD_BUILTIN_FOLDERS.includes(trimmed)) return true
  if (trimmed !== exclude && customFolders.includes(trimmed)) return true
  return false
}

function isMaterialsBoardCustomFolderId(folderId) {
  const id = safeString(folderId).trim()
  return id && id !== MATERIALS_BOARD_FOLDER_ALL && !MATERIALS_BOARD_BUILTIN_FOLDERS.includes(id)
}

function getDefaultMaterialsBoardForm() {
  return { title: '' }
}

function formatMaterialsBoardFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeMaterialsBoardPost(row) {
  const postId = safeString(row?.id).trim()
  const files = Array.isArray(row?.files)
    ? row.files
        .map((f) => ({
          id: safeString(f?.id).trim(),
          name: safeString(f?.name).trim(),
          size: Number(f?.size) || 0,
        }))
        .filter((f) => f.name)
    : safeString(row?.fileName).trim()
      ? [{ id: '', name: safeString(row.fileName).trim(), size: 0 }]
      : []
  const downloadUrls = files
    .filter((f) => f.id && postId)
    .map((f) => ({
      name: f.name,
      postId,
      fileId: f.id,
    }))
  return {
    id: postId || `mb-${Date.now()}`,
    title: safeString(row?.title).trim(),
    content: safeString(row?.content).trim(),
    files,
    fileName: files.map((f) => f.name).join(', '),
    downloadUrls,
    downloadCount: Number(row?.downloadCount) || 0,
    registeredAt: safeString(row?.registeredAt).trim() || formatMaterialsBoardRegisteredAt(),
    folder: getMaterialsBoardPostFolder(row),
  }
}

function createMaterialsBoardPendingFileEntry(file) {
  return {
    id: `mbf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
  }
}

function filesMetaFromPendingEntries(entries) {
  return (entries || [])
    .map((entry) => ({
      name: safeString(entry?.file?.name).trim(),
      size: Number(entry?.file?.size) || 0,
    }))
    .filter((f) => f.name)
}

function buildMaterialsBoardDownloadUrls(entries) {
  return (entries || [])
    .map((entry) => {
      const name = safeString(entry?.file?.name).trim()
      if (!name || !entry?.file) return null
      return { name, url: URL.createObjectURL(entry.file) }
    })
    .filter(Boolean)
}

function revokeMaterialsBoardPostUrls(row) {
  const urls = Array.isArray(row?.downloadUrls) ? row.downloadUrls : []
  urls.forEach((item) => {
    const url = safeString(item?.url).trim()
    if (url) URL.revokeObjectURL(url)
  })
  const legacy = safeString(row?.downloadUrl).trim()
  if (legacy) URL.revokeObjectURL(legacy)
}

function getMaterialsBoardAttachSummary(row) {
  const files = Array.isArray(row?.files) ? row.files : []
  if (files.length === 0) return null
  return {
    count: files.length,
    title: files.map((f) => f.name).join(', '),
  }
}

function getMaterialsBoardDownloadTargets(row) {
  const postId = safeString(row?.id).trim()
  const urls = Array.isArray(row?.downloadUrls) ? row.downloadUrls : []
  if (urls.length > 0) {
    return urls
      .map((item) => ({
        postId: safeString(item?.postId || postId).trim(),
        fileId: safeString(item?.fileId).trim(),
        fileName: safeString(item?.name).trim(),
        url: safeString(item?.url).trim(),
      }))
      .filter((t) => t.fileName && (t.url || (t.postId && t.fileId)))
  }
  const files = Array.isArray(row?.files) ? row.files : []
  return files
    .map((f) => ({
      postId,
      fileId: safeString(f?.id).trim(),
      fileName: safeString(f?.name).trim(),
      url: '',
    }))
    .filter((t) => t.fileName && t.postId && t.fileId)
}

function delayMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function MaterialBoardMultiFileDropzone({
  inputId,
  pendingFiles = [],
  onAddFiles,
  onRemoveFile,
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const fileEntries = Array.isArray(pendingFiles) ? pendingFiles : []

  const addFromList = (fileList) => {
    if (!fileList?.length || typeof onAddFiles !== 'function') return
    const entries = Array.from(fileList).map((file) => createMaterialsBoardPendingFileEntry(file))
    onAddFiles(entries)
  }

  return (
    <div className="materials-board-multi-upload">
      <div
        className={`install-case-dropzone materials-board-multi-dropzone${
          dragOver ? ' install-case-dropzone--active' : ''
        }`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
          addFromList(e.dataTransfer?.files)
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          className="install-case-dropzone-input"
          type="file"
          multiple
          aria-label="첨부 파일 다중 선택"
          onChange={(e) => {
            addFromList(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="install-case-dropzone-placeholder">
          <span className="install-case-dropzone-icon" aria-hidden>
            ⬆
          </span>
          <span className="install-case-dropzone-hint">
            클릭하거나 파일을 드래그하여 업로드하세요
          </span>
        </div>
      </div>

      {fileEntries.length > 0 && (
        <ul className="materials-board-file-list" aria-label="선택된 첨부 파일">
          {fileEntries.map((entry) => {
            const file = entry?.file
            if (!file?.name) return null
            return (
              <li key={entry.id || file.name} className="materials-board-file-list-item">
                <span className="materials-board-file-list-name" title={file.name}>
                  📎 {file.name}
                </span>
                <span className="materials-board-file-list-size">
                  {formatMaterialsBoardFileSize(file.size)}
                </span>
                <button
                  type="button"
                  className="materials-board-file-list-remove"
                  aria-label={`${file.name} 제거`}
                  onClick={() => {
                    if (typeof onRemoveFile === 'function' && entry?.id) onRemoveFile(entry.id)
                  }}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** 설치사례 상세 모달 규격표 행 순서 */
const INSTALL_CASE_SPEC_ROWS = [
  { key: 'displayArea', label: '표출부 사이즈' },
  { key: 'moduleSize', label: 'MODULE 크기 1' },
  { key: 'moduleSize2', label: 'MODULE 크기 2' },
  { key: 'moduleQty', label: 'MODULE 수량 1' },
  { key: 'moduleQty2', label: 'MODULE 수량 2' },
  { key: 'resolution', label: '해상도' },
  { key: 'ledPitch', label: 'LED Pitch' },
  { key: 'installType', label: '설치유형' },
]

/** 설치사례 등록/수정: 우측 제품 규격 필드 */
const INSTALL_CASE_REGISTER_SPEC_FIELDS = [
  { type: 'wh', pairId: 'displayArea', label: '표출부 사이즈', preview: 'whMm' },
  { type: 'wh', pairId: 'moduleSize', label: 'MODULE 크기 1', preview: 'whMm' },
  { type: 'wh', pairId: 'moduleSize2', label: 'MODULE 크기 2', preview: 'whMm' },
  { type: 'wh', pairId: 'moduleQty', label: 'MODULE 수량 1', preview: 'moduleQty' },
  { type: 'wh', pairId: 'moduleQty2', label: 'MODULE 수량 2', preview: 'moduleQty' },
  { type: 'wh', pairId: 'resolution', label: '해상도', preview: 'resolution' },
  { type: 'ledPitch', label: 'LED Pitch' },
  {
    type: 'text',
    key: 'installType',
    label: '설치유형',
    placeholder: '예: 벽면 부착형',
  },
]

/** 설치사례 대분류 */
const INSTALL_CASE_MAJOR_CATEGORY_OPTIONS = [
  { value: '옥외전광판', label: '옥외전광판' },
  { value: '옥내전광판', label: '옥내전광판' },
]

/** 설치사례 중분류 */
const INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS = [
  { value: '체육시설', label: '체육시설' },
  { value: '미디어보드', label: '미디어보드' },
  { value: '미디어파사드', label: '미디어파사드' },
  { value: '미디어 폴', label: '미디어 폴' },
  { value: '재난·재해·환경안내', label: '재난·재해·환경안내' },
  { value: '전자게시대', label: '전자게시대' },
  { value: '응용디스플레이', label: '응용디스플레이' },
  { value: '교통정보전광판', label: '교통정보전광판' },
  { value: '해외비즈니스', label: '해외비즈니스' },
]

/** 설치사례 소분류(구 발주처 구분) */
const INSTALL_CASE_MINOR_CATEGORY_OPTIONS = [
  { value: '공공기관', label: '공공기관' },
  { value: '교육기관', label: '교육기관' },
  { value: '문화·전시·컨벤션', label: '문화·전시·컨벤션' },
  { value: '관광·레저', label: '관광·레저' },
  { value: '상업·유통', label: '상업·유통' },
  { value: '교통', label: '교통' },
  { value: '의료기관', label: '의료기관' },
  { value: '운동장', label: '운동장' },
  { value: '축구장', label: '축구장' },
  { value: '야구장', label: '야구장' },
  { value: '수영장', label: '수영장' },
  { value: '빙상장', label: '빙상장' },
  { value: '체육관', label: '체육관' },
  { value: '기타', label: '기타' },
]

const INSTALL_CASE_LEGACY_MAJOR_CATEGORY = {
  indoor: '옥내전광판',
  outdoor: '옥외전광판',
}

const INSTALL_CASE_LEGACY_MINOR_CATEGORY = {
  public: '공공기관',
  education: '교육기관',
  culture: '문화·전시·컨벤션',
  private: '기타',
}

function withInstallCaseSelectPlaceholder(options, placeholder) {
  return [{ value: '', label: placeholder }, ...options]
}

function migrateInstallCaseMajorCategory(raw) {
  const v = safeString(raw).trim()
  if (!v) return ''
  if (INSTALL_CASE_LEGACY_MAJOR_CATEGORY[v]) return INSTALL_CASE_LEGACY_MAJOR_CATEGORY[v]
  if (INSTALL_CASE_MAJOR_CATEGORY_OPTIONS.some((o) => o.value === v)) return v
  if (INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS.some((o) => o.value === v)) return ''
  return v
}

function migrateInstallCaseMiddleCategory(middleRaw, environmentRaw) {
  const mid = safeString(middleRaw).trim()
  if (mid && INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS.some((o) => o.value === mid)) return mid
  const env = safeString(environmentRaw).trim()
  if (env && INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS.some((o) => o.value === env)) return env
  return mid
}

function migrateInstallCaseMinorCategory(raw) {
  const v = safeString(raw).trim()
  if (!v) return ''
  if (INSTALL_CASE_LEGACY_MINOR_CATEGORY[v]) return INSTALL_CASE_LEGACY_MINOR_CATEGORY[v]
  if (INSTALL_CASE_MINOR_CATEGORY_OPTIONS.some((o) => o.value === v)) return v
  return v
}

function getInstallCaseCategoryLabel(options, value, legacyMap = {}) {
  const v = safeString(value).trim()
  if (!v) return '-'
  const hit = options.find((o) => o.value === v)
  if (hit) return hit.label
  if (legacyMap[v]) return legacyMap[v]
  return v
}

/** 설치사례 등록/수정: 좌측 기본 필드 */
const INSTALL_CASE_REGISTER_BASIC_ROWS = [
  {
    type: 'text',
    key: 'projectName',
    label: '사업명',
    required: true,
    placeholder: '예: 00시청 LED 전광판 구축(계약서 명칭과 동일하게 작성 필요)',
  },
  {
    type: 'select',
    key: 'environment',
    label: '대분류',
    options: withInstallCaseSelectPlaceholder(INSTALL_CASE_MAJOR_CATEGORY_OPTIONS, '대분류'),
  },
  {
    type: 'select',
    key: 'middleCategory',
    label: '중분류',
    options: withInstallCaseSelectPlaceholder(INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS, '중분류'),
  },
  {
    type: 'select',
    key: 'audience',
    label: '소분류',
    options: withInstallCaseSelectPlaceholder(INSTALL_CASE_MINOR_CATEGORY_OPTIONS, '소분류'),
  },
  {
    type: 'businessYear',
    key: 'businessYearDigits',
    label: '사업년도',
    placeholder: '예: 0000.00',
  },
  { type: 'text', key: 'purpose', label: '용도', required: true, placeholder: '예: 홍보·안내' },
  {
    type: 'text',
    key: 'client',
    label: '발주처',
    required: true,
    placeholder: '예: 00시(계약서 명칭과 동일하게 작성 필요)',
  },
]

const CONTRACT_FIELD_PLACEHOLDERS = {}

const REGISTRY_FIELD_PLACEHOLDERS = {
  sales: {},
  discovery: {},
  excluded: {},
  documents: {},
}

function getRegistryFieldPlaceholder() {
  return ''
}

const INSTALL_CASE_FALLBACK_HERO = 'https://picsum.photos/seed/newinstallh/960/720'

function normalizeInstallCaseRow(row) {
  const specs = row?.specs && typeof row.specs === 'object' ? row.specs : {}
  const id = safeString(row?.id).trim() || `local-${Date.now()}`
  return {
    id,
    projectName: safeString(row?.projectName).trim() || '-',
    heroImage: resolveInstallCaseHeroImage(safeString(row?.heroImage).trim()) || INSTALL_CASE_FALLBACK_HERO,
    environment: migrateInstallCaseMajorCategory(row?.environment),
    middleCategory: migrateInstallCaseMiddleCategory(row?.middleCategory, row?.environment),
    audience: migrateInstallCaseMinorCategory(row?.audience),
    year: safeString(row?.year).trim() || '-',
    purpose: safeString(row?.purpose).trim() || '-',
    client: safeString(row?.client).trim() || '-',
    specs: {
      displayArea: safeString(specs.displayArea).trim() || '-',
      ledPitch: safeString(specs.ledPitch).trim() || '-',
      moduleSize: safeString(specs.moduleSize).trim() || '-',
      moduleSize2: safeString(specs.moduleSize2).trim() || '-',
      moduleQty: safeString(specs.moduleQty).trim() || '-',
      moduleQty2: safeString(specs.moduleQty2).trim() || '-',
      resolution: safeString(specs.resolution).trim() || '-',
      installType: safeString(specs.installType).trim() || '-',
    },
  }
}

/** 등록 폼 payload → 갤러리 카드용 행 (모킹·실API 공통) */
function buildInstallCaseRowFromPayload(rowPayload, idOverride = null) {
  return normalizeInstallCaseRow({
    ...rowPayload,
    id: idOverride || rowPayload?.id || `local-${Date.now()}`,
  })
}

function getInstallCaseProjectTitle(row) {
  return safeString(row?.projectName).trim() || '-'
}

function getInstallCaseEnvironmentLabel(env) {
  return getInstallCaseCategoryLabel(
    INSTALL_CASE_MAJOR_CATEGORY_OPTIONS,
    env,
    INSTALL_CASE_LEGACY_MAJOR_CATEGORY
  )
}

function getInstallCaseMiddleCategoryLabel(middle) {
  return getInstallCaseCategoryLabel(INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS, middle)
}

function getInstallCaseAudienceLabel(audience) {
  return getInstallCaseCategoryLabel(
    INSTALL_CASE_MINOR_CATEGORY_OPTIONS,
    audience,
    INSTALL_CASE_LEGACY_MINOR_CATEGORY
  )
}

function formatInstallCaseLedPitchDisplay(pitch) {
  const s = safeString(pitch).trim()
  if (!s) return '-'
  const mm = s.match(/^P\.?\s*([\d.]+)\s*mm$/i)
  if (mm) return `P${mm[1]}mm`
  const m = s.match(/^P\.?\s*(\d+(?:\.\d+)?)$/i)
  if (m) return `P${m[1]}mm`
  return s
}

function commaNumberEn(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return Math.round(v).toLocaleString('en-US')
}

function parseWhMmNumbers(formatted) {
  const s = safeString(formatted).trim()
  if (!s) return null
  let m = s.match(/\(?W\)?\s*([\d,]+)\s*[x×]\s*\(?H\)?\s*([\d,]+)\s*mm/i)
  if (m) {
    return {
      w: parseInt(m[1].replace(/,/g, ''), 10) || 0,
      h: parseInt(m[2].replace(/,/g, ''), 10) || 0,
    }
  }
  m = s.match(/([\d,]+)\s*\(\s*W\s*\)\s*[×x]\s*([\d,]+)\s*\(\s*H\s*\)/i)
  if (m) {
    return {
      w: parseInt(m[1].replace(/,/g, ''), 10) || 0,
      h: parseInt(m[2].replace(/,/g, ''), 10) || 0,
    }
  }
  m = s.match(/([0-9.]+)\s*m\s*[×x]\s*([0-9.]+)\s*m/i)
  if (m) {
    return {
      w: Math.round(parseFloat(m[1]) * 1000) || 0,
      h: Math.round(parseFloat(m[2]) * 1000) || 0,
    }
  }
  m = s.match(/([\d,]+)\s*mm\s*[×x]\s*([\d,]+)\s*mm/i)
  if (m) {
    return {
      w: parseInt(m[1].replace(/,/g, ''), 10) || 0,
      h: parseInt(m[2].replace(/,/g, ''), 10) || 0,
    }
  }
  return null
}

function formatInstallCaseModuleQtyLine(wRaw, hRaw) {
  const wStr = safeString(wRaw).replace(/\D/g, '')
  const hStr = safeString(hRaw).replace(/\D/g, '')
  if (!wStr && !hStr) return ''
  const w = parseInt(wStr, 10) || 0
  const h = parseInt(hStr, 10) || 0
  const ea = w * h
  return `(W)${commaNumberEn(w)} x (H)${commaNumberEn(h)} = ${commaNumberEn(ea)}EA`
}

/** 표출부 / MODULE 크기: 가로·세로 숫자 → 저장용 mm 문자열 */
function formatInstallCaseWhMmFromWH(wRaw, hRaw) {
  const w = parseInt(safeString(wRaw).replace(/\D/g, ''), 10) || 0
  const h = parseInt(safeString(hRaw).replace(/\D/g, ''), 10) || 0
  if (!w && !h) return ''
  return `(W)${commaNumberEn(w)} x (H)${commaNumberEn(h)}mm`
}

/** 해상도: 가로·세로 숫자 → (W) x (H) (픽셀 등) */
function formatInstallCaseResolutionFromWH(wRaw, hRaw) {
  const w = parseInt(safeString(wRaw).replace(/\D/g, ''), 10) || 0
  const h = parseInt(safeString(hRaw).replace(/\D/g, ''), 10) || 0
  if (!w && !h) return ''
  return `(W)${commaNumberEn(w)} x (H)${commaNumberEn(h)}`
}

function formatInstallCaseWhMmDetailDisplay(raw) {
  const t = safeString(raw).trim()
  if (!t || t === '-') return '-'
  const pair = parseWhMmNumbers(t)
  if (pair) {
    return formatInstallCaseWhMmFromWH(pair.w, pair.h) || t
  }
  return t
}

function formatInstallCaseModuleQtyDetailDisplay(raw) {
  const t = safeString(raw).trim()
  if (!t || t === '-') return '-'
  const pair = parseModuleQtyToWH(t)
  if (pair.w || pair.h) {
    return formatInstallCaseModuleQtyLine(pair.w, pair.h) || t
  }
  return t
}

function formatInstallCaseSpecDetailDisplay(key, raw) {
  const v = safeString(raw).trim()
  if (!v || v === '-') return '-'
  switch (key) {
    case 'displayArea':
      return formatInstallCaseWhMmDetailDisplay(v)
    case 'moduleQty':
    case 'moduleQty2':
      return formatInstallCaseModuleQtyDetailDisplay(v)
    case 'resolution':
      return formatInstallCaseResolutionDetailDisplay(v)
    case 'ledPitch':
      return formatInstallCaseLedPitchDisplay(v)
    default:
      return v
  }
}

function parseResolutionStoredToWH(s) {
  const t = safeString(s).trim()
  let m = t.match(/\(?W\)?\s*([\d,]+)\s*[x×]\s*\(?H\)?\s*([\d,]+)/i)
  if (m) {
    return { w: m[1].replace(/\D/g, ''), h: m[2].replace(/\D/g, '') }
  }
  m = t.match(/^([\d,]+)\s*[×x]\s*([\d,]+)$/)
  if (m) {
    return { w: m[1].replace(/\D/g, ''), h: m[2].replace(/\D/g, '') }
  }
  return { w: '', h: '' }
}

/** 상세 모달 제품 규격: 해상도를 (W)… x (H)… 형태로 표시 */
function formatInstallCaseResolutionDetailDisplay(raw) {
  const t = safeString(raw).trim()
  if (!t) return '-'
  const pair = parseResolutionStoredToWH(t)
  if (pair.w !== '' || pair.h !== '') {
    return formatInstallCaseResolutionFromWH(pair.w, pair.h) || '-'
  }
  return t
}

function installCaseLedPitchToFormValue(stored) {
  const s = safeString(stored).trim()
  if (!s) return ''
  const m = s.match(/^P\.?\s*([\d.]+)\s*mm$/i) || s.match(/^P\.?\s*([\d.]+)$/i)
  return m ? `P${m[1]}mm` : ''
}

function parseModuleQtyToWH(formatted) {
  const s = safeString(formatted).trim()
  const m = s.match(/\(?W\)?\s*([\d,]+)\s*[x×]\s*\(?H\)?\s*([\d,]+)\s*=/i)
  if (m) {
    return {
      w: m[1].replace(/\D/g, ''),
      h: m[2].replace(/\D/g, ''),
    }
  }
  return { w: '', h: '' }
}

function formatBusinessYearPreview(digits) {
  const d = safeString(digits).replace(/\D/g, '').slice(0, 6)
  if (!d) return ''
  if (d.length >= 6) {
    const mm = String(Math.min(12, Math.max(1, parseInt(d.slice(4, 6), 10) || 1))).padStart(2, '0')
    return `${d.slice(0, 4)}.${mm}`
  }
  if (d.length === 4) return `${d}.01`
  return `${d}…`
}

function businessYearDigitsToStored(digits) {
  const d = safeString(digits).replace(/\D/g, '').slice(0, 6)
  if (d.length >= 6) {
    const y = d.slice(0, 4)
    const m = Math.min(12, Math.max(1, parseInt(d.slice(4, 6), 10) || 1))
    return `${y}.${String(m).padStart(2, '0')}`
  }
  if (d.length === 4) return `${d}.01`
  const now = new Date()
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** 사업년도 입력: 숫자만 허용, 최대 6자리(YYYYMM) */
function parseBusinessYearInputDigits(raw) {
  return safeString(raw).replace(/\D/g, '').slice(0, 6)
}

/** 사업년도 입력 표시: 202509 → 2025.09 */
function formatBusinessYearInputDisplay(digits) {
  const d = parseBusinessYearInputDigits(digits)
  if (d.length <= 4) return d
  return `${d.slice(0, 4)}.${d.slice(4)}`
}

function parseYearToDigits(y) {
  return parseYearToFormDigits(y)
}

/** 상세 모달·저장값 → 폼 입력용 숫자(YYYY 또는 YYYYMM) */
function parseYearToFormDigits(y) {
  const s = safeString(y).trim()
  const dot = s.match(/^(\d{4})\.(\d{1,2})$/)
  if (dot) {
    const mm = String(Math.min(12, Math.max(1, parseInt(dot[2], 10) || 1))).padStart(2, '0')
    return `${dot[1]}${mm}`
  }
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 6) return digits.slice(0, 6)
  if (digits.length >= 4) return digits.slice(0, 4)
  return String(new Date().getFullYear())
}

/** 상세 모달 사업년도: YYYY.MM (예: 2025.05) */
function formatInstallCaseYearDetailDisplay(raw) {
  const s = safeString(raw).trim()
  if (!s) return '-'
  const dot = s.match(/^(\d{4})\.(\d{1,2})$/)
  if (dot) {
    const mm = String(Math.min(12, Math.max(1, parseInt(dot[2], 10) || 1))).padStart(2, '0')
    return `${dot[1]}.${mm}`
  }
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 6) {
    const mm = String(Math.min(12, Math.max(1, parseInt(digits.slice(4, 6), 10) || 1))).padStart(2, '0')
    return `${digits.slice(0, 4)}.${mm}`
  }
  if (digits.length >= 4) return `${digits.slice(0, 4)}.01`
  return s
}

function formatInstallCaseCardSubline(row) {
  const yRaw = safeString(row?.year).trim()
  const yearPart = yRaw ? `${(yRaw.match(/^\d{4}/) ? yRaw.slice(0, 4) : yRaw)}년` : '-'
  const area = safeString(row?.specs?.displayArea).trim() || '-'
  const pitch = formatInstallCaseLedPitchDisplay(row?.specs?.ledPitch ?? '')
  return `${yearPart} | ${area} | ${pitch}`
}

function readImageFileAsDataUrl(file) {
  if (!file) return Promise.resolve('')
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(safeString(r.result))
    r.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    r.readAsDataURL(file)
  })
}

function InstallCaseHeroMedia({
  src,
  fallback = INSTALL_CASE_FALLBACK_HERO,
  className = '',
  loading,
  variant = 'card',
}) {
  const mediaSrc = safeString(src).trim() || fallback
  const isVideo = isInstallCaseVideo(mediaSrc)

  if (variant === 'card') {
    return (
      <div className="install-case-card-media">
        {isVideo ? (
          <video
            className={className}
            src={mediaSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden
            tabIndex={-1}
          />
        ) : (
          <img
            className={className}
            src={mediaSrc}
            alt=""
            loading={loading}
          />
        )}
        <div className="install-case-card-media-overlay" aria-hidden />
      </div>
    )
  }

  if (isVideo) {
    return (
      <video
        className={`install-case-detail-media${className ? ` ${className}` : ''}`}
        src={mediaSrc}
        controls
        playsInline
        preload="metadata"
        aria-label="설치사례 동영상"
      />
    )
  }

  return (
    <img
      className={`install-case-detail-media${className ? ` ${className}` : ''}`}
      src={mediaSrc}
      alt=""
      loading={loading}
      data-install-case-media-variant={variant}
    />
  )
}

function InstallCaseImageDropzone({
  inputId,
  label,
  previewUrl,
  fileName,
  previewIsVideo = false,
  onFile,
  onClear,
  onInvalidFileType,
  onFileTooLarge,
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const assignFile = (fileList) => {
    const file = fileList?.[0]
    if (!file) return
    if (!isInstallCaseMediaFile(file)) {
      if (typeof onInvalidFileType === 'function') {
        onInvalidFileType()
      }
      return
    }
    const maxBytes = getInstallCaseMediaMaxBytes(file)
    if (file.size > maxBytes) {
      if (typeof onFileTooLarge === 'function') {
        onFileTooLarge(file, maxBytes)
      }
      return
    }
    onFile(file)
  }

  return (
    <div className="install-case-dropzone-wrap">
      <div className="install-case-dropzone-label">
        {safeString(label).trim() || '이미지/동영상'}
      </div>
      <div
        className={`install-case-dropzone${dragOver ? ' install-case-dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
          assignFile(e.dataTransfer?.files)
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="install-case-dropzone-input"
          accept={INSTALL_CASE_MEDIA_ACCEPT}
          aria-label={safeString(label).trim() || '이미지 또는 동영상 업로드'}
          onChange={(e) => {
            assignFile(e.target.files)
            e.target.value = ''
          }}
        />
        {previewUrl ? (
          <div className="install-case-dropzone-preview">
            {previewIsVideo ? (
              <video src={previewUrl} controls muted preload="metadata" playsInline aria-label="미리보기" />
            ) : (
              <img src={previewUrl} alt="" />
            )}
            <button
              type="button"
              className="install-case-dropzone-clear"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
              }}
            >
              제거
            </button>
          </div>
        ) : (
          <div className="install-case-dropzone-placeholder">
            <span className="install-case-dropzone-icon" aria-hidden>
              ⬆
            </span>
            <span className="install-case-dropzone-hint">
              클릭하거나 파일을 드래그하여 업로드하세요 (이미지·MP4/WebM/OGG, 최대 100MB)
            </span>
            {fileName ? <span className="install-case-dropzone-filename">{fileName}</span> : null}
          </div>
        )}
      </div>
    </div>
  )
}

/** 설치사례 등록·수정 동일 2단 폼 (좌: 기본정보+이미지 / 우: 제품 규격·W·H 분리) */
function InstallCaseFormSection({ title, ariaLabel, children }) {
  return (
    <div className="install-case-form-panel" role="region" aria-label={ariaLabel || title}>
      <div className="install-case-form-section-title">{title}</div>
      <div className="install-case-form-panel-body">{children}</div>
    </div>
  )
}

function InstallCaseFormWhPairField({ label, wValue, hValue, onWChange, onHChange, preview = '' }) {
  return (
    <div className="install-case-form-stack-field">
      <label className="install-case-form-label">{label}</label>
      <div className="install-case-form-wh-pair">
        <input
          className="table-search-input install-case-form-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="가로 (W)"
          value={wValue}
          onChange={onWChange}
        />
        <input
          className="table-search-input install-case-form-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="세로 (H)"
          value={hValue}
          onChange={onHChange}
        />
      </div>
      {preview ? <div className="install-case-form-digit-preview">{preview}</div> : null}
    </div>
  )
}

function getInstallCaseSpecPreview(type, specs, pairId) {
  const w = specs[`${pairId}W`]
  const h = specs[`${pairId}H`]
  if (type === 'whMm') return formatInstallCaseWhMmFromWH(w, h)
  if (type === 'moduleQty') return formatInstallCaseModuleQtyLine(w, h)
  if (type === 'resolution') return formatInstallCaseResolutionFromWH(w, h)
  return ''
}

function InstallCaseFormTwoColumn({
  formDraft,
  setFormDraft,
  icImageFile,
  setIcImageFile,
  icImagePreview,
  icImagePreviewIsVideo = false,
  onClearInstallCaseImage,
  pairDigitChange,
  onLedPitchChange,
  onInvalidImageFile,
  onFileTooLarge,
}) {
  const specs = formDraft.specs || {}

  return (
    <div className="install-case-form-two-col install-case-form-two-col--unified">
      <InstallCaseFormSection title="기본 정보" ariaLabel="기본 정보">
        {INSTALL_CASE_REGISTER_BASIC_ROWS.map((def) => {
          if (def.type === 'text') {
            return (
              <div key={def.key} className="install-case-form-stack-field">
                <label className="install-case-form-label">{def.label}</label>
                <input
                  className="table-search-input install-case-form-input"
                  type="text"
                  value={formDraft[def.key]}
                  onChange={(e) =>
                    setFormDraft((prev) => ({
                      ...prev,
                      [def.key]: e.target.value,
                    }))
                  }
                  placeholder={def.placeholder}
                />
              </div>
            )
          }
          if (def.type === 'select') {
            return (
              <div key={def.key} className="install-case-form-stack-field">
                <label className="install-case-form-label">{def.label}</label>
                <select
                  className="contract-filter-select install-case-form-input"
                  value={formDraft[def.key]}
                  onChange={(e) =>
                    setFormDraft((prev) => ({
                      ...prev,
                      [def.key]: e.target.value,
                    }))
                  }
                >
                  {def.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          if (def.type === 'businessYear') {
            return (
              <div key={def.key} className="install-case-form-stack-field">
                <label className="install-case-form-label">{def.label}</label>
                <input
                  className="table-search-input install-case-form-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatBusinessYearInputDisplay(formDraft.businessYearDigits)}
                  onChange={(e) => {
                    const v = parseBusinessYearInputDigits(e.target.value)
                    setFormDraft((prev) => ({ ...prev, businessYearDigits: v }))
                  }}
                  placeholder={def.placeholder || '2025.09'}
                />
              </div>
            )
          }
          return null
        })}
        <div className="install-case-form-stack-field install-case-form-stack-field--dropzone">
          <InstallCaseImageDropzone
            inputId="install-case-image-file"
            label="이미지/동영상"
            previewUrl={icImagePreview}
            previewIsVideo={icImagePreviewIsVideo}
            fileName={icImageFile?.name}
            onFile={setIcImageFile}
            onClear={onClearInstallCaseImage}
            onInvalidFileType={onInvalidImageFile}
            onFileTooLarge={onFileTooLarge}
          />
        </div>
      </InstallCaseFormSection>

      <InstallCaseFormSection title="제품 규격" ariaLabel="제품 규격">
        {INSTALL_CASE_REGISTER_SPEC_FIELDS.map((def) => {
          if (def.type === 'wh') {
            const pairId = def.pairId
            return (
              <InstallCaseFormWhPairField
                key={pairId}
                label={def.label}
                wValue={specs[`${pairId}W`] ?? ''}
                hValue={specs[`${pairId}H`] ?? ''}
                onWChange={pairDigitChange(pairId, 'w')}
                onHChange={pairDigitChange(pairId, 'h')}
                preview={getInstallCaseSpecPreview(def.preview, specs, pairId)}
              />
            )
          }
          if (def.type === 'ledPitch') {
            return (
              <div key="ledPitch" className="install-case-form-stack-field">
                <label className="install-case-form-label">{def.label}</label>
                <input
                  className="table-search-input install-case-form-input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="숫자·소수점 입력 (표시: P값mm)"
                  value={specs.ledPitch}
                  onChange={onLedPitchChange}
                />
              </div>
            )
          }
          if (def.type === 'text') {
            return (
              <div key={def.key} className="install-case-form-stack-field">
                <label className="install-case-form-label">{def.label}</label>
                <input
                  className="table-search-input install-case-form-input"
                  type="text"
                  value={specs[def.key] ?? ''}
                  placeholder={def.placeholder}
                  onChange={(e) =>
                    setFormDraft((prev) => ({
                      ...prev,
                      specs: { ...prev.specs, [def.key]: e.target.value },
                    }))
                  }
                />
              </div>
            )
          }
          return null
        })}
      </InstallCaseFormSection>
    </div>
  )
}

function getDefaultInstallCaseForm() {
  return {
    projectName: '',
    environment: '',
    middleCategory: '',
    audience: '',
    businessYearDigits: '',
    purpose: '',
    client: '',
    specs: {
      displayAreaW: '',
      displayAreaH: '',
      moduleSizeW: '',
      moduleSizeH: '',
      moduleSize2W: '',
      moduleSize2H: '',
      ledPitch: '',
      moduleQtyW: '',
      moduleQtyH: '',
      moduleQty2W: '',
      moduleQty2H: '',
      resolutionW: '',
      resolutionH: '',
      installType: '',
    },
  }
}

function cloneInstallCaseFormDraft(form) {
  const defaults = getDefaultInstallCaseForm()
  return {
    ...defaults,
    ...form,
    specs: { ...defaults.specs, ...(form?.specs || {}) },
  }
}

function hasMeaningfulInstallCaseFormContent(form, imagePreview = '') {
  if (!form) return false
  if (safeString(form.projectName).trim()) return true
  if (safeString(form.purpose).trim()) return true
  if (safeString(form.client).trim()) return true
  const specs = form.specs || {}
  for (const key of Object.keys(specs)) {
    if (safeString(specs[key]).trim()) return true
  }
  const img = safeString(imagePreview).trim()
  if (img && img !== INSTALL_CASE_FALLBACK_HERO && !img.startsWith('blob:')) return true
  return false
}

function loadInstallCaseFormDraftFromStorage() {
  try {
    const raw = localStorage.getItem(INSTALL_CASE_FORM_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.form?.specs) return null
    return parsed
  } catch {
    return null
  }
}

function persistInstallCaseFormDraftToStorage(payload) {
  try {
    localStorage.setItem(INSTALL_CASE_FORM_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('[설치사례] 임시 저장 실패', error)
  }
}

function clearInstallCaseFormDraftStorage() {
  try {
    localStorage.removeItem(INSTALL_CASE_FORM_DRAFT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function pickInstallCaseDraftImageForStorage(imagePreview) {
  const prev = safeString(imagePreview).trim()
  if (!prev || prev.startsWith('blob:') || prev === INSTALL_CASE_FALLBACK_HERO) return ''
  if (prev.length > INSTALL_CASE_FORM_DRAFT_MAX_IMAGE_LEN) return ''
  return prev
}

const HIDDEN_MANAGER_VALUES = ['전유찬', '전유찬 대리']

const emptyContract = {
  year: '',
  segment: '',
  refNo: '',
  contractNo: '',
  client: '',
  department: '',
  contractMethod: '',
  contractType: '',
  identNo: '',
  contractDate: '',
  dueDate: '',
  projectName: '',
  amount: '',
  salesOwner: '',
  pm: '',
  note: '',
}

const emptyEvent = {
  dateStart: '',
  dateEnd: '',
  title: '',
  owner: '',
  pm: '',
  note: '',
}

function createDocumentDraftRow() {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    docDate: '',
    docNo: '',
    senderReceiver: '',
    title: '',
    method: '',
    writer: '',
    note: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createSalesDraftRow() {
  return {
    id: `sales-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    registerDate: '',
    client: '',
    projectName: '',
    projectAmount: '',
    projectCategory: '',
    projectStage: '',
    manager: '',
    projectType: '',
    department: '',
    detail: '',
    source: '',
    salesNote: '',
    actionRequest: '',
    summary: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createDiscoveryDraftRow() {
  return {
    id: `discovery-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    permitDate: '',
    checkStatus: '',
    salesTarget: '',
    projectCategory: '',
    localGov: '',
    client: '',
    projectName: '',
    projectAmount: '',
    completionPeriod: '',
    manager: '',
    note: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createExcludedDraftRow() {
  return {
    id: `excluded-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orderNo: '',
    writeDate: '',
    openDate: '',
    category: '',
    keyword: '',
    writer: '',
    projectName: '',
    client: '',
    projectAmount: '',
    exclusionReason: '',
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

function createWorkReportDraftRow({
  reportDate,
  section,
  user = '',
  content = '',
  destination = '',
  deadline = '',
  orderIndex = 1,
}) {
  return {
    id: `work-report-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: reportDate,
    user,
    section,
    content,
    destination,
    deadline,
    orderIndex,
    createdAt: '',
    updatedAt: '',
    isDraft: true,
  }
}

/** 구형 5칸 주요확인사항 → 단일 문자열(줄바꿈) 병합. draft `…__1`이 있으면 그 content 우선 */
function getWorkReportChecklistCombinedText(date, sectionKey, workReportRows, workReportDrafts) {
  const cellKey1 = `${normalizeWorkReportDateKey(date)}__${sectionKey}__${WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX}`
  if (workReportDrafts && Object.prototype.hasOwnProperty.call(workReportDrafts, cellKey1)) {
    return safeString(workReportDrafts[cellKey1].content)
  }
  const parts = []
  for (let oi = 1; oi <= WORK_REPORT_MAIN_CHECK_COUNT; oi += 1) {
    const row = pickLatestWorkReportRow(
      workReportRows.filter((r) => workReportRowKeyMatch(r, date, sectionKey, oi))
    )
    const t = safeString(row?.content).trim()
    if (t) parts.push(t)
  }
  return parts.join('\n')
}

const WORK_REPORT_CHECKLIST_BULLET_PREFIX = '• '

/** 영업관리대장 요약 모달 — 신규 기록 날짜 스탬프 [YY-MM-DD] */
function formatSalesRecordDateStamp(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `[${yy}-${mm}-${dd}]`
}

function formatSalesRegisterDateStamp(registerDate) {
  const ymd = toDbDate(registerDate) || safeString(registerDate).trim()
  if (!ymd) return formatSalesRecordDateStamp()
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return `[${match[1].slice(-2)}-${match[2]}-${match[3]}]`
  }
  const parsed = new Date(ymd)
  if (!Number.isNaN(parsed.getTime())) return formatSalesRecordDateStamp(parsed)
  return formatSalesRecordDateStamp()
}

/** 테이블 세부내용 셀 — 누적 히스토리 중 최신 1건만 */
function extractLatestSalesDetailEntry(detail) {
  const raw = safeString(detail).trim()
  if (!raw) return ''
  const parts = raw.split(/\n+/)
  return safeString(parts[0]).trim()
}

function formatSalesRecordHistoryForDisplay(detail, registerDate) {
  const raw = safeString(detail).trim()
  if (!raw) return ''
  const stamp = formatSalesRegisterDateStamp(registerDate)
  return raw
    .split(/\n\n+/)
    .map((chunk) => {
      const trimmed = safeString(chunk).trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('[')) return trimmed
      return `${stamp} ${trimmed}`
    })
    .filter(Boolean)
    .join('\n\n')
}

function getSalesRecordRawHistory(detail) {
  return safeString(detail).trim()
}

function getSalesRecordHistoryForDisplay(detail, registerDate) {
  return formatSalesRecordHistoryForDisplay(detail, registerDate)
}

function buildSalesSummaryFallbackFromRow(row) {
  const existingSummary = safeString(row?.summary).trim()
  if (existingSummary) return existingSummary
  const existingDetail = safeString(row?.detail).trim()
  if (!existingDetail) return ''
  return `${formatSalesRegisterDateStamp(row?.registerDate)} ${existingDetail}`
}

function isSalesDetailHistoryColumn(column, scope) {
  return scope === 'sales' && column?.key === 'detail'
}

function isDiscoveryDetailColumn(column, scope) {
  return scope === 'discovery' && column?.key === 'note'
}

function isRegistrySmartDetailColumn(column, scope) {
  return isSalesDetailHistoryColumn(column, scope) || isDiscoveryDetailColumn(column, scope)
}

function getRegistrySmartDetailEditValue(scope, column, row) {
  if (isSalesDetailHistoryColumn(column, scope)) {
    return safeString(row?.detail).trim()
  }
  if (isDiscoveryDetailColumn(column, scope)) {
    const latest = extractLatestSalesDetailEntry(row?.note)
    return latest || safeString(row?.note).trim()
  }
  return safeString(row?.[column?.key]).trim()
}

function getRegistrySmartDetailDisplayValue(scope, column, row) {
  return getRegistrySmartDetailEditValue(scope, column, row)
}

function buildRegistrySmartDetailSavePayload(scope, column, row, rawValue) {
  const newDetail = safeString(rawValue).trim()
  if (isSalesDetailHistoryColumn(column, scope)) {
    const oldDetail = safeString(row?.detail).trim()
    if (newDetail === oldDetail) return null
    const existingSummary = safeString(row?.summary).trim()
    const baseSummary =
      existingSummary || (oldDetail ? `${formatSalesRegisterDateStamp(row?.registerDate)} ${oldDetail}` : '')
    const stampedSummaryLine = `${formatSalesRecordDateStamp()} ${newDetail}`
    return {
      detail: normalizeSalesRecordForSave(newDetail),
      summary: normalizeSalesRecordForSave(
        newDetail
          ? baseSummary
            ? `${stampedSummaryLine}\n${baseSummary}`
            : stampedSummaryLine
          : existingSummary
      ),
    }
  }
  if (isDiscoveryDetailColumn(column, scope)) {
    const oldLatest = getRegistrySmartDetailEditValue(scope, column, row)
    if (newDetail === oldLatest) return null
    return {
      note: normalizeSalesRecordForSave(
        buildSalesRecordDetailWithNewEntry(row?.note, newDetail)
      ),
    }
  }
  return null
}

function buildSalesRecordDetailWithNewEntry(existingDetail, newEntryText) {
  const trimmed = safeString(newEntryText).trim()
  const existing = getSalesRecordRawHistory(existingDetail)
  if (!trimmed) return existing
  const stamped = `${formatSalesRecordDateStamp()} ${trimmed}`
  return existing ? `${stamped}\n\n${existing}` : stamped
}

function hasSalesRecordStoredContent(detail) {
  const raw = safeString(detail)
  if (!raw.trim()) return false
  const lines = raw.split('\n')
  return lines.some(
    (line) => !isWorkReportChecklistEmptyBulletLine(line) && safeString(line).trim() !== ''
  )
}

function normalizeSalesRecordForSave(text) {
  const raw = safeString(text)
  const lines = raw.split('\n')
  const hasMeaningfulLine = lines.some(
    (line) => !isWorkReportChecklistEmptyBulletLine(line) && safeString(line).trim() !== ''
  )
  if (!hasMeaningfulLine) return ''
  return raw.trimEnd()
}

/** 서버/저장 데이터가 없을 때만 textarea 기본값으로 불릿 접두사 사용 */
function resolveWorkReportChecklistContent(content, hasPersistedData = false) {
  const text = safeString(content)
  if (text) return text
  return hasPersistedData ? '' : WORK_REPORT_CHECKLIST_BULLET_PREFIX
}

function getWorkReportChecklistLineBounds(value, cursor) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const nextBreak = value.indexOf('\n', cursor)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  return {
    lineStart,
    lineEnd,
    line: value.slice(lineStart, lineEnd),
  }
}

function isWorkReportChecklistEmptyBulletLine(line) {
  const trimmed = safeString(line).trimEnd()
  return trimmed === '•' || trimmed === '-' || trimmed === '• ' || trimmed === '- '
}

function setWorkReportChecklistTextareaCursor(el, cursor) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        el.selectionStart = cursor
        el.selectionEnd = cursor
      } catch {
        /* ignore */
      }
    })
  })
}

/** 주간업무보고서 텍스트 편집: Enter 저장, textarea는 Shift+Enter만 줄바꿈 */
function handleWorkReportTextEditKeyDown(event, { multiline = true, onSave } = {}) {
  if (event.key === 'Escape') return
  if (multiline && event.key === 'Enter' && event.shiftKey) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (typeof onSave === 'function') {
      onSave()
      return
    }
    event.currentTarget?.blur?.()
  }
}

/** 주요 확인사항 textarea: 포커스 시 빈 칸이면 첫 줄에 "• " 삽입 */
function handleWorkReportChecklistTextareaFocus(event, currentValue, onContentChange) {
  if (safeString(currentValue) !== '') return
  onContentChange(WORK_REPORT_CHECKLIST_BULLET_PREFIX)
  setWorkReportChecklistTextareaCursor(event.currentTarget, WORK_REPORT_CHECKLIST_BULLET_PREFIX.length)
}

/** 주요 확인사항 textarea: 빈 값에서 첫 글자 입력 시 "• " 접두사 자동 추가 */
function applyWorkReportChecklistInputValue(prevValue, rawNext) {
  const prev = safeString(prevValue)
  const next = safeString(rawNext)
  if (prev !== '' || next === '' || next.startsWith(WORK_REPORT_CHECKLIST_BULLET_PREFIX)) return next
  return `${WORK_REPORT_CHECKLIST_BULLET_PREFIX}${next}`
}

/** 주요 확인사항 textarea: Enter 저장 + Shift+Enter 줄바꿈(•) 통합 */
function handleWorkReportChecklistTextEditKeyDown(event, onContentChange, { onSave } = {}) {
  if (event.key === 'Escape') return
  if (event.key === 'Enter' && event.shiftKey) {
    handleWorkReportChecklistTextareaKeyDown(event, onContentChange)
    return
  }
  handleWorkReportTextEditKeyDown(event, { multiline: true, onSave })
}

function normalizeWorkReportDeadlineForDateInput(value) {
  const raw = safeString(value).trim()
  if (!raw) return ''
  const parsed = parseDateOnly(raw)
  return parsed ? formatDateInput(parsed) : ''
}

/** 주요 확인사항 textarea: Shift+Enter 시 다음 줄 "• " / 빈 불릿 줄에서는 불릿 제거 후 일반 개행 */
function handleWorkReportChecklistTextareaKeyDown(event, onContentChange, { useShiftEnter = true } = {}) {
  const isTrigger = useShiftEnter
    ? event.key === 'Enter' && event.shiftKey
    : event.key === 'Enter' && !event.shiftKey
  if (!isTrigger) return

  const el = event.currentTarget
  const value = safeString(el.value)
  const start = Number(el.selectionStart) || 0
  const end = Number(el.selectionEnd) || start
  const { lineStart, lineEnd, line } = getWorkReportChecklistLineBounds(value, start)

  if (isWorkReportChecklistEmptyBulletLine(line)) {
    event.preventDefault()
    const next =
      lineStart === 0 && lineEnd === value.length
        ? ''
        : `${value.slice(0, lineStart)}${value.slice(lineEnd)}`
    onContentChange(next)
    setWorkReportChecklistTextareaCursor(el, lineStart)
    return
  }

  event.preventDefault()
  const insert = `\n${WORK_REPORT_CHECKLIST_BULLET_PREFIX}`
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`
  onContentChange(next)
  setWorkReportChecklistTextareaCursor(el, start + insert.length)
}

function getWorkReportPrimaryChecklistStoredRow(date, sectionKey, workReportRows) {
  const row1 = pickLatestWorkReportRow(
    workReportRows.filter((r) => workReportRowKeyMatch(r, date, sectionKey, 1))
  )
  if (row1?.id) return row1
  for (let oi = 2; oi <= WORK_REPORT_MAIN_CHECK_COUNT; oi += 1) {
    const row = pickLatestWorkReportRow(
      workReportRows.filter((r) => workReportRowKeyMatch(r, date, sectionKey, oi))
    )
    if (row?.id) return row
  }
  return row1 || null
}

/** 외부일정 entry → 담당자·내용·목적지 (JSON content / destination 필드 모두 지원) */
function resolveDashboardExternalScheduleRow(entry) {
  if (!entry) return null
  const user = safeString(entry.user).trim()
  const destinationFromField = safeString(entry.destination).trim()
  const parsed = parseExternalScheduleContent(entry.content)
  const content = parsed.content || safeString(entry.content).trim()
  const destination = destinationFromField || parsed.destination
  if (!user && !content && !destination) return null
  return { user, content, destination }
}

/** 대시보드 브리핑: 오늘 날짜의 외부일정 슬롯(저장분 + draft) */
function collectDashboardTodayExternalRows(dateYmd, workReportRows, workReportDrafts) {
  const section = WORK_REPORT_SECTION_KEYS.external
  const list = []
  for (let oi = 1; oi <= WORK_REPORT_EXTERNAL_ROW_COUNT; oi += 1) {
    const cellKey = `${normalizeWorkReportDateKey(dateYmd)}__${section}__${oi}`
    const draftEntry = workReportDrafts?.[cellKey]
    const stored = pickLatestWorkReportRow(
      workReportRows.filter((r) => workReportRowKeyMatch(r, dateYmd, section, oi))
    )
    const resolved = resolveDashboardExternalScheduleRow(draftEntry || stored)
    if (resolved) list.push(resolved)
  }
  return list
}

/**
 * @typedef {Object} DashboardWeekDueRow
 * @property {string} id
 * @property {string} projectName
 * @property {string} dueDate
 * @property {string} dday
 * @property {string} client 발주처
 * @property {string} salesManager 영업담당자
 * @property {string} fieldPM 현장 PM
 */

function mapDashboardWeekDueRow(calendarDueItem) {
  const contract = calendarDueItem?.contract || {}
  return {
    id: safeString(calendarDueItem?.id),
    projectName: stripRedundantCalendarTitlePrefix(
      contract.projectName || calendarDueItem?.title
    ),
    dueDate: safeString(calendarDueItem?.date).trim().slice(0, 10),
    dday: safeString(calendarDueItem?.dday).trim(),
    client: safeString(contract.client).trim(),
    salesManager: safeString(contract.salesOwner).trim(),
    fieldPM: safeString(contract.pm).trim(),
  }
}

/** 대시보드 브리핑: 금주(월~일) 준공 일정 — 캘린더 due 항목 */
function collectDashboardWeekDueRows(calendarItems, weekAnchorDate = new Date()) {
  const weekStart = getWeekStartMonday(weekAnchorDate)
  const startYmd = formatDateInput(weekStart)
  const endYmd = formatDateInput(addDays(weekStart, 6))
  return (Array.isArray(calendarItems) ? calendarItems : [])
    .filter((item) => item?.type === 'due')
    .filter((item) => {
      const ymd = safeString(item.date).trim().slice(0, 10)
      return ymd && ymd >= startYmd && ymd <= endYmd
    })
    .sort((a, b) => safeString(a.date).localeCompare(safeString(b.date)))
    .map(mapDashboardWeekDueRow)
}

function getDashboardWeekWorkSectionLabel(section) {
  const sectionNorm = safeString(section).trim()
  if (sectionNorm === WORK_REPORT_SECTION_KEYS.di) return 'DI사업'
  if (sectionNorm === WORK_REPORT_SECTION_KEYS.road) return '도로사업'
  if (
    sectionNorm === WORK_REPORT_SECTION_KEYS.supportProgress ||
    sectionNorm === WORK_REPORT_SECTION_KEYS.supportDone
  ) {
    return '영업지원'
  }
  return ''
}

const DASHBOARD_WEEK_WORK_ASSIGNEE_ORDER = ['전기웅', '유영무', '김성수', '이재승', '이용자', '박재범']

/** 대시보드 금주 업무 말머리: [카테고리 - 담당자] (담당자 미입력 시 미지정, 영업지원은 카테고리만) */
function formatDashboardWeekWorkPrefixLabel(sectionLabel, assigneeRaw) {
  const category = safeString(sectionLabel).trim()
  if (!category) return ''
  if (category === '영업지원') return '[영업지원]'
  const assignee = safeString(assigneeRaw).trim()
  if (assignee) return `[${category} - ${assignee}]`
  return `[${category} - 미지정]`
}

function getDashboardWeekWorkAssigneeSortRank(assigneeRaw) {
  const assignee = safeString(assigneeRaw).trim()
  const index = DASHBOARD_WEEK_WORK_ASSIGNEE_ORDER.indexOf(assignee)
  return index === -1 ? DASHBOARD_WEEK_WORK_ASSIGNEE_ORDER.length : index
}

function sortDashboardWeekWorkRowsByAssignee(rows) {
  return [...rows].sort(
    (a, b) => getDashboardWeekWorkAssigneeSortRank(a.assignee) - getDashboardWeekWorkAssigneeSortRank(b.assignee)
  )
}

function formatDashboardBriefDeadlineLabel(deadlineYmd) {
  const normalized = safeString(deadlineYmd).trim().slice(0, 10)
  if (normalized.length < 10) return ''
  return normalized.slice(5, 10)
}

/** 대시보드 브리핑: 금주(월~일) 기한 — 주간업무보고서 DI/도로/영업지원 */
function collectDashboardWeekWorkRows(workReportRows, workReportDrafts, weekAnchorDate = new Date()) {
  const weekStart = getWeekStartMonday(weekAnchorDate)
  const startYmd = formatDateInput(weekStart)
  const endYmd = formatDateInput(addDays(weekStart, 6))
  const cellMap = new Map()

  for (const row of Array.isArray(workReportRows) ? workReportRows : []) {
    if (!isWorkReportJournalSection(row?.section) || isWorkReportRowEmpty(row)) continue
    const cellKey = `${normalizeWorkReportDateKey(row.date)}__${safeString(row.section).trim()}__${Number(row.orderIndex || 1)}`
    const existing = cellMap.get(cellKey)
    cellMap.set(cellKey, pickLatestWorkReportRow(existing ? [existing, row] : [row]))
  }

  for (const [cellKey, draftEntry] of Object.entries(workReportDrafts || {})) {
    const parsed = parseWorkReportCellKey(cellKey)
    if (!parsed || !isWorkReportJournalSection(parsed.section)) continue
    const stored = cellMap.get(cellKey)
    const merged = {
      ...(stored || {}),
      ...draftEntry,
      date: parsed.date,
      section: parsed.section,
      orderIndex: parsed.orderIndex,
    }
    if (!isWorkReportRowEmpty(merged)) {
      cellMap.set(cellKey, merged)
    }
  }

  const pushWeekWorkRow = (bucket, cellKey, entry) => {
    const sectionLabel = getDashboardWeekWorkSectionLabel(entry.section)
    if (!sectionLabel) return

    const content = safeString(entry.content).trim()
    if (!content) return

    const deadlineYmd = normalizeWorkReportDeadlineForDateInput(entry.deadline)
    if (!deadlineYmd || deadlineYmd < startYmd || deadlineYmd > endYmd) return

    const assignee = safeString(entry.user).trim()
    bucket.push({
      id: cellKey,
      sectionLabel,
      assignee,
      prefixLabel: formatDashboardWeekWorkPrefixLabel(sectionLabel, assignee),
      content,
      deadlineYmd,
      deadlineLabel: formatDashboardBriefDeadlineLabel(deadlineYmd),
    })
  }

  const collectCategoryRows = (sectionKeys, rowCounts) => {
    const bucket = []
    const weekDays = getWorkReportWeekDays(startYmd)
    for (const day of weekDays) {
      sectionKeys.forEach((sectionKey, sectionIdx) => {
        const rowCount = rowCounts[sectionIdx] ?? rowCounts[0]
        for (let oi = 1; oi <= rowCount; oi += 1) {
          const cellKey = `${normalizeWorkReportDateKey(day.date)}__${safeString(sectionKey).trim()}__${oi}`
          const entry = cellMap.get(cellKey)
          if (entry) pushWeekWorkRow(bucket, cellKey, entry)
        }
      })
    }
    return bucket
  }

  const diRows = collectCategoryRows([WORK_REPORT_SECTION_KEYS.di], [WORK_REPORT_DI_ROW_COUNT])
  const roadRows = collectCategoryRows([WORK_REPORT_SECTION_KEYS.road], [WORK_REPORT_ROAD_ROW_COUNT])
  const supportRows = collectCategoryRows(
    [WORK_REPORT_SECTION_KEYS.supportProgress, WORK_REPORT_SECTION_KEYS.supportDone],
    [WORK_REPORT_SUPPORT_ITEM_COUNT, WORK_REPORT_SUPPORT_ITEM_COUNT]
  )

  return [
    ...sortDashboardWeekWorkRowsByAssignee(diRows),
    ...sortDashboardWeekWorkRowsByAssignee(roadRows),
    ...supportRows,
  ]
}

/** 대시보드 브리핑: 주요 확인사항 텍스트 → 표시용 줄 목록 */
function splitDashboardBriefingChecklistLines(text) {
  return safeString(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !isWorkReportChecklistEmptyBulletLine(line))
}

/** 대시보드: 오늘이 속한 주(weekStart)의 회의록 요약 */
function getDashboardWeekMeetingMinutesRows(weekStartDate, workReportRows, workReportDrafts) {
  const weekStart = formatDateInput(getWeekStartMonday(normalizeWorkReportDateKey(weekStartDate)))
  if (!weekStart) return []
  const getEntry = (date, section, orderIndex = 1) => {
    const sectionNorm = safeString(section).trim()
    const oi = Number(orderIndex || 1)
    const cellKey = `${normalizeWorkReportDateKey(date)}__${sectionNorm}__${oi}`
    const draftEntry = workReportDrafts?.[cellKey]
    const storedEntry = pickLatestWorkReportRow(
      workReportRows.filter((row) => workReportRowKeyMatch(row, weekStart, sectionNorm, oi))
    )
    if (!draftEntry) return storedEntry
    return {
      ...(storedEntry || {}),
      ...draftEntry,
      content: safeString(draftEntry.content).length ? draftEntry.content : storedEntry?.content || '',
      user: safeString(draftEntry.user).length ? draftEntry.user : storedEntry?.user || '',
    }
  }
  return getDashboardMeetingMinutesDisplayRows(weekStart, getEntry)
}

function safeString(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeRegistryRowId(id) {
  if (id === null || id === undefined) return ''
  if (typeof id === 'string') return id.trim()
  if (typeof id === 'number' || typeof id === 'bigint') return String(id).trim()
  if (typeof id === 'object') {
    // Common shapes from some backends/DB drivers
    const candidates = [
      id.$oid,
      id.oid,
      id.value,
      id.id,
      id.uuid,
      id.UUID,
      id._id,
    ]
    for (const v of candidates) {
      if (typeof v === 'string' && v.trim() !== '') return v.trim()
      if (typeof v === 'number' || typeof v === 'bigint') return String(v).trim()
    }
  }
  try {
    return String(id).trim()
  } catch {
    return ''
  }
}

/** API 응답 필드명이 달라도 계약 행 식별자를 한곳에서 추출 (우선순위 고정) */
function pickContractRowId(row) {
  if (!row || typeof row !== 'object') return ''
  const merged =
    typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data)
      ? { ...row.data, ...row }
      : { ...row }

  const chain = [
    merged.id,
    merged._id,
    merged.contract_id,
    merged.contractNo,
    merged.ID,
  ]
  for (const v of chain) {
    const s = normalizeRegistryRowId(v)
    if (s !== '' && s !== '[object Object]') return s
  }
  return ''
}

/** PATCH/DELETE URL에 넣을 수 있는지(비어 있지 않고 임시 행 키가 아닌지) */
function isUsableContractPathId(id) {
  const s = normalizeRegistryRowId(id)
  if (!s) return false
  if (s.startsWith('__MISSING__')) return false
  if (s.startsWith('__ROW__')) return false
  if (s === '[object Object]') return false
  if (s.length > 256) return false
  return !/[\r\n]/.test(s)
}

/** 테이블 임시키(`__MISSING__`)를 건너뛰고 API용 id만 고름 */
function firstUsableContractPathId(...parts) {
  for (const p of parts) {
    const s = normalizeRegistryRowId(p)
    if (isUsableContractPathId(s)) return s
  }
  return ''
}

/** 테이블 UI 키 — 행마다 고유. 저장 API 는 `record.id`(DB PK)만 사용 */
function getContractTableRowKey(record) {
  if (record == null || typeof record !== 'object') return ''
  if (record.selectKey != null && String(record.selectKey).trim() !== '') {
    return String(record.selectKey)
  }
  const serverId = firstUsableContractPathId(record.id, record.key)
  return serverId || ''
}

function removeObjectKey(object, key) {
  const next = { ...object }
  delete next[key]
  return next
}

function normalizeHeader(text) {
  return safeString(text)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function getValueByHeader(row, candidates, fallback = '') {
  const map = new Map()

  Object.keys(row).forEach((key) => {
    map.set(normalizeHeader(key), row[key])
  })

  for (const candidate of candidates) {
    const value = map.get(normalizeHeader(candidate))
    if (value !== undefined && value !== null && safeString(value).trim() !== '') {
      return value
    }
  }

  return fallback
}

function isValidCalendarDateYmd(ymd) {
  const match = safeString(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  )
}

function formatYmdFromParts(year, month, day) {
  const yyyy = String(year)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const ymd = `${yyyy}-${mm}-${dd}`
  return isValidCalendarDateYmd(ymd) ? ymd : ''
}

function excelDateToInput(value) {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return ''
    return formatYmdFromParts(parsed.y, parsed.m, parsed.d)
  }

  const str = safeString(value).trim()
  if (!str) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValidCalendarDateYmd(str) ? str : ''
  }
  if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('.').map((part) => Number(part))
    return formatYmdFromParts(y, m, d)
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('/').map((part) => Number(part))
    return formatYmdFromParts(y, m, d)
  }

  const serialText = str.replace(/[^\d]/g, '')
  if (/^\d{4,6}$/.test(serialText)) {
    const serial = Number(serialText)
    if (serial > 20000) {
      const fromSerial = excelDateToInput(serial)
      if (fromSerial) return fromSerial
    }
  }

  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return ''
  return formatYmdFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function parseDateOnly(value) {
  const str = safeString(value).trim()
  if (!str) return null

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateInput(date) {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** `YYYY-MM-DD (요일)` — 대시보드 브리핑 제목용 */
function formatYmdWithWeekdayKo(date = new Date()) {
  const d =
    date instanceof Date
      ? date
      : new Date(`${safeString(date).trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDateInput(d)} (${CALENDAR_WEEKDAY_LABELS_KO[d.getDay()]})`
}

function addDays(baseDate, days) {
  const nextDate = new Date(baseDate)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function getWeekStartMonday(dateInput = new Date()) {
  const sourceDate =
    typeof dateInput === 'string' ? parseDateOnly(dateInput) ?? new Date() : new Date(dateInput)
  const normalizedDate = new Date(
    sourceDate.getFullYear(),
    sourceDate.getMonth(),
    sourceDate.getDate()
  )
  const day = normalizedDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  normalizedDate.setDate(normalizedDate.getDate() + diff)
  return normalizedDate
}

function getWeekNumberInMonth(dateInput) {
  const sourceDate = typeof dateInput === 'string' ? parseDateOnly(dateInput) : dateInput
  if (!sourceDate) return 1

  const targetDate = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate())
  const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
  const firstWeekStart = getWeekStartMonday(firstDayOfMonth)
  return Math.floor((getWeekStartMonday(targetDate).getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function buildWorkReportWeekMeta(weekStartDate) {
  const monday = getWeekStartMonday(weekStartDate)
  return {
    weekStartDate: formatDateInput(monday),
    year: monday.getFullYear(),
    month: monday.getMonth() + 1,
    weekNumber: getWeekNumberInMonth(monday),
  }
}

function getWorkReportWeekLabel(weekStartDate) {
  const meta = buildWorkReportWeekMeta(weekStartDate)
  const monday = getWeekStartMonday(weekStartDate)
  const sunday = addDays(monday, 6)
  return `${meta.year}년 ${meta.month}월 ${meta.weekNumber}주차 (${String(
    monday.getMonth() + 1
  ).padStart(2, '0')}.${String(monday.getDate()).padStart(2, '0')} ~ ${String(
    sunday.getMonth() + 1
  ).padStart(2, '0')}.${String(sunday.getDate()).padStart(2, '0')})`
}

function getWorkReportWeekDays(weekStartDate) {
  const monday = getWeekStartMonday(weekStartDate)
  return WORK_REPORT_WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(monday, index)
    return {
      label,
      date: formatDateInput(date),
      monthDay: `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`,
      isToday: formatDateInput(date) === formatDateInput(new Date()),
    }
  })
}

function normalizeAmountValue(value) {
  if (value === null || value === undefined || value === '') return ''
  return safeString(value).replace(/[^\d]/g, '')
}

function formatAmount(value) {
  const raw = normalizeAmountValue(value)
  if (!raw) return ''
  return Number(raw).toLocaleString('ko-KR')
}

function formatAmountDisplay(value) {
  return formatAmount(value)
}

function formatAmountWithWon(value) {
  const formatted = formatAmountDisplay(value)
  return formatted ? `${formatted}원` : '-'
}

function parseAmount(value) {
  const raw = normalizeAmountValue(value)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

/** 계약현황 그룹 헤더용 계약금액 합계 */
function sumContractAmounts(items) {
  if (!Array.isArray(items) || !items.length) return 0
  return items.reduce((sum, item) => sum + parseAmount(item?.amount), 0)
}

function parseYearValue(value) {
  const year = safeString(value).replace(/[^\d]/g, '').slice(0, 4)
  return year ? Number(year) : null
}

function toDbDate(value) {
  const str = safeString(value).trim()
  if (!str) return null
  return isValidCalendarDateYmd(str) ? str : null
}

function collectContractExcelImportIssues(item, excelRowNum) {
  const issues = []
  const rowLabel = excelRowNum > 0 ? `엑셀 ${excelRowNum}행` : '엑셀 데이터'

  for (const [key, label] of [
    ['contractDate', '계약일자'],
    ['dueDate', '준공일자'],
  ]) {
    const raw = safeString(item[key]).trim()
    if (raw === '-' || raw === '—' || raw === '–') continue
    if (raw && !isValidCalendarDateYmd(raw)) {
      issues.push(`${rowLabel} ${label}: "${raw}" (존재하지 않는 날짜입니다)`)
    }
  }

  return issues
}

function formatContractExcelImportApiError(message) {
  const msg = safeString(message).trim()
  if (!msg) return msg

  const rowMatch = msg.match(/body\.rows\.(\d+)\.(\w+)/i)
  if (rowMatch) {
    const excelApproxRow = Number(rowMatch[1]) + 2
    const field = rowMatch[2]
    const fieldKo =
      field === 'contractDate'
        ? '계약일자'
        : field === 'dueDate'
          ? '준공일자'
          : field
    if (/day value is outside expected range|valid date/i.test(msg)) {
      return `엑셀 약 ${excelApproxRow}행 ${fieldKo}: 날짜가 잘못되었습니다. (예: 2월 30일)\n원본: ${msg}`
    }
    return `엑셀 약 ${excelApproxRow}행 ${fieldKo} 오류\n원본: ${msg}`
  }

  return msg
}

/** 연도/그룹 아코디언 행·헤더: 전체 영역 클릭·키보드로 펼치기/접기 */
function bindExpandCollapseRow(toggle, isExpanded) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-expanded': isExpanded,
    onClick: toggle,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    },
  }
}

function sanitizeExcelContractText(value) {
  let s = safeString(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .trim()
  if (!s) return ''
  if (s.startsWith('=')) s = s.slice(1).trim()
  s = s.replace(/\\/g, '')
  s = s.replace(/[\u201c\u201d\u2018\u2019"`']/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

function normalizeExcelPlaceholderText(value) {
  const t = safeString(value).trim()
  const compact = t.replace(/\s+/g, '').toLowerCase()
  if (
    compact === '' ||
    compact === '—' ||
    compact === '–' ||
    compact === 'w-w' ||
    compact === 'n/a' ||
    compact === 'na' ||
    compact === 'x' ||
    compact === '--' ||
    compact === '---' ||
    compact === '해당없음' ||
    compact === '없음' ||
    compact === '해당사항없음'
  ) {
    return ''
  }
  return t
}

function normalizeContractPayload(item) {
  return {
    year: parseYearValue(item.year),
    segment: normalizeExcelPlaceholderText(safeString(item.segment).trim()),
    refNo: normalizeExcelPlaceholderText(sanitizeExcelContractText(item.refNo)),
    contractNo: normalizeExcelPlaceholderText(sanitizeExcelContractText(item.contractNo)),
    client: normalizeExcelPlaceholderText(safeString(item.client).trim()),
    department: normalizeExcelPlaceholderText(safeString(item.department).trim()),
    contractMethod: normalizeExcelPlaceholderText(safeString(item.contractMethod).trim()),
    contractType: normalizeExcelPlaceholderText(safeString(item.contractType).trim()),
    identNo: normalizeExcelPlaceholderText(sanitizeExcelContractText(item.identNo)),
    contractDate: toDbDate(item.contractDate),
    dueDate: toDbDate(item.dueDate),
    projectName: normalizeExcelPlaceholderText(safeString(item.projectName).trim()),
    amount: parseAmount(item.amount),
    salesOwner: normalizeExcelPlaceholderText(safeString(item.salesOwner).trim()),
    pm: normalizeExcelPlaceholderText(safeString(item.pm).trim()),
    note: normalizeExcelPlaceholderText(safeString(item.note).trim()),
  }
}

function normalizeEditValue(key, value) {
  if (key === 'amount') return parseAmount(value)
  if (key === 'year') return parseYearValue(value)
  if (key === 'contractDate' || key === 'dueDate') return toDbDate(value)
  return safeString(value).trim()
}

function compareKoreanText(a, b) {
  return safeString(a).localeCompare(safeString(b), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  })
}

/** 계약현황 2차 그룹: `contractType`에 "유지보수" 포함 시 유지보수, 그 외·빈 값은 전광판 */
const CONTRACT_CATEGORY_SUBGROUPS = Object.freeze([
  { groupId: 'signboard', label: '[전광판]' },
  { groupId: 'maintenance', label: '[유지보수]' },
])

function getContractCategorySubgroupId(contractType) {
  return safeString(contractType).includes('유지보수') ? 'maintenance' : 'signboard'
}

/** 그룹 내 정렬: 계약일자 내림차순(최신 먼저). 미입력·파싱 불가는 맨 뒤. */
function compareContractsByContractDateDesc(a, b) {
  const ts = (item) => {
    const raw = safeString(item.contractDate ?? '').trim()
    if (!raw) return null
    const t = new Date(raw).getTime()
    return Number.isNaN(t) ? null : t
  }
  const ta = ts(a)
  const tb = ts(b)
  if (ta === null && tb === null) {
    /* fall through to secondary */
  } else if (ta === null) return 1
  else if (tb === null) return -1
  else if (ta !== tb) return tb - ta

  const seg = compareKoreanText(a.segment, b.segment)
  if (seg !== 0) return seg
  return compareKoreanText(a.projectName, b.projectName)
}

function getOptions(items, key) {
  return [
    ...new Set(
      items
        .map((item) => safeString(item[key]).trim())
        .filter(Boolean)
        .filter((value) => !HIDDEN_MANAGER_VALUES.includes(value))
    ),
  ]
}

function getYearLabel(value) {
  const s = safeString(value).trim()
  if (!s) return ''
  const match = s.match(/\d{4}/)
  return match ? match[0] : s
}

function getContractColumnLabel(key) {
  return CONTRACT_COLUMNS.find((col) => col.key === key)?.label ?? key
}

/** 집계 대상 계약이 없을 때도 요약 위젯이 비지 않도록 대시보드와 동일 4분류 0건 블록을 만든다. */
function buildEmptyContractYearSummaryBlock(focusYearKey) {
  const y = safeString(focusYearKey).trim() || '미분류'
  return {
    year: y,
    totalAmount: 0,
    items: DASHBOARD_CATEGORY_ORDER.map((name) => ({
      name,
      count: 0,
      amount: 0,
      ratio: 0,
    })),
  }
}

/** `buildDashboardSummary`는 `item.year`를 그대로 키로 쓰므로, 한 화면 연도로 맞춰 집계한다. */
function buildDashboardSummaryForFocusYear(rows, focusYearKey) {
  const y = safeString(focusYearKey).trim() || '미분류'
  const normalized = rows.map((item) => ({ ...item, year: y }))
  return buildDashboardSummary(normalized)
}

function sortContracts(items) {
  return [...items].sort((a, b) => {
    const aDate = a.contractDate || a.dueDate || '1900-01-01'
    const bDate = b.contractDate || b.dueDate || '1900-01-01'
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })
}

/** [2단계] 필터링된 계약 목록 → 연도·카테고리 아코디언 그룹 (원본 데이터 사용 금지) */
function groupContractsForAccordion(filteredData) {
  const groups = new Map()

  filteredData.forEach((item) => {
    const year = getYearLabel(item.year) || '미분류'
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year).push(item)
  })

  return [...groups.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, yearItems]) => {
      const buckets = { signboard: [], maintenance: [] }
      yearItems.forEach((item) => {
        buckets[getContractCategorySubgroupId(item.contractType)].push(item)
      })

      const subGroups = CONTRACT_CATEGORY_SUBGROUPS.map(({ groupId, label }) => {
        const items = [...buckets[groupId]].sort(compareContractsByContractDateDesc)
        return {
          groupId,
          label,
          items,
          totalAmount: sumContractAmounts(items),
        }
      })

      const items = subGroups.flatMap((g) => g.items)

      return {
        year,
        subGroups,
        items,
        totalAmount: sumContractAmounts(items),
      }
    })
}

function getDateDiffFromToday(dateString) {
  const targetDate = parseDateOnly(dateString)
  if (!targetDate) return null

  const today = new Date()
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((targetDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
}

function escapeHtml(text) {
  return safeString(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeDocumentRow(item) {
  return {
    id: safeString(item.id),
    docDate: safeString(item.docDate ?? item.docdate),
    docNo: safeString(item.docNo ?? item.docno),
    senderReceiver: safeString(item.senderReceiver ?? item.senderreceiver),
    title: safeString(item.title),
    method: safeString(item.method),
    writer: safeString(item.writer),
    note: safeString(item.note),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isDocumentRowEmpty(row) {
  return DOCUMENT_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

function toDocumentPayload(row, timestamp) {
  return {
    docDate: toDbDate(row.docDate),
    docNo: safeString(row.docNo).trim(),
    senderReceiver: safeString(row.senderReceiver).trim(),
    title: safeString(row.title).trim(),
    method: safeString(row.method).trim(),
    writer: safeString(row.writer).trim(),
    note: safeString(row.note).trim(),
    updatedAt: timestamp,
  }
}

function normalizeSalesRow(item) {
  return {
    id: safeString(item.id),
    registerDate: safeString(item.registerDate ?? item.registerdate),
    client: safeString(item.client),
    projectName: safeString(item.projectName ?? item.projectname),
    projectAmount: safeString(item.projectAmount ?? item.projectamount),
    projectCategory: safeString(item.projectCategory ?? item.projectcategory),
    projectStage: safeString(item.projectStage ?? item.projectstage),
    manager: safeString(item.manager),
    projectType: safeString(item.projectType ?? item.projecttype),
    department: safeString(item.department),
    detail: safeString(item.detail),
    source: safeString(item.source),
    salesNote: safeString(item.salesNote ?? item.salesnote),
    actionRequest: safeString(item.actionRequest ?? item.actionrequest),
    summary: safeString(item.summary).trim(),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isSalesRowEmpty(row) {
  return SALES_COLUMNS.every((column) => {
    if (column.type === 'importance') return true
    return safeString(row[column.key]).trim() === ''
  })
}

function toSalesPayload(row, timestamp) {
  return {
    registerDate: toDbDate(row.registerDate),
    client: safeString(row.client).trim(),
    projectName: safeString(row.projectName).trim(),
    projectAmount: parseAmount(row.projectAmount),
    projectCategory: safeString(row.projectCategory).trim(),
    projectStage: normalizeSalesProjectStage(row.projectStage),
    manager: safeString(row.manager).trim(),
    projectType: safeString(row.projectType).trim(),
    department: safeString(row.department).trim(),
    detail: safeString(row.detail).trim(),
    source: safeString(row.source).trim(),
    salesNote: safeString(row.salesNote).trim(),
    actionRequest: safeString(row.actionRequest).trim(),
    summary: safeString(row.summary).trim() || null,
    updatedAt: timestamp,
  }
}

function getRegistryTableRowDomKey(row, index, prefix = '') {
  const id = safeString(row?.id).trim()
  if (id && id !== 'undefined') {
    return prefix ? `${prefix}::${id}` : id
  }
  return prefix ? `${prefix}-row-${index}` : `row-${index}`
}

function normalizeDiscoveryRow(item, rowIndex = 0) {
  let id = safeString(item.id).trim()
  if (!id || id === 'undefined') {
    const permit = safeString(item.permitDate ?? item.permitdate).trim()
    const project = safeString(item.projectName ?? item.projectname).trim()
    id = `discovery-fallback-${rowIndex}-${permit}-${project}`.replace(/\s+/g, '-')
    if (!id || id === `discovery-fallback-${rowIndex}--`) {
      id = `discovery-fallback-${rowIndex}`
    }
  }
  return {
    id,
    permitDate: safeString(item.permitDate ?? item.permitdate),
    checkStatus: safeString(item.checkStatus ?? item.checkstatus),
    salesTarget: safeString(item.salesTarget ?? item.salestarget),
    projectCategory: safeString(item.projectCategory ?? item.projectcategory),
    localGov: safeString(item.localGov ?? item.localgov),
    client: safeString(item.client),
    projectName: safeString(item.projectName ?? item.projectname),
    projectAmount: safeString(item.projectAmount ?? item.projectamount),
    completionPeriod: safeString(item.completionPeriod ?? item.completionperiod),
    manager: safeString(item.manager),
    note: safeString(item.note),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isDiscoveryRowEmpty(row) {
  return DISCOVERY_COLUMNS.every((column) => safeString(row[column.key]).trim() === '')
}

const DISCOVERY_EXCEL_TABLE_FIELDS = [
  '건축정보일자',
  '확인',
  '영업자',
  '사업구분',
  '발주처',
  '사업명',
  '사업금액',
  '준공시기',
  '담당자',
  '세부내용',
]

function discoveryRowToExcelTableItem(row) {
  return {
    건축정보일자: safeString(row.permitDate).trim(),
    확인: safeString(row.checkStatus).trim(),
    영업자: safeString(row.salesTarget).trim(),
    사업구분: safeString(row.projectCategory).trim(),
    발주처: safeString(row.client).trim(),
    사업명: safeString(row.projectName).trim(),
    사업금액: safeString(row.projectAmount).trim(),
    준공시기: safeString(row.completionPeriod).trim(),
    담당자: safeString(row.manager).trim(),
    세부내용: safeString(row.note).trim(),
  }
}

function discoveryExcelCellDisplay(value) {
  if (value === null || value === undefined) return '-'
  const text = safeString(value).trim()
  if (!text || text === 'undefined' || text === 'null') return '-'
  return text
}

function excelTableItemToDiscoveryRow(item, index) {
  return normalizeDiscoveryRow(
    {
      id: `discovery-excel-${index}`,
      permitDate: item.건축정보일자,
      checkStatus: item.확인,
      salesTarget: item.영업자,
      projectCategory: item.사업구분,
      client: item.발주처,
      projectName: item.사업명,
      projectAmount: item.사업금액,
      completionPeriod: item.준공시기,
      manager: item.담당자,
      note: item.세부내용 ?? item.비고,
    },
    index
  )
}

function applyDiscoveryRowsToState(normalizedRows, preserveDrafts, setters) {
  const { setDiscoveryRows, setDiscoveryTableData, setSelectedDiscoveryIds } = setters
  setDiscoveryRows((prev) => {
    const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
    return [...normalizedRows, ...draftRows]
  })
  setDiscoveryTableData(normalizedRows.map(discoveryRowToExcelTableItem))
  setSelectedDiscoveryIds([])
}

function matchesDiscoveryExcelTableSearch(item, searchText) {
  const query = safeString(searchText).trim()
  if (!query) return true
  const haystack = DISCOVERY_EXCEL_TABLE_FIELDS.map((field) =>
    discoveryExcelCellDisplay(item[field])
  ).join(' ')
  return haystack.includes(query)
}

function toDiscoveryPayload(row, timestamp) {
  return {
    permitDate: toDbDate(row.permitDate),
    checkStatus: safeString(row.checkStatus).trim(),
    salesTarget: safeString(row.salesTarget).trim(),
    projectCategory: safeString(row.projectCategory).trim(),
    localGov: safeString(row.localGov).trim(),
    client: safeString(row.client).trim(),
    projectName: safeString(row.projectName).trim(),
    projectAmount: parseAmount(row.projectAmount),
    completionPeriod: safeString(row.completionPeriod).trim(),
    manager: safeString(row.manager).trim(),
    note: safeString(row.note).trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function normalizeExcludedRow(item) {
  return {
    id: safeString(item.id),
    orderNo: safeString(item.orderNo ?? item.orderno),
    writeDate: safeString(item.writeDate ?? item.writedate),
    openDate: safeString(item.openDate ?? item.opendate),
    category: safeString(item.category),
    keyword: safeString(item.keyword),
    writer: safeString(item.writer),
    projectName: safeString(item.projectName ?? item.projectname),
    client: safeString(item.client),
    projectAmount: safeString(item.projectAmount ?? item.projectamount),
    exclusionReason: safeString(item.exclusionReason ?? item.exclusionreason),
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isExcludedRowEmpty(row) {
  return EXCLUDED_COLUMNS.every((column) => {
    if (column.type === 'importance') return true
    return safeString(row[column.key]).trim() === ''
  })
}

function toExcludedPayload(row, timestamp) {
  return {
    orderNo: safeString(row.orderNo).trim(),
    writeDate: toDbDate(row.writeDate),
    openDate: toDbDate(row.openDate),
    category: safeString(row.category).trim(),
    keyword: safeString(row.keyword).trim(),
    writer: safeString(row.writer).trim(),
    projectName: safeString(row.projectName).trim(),
    client: safeString(row.client).trim(),
    projectAmount: parseAmount(row.projectAmount),
    exclusionReason: safeString(row.exclusionReason).trim(),
    updatedAt: timestamp,
  }
}

function getRegistryCellSearchValue(column, row) {
  if (column.type === 'importance') {
    const normalized = resolveRegistryImportanceStatus(row, column)
    const { label } = getImportanceStyle(normalized)
    return `${normalized} ${label}`.trim().toLowerCase()
  }

  if (column.type === 'amount') {
    const raw = normalizeAmountValue(row[column.key])
    if (!raw) return ''
    return `${raw} ${formatAmountDisplay(raw)}`.toLowerCase()
  }

  return safeString(row[column.key]).trim().toLowerCase()
}

function matchesRegistrySearch(row, columns, keyword) {
  const normalizedKeyword = safeString(keyword).trim().toLowerCase()
  if (!normalizedKeyword || row.isDraft) return true

  return columns.some((column) =>
    getRegistryCellSearchValue(column, row).includes(normalizedKeyword)
  )
}

function getRegistryRowDateYmd(row, dateKey) {
  const normalized = toDbDate(row?.[dateKey])
  if (normalized) return normalized
  const parsed = parseDateOnly(row?.[dateKey])
  return parsed ? formatDateInput(parsed) : ''
}

/** 기간 검색: startDate/endDate(yyyy-mm-dd) 중 하나라도 있으면 dateKey 기준으로 필터 */
function matchesDateRangeFilter(row, dateKey, startDate, endDate) {
  const start = safeString(startDate).trim()
  const end = safeString(endDate).trim()
  if (!start && !end) return true
  if (row?.isDraft) return true

  const rowYmd = getRegistryRowDateYmd(row, dateKey)
  if (!rowYmd) return false

  if (start && rowYmd < start) return false
  if (end && rowYmd > end) return false
  return true
}

function formatYmdSlash(ymd) {
  const s = safeString(ymd).trim()
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  return s.replace(/-/g, '/')
}

function openNativeDatePicker(inputEl) {
  if (!inputEl) return
  if (typeof inputEl.showPicker === 'function') {
    try {
      inputEl.showPicker()
      return
    } catch {
      /* 일부 브라우저는 사용자 제스처 없으면 거부 */
    }
  }
  inputEl.click()
}

function RegistryDateRangeFilter({ startDate, endDate, onStartChange, onEndChange }) {
  const startInputRef = useRef(null)
  const endInputRef = useRef(null)
  const startLabel = formatYmdSlash(startDate) || 'YYYY/MM/DD'
  const endLabel = formatYmdSlash(endDate) || 'YYYY/MM/DD'

  return (
    <div className="registry-date-range-picker" role="group" aria-label="기간 검색">
      <button
        type="button"
        className="registry-date-range-picker-segment"
        onClick={() => openNativeDatePicker(startInputRef.current)}
        aria-label="시작일 선택"
      >
        <span className={startDate ? '' : 'registry-date-range-picker-placeholder'}>{startLabel}</span>
      </button>
      <span className="registry-date-range-picker-sep" aria-hidden="true">
        ~
      </span>
      <button
        type="button"
        className="registry-date-range-picker-segment"
        onClick={() => openNativeDatePicker(endInputRef.current)}
        aria-label="종료일 선택"
      >
        <span className={endDate ? '' : 'registry-date-range-picker-placeholder'}>{endLabel}</span>
      </button>
      <button
        type="button"
        className="registry-date-range-picker-icon"
        onClick={() => openNativeDatePicker(startInputRef.current)}
        aria-label="기간 선택"
      >
        <span aria-hidden="true">📅</span>
      </button>
      <input
        ref={startInputRef}
        type="date"
        className="registry-date-range-picker-native"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={endInputRef}
        type="date"
        className="registry-date-range-picker-native"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

function getRegistryCellSignatureValue(column, row) {
  if (column.type === 'amount') {
    return normalizeAmountValue(row[column.key])
  }

  if (column.type === 'date') {
    return toDbDate(row[column.key]) ?? ''
  }

  return safeString(row[column.key]).trim()
}

function getRegistryRowSignature(row, columns) {
  return columns
    .map((column) => `${column.key}:${getRegistryCellSignatureValue(column, row)}`)
    .join('|')
}

function getRegistryRowYear(row, dateKey) {
  const value = safeString(row[dateKey]).trim()
  const parsedDate = parseDateOnly(value)
  if (parsedDate) {
    return String(parsedDate.getFullYear())
  }

  const matchedYear = value.match(/\d{4}/)
  return matchedYear ? matchedYear[0] : '미분류'
}

function groupRegistryRowsByYear(rows, dateKey) {
  const groupMap = new Map()
  const orderedGroups = []

  rows.forEach((row) => {
    const year = getRegistryRowYear(row, dateKey)
    if (!groupMap.has(year)) {
      const nextGroup = { year, items: [] }
      groupMap.set(year, nextGroup)
      orderedGroups.push(nextGroup)
    }

    groupMap.get(year).items.push(row)
  })

  return orderedGroups.sort((a, b) => {
    const aNumeric = /^\d{4}$/.test(a.year)
    const bNumeric = /^\d{4}$/.test(b.year)

    if (aNumeric && bNumeric) {
      return Number(b.year) - Number(a.year)
    }

    if (aNumeric) return -1
    if (bNumeric) return 1
    return compareKoreanText(a.year, b.year)
  })
}

/** 영업: 계약&마감 접이 그룹 대상 (상태 마감·계약, DB 레거시 완료 포함) */
function isSalesStageInContractClosedGroup(row) {
  const stage = normalizeSalesProjectStage(row?.projectStage)
  if (SALES_CONTRACT_CLOSED_STAGES.has(stage)) return true
  const raw = safeString(row?.projectStage).trim()
  return raw === '완료' || raw === '마감' || raw === '계약'
}

function isSalesStageCompletedForGrouping(row) {
  return isSalesStageInContractClosedGroup(row)
}

function partitionSalesRowsByContractClosed(rows) {
  const activeItems = []
  const contractClosedItems = []
  for (const row of rows) {
    if (isSalesStageInContractClosedGroup(row)) contractClosedItems.push(row)
    else activeItems.push(row)
  }
  return { activeItems, contractClosedItems }
}

/** 연도별 1차 그룹 안에서 진행 / 계약&마감 2분할 */
function groupSalesRowsByYearWithCompletion(rows, dateKey) {
  const baseGroups = groupRegistryRowsByYear(rows, dateKey)
  return baseGroups.map((group) => {
    const { activeItems, contractClosedItems } = partitionSalesRowsByContractClosed(group.items)
    return {
      ...group,
      activeItems,
      completedItems: contractClosedItems,
      contractClosedSectionLabel: SALES_CONTRACT_CLOSED_GROUP_LABEL,
    }
  })
}

function getLatestRegistryYear(groups) {
  const numericYears = groups
    .map((group) => group.year)
    .filter((year) => /^\d{4}$/.test(year))
    .sort((a, b) => Number(b) - Number(a))

  return numericYears[0] || groups[groups.length - 1]?.year || ''
}

function isRegistryYearOpen(openState, year, defaultYear) {
  return Object.prototype.hasOwnProperty.call(openState, year)
    ? openState[year]
    : year === defaultYear
}

function isAllVisibleRegistryRowsSelected(rows, selectedIds) {
  const visibleIds = rows.map((row) => normalizeRegistryRowId(row.id)).filter(Boolean)
  if (visibleIds.length === 0) return false
  const selectedSet = new Set(selectedIds.map((id) => normalizeRegistryRowId(id)).filter(Boolean))
  return visibleIds.every((id) => selectedSet.has(id))
}

function registryCellDisplayText(value) {
  if (value === null || value === undefined) return ''
  const text = safeString(value).trim()
  if (text === 'undefined' || text === 'null') return ''
  return text
}

function getRegistryPlainDisplayValue(row, column) {
  if (column.type === 'amount') {
    const amountText = registryCellDisplayText(formatAmountDisplay(row[column.key]))
    return amountText || '-'
  }

  if (column.type === 'importance') {
    const { label } = getImportanceStyle(resolveRegistryImportanceStatus(row, column))
    return label || '-'
  }

  if (column.key === 'projectStage') {
    const stage = normalizeSalesProjectStage(row.projectStage)
    return stage || '-'
  }

  return registryCellDisplayText(row[column.key]) || '-'
}

/** 외부일정 본문·목적지 구분자 (JSON 미사용 → Cloudflare WAF 회피) */
const EXTERNAL_SCHEDULE_FIELD_SEP = '\u001f'
const EXTERNAL_SCHEDULE_STORAGE_VERSION = 3

/** 업무일지(DI/도로/영업지원) 본문·기한 구분자 */
const WORK_REPORT_JOURNAL_FIELD_SEP = '\u001e'

const WORK_REPORT_JOURNAL_SECTIONS = new Set([
  WORK_REPORT_SECTION_KEYS.di,
  WORK_REPORT_SECTION_KEYS.road,
  WORK_REPORT_SECTION_KEYS.supportProgress,
  WORK_REPORT_SECTION_KEYS.supportDone,
])

function isWorkReportJournalSection(section) {
  return WORK_REPORT_JOURNAL_SECTIONS.has(safeString(section).trim())
}

function isWorkReportManagedJournalSection(section) {
  const sectionNorm = safeString(section).trim()
  return (
    sectionNorm === WORK_REPORT_SECTION_KEYS.di ||
    sectionNorm === WORK_REPORT_SECTION_KEYS.road
  )
}

function parseExternalScheduleContent(value) {
  const raw = safeString(value).trim()
  if (!raw) {
    return {
      content: '',
      destination: '',
    }
  }

  if (raw.includes(EXTERNAL_SCHEDULE_FIELD_SEP)) {
    const sepIndex = raw.indexOf(EXTERNAL_SCHEDULE_FIELD_SEP)
    return {
      content: safeString(raw.slice(0, sepIndex)).trim(),
      destination: safeString(raw.slice(sepIndex + 1)).trim(),
    }
  }

  if (raw.includes('|') && !raw.startsWith('{')) {
    const [contentPart, destinationPart] = raw.split('|')
    return {
      content: safeString(contentPart).trim(),
      destination: safeString(destinationPart).trim(),
    }
  }

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.v === EXTERNAL_SCHEDULE_STORAGE_VERSION && Array.isArray(parsed.d)) {
        return {
          content: safeString(parsed.d[0]).trim(),
          destination: safeString(parsed.d[1]).trim(),
        }
      }
      if (parsed && typeof parsed === 'object') {
        return {
          content: safeString(parsed.content).trim(),
          destination: safeString(parsed.destination).trim(),
        }
      }
    } catch {
      /* fall through */
    }
  }

  return {
    content: raw,
    destination: '',
  }
}

function serializeExternalScheduleContent(content, destination) {
  const normalizedContent = safeString(content).trim()
  const normalizedDestination = safeString(destination).trim()

  if (!normalizedContent && !normalizedDestination) {
    return ''
  }

  if (!normalizedDestination) {
    return normalizedContent
  }

  return `${normalizedContent}${EXTERNAL_SCHEDULE_FIELD_SEP}${normalizedDestination}`
}

function parseWorkReportJournalContent(value) {
  const raw = safeString(value).trim()
  if (!raw) {
    return { content: '', deadline: '' }
  }

  if (raw.includes(WORK_REPORT_JOURNAL_FIELD_SEP)) {
    const sepIndex = raw.indexOf(WORK_REPORT_JOURNAL_FIELD_SEP)
    return {
      content: safeString(raw.slice(0, sepIndex)).trim(),
      deadline: safeString(raw.slice(sepIndex + 1)).trim(),
    }
  }

  return { content: raw, deadline: '' }
}

function serializeWorkReportJournalContent(content, deadline) {
  const normalizedContent = safeString(content).trim()
  const normalizedDeadline = safeString(deadline).trim()

  if (!normalizedContent && !normalizedDeadline) {
    return ''
  }

  if (!normalizedDeadline) {
    return normalizedContent
  }

  return `${normalizedContent}${WORK_REPORT_JOURNAL_FIELD_SEP}${normalizedDeadline}`
}

function isWafRiskyWorkReportContent(content) {
  const raw = safeString(content)
  if (!raw.trim()) return false
  if (raw.includes('"agenda"') && (raw.includes('"assignee"') || raw.includes('"dueDate"'))) {
    return true
  }
  if (raw.includes('"meta"') && raw.includes('"agenda"')) {
    return true
  }
  if (raw.includes('"content"') && raw.includes('"destination"')) {
    return true
  }
  if (raw.trim().startsWith('{') && raw.includes('"content"')) {
    return true
  }
  return false
}

function ensureWorkReportContentSafeForApi(content, sectionNorm) {
  let next = safeString(content).trim()
  if (!next || !isWafRiskyWorkReportContent(next)) return next

  if (sectionNorm === WORK_REPORT_SECTION_KEYS.meetingMinutes) {
    return next
  }
  if (sectionNorm === WORK_REPORT_SECTION_KEYS.external) {
    const parsed = parseExternalScheduleContent(next)
    return serializeExternalScheduleContent(parsed.content, parsed.destination)
  }
  return next
}

function normalizeWorkReportDateKey(value) {
  const str = safeString(value).trim()
  if (!str) return ''
  return str.slice(0, 10)
}

function workReportRowKeyMatch(row, date, section, orderIndex) {
  return (
    normalizeWorkReportDateKey(row?.date) === normalizeWorkReportDateKey(date) &&
    safeString(row?.section).trim() === safeString(section).trim() &&
    Number(row?.orderIndex || 1) === Number(orderIndex || 1)
  )
}

function pickLatestWorkReportRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return undefined
  if (rows.length === 1) return rows[0]
  return rows.reduce((latest, row) => {
    const latestTs = safeString(latest?.updatedAt || latest?.createdAt)
    const rowTs = safeString(row?.updatedAt || row?.createdAt)
    return rowTs > latestTs ? row : latest
  })
}

/** API 목록에서 해당 주(weekStart) 회의록 행 1건 */
function pickMeetingMinutesStoredRow(weekStartDate, workReportRows, orderIndex = 1) {
  const dateKey = normalizeWorkReportDateKey(weekStartDate)
  if (!dateKey) return undefined
  const section = WORK_REPORT_SECTION_KEYS.meetingMinutes
  const weekStart = formatDateInput(getWeekStartMonday(dateKey))
  const oi = Number(orderIndex || 1)
  const matches = (Array.isArray(workReportRows) ? workReportRows : []).filter((row) => {
    if (safeString(row.section).trim() !== section) return false
    if (Number(row.orderIndex || 1) !== oi) return false
    const rowDateKey = normalizeWorkReportDateKey(row.date)
    const rowWeekStart = formatDateInput(getWeekStartMonday(rowDateKey || dateKey))
    return rowWeekStart === weekStart || rowDateKey === dateKey
  })
  if (!matches.length) return undefined
  const withData = matches.filter(
    (row) => !isMeetingMinutesDataEmpty(parseMeetingMinutesFromEntry(row))
  )
  return pickLatestWorkReportRow(withData.length ? withData : matches)
}

function upsertWorkReportRowInList(rows, nextRow) {
  const filtered = (Array.isArray(rows) ? rows : []).filter(
    (row) => !workReportRowKeyMatch(row, nextRow.date, nextRow.section, nextRow.orderIndex)
  )
  return [...filtered, nextRow]
}

function isWorkReportDraftRowId(id) {
  return safeString(id).startsWith('work-report-draft-')
}

function parseWorkReportCellKey(cellKey) {
  const parts = safeString(cellKey).split('__')
  if (parts.length < 3) return null
  const orderIndex = Number(parts[parts.length - 1])
  if (!Number.isFinite(orderIndex)) return null
  const date = normalizeWorkReportDateKey(parts[0])
  if (!date) return null
  const section = parts.slice(1, -1).join('__')
  return { date, section, orderIndex }
}

function serializeWorkReportEntrySnapshot(row) {
  if (!row) return ''
  const section = safeString(row.section).trim()
  if (section === WORK_REPORT_SECTION_KEYS.external) {
    return JSON.stringify({
      user: safeString(row.user).trim(),
      payload: serializeExternalScheduleContent(row.content, row.destination),
    })
  }
  if (section === WORK_REPORT_SECTION_KEYS.meetingMinutes) {
    return JSON.stringify({
      content: safeString(row.content).trim(),
      user: safeString(row.user).trim(),
    })
  }
  if (section === WORK_REPORT_SECTION_KEYS.checklist) {
    return safeString(row.content).trim()
  }
  if (isWorkReportJournalSection(section)) {
    return JSON.stringify({
      user: safeString(row.user).trim(),
      content: safeString(row.content).trim(),
      deadline: safeString(row.deadline).trim(),
    })
  }
  return JSON.stringify({
    user: safeString(row.user).trim(),
    content: safeString(row.content).trim(),
    destination: safeString(row.destination).trim(),
  })
}

function normalizeWorkReportRow(item) {
  const section = safeString(item.section ?? item.category)
  const orderIndex = Number(item.order_index ?? item.orderIndex ?? 1)
  const decodedContent = decodeWorkReportWireText(item.content)
  const parsedExternalContent =
    section === WORK_REPORT_SECTION_KEYS.external
      ? parseExternalScheduleContent(decodedContent)
      : { content: safeString(decodedContent), destination: '' }
  const parsedJournalContent = isWorkReportJournalSection(section)
    ? parseWorkReportJournalContent(decodedContent)
    : { content: safeString(decodedContent), deadline: '' }

  return {
    id: safeString(item.id),
    date: normalizeWorkReportDateKey(
      item.date ?? item.reportDate ?? item.reportdate ?? item.weekStartDate ?? item.weekstartdate
    ),
    user: safeString(item.user ?? item.assignee).trim(),
    section,
    content: isWorkReportJournalSection(section)
      ? parsedJournalContent.content
      : parsedExternalContent.content,
    destination: parsedExternalContent.destination,
    deadline: parsedJournalContent.deadline,
    orderIndex,
    createdAt: safeString(item.createdAt ?? item.createdat),
    updatedAt: safeString(item.updatedAt ?? item.updatedat),
    isDraft: false,
  }
}

function isWorkReportRowEmpty(row) {
  const normalizedSection = safeString(row.section).trim()
  if (normalizedSection === WORK_REPORT_SECTION_KEYS.external) {
    return (
      safeString(row.user).trim() === '' &&
      safeString(row.content).trim() === '' &&
      safeString(row.destination).trim() === ''
    )
  }

  if (isWorkReportJournalSection(normalizedSection)) {
    const hasContent = safeString(row.content).trim() !== ''
    const hasDeadline = safeString(row.deadline).trim() !== ''
    if (isWorkReportManagedJournalSection(normalizedSection)) {
      const hasUser = safeString(row.user).trim() !== ''
      return !hasContent && !hasDeadline && !hasUser
    }
    return !hasContent && !hasDeadline
  }

  if (normalizedSection === WORK_REPORT_SECTION_KEYS.meetingMinutes) {
    return isMeetingMinutesDataEmpty(parseMeetingMinutesFromEntry(row))
  }

  return safeString(row.content).trim() === ''
}

function toWorkReportPayload(row, timestamp) {
  const sectionNorm = safeString(row.section).trim()
  const resolvedUser = safeString(row.user).trim()
  let content = safeString(row.content).trim()
  let user = resolvedUser

  if (sectionNorm === WORK_REPORT_SECTION_KEYS.external) {
    const parsed = parseExternalScheduleContent(row.content)
    content = serializeExternalScheduleContent(
      parsed.content || row.content,
      safeString(row.destination).trim() || parsed.destination
    )
  } else if (sectionNorm === WORK_REPORT_SECTION_KEYS.meetingMinutes) {
    content = safeString(decodeWorkReportWireText(row.content)).trim()
    user = ''
  } else if (isWorkReportJournalSection(sectionNorm)) {
    content = serializeWorkReportJournalContent(
      safeString(row.content).trim(),
      safeString(row.deadline).trim()
    )
  }

  content = ensureWorkReportContentSafeForApi(content, sectionNorm)

  const reportDate =
    sectionNorm === WORK_REPORT_SECTION_KEYS.meetingMinutes
      ? formatDateInput(getWeekStartMonday(normalizeWorkReportDateKey(row.date)))
      : normalizeWorkReportDateKey(row.date)

  return {
    date: toDbDate(reportDate),
    user,
    section: sectionNorm,
    content,
    order_index: Number(row.orderIndex || 1),
    updatedAt: timestamp,
  }
}

function getDiscoveryCategoryClassName(category) {
  return (
    DISCOVERY_CATEGORY_TONE_MAP[safeString(category).trim()] || 'discovery-category-badge'
  )
}

function getExcludedBadgeStyle(toneMap, value) {
  const tone = toneMap[safeString(value).trim()]
  if (!tone) return null

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    padding: '0 10px',
    borderRadius: 999,
    border: `1px solid ${tone.borderColor}`,
    background: tone.background,
    color: tone.color,
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  }
}

function getDdayText(dateString) {
  const diff = getDateDiffFromToday(dateString)
  if (diff === null) return ''
  if (diff < 0) return '준공'
  if (diff === 0) return 'D-Day'
  return `D-${diff}`
}

/** 캘린더 우측 리스트·일정 객체: 준공일만 D-n / 그 외(당일·과거)=「준공」. 계약·기타는 기존 D+/D-Day/D-n */
function getCalendarListRelativeDayLabel(eventType, dateString) {
  const diff = getDateDiffFromToday(dateString)
  if (diff === null) return ''
  if (eventType === 'due') {
    if (diff > 0) return `D-${diff}`
    return '준공'
  }
  if (diff < 0) return `D+${-diff}`
  if (diff === 0) return 'D-Day'
  return `D-${diff}`
}

/** title에 이미 붙은「계약:」「준공:」「기타:」머리말 제거 (중복 표기 방지) */
function stripRedundantCalendarTitlePrefix(title) {
  let t = safeString(title).trim()
  while (/^(계약|준공|기타)\s*:\s*/u.test(t)) {
    t = t.replace(/^(계약|준공|기타)\s*:\s*/u, '').trim()
  }
  return t
}

/** 우측 리스트 한 줄 제목 — 카테고리별 포맷 분리 (중복 파이프 제거) */
function formatCalendarMonthListTitleLine(item) {
  if (!item) return ''
  const date = safeString(item.date).trim()
  const clean = stripRedundantCalendarTitlePrefix(item.title ?? item.text)
  if (item.type === 'contract') {
    return `${CALENDAR_MONTH_LIST_CATEGORY.CONTRACT} [${date}] ${clean}`
  }
  if (item.type === 'manual') {
    const r = normalizeManualEventRangeInPlace(item)
    const rangeDate = formatCalendarManualRangeLabel(r.dateStart, r.dateEnd)
    return `${CALENDAR_MONTH_LIST_CATEGORY.MANUAL} [${rangeDate}] ${clean}`
  }
  if (item.type === 'due') {
    const diff = getDateDiffFromToday(date)
    if (diff === null) return `${CALENDAR_MONTH_LIST_CATEGORY.DUE} [${date}] ${clean}`
    if (diff > 0) return `D-${diff} | ${CALENDAR_MONTH_LIST_CATEGORY.DUE} [${date}] ${clean}`
    return `${CALENDAR_MONTH_LIST_CATEGORY.DUE} [${date}] ${clean}`
  }
  return `${safeString(item.category).trim() || '기타'} [${date}] ${clean}`
}

function formatPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  if (value >= 99.95) return '100%'
  return `${value.toFixed(1)}%`
}

/** 화면 표기용: 집계 키 `전광판`은 메뉴 용어와 맞춰 `디스플레이`로 표시 (내부 데이터·집계 키는 유지) */
function getContractPageSummaryCategoryTitle(name) {
  return name === '전광판' ? '디스플레이' : name
}

/** 대시보드·계약현황 「연도별 계약금액 현황」 카드 그리드. `formatCategoryTitle`로 화면 제목만 변환. */
function YearContractAmountCategoryCards({ items, keyPrefix, formatCategoryTitle }) {
  const prefix = keyPrefix != null && keyPrefix !== '' ? String(keyPrefix) : ''
  const titleFor = (name) => (typeof formatCategoryTitle === 'function' ? formatCategoryTitle(name) : name)
  return (
    <div className="dashboard-year-cards">
      {items.map((item) => {
        const displayName = titleFor(item.name)
        return (
        <div
          className="dashboard-year-card"
          key={prefix ? `${prefix}-${item.name}` : item.name}
        >
          <div className="graph-card-title">{displayName}</div>

          <div className="year-card-body">
            <div
              className="dashboard-donut"
              style={{ '--ratio': `${Math.min(item.ratio, 100)}%` }}
              aria-label={`${displayName} 비율 ${formatPercent(item.ratio)}`}
            >
              <span>{formatPercent(item.ratio)}</span>
            </div>

            <div className="year-card-metrics">
              <div className="year-card-metric">
                <span className="year-card-label">계약</span>
                <strong>{item.count.toLocaleString('ko-KR')}건</strong>
              </div>

              <div className="year-card-metric">
                <span className="year-card-label">금액</span>
                <strong>{item.amount.toLocaleString('ko-KR')}원</strong>
              </div>

              <div className="year-card-metric ratio">
                <span className="year-card-label">비율</span>
                <strong>{formatPercent(item.ratio)}</strong>
              </div>
            </div>
          </div>
        </div>
        )
      })}
    </div>
  )
}

function getMonthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

function getCategory(contract) {
  const type = safeString(contract.contractType).trim()
  if (type === '55121903') return '전광판'
  if (['43211514', '43211507', '43211902'].includes(type)) return 'BIT'
  if (type === '도로사업') return '도로사업'
  if (type === '유지보수') return '유지보수'
  return null
}

/**
 * 연도별 계약금액 집계.
 * - totalAmount: 해당 연도 전체 항목 합산 (category 미인식 포함) → 리스트 합계와 항상 일치
 * - items: 인식된 카테고리별 금액·비율 (도넛 차트·카드 표시용)
 */
function buildDashboardSummary(contracts) {
  const byYear = {}
  // 연도별 전체 합산 (category 필터 없음) — Single Source of Truth
  const totalByYear = {}

  contracts.forEach((item) => {
    const year = item.year || '미분류'
    const amt = parseAmount(item.amount)

    // 전체 합산
    totalByYear[year] = (totalByYear[year] ?? 0) + amt

    const category = getCategory(item)
    if (!category) return

    if (!byYear[year]) {
      byYear[year] = {}
      DASHBOARD_CATEGORY_ORDER.forEach((name) => {
        byYear[year][name] = { count: 0, amount: 0 }
      })
    }

    byYear[year][category].count += 1
    byYear[year][category].amount += amt
  })

  // 카테고리가 없는 연도도 totalByYear 에 잡힐 수 있으므로 union
  const allYears = new Set([...Object.keys(byYear), ...Object.keys(totalByYear)])

  const years = [...allYears]
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => {
      // 카테고리 합산(차트용) — 미인식 항목은 포함되지 않으므로 비율 기준으로만 사용
      const categoryTotal = byYear[year]
        ? DASHBOARD_CATEGORY_ORDER.reduce((sum, name) => sum + byYear[year][name].amount, 0)
        : 0
      // 상단 요약·하단 리스트와 동일한 전체 합산
      const totalAmount = totalByYear[year] ?? 0

      return {
        year,
        totalAmount,
        items: DASHBOARD_CATEGORY_ORDER.map((name) => {
          const amount = byYear[year]?.[name]?.amount ?? 0
          const ratio = categoryTotal > 0 ? (amount / categoryTotal) * 100 : 0

          return {
            name,
            count: byYear[year]?.[name]?.count ?? 0,
            amount,
            ratio,
          }
        }),
      }
    })

  return { years }
}

function getPersistedRows(rows) {
  return rows.filter((row) => !row.isDraft)
}

function logApiFetchError(label, table, error) {
  console.error(`[${label}] API fetch failed`, {
    table,
    message: error?.message ?? safeString(error),
    code: error?.code ?? '',
    details: error?.details ?? '',
    hint: error?.hint ?? '',
    error,
  })
}

function logApiOperationError(label, error) {
  console.error(`[${label}] API operation failed`, {
    message: error?.message ?? safeString(error),
    name: error?.name,
    stack: error?.stack,
    cause: error?.cause,
    code: error?.code ?? '',
    details: error?.details ?? '',
    hint: error?.hint ?? '',
    error,
  })
}

function getDashboardDisplayDate(value) {
  const raw = safeString(value).trim()
  return raw ? raw.slice(0, 10) : '-'
}

const DASHBOARD_RECENT_ITEM_LIMIT = 10

function getDashboardRecentUpdatedTime(row) {
  const updated = new Date(row.updatedAt || row.createdAt || 0)
  return Number.isNaN(updated.getTime()) ? 0 : updated.getTime()
}

function getDashboardRecentItems(rows, config) {
  return [...rows]
    .sort((a, b) => getDashboardRecentUpdatedTime(b) - getDashboardRecentUpdatedTime(a))
    .slice(0, DASHBOARD_RECENT_ITEM_LIMIT)
    .map((row) => {
      const statusRaw = typeof config.getStatus === 'function' ? config.getStatus(row) : ''
      const status = normalizeStatusForImportance(statusRaw)
      return {
        id: row.id,
        date: getDashboardDisplayDate(row[config.dateKey] || row.createdAt),
        title: config.getTitle(row),
        meta: config.getMeta(row),
        status,
      }
    })
}

/** 등록일이 이번 주(월요일~일요일, 로컬)에 포함되는 행 수 */
function countRowsRegisteredInCurrentWeek(rows, dateKey) {
  const monday = getWeekStartMonday(new Date())
  const sunday = addDays(monday, 6)
  const startYmd = formatDateInput(monday)
  const endYmd = formatDateInput(sunday)
  return rows.filter((row) => {
    const parsed = parseDateOnly(row[dateKey])
    if (!parsed) return false
    const ymd = formatDateInput(parsed)
    return ymd >= startYmd && ymd <= endYmd
  }).length
}

/** 문서 접수·수신 vs 발송·발신 — 텍스트 필드에서 키워드 탐지(발신류 우선) */
function countDocumentsInboundOutbound(rows) {
  let inbound = 0
  let outbound = 0
  for (const row of rows) {
    const hay = [row.method, row.title, row.note, row.senderReceiver, row.writer, row.docNo]
      .map((v) => safeString(v))
      .join('\n')
    if (/(발신|발송)/.test(hay)) outbound += 1
    else if (/(수신|접수)/.test(hay)) inbound += 1
  }
  return { inbound, outbound }
}

function splitDashboardRecentTitleLabel(fullLabel) {
  const s = safeString(fullLabel).trim()
  const idx = s.indexOf(' (')
  if (idx === -1) return { base: s, counts: '' }
  return { base: s.slice(0, idx).trim(), counts: s.slice(idx).trim() }
}

function App() {
  const { isAdmin, sharedSessionExpiresAt, logout, extendLogin } = useAuth()
  const [contactsManageRows, setContactsManageRows] = useState([])
  const [isLoadingContactsManage, setIsLoadingContactsManage] = useState(false)
  const [selectedContactsIds, setSelectedContactsIds] = useState([])
  const [contactsSearch, setContactsSearch] = useState('')
  const [contactsActiveFilters, setContactsActiveFilters] = useState({})
  const [openContactsColumnFilterKey, setOpenContactsColumnFilterKey] = useState(null)
  const [contracts, setContracts] = useState([])
  const [documents, setDocuments] = useState([])
  const [salesRows, setSalesRows] = useState([])
  const [salesRecordModal, setSalesRecordModal] = useState(null)
  const [registryLongTextModal, setRegistryLongTextModal] = useState(null)
  const [discoveryRows, setDiscoveryRows] = useState([])
  const [discoveryTableData, setDiscoveryTableData] = useState([])
  const [excludedRows, setExcludedRows] = useState([])
  const [workReportRows, setWorkReportRows] = useState([])
  const workReportRowsRef = useRef([])
  const initialMenu = resolveInitialMenu()
  const [menu, setMenu] = useState(initialMenu)
  const [expandedMenuGroups, setExpandedMenuGroups] = useState(() =>
    loadExpandedMenuGroups(initialMenu)
  )
  const [openDashboardYears, setOpenDashboardYears] = useState(() => {
    const currentYear = String(new Date().getFullYear())
    return { [currentYear]: true }
  })
  const [openContractYears, setOpenContractYears] = useState({})
  const [isContractPageYearSummaryOpen, setIsContractPageYearSummaryOpen] = useState(false)
  const [installCaseEnvFilter, setInstallCaseEnvFilter] = useState('')
  const [installCaseMiddleFilter, setInstallCaseMiddleFilter] = useState('')
  const [installCaseAudienceFilter, setInstallCaseAudienceFilter] = useState('')
  const [installCaseDetailModal, setInstallCaseDetailModal] = useState(null)
  const [installCases, setInstallCases] = useState([])
  const [installCaseRegisterOpen, setInstallCaseRegisterOpen] = useState(false)
  const [installCaseFormDraft, setInstallCaseFormDraft] = useState(() => getDefaultInstallCaseForm())
  const [installCaseEditingId, setInstallCaseEditingId] = useState(null)
  const [installCaseSubmitting, setInstallCaseSubmitting] = useState(false)
  const [icImageFile, setIcImageFile] = useState(null)
  const [icImagePreview, setIcImagePreview] = useState('')
  const icImageRestoreRef = useRef('')
  const installCaseFormDraftRef = useRef(installCaseFormDraft)
  const icImagePreviewRef = useRef(icImagePreview)
  const [materialsBoardPosts, setMaterialsBoardPosts] = useState([])
  const [materialsBoardRegisterOpen, setMaterialsBoardRegisterOpen] = useState(false)
  const [materialsBoardFormDraft, setMaterialsBoardFormDraft] = useState(() =>
    getDefaultMaterialsBoardForm()
  )
  const [materialsBoardRegisterFolderId, setMaterialsBoardRegisterFolderId] = useState('기타')
  const [materialsBoardFile, setMaterialsBoardFile] = useState([])
  const [materialsBoardEditingId, setMaterialsBoardEditingId] = useState(null)
  const [materialsBoardSubmitting, setMaterialsBoardSubmitting] = useState(false)
  const [materialsBoardSearch, setMaterialsBoardSearch] = useState('')
  const [materialsBoardSelectedFolder, setMaterialsBoardSelectedFolder] = useState(MATERIALS_BOARD_FOLDER_ALL)
  const [materialsBoardCustomFolders, setMaterialsBoardCustomFolders] = useState(() =>
    loadMaterialsBoardCustomFolders()
  )
  const [materialsBoardDownloadingId, setMaterialsBoardDownloadingId] = useState('')
  /** 계약현황: 2차 그룹이 접힌 경우에만 키(`${year}__${groupId}`)를 보관. 비어 있으면 전부 펼침. */
  const [collapsedContractCategoryGroups, setCollapsedContractCategoryGroups] = useState(() => new Set())
  const [selectedContractRowKeys, setSelectedContractRowKeys] = useState(() => new Set())
  const [openDiscoveryYears, setOpenDiscoveryYears] = useState({})
  const [openExcludedYears, setOpenExcludedYears] = useState({})
  const [openDocumentYears, setOpenDocumentYears] = useState({})
  const [openSalesYears, setOpenSalesYears] = useState({})
  const [salesCompletedSectionOpenByYear, setSalesCompletedSectionOpenByYear] = useState({})
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [editingDocumentIds, setEditingDocumentIds] = useState([])
  const [documentEditSnapshots, setDocumentEditSnapshots] = useState({})
  const [isSavingDocuments, setIsSavingDocuments] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [documentDateRange, setDocumentDateRange] = useState({ startDate: '', endDate: '' })
  const [documentActiveFilters, setDocumentActiveFilters] = useState({})
  const [openDocumentColumnFilterKey, setOpenDocumentColumnFilterKey] = useState(null)
  const [selectedSalesIds, setSelectedSalesIds] = useState([])
  const [editingSalesIds, setEditingSalesIds] = useState([])
  const [salesEditSnapshots, setSalesEditSnapshots] = useState({})
  const [isSavingSales, setIsSavingSales] = useState(false)
  const [salesSearch, setSalesSearch] = useState('')
  const [salesDateRange, setSalesDateRange] = useState({ startDate: '', endDate: '' })
  const [salesActiveFilters, setSalesActiveFilters] = useState({})
  const [openSalesColumnFilterKey, setOpenSalesColumnFilterKey] = useState(null)
  const [selectedDiscoveryIds, setSelectedDiscoveryIds] = useState([])
  const [editingDiscoveryIds, setEditingDiscoveryIds] = useState([])
  const [discoveryEditSnapshots, setDiscoveryEditSnapshots] = useState({})
  const [isSavingDiscovery, setIsSavingDiscovery] = useState(false)
  const [discoverySearch, setDiscoverySearch] = useState('')
  const [discoveryDateRange, setDiscoveryDateRange] = useState({ startDate: '', endDate: '' })
  const [discoveryActiveFilters, setDiscoveryActiveFilters] = useState({})
  const [openDiscoveryColumnFilterKey, setOpenDiscoveryColumnFilterKey] = useState(null)
  const [selectedExcludedIds, setSelectedExcludedIds] = useState([])
  const [editingExcludedIds, setEditingExcludedIds] = useState([])
  const [excludedEditSnapshots, setExcludedEditSnapshots] = useState({})
  const [isSavingExcluded, setIsSavingExcluded] = useState(false)
  const [excludedSearch, setExcludedSearch] = useState('')
  const [excludedDateRange, setExcludedDateRange] = useState({ startDate: '', endDate: '' })
  const [excludedActiveFilters, setExcludedActiveFilters] = useState({})
  const [openExcludedColumnFilterKey, setOpenExcludedColumnFilterKey] = useState(null)
  const [editingWorkCellKey, setEditingWorkCellKey] = useState('')
  const [editingWorkCellData, setEditingWorkCellData] = useState(null)
  const [workReportDrafts, setWorkReportDrafts] = useState({})
  const workReportDraftsRef = useRef({})
  const workReportSaveChainRef = useRef(Promise.resolve())
  const saveWorkReportBoardEntryRef = useRef(() => Promise.resolve())
  const skipWorkReportWeekFlushRef = useRef(true)
  useLayoutEffect(() => {
    workReportRowsRef.current = workReportRows
  }, [workReportRows])

  const [isSavingWorkReports, setIsSavingWorkReports] = useState(false)
  const [generatedWorkWeeks, setGeneratedWorkWeeks] = useState([])
  const [selectedWorkWeek, setSelectedWorkWeek] = useState(() =>
    buildWorkReportWeekMeta(new Date()).weekStartDate
  )
  const [workReportFilters, setWorkReportFilters] = useState({
    assignee: '',
  })
  const [isExcludedGuideCollapsed, setIsExcludedGuideCollapsed] = useState(true)
  const [isDocumentGuideCollapsed, setIsDocumentGuideCollapsed] = useState(true)
  const [manualEvents, setManualEvents] = useState([])
  const [search, setSearch] = useState('')
  const [contractDateRange, setContractDateRange] = useState({ startDate: '', endDate: '' })
  const [activeFilters, setActiveFilters] = useState({})
  const [openContractColumnFilterKey, setOpenContractColumnFilterKey] = useState(null)
  const [contractRegisterModalOpen, setContractRegisterModalOpen] = useState(false)
  const [newRow, setNewRow] = useState({ ...emptyContract })
  const [registryCreateModal, setRegistryCreateModal] = useState(null)
  const [calendarEventRegisterOpen, setCalendarEventRegisterOpen] = useState(false)
  /** 계약 셀 편집: UI 행 키(rowKey) + 컬럼 + PATCH용 serverRowId(행의 서버 PK) */
  const [contractEdit, setContractEdit] = useState(null)
  const [contractEditDraft, setContractEditDraft] = useState('')
  /** 영업·건축·사업검색이력·문서 — 계약현황과 동일한 셀 단위 인라인 편집 */
  const [registryCellEdit, setRegistryCellEdit] = useState(null)
  const [registryCellEditDraft, setRegistryCellEditDraft] = useState('')
  /** 계약 삭제: payloadIds + single | 일반: alert / onConfirm + destructive + confirmLabel */
  const [contractConfirmDialog, setContractConfirmDialog] = useState(null)
  const showAppAlert = useCallback((message, title = '알림', onClose) => {
    setContractConfirmDialog({
      title,
      message,
      alert: true,
      ...(typeof onClose === 'function' ? { onConfirm: onClose } : {}),
    })
  }, [])
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [eventForm, setEventForm] = useState({ ...emptyEvent })
  const [calendarManualDetailEditMode, setCalendarManualDetailEditMode] = useState(false)
  const [calendarManualDetailDraft, setCalendarManualDetailDraft] = useState(null)
  const [monthSearch, setMonthSearch] = useState('')
  const [monthTypeFilter, setMonthTypeFilter] = useState(CALENDAR_MONTH_LIST_CATEGORY.ALL)
  const [detailModal, setDetailModal] = useState(null)
  const [remainingTime, setRemainingTime] = useState(() =>
    sharedSessionExpiresAt ? Math.max(0, sharedSessionExpiresAt - Date.now()) : 0
  )
  const [showSessionWarning, setShowSessionWarning] = useState(() => {
    if (!sharedSessionExpiresAt) return false
    const left = sharedSessionExpiresAt - Date.now()
    return left > 0 && left <= CONTRACT_SHARED_WARNING_MS
  })
  const [toastMessage, setToastMessage] = useState('')
  const [registryUploadTarget, setRegistryUploadTarget] = useState('')

  const fileInputRef = useRef(null)
  const registryUploadInputRef = useRef(null)
  const registryUploadTargetRef = useRef('')
  const registryUploadInProgressRef = useRef(false)
  const contractEditRef = useRef(null)
  const contractEditDraftRef = useRef('')
  const registryCellEditRef = useRef(null)
  const registryCellEditDraftRef = useRef('')
  const remoteListsSyncRef = useRef(() => {})

  useEffect(() => {
    contractEditRef.current = contractEdit
  }, [contractEdit])

  useEffect(() => {
    contractEditDraftRef.current = contractEditDraft
  }, [contractEditDraft])

  useEffect(() => {
    registryCellEditRef.current = registryCellEdit
  }, [registryCellEdit])

  useEffect(() => {
    registryCellEditDraftRef.current = registryCellEditDraft
  }, [registryCellEditDraft])

  useEffect(() => {
    installCaseFormDraftRef.current = installCaseFormDraft
  }, [installCaseFormDraft])

  useEffect(() => {
    icImagePreviewRef.current = icImagePreview
  }, [icImagePreview])

  useEffect(() => {
    if (menu !== 'contactsManage') return
    if (!isAdmin) return
    void fetchContactsManageRows()
  }, [isAdmin, menu])

  const applyInstallCaseFormDraftSnapshot = useCallback((snap) => {
    if (!snap?.form) return
    const editingId = snap.mode === 'edit' ? snap.editingId || null : null
    setInstallCaseEditingId(editingId)
    setInstallCaseFormDraft(cloneInstallCaseFormDraft(snap.form))
    setIcImageFile(null)
    const img = safeString(snap.imagePreview).trim()
    if (editingId) {
      icImageRestoreRef.current = img || INSTALL_CASE_FALLBACK_HERO
    } else {
      icImageRestoreRef.current = ''
    }
    setIcImagePreview(img)
  }, [])

  const flushInstallCaseFormDraftToStorage = useCallback(() => {
    const form = installCaseFormDraftRef.current
    const imagePreview = icImagePreviewRef.current
    if (!hasMeaningfulInstallCaseFormContent(form, imagePreview)) return
    persistInstallCaseFormDraftToStorage({
      version: 1,
      savedAt: Date.now(),
      mode: installCaseEditingId ? 'edit' : 'create',
      editingId: installCaseEditingId || null,
      form: cloneInstallCaseFormDraft(form),
      imagePreview: pickInstallCaseDraftImageForStorage(imagePreview),
    })
  }, [installCaseEditingId])

  useEffect(() => {
    if (!installCaseRegisterOpen) return undefined
    const timer = window.setTimeout(() => {
      flushInstallCaseFormDraftToStorage()
    }, INSTALL_CASE_FORM_DRAFT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [
    installCaseRegisterOpen,
    installCaseFormDraft,
    icImagePreview,
    installCaseEditingId,
    icImageFile,
    flushInstallCaseFormDraftToStorage,
  ])

  useEffect(() => {
    if (!installCaseRegisterOpen || !icImageFile) return undefined
    if (isInstallCaseVideoFile(icImageFile)) return undefined
    let cancelled = false
    void (async () => {
      try {
        const dataUrl = await readImageFileAsDataUrl(icImageFile)
        if (cancelled || !dataUrl || dataUrl.length > INSTALL_CASE_FORM_DRAFT_MAX_IMAGE_LEN) return
        const form = installCaseFormDraftRef.current
        if (!hasMeaningfulInstallCaseFormContent(form, dataUrl)) return
        persistInstallCaseFormDraftToStorage({
          version: 1,
          savedAt: Date.now(),
          mode: installCaseEditingId ? 'edit' : 'create',
          editingId: installCaseEditingId || null,
          form: cloneInstallCaseFormDraft(form),
          imagePreview: dataUrl,
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [icImageFile, installCaseRegisterOpen, installCaseEditingId])

  const fetchContracts = async () => {
    try {
      const data = await contractsApi.list()
      if (Array.isArray(data) && data.length > 0) {
        console.log('Raw Data sample:', data[0])
      }

      const normalized = Array.isArray(data)
        ? data.map((item, index) => {
            /** contractNo 는 중복될 수 있어 UI/API id 로 쓰지 않음 */
            const serverId = firstUsableContractPathId(item.id, item._id, item.contract_id, item.ID)
            return {
              ...item,
              id: serverId,
              key: serverId,
              selectKey: serverId || `__ROW__${index}`,
            }
          })
        : []
      setContracts(normalized)
      return normalized
    } catch (error) {
      console.error('[계약현황] API fetch failed', error)
      setContracts([])
      return []
    }
  }

  const fetchDocuments = async (preserveDrafts = true) => {
    try {
      const rows = await documentRegisterApi.list()
      setDocuments((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeDocumentRow), ...draftRows]
      })
      setSelectedDocumentIds([])
      return rows
    } catch (error) {
      console.error('[문서수발신대장] API fetch failed', error)
      setDocuments([])
      setSelectedDocumentIds([])
      return []
    }
  }

  const fetchSalesRows = async (preserveDrafts = true) => {
    try {
      const rows = await salesRegisterApi.list()
      setSalesRows((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeSalesRow), ...draftRows]
      })
      setSelectedSalesIds([])
      return rows
    } catch (error) {
      console.error('[영업관리대장] API fetch failed', error)
      setSalesRows([])
      setSelectedSalesIds([])
      return []
    }
  }

  const fetchDiscoveryRows = async (preserveDrafts = true) => {
    try {
      const rows = await projectDiscoveryApi.list()
      const normalizedRows = (Array.isArray(rows) ? rows : []).map((item, index) =>
        normalizeDiscoveryRow(item, index)
      )
      applyDiscoveryRowsToState(normalizedRows, preserveDrafts, {
        setDiscoveryRows,
        setDiscoveryTableData,
        setSelectedDiscoveryIds,
      })
      return rows
    } catch (error) {
      console.warn('[건축정보] API 조회 실패 — 화면 데이터 유지', error)
      return []
    }
  }

  const fetchExcludedRows = async (preserveDrafts = true) => {
    try {
      const rows = await excludedProjectsApi.list()
      setExcludedRows((prev) => {
        const draftRows = preserveDrafts ? prev.filter((row) => row.isDraft) : []
        return [...rows.map(normalizeExcludedRow), ...draftRows]
      })
      setSelectedExcludedIds([])
      return rows
    } catch (error) {
      console.error('[사업검색이력] API fetch failed', error)
      setExcludedRows([])
      setSelectedExcludedIds([])
      return []
    }
  }

  const fetchWorkReportRows = async () => {
    try {
      const rows = await weeklyWorkReportsApi.list()
      const normalized = rows.map(normalizeWorkReportRow)
      workReportRowsRef.current = normalized
      setWorkReportRows(normalized)
      return rows
    } catch (error) {
      console.error('[주간업무보고서] API fetch failed', error)
      workReportRowsRef.current = []
      setWorkReportRows([])
      return []
    }
  }

  const fetchInstallCases = async () => {
    try {
      const rows = await installCasesApi.list()
      const normalized = Array.isArray(rows) ? rows.map(normalizeInstallCaseRow) : []
      setInstallCases(normalized)
      return normalized
    } catch (error) {
      console.error('[설치사례] API fetch failed', error)
      setInstallCases([])
      return []
    }
  }

  const fetchMaterialsBoardPosts = async () => {
    try {
      const rows = await materialsBoardApi.list()
      const normalized = Array.isArray(rows) ? rows.map(normalizeMaterialsBoardPost) : []
      setMaterialsBoardPosts(normalized)
      return normalized
    } catch (error) {
      console.error('[게시판] API fetch failed', error)
      setMaterialsBoardPosts([])
      return []
    }
  }

  const fetchCalendarEvents = async () => {
    try {
      let rows = await calendarEventsApi.list()
      let list = Array.isArray(rows) ? rows : []

      if (list.length === 0) {
        const localRows = loadManualEventsFromLocalStorage()
        if (localRows.length > 0) {
          try {
            await calendarEventsApi.importRows(localRows.map(calendarManualEventToPayload))
            clearLocalCalendarManualEventsStorage()
            rows = await calendarEventsApi.list()
            list = Array.isArray(rows) ? rows : []
          } catch (importError) {
            console.error('[캘린더] localStorage → DB 이전 실패', importError)
            const normalizedLocal = localRows.map((row) =>
              normalizeCalendarManualEvent(normalizeManualEventRangeInPlace(row))
            )
            setManualEvents(normalizedLocal)
            return normalizedLocal
          }
        }
      }

      const normalized = list
        .map(normalizeCalendarManualEvent)
        .filter(Boolean)
        .map((row) => ({ ...row, ...normalizeManualEventRangeInPlace(row) }))
      setManualEvents(normalized)
      return normalized
    } catch (error) {
      console.error('[캘린더] API fetch failed', error)
      setManualEvents([])
      return []
    }
  }

  useEffect(() => {
    remoteListsSyncRef.current = () => {
      void fetchContracts()
      void fetchDocuments(true)
      void fetchSalesRows(true)
      void fetchDiscoveryRows(true)
      void fetchExcludedRows(true)
      void fetchWorkReportRows()
      void fetchInstallCases()
      void fetchMaterialsBoardPosts()
      void fetchCalendarEvents()
    }
  })

  const saveContractToApi = async (formData) => {
    const payload = normalizeContractPayload(formData)

    try {
      const data = await contractsApi.create(payload)
      return data ? [data] : []
    } catch (error) {
      logApiOperationError('계약현황 저장', error)
      return null
    }
  }

  /** 로그인 전에는 JWT 없이 list가 비거나 401 → 빈 목록만 보임. 인증 성공 후에만 계약 목록을 불러옵니다. */
  useEffect(() => {
    void fetchContracts()
  }, [])

  useEffect(() => {
    if (!isWorkReportRelatedMenu(menu)) return
    void fetchWorkReportRows()
  }, [menu])

  useEffect(() => {
    if (!isWorkReportRelatedMenu(menu)) return
    const refetchOnVisible = () => {
      if (document.visibilityState === 'visible') void fetchWorkReportRows()
    }
    window.addEventListener('focus', refetchOnVisible)
    document.addEventListener('visibilitychange', refetchOnVisible)
    return () => {
      window.removeEventListener('focus', refetchOnVisible)
      document.removeEventListener('visibilitychange', refetchOnVisible)
    }
  }, [menu])

  useEffect(() => {
    if (menu !== 'documents') return
    void fetchDocuments(true)
  }, [menu])

  useEffect(() => {
    if (menu !== 'sales') return
    void fetchSalesRows(true)
  }, [menu])

  useEffect(() => {
    if (menu !== 'discovery') return
    void fetchDiscoveryRows(true)
  }, [menu])

  useEffect(() => {
    if (menu !== 'excluded') return
    void fetchExcludedRows(true)
  }, [menu])

  useEffect(() => {
    if (menu !== 'installCases') return
    void fetchInstallCases()
  }, [menu])

  useEffect(() => {
    if (menu !== 'materialsBoard') return
    void fetchMaterialsBoardPosts()
  }, [menu])

  useEffect(() => {
    if (menu !== 'calendar') return
    void fetchCalendarEvents()
  }, [menu])

  useEffect(() => {
    setRegistryCellEdit(null)
    setRegistryCellEditDraft('')
  }, [menu])

  useEffect(() => {
    try {
      if (menu === 'unitPrice') {
        if (window.location.pathname !== UNIT_PRICE_MENU_PATH) {
          window.history.replaceState(null, '', UNIT_PRICE_MENU_PATH)
        }
      } else if (window.location.pathname === UNIT_PRICE_MENU_PATH) {
        window.history.replaceState(null, '', '/')
      }
    } catch {
      /* ignore */
    }
  }, [menu])

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_MENU_STORAGE_KEY, menu)
    } catch {
      /* ignore */
    }
    const activeGroupId = getMenuGroupIdForMenu(menu)
    if (!activeGroupId) return
    setExpandedMenuGroups((prev) => {
      if (prev[activeGroupId]) return prev
      const next = { ...prev, [activeGroupId]: true }
      persistExpandedMenuGroups(next)
      return next
    })
  }, [menu])

  const toggleMenuGroup = useCallback((groupId) => {
    setExpandedMenuGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] }
      persistExpandedMenuGroups(next)
      return next
    })
  }, [])

  useEffect(() => {
    setInstallCaseDetailModal(null)
    setInstallCaseRegisterOpen(false)
    setInstallCaseEditingId(null)
    setIcImageFile(null)
    setIcImagePreview('')
    icImageRestoreRef.current = ''
    setMaterialsBoardRegisterOpen(false)
    setMaterialsBoardEditingId(null)
    setMaterialsBoardFormDraft(getDefaultMaterialsBoardForm())
    setMaterialsBoardRegisterFolderId('기타')
    setMaterialsBoardFile([])
    setMaterialsBoardSearch('')
  }, [menu])

  useEffect(() => {
    setContractRegisterModalOpen(false)
    setRegistryCreateModal(null)
    setCalendarEventRegisterOpen(false)
    setNewRow({ ...emptyContract })
  }, [menu])

  /** 다른 메뉴로 나갈 때 빈 신규 행(isDraft)·편집 모드만 정리 — 업로드/추가가 막히는 유령 상태 방지 */
  useEffect(() => {
    if (menu === 'documents') return
    setEditingDocumentIds([])
    setDocumentEditSnapshots({})
    setDocuments((prev) => prev.filter((row) => !(row.isDraft && isDocumentRowEmpty(row))))
  }, [menu])

  useEffect(() => {
    if (menu === 'sales') return
    setEditingSalesIds([])
    setSalesEditSnapshots({})
    setSalesRows((prev) => prev.filter((row) => !(row.isDraft && isSalesRowEmpty(row))))
  }, [menu])

  useEffect(() => {
    if (menu === 'discovery') return
    setEditingDiscoveryIds([])
    setDiscoveryEditSnapshots({})
    setDiscoveryRows((prev) => prev.filter((row) => !(row.isDraft && isDiscoveryRowEmpty(row))))
  }, [menu])

  useEffect(() => {
    if (menu === 'excluded') return
    setEditingExcludedIds([])
    setExcludedEditSnapshots({})
    setExcludedRows((prev) => prev.filter((row) => !(row.isDraft && isExcludedRowEmpty(row))))
  }, [menu])

  useEffect(() => {
    if (menu !== 'dashboard') return
    void fetchContracts()
    void fetchDocuments(false)
    void fetchSalesRows(false)
    void fetchDiscoveryRows(false)
    void fetchExcludedRows(false)
    void fetchWorkReportRows()
  }, [menu])

  useEffect(() => {
    if (!toastMessage) return undefined

    const timeoutId = window.setTimeout(() => {
      setToastMessage('')
    }, 2600)

    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  useEffect(() => {
    if (!sharedSessionExpiresAt) return undefined

    const checkSession = () => {
      const now = Date.now()
      const nextRemainingTime = Math.max(0, sharedSessionExpiresAt - now)
      setRemainingTime(nextRemainingTime)
      setShowSessionWarning(
        nextRemainingTime > 0 && nextRemainingTime <= CONTRACT_SHARED_WARNING_MS
      )

      if (now >= sharedSessionExpiresAt) {
        clearSharedAuthState()
      }
    }

    checkSession()
    const timer = window.setInterval(checkSession, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [sharedSessionExpiresAt])

  const REMOTE_LIST_POLL_MS = 10_000

  useEffect(() => {
    return undefined

    let debounceTimer = 0

    const run = () => {
      remoteListsSyncRef.current()
    }

    const scheduleRun = () => {
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(run, 200)
    }

    const intervalId = window.setInterval(run, REMOTE_LIST_POLL_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRun()
    }

    window.addEventListener('focus', scheduleRun)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(debounceTimer)
      window.removeEventListener('focus', scheduleRun)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const contractsRawData = contracts

  const contractColumnFilterOptionsMap = useMemo(() => {
    const basePool = contractsRawData.filter(
      (item) =>
        contractMatchesSearch(item, search) &&
        matchesDateRangeFilter(
          item,
          'contractDate',
          contractDateRange.startDate,
          contractDateRange.endDate
        )
    )
    const map = {}
    CONTRACT_COLUMNS.forEach(({ key: columnKey }) => {
      const pool = basePool.filter((item) =>
        contractMatchesColumnFilters(item, activeFilters, columnKey)
      )
      map[columnKey] = buildContractColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [
    activeFilters,
    contractDateRange.endDate,
    contractDateRange.startDate,
    contractsRawData,
    search,
  ])

  const handleActiveFiltersApply = useCallback((columnKey, selected) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  /** [1단계] rawData → 검색·기간·헤더 열 필터(AND) → filteredData */
  const filteredData = useMemo(() => {
    const toolbarFiltered = contractsRawData.filter(
      (item) =>
        contractMatchesSearch(item, search) &&
        matchesDateRangeFilter(
          item,
          'contractDate',
          contractDateRange.startDate,
          contractDateRange.endDate
        )
    )
    const columnFiltered = filterContractRowsByActiveFilters(toolbarFiltered, activeFilters)
    return sortContracts(columnFiltered)
  }, [
    activeFilters,
    contractDateRange.endDate,
    contractDateRange.startDate,
    contractsRawData,
    search,
  ])

  const filteredTotalAmount = useMemo(
    () => filteredData.reduce((sum, item) => sum + parseAmount(item.amount), 0),
    [filteredData]
  )

  const isContractsTableDefaultFilterState = useMemo(
    () =>
      !safeString(search).trim() &&
      !hasActiveContractColumnFilters(activeFilters) &&
      !safeString(contractDateRange.startDate).trim() &&
      !safeString(contractDateRange.endDate).trim(),
    [
      activeFilters,
      contractDateRange.endDate,
      contractDateRange.startDate,
      search,
    ]
  )

  const isContractTableFilterResultEmpty = useMemo(
    () => contractsRawData.length > 0 && filteredData.length === 0,
    [contractsRawData.length, filteredData.length]
  )

  const remainingSessionMinutes = useMemo(() => {
    if (!sharedSessionExpiresAt) return 0
    return Math.max(0, Math.ceil(remainingTime / (60 * 1000)))
  }, [remainingTime, sharedSessionExpiresAt])

  /** 자동 로그인(30일) 등 24시간 초과 세션 — 분 단위 타이머 대신 문구 표시 */
  const isLongLivedSession = remainingSessionMinutes > 24 * 60

  /** [2단계] filteredData만 그룹화 — 원본 contracts 미사용 */
  const groupedContracts = useMemo(
    () => groupContractsForAccordion(filteredData),
    [filteredData]
  )

  const contractPageSummaryFocusYear = useMemo(() => {
    const yearFilter = activeFilters.year
    if (Array.isArray(yearFilter) && yearFilter.length === 1) return yearFilter[0]
    return groupedContracts[0]?.year ?? ''
  }, [activeFilters.year, groupedContracts])

  const contractPageSummaryRows = useMemo(() => {
    const y = contractPageSummaryFocusYear
    if (!y) return []
    return filteredData.filter((item) => (getYearLabel(item.year) || '미분류') === y)
  }, [filteredData, contractPageSummaryFocusYear])

  const contractPageYearSummaryBlock = useMemo(() => {
    const y = contractPageSummaryFocusYear
    if (!y) return null
    // buildDashboardSummary 가 이미 전체 합산 totalAmount 를 반환하므로 그대로 사용
    const { years } = buildDashboardSummaryForFocusYear(contractPageSummaryRows, y)
    const fromData = years[0]
    if (fromData) return fromData
    return buildEmptyContractYearSummaryBlock(y)
  }, [contractPageSummaryFocusYear, contractPageSummaryRows])

  const filteredInstallCases = useMemo(() => {
    return installCases.filter((row) => {
      const envOk = !installCaseEnvFilter || row.environment === installCaseEnvFilter
      const midOk =
        !installCaseMiddleFilter || row.middleCategory === installCaseMiddleFilter
      const audOk = !installCaseAudienceFilter || row.audience === installCaseAudienceFilter
      return envOk && midOk && audOk
    })
  }, [installCaseAudienceFilter, installCaseEnvFilter, installCaseMiddleFilter, installCases])

  useEffect(() => {
    if (!icImageFile) return undefined
    const u = URL.createObjectURL(icImageFile)
    setIcImagePreview(u)
    return () => URL.revokeObjectURL(u)
  }, [icImageFile])

  const deleteInstallCaseById = useCallback((id) => {
    setContractConfirmDialog({
      title: '설치사례 삭제',
      message: '이 설치사례를 삭제할까요?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await installCasesApi.remove(id)
          setInstallCases((prev) => prev.filter((row) => row.id !== id))
          setInstallCaseDetailModal((cur) => (cur && cur.id === id ? null : cur))
        } catch (error) {
          logApiOperationError('설치사례 삭제', error)
          showAppAlert(error?.message || '삭제에 실패했습니다.', '알림')
        }
      },
    })
  }, [])

  const openInstallCaseRegisterEmpty = useCallback(() => {
    setInstallCaseEditingId(null)
    setIcImageFile(null)
    setIcImagePreview('')
    icImageRestoreRef.current = ''
    setInstallCaseFormDraft(getDefaultInstallCaseForm())
    setInstallCaseRegisterOpen(true)
  }, [])

  const handleOpenInstallCaseRegister = useCallback(() => {
    const stored = loadInstallCaseFormDraftFromStorage()
    if (
      stored?.mode === 'create' &&
      hasMeaningfulInstallCaseFormContent(stored.form, stored.imagePreview)
    ) {
      setContractConfirmDialog({
        title: '임시 저장',
        message: '작성 중인 내용이 있습니다. 불러오시겠습니까?',
        confirmLabel: '불러오기',
        onConfirm: () => {
          applyInstallCaseFormDraftSnapshot(stored)
          setInstallCaseRegisterOpen(true)
        },
        onCancel: () => {
          clearInstallCaseFormDraftStorage()
          openInstallCaseRegisterEmpty()
        },
      })
      return
    }
    openInstallCaseRegisterEmpty()
  }, [applyInstallCaseFormDraftSnapshot, openInstallCaseRegisterEmpty])

  const handleOpenInstallCaseEdit = useCallback((row) => {
    if (!row) return

    const openEditFromRow = () => {
      setInstallCaseEditingId(row.id)
      const da = parseWhMmNumbers(safeString(row.specs?.displayArea))
      const ms = parseWhMmNumbers(safeString(row.specs?.moduleSize))
      const ms2 = parseWhMmNumbers(safeString(row.specs?.moduleSize2))
      const res = parseResolutionStoredToWH(safeString(row.specs?.resolution))
      const mq = parseModuleQtyToWH(safeString(row.specs?.moduleQty))
      const mq2 = parseModuleQtyToWH(safeString(row.specs?.moduleQty2))
      setInstallCaseFormDraft({
        projectName: safeString(row.projectName).trim(),
        environment: migrateInstallCaseMajorCategory(row.environment),
        middleCategory: migrateInstallCaseMiddleCategory(row.middleCategory, row.environment),
        audience: migrateInstallCaseMinorCategory(row.audience),
        businessYearDigits: parseYearToFormDigits(row.year),
        purpose: safeString(row.purpose).trim(),
        client: safeString(row.client).trim(),
        specs: {
          displayAreaW: da ? String(da.w) : '',
          displayAreaH: da ? String(da.h) : '',
          moduleSizeW: ms ? String(ms.w) : '',
          moduleSizeH: ms ? String(ms.h) : '',
          moduleSize2W: ms2 ? String(ms2.w) : '',
          moduleSize2H: ms2 ? String(ms2.h) : '',
          ledPitch: installCaseLedPitchToFormValue(row.specs?.ledPitch),
          moduleQtyW: mq.w,
          moduleQtyH: mq.h,
          moduleQty2W: mq2.w,
          moduleQty2H: mq2.h,
          resolutionW: res.w,
          resolutionH: res.h,
          installType: safeString(row.specs?.installType).trim(),
        },
      })
      icImageRestoreRef.current =
        safeString(row.heroImage).trim() ||
        INSTALL_CASE_FALLBACK_HERO
      setIcImageFile(null)
      setIcImagePreview(icImageRestoreRef.current)
      setInstallCaseRegisterOpen(true)
    }

    const stored = loadInstallCaseFormDraftFromStorage()
    if (
      stored?.mode === 'edit' &&
      stored.editingId === row.id &&
      hasMeaningfulInstallCaseFormContent(stored.form, stored.imagePreview)
    ) {
      setContractConfirmDialog({
        title: '임시 저장',
        message: '작성 중인 내용이 있습니다. 불러오시겠습니까?',
        confirmLabel: '불러오기',
        onConfirm: () => {
          applyInstallCaseFormDraftSnapshot(stored)
          setInstallCaseRegisterOpen(true)
        },
        onCancel: () => {
          clearInstallCaseFormDraftStorage()
          openEditFromRow()
        },
      })
      return
    }
    openEditFromRow()
  }, [applyInstallCaseFormDraftSnapshot])

  const handleCloseInstallCaseRegister = useCallback(
    ({ discardDraft = false } = {}) => {
      setInstallCaseSubmitting(false)
      if (!discardDraft) {
        flushInstallCaseFormDraftToStorage()
      }
      setIcImageFile(null)
      setIcImagePreview('')
      icImageRestoreRef.current = ''
      setInstallCaseEditingId(null)
      setInstallCaseRegisterOpen(false)
      setInstallCaseFormDraft(getDefaultInstallCaseForm())
    },
    [flushInstallCaseFormDraftToStorage]
  )

  const clearInstallCaseImage = useCallback(() => {
    setIcImageFile(null)
    if (installCaseEditingId && safeString(icImageRestoreRef.current).trim()) {
      setIcImagePreview(icImageRestoreRef.current)
    } else {
      setIcImagePreview('')
    }
  }, [installCaseEditingId])

  const materialsBoardFolderNav = useMemo(
    () => buildMaterialsBoardFolderNav(materialsBoardCustomFolders),
    [materialsBoardCustomFolders]
  )

  const materialsBoardAssignableFolders = useMemo(
    () => getMaterialsBoardAssignableFolders(materialsBoardCustomFolders),
    [materialsBoardCustomFolders]
  )

  const materialsBoardRegisterFolderOptions = useMemo(() => {
    const base = materialsBoardAssignableFolders
    const current = safeString(materialsBoardRegisterFolderId).trim()
    if (current && !base.includes(current)) {
      return [...base, current]
    }
    return base
  }, [materialsBoardAssignableFolders, materialsBoardRegisterFolderId])

  useEffect(() => {
    persistMaterialsBoardCustomFolders(materialsBoardCustomFolders)
  }, [materialsBoardCustomFolders])

  useEffect(() => {
    if (!materialsBoardRegisterOpen || materialsBoardEditingId) return
    if (materialsBoardSelectedFolder === MATERIALS_BOARD_FOLDER_ALL) return
    setMaterialsBoardRegisterFolderId(materialsBoardSelectedFolder)
  }, [
    materialsBoardRegisterOpen,
    materialsBoardEditingId,
    materialsBoardSelectedFolder,
  ])

  const filteredMaterialsBoardPosts = useMemo(() => {
    const query = safeString(materialsBoardSearch).trim().toLowerCase()
    let rows = [...materialsBoardPosts].sort(compareMaterialsBoardPosts)

    if (materialsBoardSelectedFolder !== MATERIALS_BOARD_FOLDER_ALL) {
      rows = rows.filter(
        (row) => getMaterialsBoardPostFolder(row) === materialsBoardSelectedFolder
      )
    }

    if (!query) return rows
    return rows.filter((row) => {
      const title = safeString(row.title).toLowerCase()
      const content = safeString(row.content).toLowerCase()
      const fileNames = (Array.isArray(row.files) ? row.files : [])
        .map((f) => safeString(f?.name).toLowerCase())
        .join(' ')
      return (
        title.includes(query) || content.includes(query) || fileNames.includes(query)
      )
    })
  }, [materialsBoardPosts, materialsBoardSearch, materialsBoardSelectedFolder])

  const handleDownloadMaterialsBoardFile = useCallback(
    async (row, event) => {
      if (event?.target?.closest?.('.materials-board-row-actions')) {
        return
      }
      if (!row || materialsBoardDownloadingId === row.id) return

      const targets = getMaterialsBoardDownloadTargets(row)
      if (targets.length === 0) {
        const legacyUrl = safeString(row?.downloadUrl).trim()
        const legacyName = safeString(row?.fileName).trim()
        if (legacyUrl && legacyName) {
          downloadMaterialsBoardBlobUrl(legacyUrl, legacyName)
          setToastMessage('다운로드가 시작되었습니다.')
          return
        }
        showAppAlert('첨부 파일이 없습니다.', '알림')
        return
      }

      setMaterialsBoardDownloadingId(row.id)
      try {
        let lastCount = null
        for (let i = 0; i < targets.length; i += 1) {
          const target = targets[i]
          if (i > 0) {
            await delayMs(350)
          }

          if (target.postId && target.fileId) {
            lastCount = await materialsBoardApi.downloadFile(
              target.postId,
              target.fileId,
              target.fileName
            )
            continue
          }

          if (target.url) {
            downloadMaterialsBoardBlobUrl(target.url, target.fileName)
          }
        }

        if (lastCount != null) {
          setMaterialsBoardPosts((prev) =>
            prev.map((post) =>
              post.id === row.id ? { ...post, downloadCount: lastCount } : post
            )
          )
        }

        setToastMessage(
          targets.length > 1
            ? `${targets.length}개 파일 다운로드가 시작되었습니다.`
            : '다운로드가 시작되었습니다.'
        )
      } catch (error) {
        showAppAlert(error?.message || '다운로드에 실패했습니다.', '알림')
      } finally {
        setMaterialsBoardDownloadingId('')
      }
    },
    [materialsBoardDownloadingId, showAppAlert]
  )

  const handleAddMaterialsBoardFolder = useCallback(() => {
    setContractConfirmDialog({
      title: '새 폴더',
      message: '새 폴더 이름을 입력하세요.',
      confirmLabel: '추가',
      prompt: { value: '', placeholder: '폴더 이름' },
      onConfirm: (value) => {
        const trimmed = safeString(value).trim()
        if (!trimmed) {
          showAppAlert('폴더 이름을 입력해 주세요.', '알림')
          return
        }
        if (isMaterialsBoardFolderNameTaken(trimmed, materialsBoardCustomFolders)) {
          showAppAlert('이미 사용 중인 폴더 이름입니다.', '알림')
          return
        }
        setMaterialsBoardCustomFolders((prev) => [...prev, trimmed])
        setMaterialsBoardSelectedFolder(trimmed)
        setMaterialsBoardRegisterFolderId(trimmed)
      },
    })
  }, [materialsBoardCustomFolders, showAppAlert])

  const updateMaterialsBoardPostsFolder = useCallback(async (fromFolder, toFolder) => {
    const targets = materialsBoardPosts.filter(
      (post) => getMaterialsBoardPostFolder(post) === fromFolder
    )
    for (const post of targets) {
      await materialsBoardApi.update(post.id, {
        title: safeString(post.title).trim(),
        content: safeString(post.content).trim(),
        folder: toFolder,
        files: [],
      })
    }
    if (targets.length > 0) {
      await fetchMaterialsBoardPosts()
    }
  }, [materialsBoardPosts])

  const handleRenameMaterialsBoardFolder = useCallback(
    (folderId) => {
      const oldName = safeString(folderId).trim()
      if (!oldName || oldName === MATERIALS_BOARD_FOLDER_ALL) return

      setContractConfirmDialog({
        title: '폴더명 수정',
        message: `「${oldName}」 폴더의 새 이름을 입력하세요.`,
        confirmLabel: '저장',
        prompt: { value: oldName, placeholder: '폴더 이름' },
        onConfirm: async (value) => {
          const newName = safeString(value).trim()
          if (!newName) {
            showAppAlert('폴더 이름을 입력해 주세요.', '알림')
            return
          }
          if (newName === oldName) return
          if (isMaterialsBoardFolderNameTaken(newName, materialsBoardCustomFolders, oldName)) {
            showAppAlert('이미 사용 중인 폴더 이름입니다.', '알림')
            return
          }

          try {
            await updateMaterialsBoardPostsFolder(oldName, newName)
            if (isMaterialsBoardCustomFolderId(oldName)) {
              setMaterialsBoardCustomFolders((prev) =>
                prev.map((name) => (name === oldName ? newName : name))
              )
            } else if (oldName === '기타' && !materialsBoardCustomFolders.includes(newName)) {
              setMaterialsBoardCustomFolders((prev) => [...prev, newName])
            }
            if (materialsBoardSelectedFolder === oldName) {
              setMaterialsBoardSelectedFolder(newName)
            }
            setToastMessage('폴더명이 변경되었습니다.')
          } catch (error) {
            logApiOperationError('게시판 폴더명 수정', error)
            showAppAlert(error?.message || '폴더명 변경에 실패했습니다.', '알림')
          }
        },
      })
    },
    [
      materialsBoardCustomFolders,
      materialsBoardSelectedFolder,
      showAppAlert,
      updateMaterialsBoardPostsFolder,
    ]
  )

  const handleDeleteMaterialsBoardFolder = useCallback(
    (folderId) => {
      const folderName = safeString(folderId).trim()
      if (!folderName || folderName === MATERIALS_BOARD_FOLDER_ALL) return

      if (!isMaterialsBoardCustomFolderId(folderName)) {
        showAppAlert('기본 폴더 「기타」는 삭제할 수 없습니다.', '알림')
        return
      }

      const postCount = materialsBoardPosts.filter(
        (post) => getMaterialsBoardPostFolder(post) === folderName
      ).length

      setContractConfirmDialog({
        title: '폴더 삭제',
        message:
          postCount > 0
            ? `「${folderName}」 폴더를 삭제하시겠습니까?\n해당 폴더의 게시글 ${postCount}건은 「기타」 폴더로 이동합니다.`
            : `「${folderName}」 폴더를 삭제하시겠습니까?`,
        destructive: true,
        confirmLabel: '삭제',
        onConfirm: async () => {
          try {
            if (postCount > 0) {
              await updateMaterialsBoardPostsFolder(folderName, '기타')
            }
            setMaterialsBoardCustomFolders((prev) => prev.filter((name) => name !== folderName))
            if (materialsBoardSelectedFolder === folderName) {
              setMaterialsBoardSelectedFolder(MATERIALS_BOARD_FOLDER_ALL)
            }
            setToastMessage('폴더가 삭제되었습니다.')
          } catch (error) {
            logApiOperationError('게시판 폴더 삭제', error)
            showAppAlert(error?.message || '폴더 삭제에 실패했습니다.', '알림')
          }
        },
      })
    },
    [materialsBoardPosts, materialsBoardSelectedFolder, showAppAlert, updateMaterialsBoardPostsFolder]
  )

  const handleOpenMaterialsBoardRegister = useCallback(() => {
    if (!isAdmin) return
    setMaterialsBoardEditingId(null)
    const defaultFolder =
      materialsBoardSelectedFolder !== MATERIALS_BOARD_FOLDER_ALL
        ? materialsBoardSelectedFolder
        : '기타'
    setMaterialsBoardFormDraft(getDefaultMaterialsBoardForm())
    setMaterialsBoardRegisterFolderId(defaultFolder)
    setMaterialsBoardFile([])
    setMaterialsBoardRegisterOpen(true)
  }, [isAdmin, materialsBoardSelectedFolder])

  const handleOpenMaterialsBoardEdit = useCallback((row) => {
    if (!row || !isAdmin) return
    setMaterialsBoardEditingId(row.id)
    setMaterialsBoardFormDraft({
      title: safeString(row.title).trim(),
    })
    setMaterialsBoardRegisterFolderId(getMaterialsBoardPostFolder(row))
    setMaterialsBoardFile([])
    setMaterialsBoardRegisterOpen(true)
  }, [isAdmin])

  const handleCloseMaterialsBoardRegister = useCallback(() => {
    setMaterialsBoardRegisterOpen(false)
    setMaterialsBoardEditingId(null)
    setMaterialsBoardFormDraft(getDefaultMaterialsBoardForm())
    setMaterialsBoardRegisterFolderId('기타')
    setMaterialsBoardFile([])
    setMaterialsBoardSubmitting(false)
  }, [])

  const handleDeleteMaterialsBoardPost = useCallback((row, e) => {
    e?.stopPropagation()
    if (!isAdmin || !row) return
    setContractConfirmDialog({
      title: '게시판 삭제',
      message: `「${row.title}」을(를) 삭제하시겠습니까?`,
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await materialsBoardApi.remove(row.id)
          revokeMaterialsBoardPostUrls(row)
          setMaterialsBoardPosts((prev) => prev.filter((p) => p.id !== row.id))
          setToastMessage('삭제되었습니다.')
        } catch (error) {
          logApiOperationError('게시판 삭제', error)
          showAppAlert(error?.message || '삭제에 실패했습니다.', '알림')
        }
      },
    })
  }, [isAdmin, showAppAlert])

  const handleSaveMaterialsBoardRegister = useCallback(async () => {
    if (!isAdmin || materialsBoardSubmitting) return
    const title = safeString(materialsBoardFormDraft.title).trim()
    if (!title) {
      showAppAlert('제목을 입력해 주세요.', '알림')
      return
    }
    const content = ''
    const editingId = materialsBoardEditingId
    const selectedFolderAtSave =
      materialsBoardSelectedFolder !== MATERIALS_BOARD_FOLDER_ALL
        ? materialsBoardSelectedFolder
        : ''
    const formFolderId = safeString(materialsBoardRegisterFolderId).trim()
    const folderId =
      formFolderId || safeString(selectedFolderAtSave).trim() || '기타'

    setMaterialsBoardSubmitting(true)
    try {
      const payload = {
        title,
        content,
        folder: folderId,
        folderId,
        files: materialsBoardFile,
      }
      console.log('API로 전송되는 게시글 데이터:', payload)

      if (editingId) {
        const updated = await materialsBoardApi.update(editingId, payload)
        console.log('서버 저장 결과 folder:', updated?.folder)
        await fetchMaterialsBoardPosts()
        setMaterialsBoardSelectedFolder(safeString(updated?.folder).trim() || folderId)
        setMaterialsBoardFile([])
        handleCloseMaterialsBoardRegister()
        showAppAlert('게시글이 성공적으로 수정되었습니다.', '알림')
      } else {
        const created = await materialsBoardApi.create(payload)
        console.log('서버 저장 결과:', created)
        console.log('서버 저장 결과 folder:', created?.folder)
        const savedFolder = safeString(created?.folder).trim() || folderId
        if (!safeString(created?.folder).trim()) {
          console.warn(
            '[게시판] 서버 응답에 folder가 없습니다. NAS 백엔드를 최신으로 재빌드하고 /api/health 에 materialsBoardFolderApiVersion: 2 인지 확인하세요.'
          )
        }
        await fetchMaterialsBoardPosts()
        setMaterialsBoardSelectedFolder(savedFolder)
        setMaterialsBoardFile([])
        handleCloseMaterialsBoardRegister()
        showAppAlert('게시글이 성공적으로 등록되었습니다.', '알림')
      }
    } catch (error) {
      logApiOperationError(editingId ? '게시판 수정' : '게시판 등록', error)
      showAppAlert(error?.message || '저장에 실패했습니다.', '알림')
    } finally {
      setMaterialsBoardSubmitting(false)
    }
  }, [
    materialsBoardEditingId,
    materialsBoardFile,
    materialsBoardFormDraft,
    materialsBoardRegisterFolderId,
    materialsBoardSelectedFolder,
    materialsBoardSubmitting,
    handleCloseMaterialsBoardRegister,
    isAdmin,
    showAppAlert,
  ])

  const handleInstallCasePairDigitChange = useCallback((pairId, axis) => (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '')
    const wKey = `${pairId}W`
    const hKey = `${pairId}H`
    const key = axis === 'w' ? wKey : hKey
    setInstallCaseFormDraft((prev) => ({
      ...prev,
      specs: { ...prev.specs, [key]: v },
    }))
  }, [])

  const handleInstallCaseLedPitchChange = useCallback((e) => {
    const raw = e.target.value
    let val = raw.replace(/[^0-9.]/g, '')
    const dot = val.indexOf('.')
    if (dot !== -1) {
      val = val.slice(0, dot + 1) + val.slice(dot + 1).replace(/\./g, '')
    }
    val = val.replace(/^\.+/, '')
    const next = val === '' ? '' : `P${val}mm`
    setInstallCaseFormDraft((prev) => ({
      ...prev,
      specs: { ...prev.specs, ledPitch: next },
    }))
  }, [])

  const handleSaveInstallCaseRegister = async () => {
    if (installCaseSubmitting) return

    const d = installCaseFormDraft
    if (!safeString(d.projectName).trim()) {
      showAppAlert('사업명을 입력해 주세요.', '알림')
      return
    }
    if (!safeString(d.environment).trim()) {
      showAppAlert('대분류를 선택해 주세요.', '알림')
      return
    }
    if (!safeString(d.middleCategory).trim()) {
      showAppAlert('중분류를 선택해 주세요.', '알림')
      return
    }
    if (!safeString(d.audience).trim()) {
      showAppAlert('소분류를 선택해 주세요.', '알림')
      return
    }

    let imageUrl = INSTALL_CASE_FALLBACK_HERO
    const imageFile = icImageFile || null
    if (!imageFile) {
      const prev = safeString(icImagePreview).trim()
      if (prev && !prev.startsWith('blob:')) {
        imageUrl = prev
      }
    } else {
      imageUrl = ''
    }

    const projectName = safeString(d.projectName).trim()
    const displayArea = formatInstallCaseWhMmFromWH(d.specs.displayAreaW, d.specs.displayAreaH) || '-'
    const moduleSize = formatInstallCaseWhMmFromWH(d.specs.moduleSizeW, d.specs.moduleSizeH) || '-'
    const moduleSize2 = formatInstallCaseWhMmFromWH(d.specs.moduleSize2W, d.specs.moduleSize2H) || '-'
    const ledPitch = safeString(d.specs.ledPitch).trim() || '-'
    const moduleQty = formatInstallCaseModuleQtyLine(d.specs.moduleQtyW, d.specs.moduleQtyH) || '-'
    const moduleQty2 = formatInstallCaseModuleQtyLine(d.specs.moduleQty2W, d.specs.moduleQty2H) || '-'
    const resolution =
      formatInstallCaseResolutionFromWH(d.specs.resolutionW, d.specs.resolutionH) || '-'
    const rowPayload = {
      projectName,
      heroImage: imageUrl,
      environment: safeString(d.environment).trim(),
      middleCategory: safeString(d.middleCategory).trim(),
      audience: safeString(d.audience).trim(),
      year: businessYearDigitsToStored(d.businessYearDigits),
      purpose: safeString(d.purpose).trim() || '-',
      client: safeString(d.client).trim() || '-',
      specs: {
        displayArea,
        ledPitch,
        moduleSize,
        moduleSize2,
        moduleQty,
        moduleQty2,
        resolution,
        installType: safeString(d.specs.installType).trim() || '-',
      },
    }

    const isEdit = Boolean(installCaseEditingId)
    const editingId = installCaseEditingId
    setInstallCaseSubmitting(true)
    try {
      if (isEdit) {
        await installCasesApi.update(editingId, rowPayload, imageFile)
        clearInstallCaseFormDraftStorage()
        handleCloseInstallCaseRegister({ discardDraft: true })
        const refreshed = await fetchInstallCases()
        const found = refreshed.find((row) => row.id === editingId)
        if (found) setInstallCaseDetailModal(found)
        showAppAlert('설치사례가 성공적으로 수정되었습니다.', '알림')
      } else {
        await installCasesApi.create(rowPayload, imageFile)
        clearInstallCaseFormDraftStorage()
        handleCloseInstallCaseRegister({ discardDraft: true })
        setInstallCaseEnvFilter('')
        setInstallCaseMiddleFilter('')
        setInstallCaseAudienceFilter('')
        await fetchInstallCases()
        showAppAlert('설치사례가 성공적으로 등록되었습니다.', '알림')
      }
    } catch (error) {
      logApiOperationError(isEdit ? '설치사례 수정' : '설치사례 등록', error)
      showAppAlert(
        error?.message || (isEdit ? '수정에 실패했습니다.' : '등록에 실패했습니다.'),
        '알림'
      )
    } finally {
      setInstallCaseSubmitting(false)
    }
  }

  const getContractRowBySelectKey = useCallback(
    (rowKey) => {
      for (const yb of groupedContracts) {
        for (let i = 0; i < yb.items.length; i++) {
          if (getContractTableRowKey(yb.items[i]) === rowKey) {
            return yb.items[i]
          }
        }
      }
      return null
    },
    [groupedContracts]
  )

  /** 계약 테이블 선택 키 = `getContractTableRowKey(record)` (= `record.id`) */
  const contractVisibleRowKeysFlat = useMemo(() => {
    return groupedContracts.flatMap((yb) => yb.items.map((item) => getContractTableRowKey(item)))
  }, [groupedContracts])

  const contractTableColSpan = isAdmin ? CONTRACT_COLUMNS.length + 2 : CONTRACT_COLUMNS.length + 1

  const documentsRawData = documents

  const documentColumnFilterOptionsMap = useMemo(() => {
    const basePool = documentsRawData.filter(
      (row) =>
        matchesRegistrySearch(row, DOCUMENT_COLUMNS, documentSearch) &&
        matchesDateRangeFilter(
          row,
          'docDate',
          documentDateRange.startDate,
          documentDateRange.endDate
        )
    )
    const map = {}
    DOCUMENT_COLUMNS.forEach(({ key: columnKey }) => {
      const pool = basePool.filter((row) =>
        row.isDraft || documentMatchesColumnFilters(row, documentActiveFilters, columnKey)
      )
      map[columnKey] = buildDocumentColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [
    documentActiveFilters,
    documentDateRange.endDate,
    documentDateRange.startDate,
    documentsRawData,
    documentSearch,
  ])

  const handleDocumentActiveFiltersApply = useCallback((columnKey, selected) => {
    setDocumentActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  /** [1단계] rawData → 검색·기간·헤더 열 필터(AND) → filteredData */
  const filteredDocuments = useMemo(() => {
    const toolbarFiltered = documentsRawData.filter(
      (row) =>
        matchesRegistrySearch(row, DOCUMENT_COLUMNS, documentSearch) &&
        matchesDateRangeFilter(
          row,
          'docDate',
          documentDateRange.startDate,
          documentDateRange.endDate
        )
    )
    return filterDocumentRowsByActiveFilters(toolbarFiltered, documentActiveFilters)
  }, [
    documentActiveFilters,
    documentDateRange.endDate,
    documentDateRange.startDate,
    documentsRawData,
    documentSearch,
  ])

  const isDocumentTableFilterResultEmpty = useMemo(
    () => documentsRawData.length > 0 && filteredDocuments.length === 0,
    [documentsRawData.length, filteredDocuments.length]
  )

  const contactsRawData = contactsManageRows

  const contactsColumnFilterOptionsMap = useMemo(() => {
    const basePool = contactsRawData.filter((row) =>
      matchesRegistrySearch(row, CONTACTS_MANAGE_COLUMNS, contactsSearch)
    )
    const map = {}
    CONTACTS_MANAGE_COLUMNS.forEach(({ key: columnKey }) => {
      const pool = basePool.filter((row) =>
        row.isDraft || contactsManageMatchesColumnFilters(row, contactsActiveFilters, columnKey)
      )
      map[columnKey] = buildContactsManageColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [contactsActiveFilters, contactsRawData, contactsSearch])

  const handleContactsActiveFiltersApply = useCallback((columnKey, selected) => {
    setContactsActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  const filteredContactsRows = useMemo(() => {
    const toolbarFiltered = contactsRawData.filter((row) =>
      matchesRegistrySearch(row, CONTACTS_MANAGE_COLUMNS, contactsSearch)
    )
    return filterContactsManageRowsByActiveFilters(toolbarFiltered, contactsActiveFilters)
  }, [contactsActiveFilters, contactsRawData, contactsSearch])

  const isContactsTableFilterResultEmpty = useMemo(
    () => contactsRawData.length > 0 && filteredContactsRows.length === 0,
    [contactsRawData.length, filteredContactsRows.length]
  )

  const salesRawData = salesRows

  const salesColumnFilterOptionsMap = useMemo(() => {
    const basePool = salesRawData.filter(
      (row) =>
        matchesRegistrySearch(row, SALES_COLUMNS, salesSearch) &&
        matchesDateRangeFilter(
          row,
          'registerDate',
          salesDateRange.startDate,
          salesDateRange.endDate
        )
    )
    const map = {}
    SALES_COLUMNS.forEach(({ key: columnKey }) => {
      const pool = basePool.filter((row) =>
        row.isDraft || salesMatchesColumnFilters(row, salesActiveFilters, columnKey)
      )
      map[columnKey] = buildSalesColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [
    salesActiveFilters,
    salesDateRange.endDate,
    salesDateRange.startDate,
    salesRawData,
    salesSearch,
  ])

  const handleSalesActiveFiltersApply = useCallback((columnKey, selected) => {
    setSalesActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  const discoveryRawData = discoveryRows

  const discoveryColumnFilterOptionsMap = useMemo(() => {
    const basePool = discoveryRawData.filter(
      (row) =>
        matchesRegistrySearch(row, DISCOVERY_COLUMNS, discoverySearch) &&
        matchesDateRangeFilter(
          row,
          'permitDate',
          discoveryDateRange.startDate,
          discoveryDateRange.endDate
        )
    )
    const map = {}
    DISCOVERY_COLUMNS.forEach(({ key: columnKey }) => {
      const pool = basePool.filter((row) =>
        row.isDraft || discoveryMatchesColumnFilters(row, discoveryActiveFilters, columnKey)
      )
      map[columnKey] = buildDiscoveryColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [
    discoveryActiveFilters,
    discoveryDateRange.endDate,
    discoveryDateRange.startDate,
    discoveryRawData,
    discoverySearch,
  ])

  const handleDiscoveryActiveFiltersApply = useCallback((columnKey, selected) => {
    setDiscoveryActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  /** [1단계] rawData → 검색·기간·헤더 열 필터(AND) → filteredData */
  const filteredSalesRows = useMemo(() => {
    const toolbarFiltered = salesRawData.filter(
      (row) =>
        matchesRegistrySearch(row, SALES_COLUMNS, salesSearch) &&
        matchesDateRangeFilter(
          row,
          'registerDate',
          salesDateRange.startDate,
          salesDateRange.endDate
        )
    )
    return filterSalesRowsByActiveFilters(toolbarFiltered, salesActiveFilters)
  }, [
    salesActiveFilters,
    salesDateRange.endDate,
    salesDateRange.startDate,
    salesRawData,
    salesSearch,
  ])

  const isSalesTableFilterResultEmpty = useMemo(
    () => salesRawData.length > 0 && filteredSalesRows.length === 0,
    [filteredSalesRows.length, salesRawData.length]
  )

  const filteredDiscoveryRows = useMemo(() => {
    const toolbarFiltered = discoveryRawData.filter(
      (row) =>
        matchesRegistrySearch(row, DISCOVERY_COLUMNS, discoverySearch) &&
        matchesDateRangeFilter(
          row,
          'permitDate',
          discoveryDateRange.startDate,
          discoveryDateRange.endDate
        )
    )
    return filterDiscoveryRowsByActiveFilters(toolbarFiltered, discoveryActiveFilters)
  }, [
    discoveryActiveFilters,
    discoveryDateRange.endDate,
    discoveryDateRange.startDate,
    discoveryRawData,
    discoverySearch,
  ])

  const isDiscoveryTableFilterResultEmpty = useMemo(
    () => discoveryRawData.length > 0 && filteredDiscoveryRows.length === 0,
    [discoveryRawData.length, filteredDiscoveryRows.length]
  )

  const excludedRawData = excludedRows

  const excludedColumnFilterOptionsMap = useMemo(() => {
    const basePool = excludedRawData.filter(
      (row) =>
        matchesRegistrySearch(row, EXCLUDED_COLUMNS, excludedSearch) &&
        matchesDateRangeFilter(
          row,
          'writeDate',
          excludedDateRange.startDate,
          excludedDateRange.endDate
        )
    )
    const map = {}
    EXCLUDED_COLUMNS.forEach(({ key: columnKey }) => {
      const pool = basePool.filter((row) =>
        row.isDraft || excludedMatchesColumnFilters(row, excludedActiveFilters, columnKey)
      )
      map[columnKey] = buildExcludedColumnFilterOptions(pool, columnKey)
    })
    return map
  }, [
    excludedActiveFilters,
    excludedDateRange.endDate,
    excludedDateRange.startDate,
    excludedRawData,
    excludedSearch,
  ])

  const handleExcludedActiveFiltersApply = useCallback((columnKey, selected) => {
    setExcludedActiveFilters((prev) => {
      const next = { ...prev }
      const values = Array.isArray(selected) ? [...selected] : []
      if (values.length === 0) delete next[columnKey]
      else next[columnKey] = values
      return next
    })
  }, [])

  /** [1단계] rawData → 검색·기간·헤더 열 필터(AND) → filteredData */
  const filteredExcludedRows = useMemo(() => {
    const toolbarFiltered = excludedRawData.filter(
      (row) =>
        matchesRegistrySearch(row, EXCLUDED_COLUMNS, excludedSearch) &&
        matchesDateRangeFilter(
          row,
          'writeDate',
          excludedDateRange.startDate,
          excludedDateRange.endDate
        )
    )
    return filterExcludedRowsByActiveFilters(toolbarFiltered, excludedActiveFilters)
  }, [
    excludedActiveFilters,
    excludedDateRange.endDate,
    excludedDateRange.startDate,
    excludedRawData,
    excludedSearch,
  ])

  const isExcludedTableFilterResultEmpty = useMemo(
    () => excludedRawData.length > 0 && filteredExcludedRows.length === 0,
    [excludedRawData.length, filteredExcludedRows.length]
  )

  /** [2단계] filteredData만 그룹화 — 원본 salesRows 미사용 */
  const groupedSalesRows = useMemo(
    () => groupSalesRowsByYearWithCompletion(filteredSalesRows, 'registerDate'),
    [filteredSalesRows]
  )

  /** [2단계] filteredData만 그룹화 — 원본 discoveryRows 미사용 */
  const groupedDiscoveryRows = useMemo(
    () => groupRegistryRowsByYear(filteredDiscoveryRows, 'permitDate'),
    [filteredDiscoveryRows]
  )

  const groupedExcludedRows = useMemo(
    () => groupRegistryRowsByYear(filteredExcludedRows, 'writeDate'),
    [filteredExcludedRows]
  )

  /** [2단계] filteredData만 그룹화 — 원본 documents 미사용 */
  const groupedDocumentRows = useMemo(
    () => groupRegistryRowsByYear(filteredDocuments, 'docDate'),
    [filteredDocuments]
  )

  const workReportWeekOptions = useMemo(() => {
    const weekMap = new Map()

    generatedWorkWeeks.forEach((weekStartDate) => {
      if (!weekMap.has(weekStartDate)) {
        weekMap.set(weekStartDate, buildWorkReportWeekMeta(weekStartDate))
      }
    })

    workReportRows.forEach((row) => {
      const weekStartDate = buildWorkReportWeekMeta(row.date || new Date()).weekStartDate
      if (!weekMap.has(weekStartDate)) {
        weekMap.set(weekStartDate, buildWorkReportWeekMeta(weekStartDate))
      }
    })

    if (!weekMap.has(selectedWorkWeek)) {
      weekMap.set(selectedWorkWeek, buildWorkReportWeekMeta(selectedWorkWeek))
    }

    return [...weekMap.values()].sort(
      (a, b) => new Date(b.weekStartDate).getTime() - new Date(a.weekStartDate).getTime()
    )
  }, [generatedWorkWeeks, selectedWorkWeek, workReportRows])

  const selectedWorkWeekMeta = useMemo(
    () =>
      workReportWeekOptions.find((item) => item.weekStartDate === selectedWorkWeek) ??
      buildWorkReportWeekMeta(selectedWorkWeek),
    [selectedWorkWeek, workReportWeekOptions]
  )
  const dashboardWorkReportWeekMeta = useMemo(() => {
    const currentWeekStartDate = buildWorkReportWeekMeta(new Date()).weekStartDate
    return (
      workReportWeekOptions.find((item) => item.weekStartDate === currentWeekStartDate) ??
      workReportWeekOptions[0] ??
      buildWorkReportWeekMeta(currentWeekStartDate)
    )
  }, [workReportWeekOptions])

  const selectedWorkWeekDays = useMemo(
    () => getWorkReportWeekDays(selectedWorkWeekMeta.weekStartDate),
    [selectedWorkWeekMeta.weekStartDate]
  )
  const filteredWorkReportRows = useMemo(() => {
    return workReportRows.filter((row) => {
      const rowWeekStartDate = buildWorkReportWeekMeta(row.date || new Date()).weekStartDate
      if (rowWeekStartDate !== selectedWorkWeekMeta.weekStartDate) return false
      if (
        workReportFilters.assignee &&
        safeString(row.user).trim() &&
        !safeString(row.user).toLowerCase().includes(workReportFilters.assignee.toLowerCase())
      ) {
        return false
      }
      return true
    })
  }, [
    selectedWorkWeekMeta.weekStartDate,
    workReportFilters.assignee,
    workReportRows,
  ])

  const dashboardTodayWorkBrief = useMemo(() => {
    const now = new Date()
    const todayYmd = formatDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    const checklistText = safeString(
      getWorkReportChecklistCombinedText(
        todayYmd,
        WORK_REPORT_SECTION_KEYS.checklist,
        workReportRows,
        workReportDrafts
      )
    ).trim()
    const externalRows = collectDashboardTodayExternalRows(todayYmd, workReportRows, workReportDrafts)
    const weekStartDate = buildWorkReportWeekMeta(todayYmd).weekStartDate
    const meetingMinutesRows = getDashboardWeekMeetingMinutesRows(
      weekStartDate,
      workReportRows,
      workReportDrafts
    )
    return {
      todayYmd,
      weekStartDate,
      checklistText,
      externalRows,
      meetingMinutesRows,
      hasChecklist: Boolean(checklistText),
      hasExternal: externalRows.length > 0,
      hasMeetingMinutes: meetingMinutesRows.length > 0,
    }
  }, [workReportRows, workReportDrafts])

  const dashboardCurrentYear = String(new Date().getFullYear())
  const dashboardSummary = useMemo(() => {
    const { years } = buildDashboardSummary(contracts)
    const currentYearBlock = years.find((y) => String(y.year) === dashboardCurrentYear)
    if (currentYearBlock) {
      return { years: [currentYearBlock] }
    }
    return {
      years: [
        {
          year: dashboardCurrentYear,
          totalAmount: 0,
          items: DASHBOARD_CATEGORY_ORDER.map((name) => ({
            name,
            count: 0,
            amount: 0,
            ratio: 0,
          })),
        },
      ],
    }
  }, [contracts, dashboardCurrentYear])
  const dashboardData = useMemo(() => {
    const persistedSalesRows = getPersistedRows(salesRows)
    const persistedDiscoveryRows = getPersistedRows(discoveryRows)
    const persistedExcludedRows = getPersistedRows(excludedRows)
    const persistedDocuments = getPersistedRows(documents)
    const salesWeekCount = countRowsRegisteredInCurrentWeek(persistedSalesRows, 'registerDate')
    const discoveryWeekCount = countRowsRegisteredInCurrentWeek(persistedDiscoveryRows, 'permitDate')
    const excludedWeekCount = countRowsRegisteredInCurrentWeek(persistedExcludedRows, 'writeDate')
    const { inbound: docInboundCount, outbound: docOutboundCount } =
      countDocumentsInboundOutbound(persistedDocuments)

    return {
      recentGroups: [
        {
          key: 'sales',
          label: `영업관리대장 (이번 주 ${salesWeekCount.toLocaleString('ko-KR')}건)`,
          menu: 'sales',
          items: getDashboardRecentItems(persistedSalesRows, {
            dateKey: 'registerDate',
            getTitle: (row) => safeString(row.projectName || row.client).trim() || '영업 항목',
            getMeta: (row) =>
              [row.client, row.manager || row.projectStage].filter(Boolean).join(' · ') || '-',
            getStatus: (row) => row.projectStage,
          }),
        },
        {
          key: 'discovery',
          label: `건축정보 (이번 주 ${discoveryWeekCount.toLocaleString('ko-KR')}건)`,
          menu: 'discovery',
          items: getDashboardRecentItems(persistedDiscoveryRows, {
            dateKey: 'permitDate',
            getTitle: (row) => safeString(row.projectName || row.client).trim() || '건축정보 항목',
            getMeta: (row) =>
              [row.client, row.manager || row.salesTarget].filter(Boolean).join(' · ') || '-',
          }),
        },
        {
          key: 'excluded',
          label: `사업검색이력 (이번 주 ${excludedWeekCount.toLocaleString('ko-KR')}건)`,
          menu: 'excluded',
          items: getDashboardRecentItems(persistedExcludedRows, {
            dateKey: 'writeDate',
            getTitle: (row) => safeString(row.projectName || row.client).trim() || '검색이력 항목',
            getMeta: (row) =>
              [row.client, row.writer || row.category].filter(Boolean).join(' · ') || '-',
            getStatus: (row) => row.category,
          }),
        },
        {
          key: 'documents',
          label: `문서수발신대장 (수신 ${docInboundCount.toLocaleString('ko-KR')}건 / 발신 ${docOutboundCount.toLocaleString('ko-KR')}건)`,
          menu: 'documents',
          items: getDashboardRecentItems(persistedDocuments, {
            dateKey: 'docDate',
            getTitle: (row) => safeString(row.title || row.docNo).trim() || '문서 항목',
            getMeta: (row) =>
              [row.senderReceiver, row.writer || row.method].filter(Boolean).join(' · ') || '-',
          }),
        },
      ],
    }
  }, [discoveryRows, documents, excludedRows, salesRows])
  const currentRegistryYear = String(new Date().getFullYear())
  const defaultContractYear = groupedContracts.find((group) => group.year === currentRegistryYear)?.year ?? groupedContracts[0]?.year
  const defaultSalesYear = groupedSalesRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedSalesRows)
  const defaultDiscoveryYear = groupedDiscoveryRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedDiscoveryRows)
  const defaultExcludedYear = groupedExcludedRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedExcludedRows)
  const defaultDocumentYear = groupedDocumentRows.find((group) => group.year === currentRegistryYear)?.year ?? getLatestRegistryYear(groupedDocumentRows)

  const isDashboardYearOpen = (year) => {
    const key = String(year)
    return Object.prototype.hasOwnProperty.call(openDashboardYears, key)
      ? openDashboardYears[key]
      : key === dashboardCurrentYear
  }

  const isContractYearOpen = (year) =>
    Object.prototype.hasOwnProperty.call(openContractYears, year)
      ? openContractYears[year]
      : year === defaultContractYear

  const isSalesYearOpen = (year) =>
    isRegistryYearOpen(openSalesYears, year, defaultSalesYear)

  const isDiscoveryYearOpen = (year) =>
    isRegistryYearOpen(openDiscoveryYears, year, defaultDiscoveryYear)

  const isExcludedYearOpen = (year) =>
    isRegistryYearOpen(openExcludedYears, year, defaultExcludedYear)

  const isDocumentYearOpen = (year) =>
    isRegistryYearOpen(openDocumentYears, year, defaultDocumentYear)

  const allContractsSelected =
    contractVisibleRowKeysFlat.length > 0 &&
    contractVisibleRowKeysFlat.every((rk) => selectedContractRowKeys.has(rk))
  const allSalesSelected = isAllVisibleRegistryRowsSelected(filteredSalesRows, selectedSalesIds)
  const allDiscoverySelected = isAllVisibleRegistryRowsSelected(
    filteredDiscoveryRows,
    selectedDiscoveryIds
  )
  const allExcludedSelected = isAllVisibleRegistryRowsSelected(
    filteredExcludedRows,
    selectedExcludedIds
  )
  const allDocumentsSelected = isAllVisibleRegistryRowsSelected(filteredDocuments, selectedDocumentIds)
  const allContactsSelected = isAllVisibleRegistryRowsSelected(
    filteredContactsRows,
    selectedContactsIds
  )

  const calendarItems = useMemo(() => {
    const contractDateItems = contracts
      .filter((item) => item.contractDate)
      .map((item) => ({
        id: `contract-${item.id}`,
        contractId: item.id,
        date: item.contractDate,
        category: CALENDAR_MONTH_LIST_CATEGORY.CONTRACT,
        title: `계약: ${item.projectName}`,
        text: `계약: ${item.projectName}`,
        type: 'contract',
        dday: getCalendarListRelativeDayLabel('contract', item.contractDate),
        owner: item.salesOwner,
        pm: item.pm,
        contract: item,
      }))

    const dueDateItems = contracts
      .filter((item) => item.dueDate)
      .map((item) => ({
        id: `due-${item.id}`,
        contractId: item.id,
        date: item.dueDate,
        category: CALENDAR_MONTH_LIST_CATEGORY.DUE,
        title: `준공: ${item.projectName}`,
        text: `준공: ${item.projectName}`,
        type: 'due',
        dday: getCalendarListRelativeDayLabel('due', item.dueDate),
        owner: item.salesOwner,
        pm: item.pm,
        contract: item,
      }))

    const extraItems = manualEvents.map((item) => {
      const r = normalizeManualEventRangeInPlace(item)
      return {
        id: `manual-${item.id}`,
        date: r.dateStart,
        dateStart: r.dateStart,
        dateEnd: r.dateEnd,
        category: CALENDAR_MONTH_LIST_CATEGORY.MANUAL,
        title: item.title,
        text: item.title,
        type: 'manual',
        owner: item.owner,
        pm: item.pm || '',
        note: item.note,
        dday: getCalendarListRelativeDayLabel('manual', r.dateEnd),
        originalId: item.id,
      }
    })

    return [...contractDateItems, ...dueDateItems, ...extraItems]
  }, [contracts, manualEvents])

  const dashboardWeekDueRows = useMemo(
    () => collectDashboardWeekDueRows(calendarItems, new Date()),
    [calendarItems]
  )

  const dashboardWeekWorkRows = useMemo(
    () => collectDashboardWeekWorkRows(workReportRows, workReportDrafts, new Date()),
    [workReportRows, workReportDrafts]
  )

  const monthDays = useMemo(() => {
    const year = calendarCursor.getFullYear()
    const month = calendarCursor.getMonth()
    /** JS: 0=일요일 … 6=토요일 → 달력 첫 열은 일요일 */
    const firstDaySundayBased = new Date(year, month, 1).getDay()
    const lastDay = new Date(year, month + 1, 0).getDate()

    const cells = []
    for (let i = 0; i < firstDaySundayBased; i += 1) cells.push(null)
    for (let i = 1; i <= lastDay; i += 1) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`)
    }
    return cells
  }, [calendarCursor])

  const monthEventList = useMemo(() => {
    const year = calendarCursor.getFullYear()
    const month = calendarCursor.getMonth() + 1

    return [...calendarItems]
      .filter((item) => {
        if (!calendarItemOverlapsCalendarMonth(item, year, month)) return false
        if (!calendarMonthListEventPassesCategoryFilter(item, monthTypeFilter)) return false
        const searchMatch = `${item.text} ${item.owner || ''} ${item.pm || ''} ${item.note || ''}`
          .toLowerCase()
          .includes(monthSearch.toLowerCase())

        return searchMatch
      })
      .sort((a, b) => {
        const aKey = a.type === 'manual' ? normalizeManualEventRangeInPlace(a).dateStart : a.date
        const bKey = b.type === 'manual' ? normalizeManualEventRangeInPlace(b).dateStart : b.date
        const aDate = parseDateOnly(aKey)
        const bDate = parseDateOnly(bKey)
        return (aDate?.getTime() ?? 0) - (bDate?.getTime() ?? 0)
      })
  }, [calendarCursor, calendarItems, monthSearch, monthTypeFilter])

  const calendarTodayYmd = formatDateInput(new Date())

  const resetAppUiOnLogout = () => {
    setContractEdit(null)
    setContractEditDraft('')
    setSelectedContractRowKeys(new Set())
    setContractConfirmDialog(null)
    setContractRegisterModalOpen(false)
    setRegistryCreateModal(null)
    setCalendarEventRegisterOpen(false)
    setNewRow({ ...emptyContract })
  }

  const clearSharedAuthState = () => {
    logout()
    setRemainingTime(0)
    setShowSessionWarning(false)
    resetAppUiOnLogout()
  }

  const requireAdmin = () => {
    if (isAdmin) return true
    showAppAlert('관리자 권한으로 로그인해야 편집할 수 있습니다.', '알림')
    return false
  }

  const handleExtendLogin = async () => {
    const expiresAt = await extendLogin()
    setRemainingTime(Math.max(0, expiresAt - Date.now()))
    setShowSessionWarning(false)
  }

  const fetchContactsManageRows = async () => {
    setIsLoadingContactsManage(true)
    try {
      const rows = await contactsManageApi.list()
      setContactsManageRows(Array.isArray(rows) ? rows : [])
    } catch (error) {
      const isNotFound =
        error?.status === 404 ||
        error?.response?.status === 404
      if (isNotFound) {
        console.warn('연락처 API 미구현(404) — 빈 목록으로 표시합니다.')
        setContactsManageRows([])
      } else {
        console.error('연락처 데이터를 불러오지 못했습니다.', error)
        showAppAlert('연락처 데이터를 불러오지 못했습니다.')
        setContactsManageRows([])
      }
    } finally {
      setIsLoadingContactsManage(false)
    }
  }

  const handleAddContactsRow = () => {
    showAppAlert('연락처 등록 기능은 준비 중입니다.')
  }

  const handleContactsExcelUpload = () => {
    showAppAlert('연락처 엑셀 업로드 기능은 준비 중입니다.')
  }

  const toggleContactsSelection = (rowId) => {
    setSelectedContactsIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedContactsRows = () => {
    const validSelectedIds = selectedContactsIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      showAppAlert('삭제할 행을 선택해주세요.')
      return
    }

    setContractConfirmDialog({
      title: '선택 삭제',
      message: '선택한 연락처를 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: () => {
        setContactsManageRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
        setSelectedContactsIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
        setToastMessage('선택한 항목이 삭제되었습니다. (로컬만 반영)')
      },
    })
  }

  const handleContactsExcelDownload = () => {
    const rows = filteredContactsRows.filter((row) => !row.isDraft).map((row) => ({
      구분: row.category,
      사업내용: row.business_content,
      담당자: row.manager_name,
      직위: row.position,
      전화번호: row.phone,
      이메일: row.email,
      비고: row.notes,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '연락처')

    const now = new Date()
    const filename = `연락처_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleContactsCellChange = (rowId, key, value) => {
    setContactsManageRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    )
  }

  const handleAppLogout = () => {
    clearSharedAuthState()
  }

  const toggleContractYear = (year) => {
    setOpenContractYears((prev) => ({
      ...prev,
      [year]: !isContractYearOpen(year),
    }))
  }

  const contractCategoryGroupKey = (year, groupId) => `${year}__${groupId}`

  const isContractCategoryGroupOpen = (year, groupId) =>
    !collapsedContractCategoryGroups.has(contractCategoryGroupKey(year, groupId))

  const toggleContractCategoryGroup = (year, groupId) => {
    const key = contractCategoryGroupKey(year, groupId)
    setCollapsedContractCategoryGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleDashboardYear = (year) => {
    const key = String(year)
    setOpenDashboardYears((prev) => ({
      ...prev,
      [key]: !isDashboardYearOpen(key),
    }))
  }

  const toggleSalesYear = (year) => {
    setOpenSalesYears((prev) => ({
      ...prev,
      [year]: !isSalesYearOpen(year),
    }))
  }

  const isSalesCompletedSectionOpen = (year) =>
    Object.prototype.hasOwnProperty.call(salesCompletedSectionOpenByYear, year)
      ? salesCompletedSectionOpenByYear[year]
      : false

  const toggleSalesCompletedSection = (year) => {
    setSalesCompletedSectionOpenByYear((prev) => ({
      ...prev,
      [year]: !isSalesCompletedSectionOpen(year),
    }))
  }

  const toggleDiscoveryYear = (year) => {
    setOpenDiscoveryYears((prev) => ({
      ...prev,
      [year]: !isDiscoveryYearOpen(year),
    }))
  }

  const toggleExcludedYear = (year) => {
    setOpenExcludedYears((prev) => ({
      ...prev,
      [year]: !isExcludedYearOpen(year),
    }))
  }

  const toggleDocumentYear = (year) => {
    setOpenDocumentYears((prev) => ({
      ...prev,
      [year]: !isDocumentYearOpen(year),
    }))
  }

  const handleExcelImportClick = () => {
    if (!requireAdmin()) return
    fileInputRef.current?.click()
  }

  const handleExcelUpload = async (e) => {
    if (!requireAdmin()) {
      e.target.value = ''
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        showAppAlert('업로드할 시트를 찾을 수 없습니다.')
        return
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const { rows, headerRowIndex } = sheetToJsonWithSmartHeader(
        worksheet,
        CONTRACT_EXCEL_HEADER_KEYWORDS
      )

      if (!rows.length) {
        showAppAlert('업로드할 데이터가 없습니다. (헤더 행을 찾지 못했습니다.)')
        return
      }

      const excelDataStartRow = headerRowIndex + 2

      const imported = rows
        .map((row, rowIndex) => {
          const contractDate = excelDateToInput(
            getValueByHeader(row, ['계약일자', '계약일', '계약 날짜', '계약날짜'])
          )
          const contractDateRaw = safeString(
            getValueByHeader(row, ['계약일자', '계약일', '계약 날짜', '계약날짜'])
          ).trim()
          const dueDateRaw = safeString(
            getValueByHeader(row, ['준공일자', '납기일자', '납기일', '준공일'])
          ).trim()
          const yearFromDate = contractDate ? contractDate.slice(0, 4) : ''

          return {
            _excelRow: excelDataStartRow + rowIndex,
            _contractDateRaw: contractDateRaw,
            _dueDateRaw: dueDateRaw,
            year: safeString(
              getValueByHeader(row, ['사업년도', '사업 년도', '연도', '년도'], yearFromDate)
            )
              .replace(/[^\d]/g, '')
              .slice(0, 4),
            segment: normalizeExcelPlaceholderText(
              safeString(getValueByHeader(row, ['구분'])).trim()
            ),
            refNo: normalizeExcelPlaceholderText(
              sanitizeExcelContractText(
                getValueByHeader(row, ['참고번호', '참고 번호', '공고번호', '공고 번호'])
              )
            ),
            contractNo: normalizeExcelPlaceholderText(
              sanitizeExcelContractText(
                getValueByHeader(row, ['계약번호', '계약 번호', '사업번호', '사업 번호'])
              )
            ),
            client: normalizeExcelPlaceholderText(
              safeString(getValueByHeader(row, ['발주처', '수요기관'])).trim()
            ),
            department: normalizeExcelPlaceholderText(
              safeString(getValueByHeader(row, ['담당부서', '담당 부서'])).trim()
            ),
            contractMethod: normalizeExcelPlaceholderText(
              safeString(getValueByHeader(row, ['계약방식', '계약 방식'])).trim()
            ),
            contractType: normalizeExcelPlaceholderText(
              safeString(getValueByHeader(row, ['계약분류', '계약 분류'])).trim()
            ),
            identNo: normalizeExcelPlaceholderText(
              sanitizeExcelContractText(getValueByHeader(row, ['식별번호']))
            ),
            contractDate,
            dueDate: excelDateToInput(
              getValueByHeader(row, ['준공일자', '납기일자', '납기일', '준공일'])
            ),
            projectName: safeString(
              getValueByHeader(row, ['사업명', '공사명', '과업명', '건명'])
            ).trim(),
            amount: parseAmount(
              getValueByHeader(row, ['계약금액', '계약 금액', '금액', '계약금액VAT포함'])
            ),
            salesOwner: safeString(getValueByHeader(row, ['영업담당자', '영업 담당자'])).trim(),
            pm: safeString(getValueByHeader(row, ['현장PM', '현장 PM', 'PM'])).trim(),
            note: safeString(getValueByHeader(row, ['비고', '메모', '참고사항'])).trim(),
          }
        })
        .filter((item) => item.projectName || item.contractNo || item.client)

      if (!imported.length) {
        showAppAlert('불러올 수 있는 계약 데이터가 없습니다.')
        return
      }

      const normalizedRows = imported
        .filter((item) => item.projectName || item.contractNo || item.client)
        .map((item) => ({
          excelRow: item._excelRow,
          contractDateRaw: item._contractDateRaw,
          dueDateRaw: item._dueDateRaw,
          payload: normalizeContractPayload(item),
        }))

      if (!normalizedRows.length) {
        showAppAlert('불러올 수 있는 계약 데이터가 없습니다.')
        return
      }

      const importIssues = []
      for (const row of normalizedRows) {
        const checkItem = {
          ...row.payload,
          contractDate:
            row.contractDateRaw && !row.payload.contractDate
              ? row.contractDateRaw
              : row.payload.contractDate,
          dueDate:
            row.dueDateRaw && !row.payload.dueDate ? row.dueDateRaw : row.payload.dueDate,
        }
        importIssues.push(...collectContractExcelImportIssues(checkItem, row.excelRow))
      }

        if (importIssues.length) {
        const preview = importIssues.slice(0, 8).join('\n')
        const more =
          importIssues.length > 8 ? `\n… 외 ${importIssues.length - 8}건` : ''
        showAppAlert(
          `엑셀 데이터를 확인해 주세요.\n\n${preview}${more}\n\n날짜 형식을 수정한 뒤 다시 업로드하세요.`
        )
        return
      }

      const payload = normalizedRows.map((row) => row.payload)

      const result = await contractsApi.bulkCreate(payload)

      await fetchContracts()
      const dupLen = Array.isArray(result.duplicateItems) ? result.duplicateItems.length : 0
      const intro = `엑셀 업로드 성공: 신규 ${result.created}건 추가, 중복 ${dupLen}건 제외`
      showAppAlert(intro)
    } catch (error) {
      console.error('엑셀 업로드 중 오류가 발생했습니다.', error)
      const raw = safeString(error?.message).trim() || safeString(error)
      const msg = formatContractExcelImportApiError(raw)
      showAppAlert(msg ? `계약현황 엑셀 업로드 실패:\n${msg}` : '계약현황 엑셀 업로드 중 오류가 발생했습니다.')
    } finally {
      e.target.value = ''
    }
  }

  const handleExcelDownload = () => {
    const rows = sortContracts(contracts).map((item) => ({
      사업년도: item.year,
      구분: item.segment,
      참고번호: item.refNo,
      계약번호: item.contractNo,
      발주처: item.client,
      담당부서: item.department,
      계약방식: item.contractMethod,
      계약분류: item.contractType,
      식별번호: item.identNo,
      계약일자: item.contractDate || '-',
      준공일자: item.dueDate || '-',
      사업명: item.projectName,
      계약금액: formatAmountDisplay(item.amount),
      영업담당자: item.salesOwner,
      '현장 PM': item.pm,
      비고: item.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '계약현황')

    const now = new Date()
    const filename = `계약현황_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const closeRegistryCreateModal = () => setRegistryCreateModal(null)

  const patchRegistryCreateDraft = (key, value) => {
    setRegistryCreateModal((prev) => {
      if (!prev?.draft) return prev
      const v =
        (prev.scope === 'sales' || prev.scope === 'discovery' || prev.scope === 'excluded') &&
        key === 'projectAmount'
          ? formatAmount(value)
          : value
      return { ...prev, draft: { ...prev.draft, [key]: v } }
    })
  }

  const saveRegistryCreateModal = async () => {
    const snap = registryCreateModal
    if (!snap?.draft) return
    const { scope, draft } = snap
    const timestamp = new Date().toISOString()

    if (scope === 'sales') {
      if (isSalesRowEmpty(draft)) {
        showAppAlert('입력 내용을 확인해주세요.')
        return
      }
      setIsSavingSales(true)
      try {
        await salesRegisterApi.create({ ...toSalesPayload(draft, timestamp), createdAt: timestamp })
        await fetchSalesRows(false)
        setToastMessage('저장되었습니다.')
        closeRegistryCreateModal()
      } catch (error) {
        logApiOperationError('영업관리대장 등록', error)
      } finally {
        setIsSavingSales(false)
      }
      return
    }

    if (scope === 'discovery') {
      if (isDiscoveryRowEmpty(draft)) {
        showAppAlert('입력 내용을 확인해주세요.')
        return
      }
      setIsSavingDiscovery(true)
      try {
        await projectDiscoveryApi.create({
          ...toDiscoveryPayload(draft, timestamp),
          createdAt: timestamp,
        })
        await fetchDiscoveryRows(false)
        setToastMessage('저장되었습니다.')
        closeRegistryCreateModal()
      } catch (error) {
        logApiOperationError('건축정보 등록', error)
      } finally {
        setIsSavingDiscovery(false)
      }
      return
    }

    if (scope === 'excluded') {
      if (isExcludedRowEmpty(draft)) {
        showAppAlert('입력 내용을 확인해주세요.')
        return
      }
      setIsSavingExcluded(true)
      try {
        await excludedProjectsApi.create({
          ...toExcludedPayload(draft, timestamp),
          createdAt: timestamp,
        })
        await fetchExcludedRows(false)
        setToastMessage('저장되었습니다.')
        closeRegistryCreateModal()
      } catch (error) {
        logApiOperationError('사업검색이력 등록', error)
      } finally {
        setIsSavingExcluded(false)
      }
      return
    }

    if (scope === 'documents') {
      if (isDocumentRowEmpty(draft)) {
        showAppAlert('입력 내용을 확인해주세요.')
        return
      }
      setIsSavingDocuments(true)
      try {
        await documentRegisterApi.create({
          ...toDocumentPayload(draft, timestamp),
          createdAt: timestamp,
        })
        await fetchDocuments(false)
        setToastMessage('저장되었습니다.')
        closeRegistryCreateModal()
      } catch (error) {
        logApiOperationError('문서수발신대장 등록', error)
      } finally {
        setIsSavingDocuments(false)
      }
    }
  }

  const handleAddDocumentRow = () => {
    setRegistryCreateModal({ scope: 'documents', draft: createDocumentDraftRow() })
    setSelectedDocumentIds([])
  }

  const handleDocumentCellChange = (rowId, key, value) => {
    setDocuments((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: value,
            }
          : row
      )
    )
  }

  const startDocumentEdit = (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return

    setDocumentEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingDocumentIds([rowId])
  }

  const cancelDocumentRow = (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDocuments((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setDocuments((prev) =>
      prev.map((row) => (row.id === rowId ? documentEditSnapshots[rowId] ?? row : row))
    )
    setEditingDocumentIds((prev) => prev.filter((id) => id !== rowId))
    setDocumentEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteDocumentRow = async (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDocuments((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setContractConfirmDialog({
      title: '문서수발신대장 삭제',
      message: '이 문서수발신 항목을 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await documentRegisterApi.remove(rowId)
        } catch (error) {
          logApiOperationError('문서수발신대장 삭제', error)
          return
        }

        setEditingDocumentIds((prev) => prev.filter((id) => id !== rowId))
        setDocumentEditSnapshots((prev) => removeObjectKey(prev, rowId))
        await fetchDocuments(false)
      },
    })
  }

  const saveDocumentRow = async (rowId) => {
    const targetRow = documents.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isDocumentRowEmpty(targetRow)) {
      showAppAlert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingDocuments(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await documentRegisterApi.create({
          ...toDocumentPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await documentRegisterApi.update(rowId, toDocumentPayload(targetRow, timestamp))
      }

      await fetchDocuments(false)
      setEditingDocumentIds((prev) => prev.filter((id) => id !== rowId))
      setDocumentEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('문서수발신대장 저장', error)
    } finally {
      setIsSavingDocuments(false)
    }
  }

  const toggleDocumentSelection = (rowId) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedDocuments = async () => {
    const validSelectedIds = selectedDocumentIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      showAppAlert('삭제할 행을 선택해주세요.')
      return
    }

    setContractConfirmDialog({
      title: '선택 삭제',
      message: '선택한 데이터를 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        const persistedIds = documents
          .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
          .map((row) => row.id)
          .filter((id) => safeString(id).trim() !== '')

        if (persistedIds.length > 0) {
          const remainingDrafts = documents.filter(
            (row) => row.isDraft && !validSelectedIds.includes(row.id)
          )
          try {
            await documentRegisterApi.bulkDelete(persistedIds)
          } catch (error) {
            logApiOperationError('문서수발신대장 선택 삭제', error)
            return
          }

          setDocuments(remainingDrafts)
          setSelectedDocumentIds([])
          setEditingDocumentIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
          await fetchDocuments(true)
          return
        }

        setDocuments((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
        setSelectedDocumentIds([])
        setEditingDocumentIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      },
    })
  }

  const saveDocuments = async () => {
    const rowsToInsert = documents.filter((row) => row.isDraft && !isDocumentRowEmpty(row))
    const rowsToUpdate = documents.filter(
      (row) => !row.isDraft && editingDocumentIds.includes(row.id)
    )
    const hasEmptyDraftRows = documents.some((row) => row.isDraft && isDocumentRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      showAppAlert('저장할 행이 없습니다.')
      return
    }

    setIsSavingDocuments(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toDocumentPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await documentRegisterApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            documentRegisterApi.update(row.id, toDocumentPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setDocuments((prev) => prev.filter((row) => !(row.isDraft && isDocumentRowEmpty(row))))
        setSelectedDocumentIds([])
        setEditingDocumentIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchDocuments(false)
      setSelectedDocumentIds([])
      setEditingDocumentIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('문서수발신대장 일괄 저장', error)
    } finally {
      setIsSavingDocuments(false)
    }
  }

  const handleDocumentExcelDownload = () => {
    const rows = filteredDocuments.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.docDate,
      문서번호: row.docNo,
      '수신처 또는 발신처': row.senderReceiver,
      '문서명 또는 제목': row.title,
      '접수 또는 발송형태': row.method,
      '수신자 또는 작성자': row.writer,
      비고: row.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '문서수발신대장')

    const now = new Date()
    const filename = `문서수발신대장_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddSalesRow = () => {
    setRegistryCreateModal({ scope: 'sales', draft: createSalesDraftRow() })
    setSelectedSalesIds([])
  }

  const handleSalesCellChange = (rowId, key, value) => {
    if (key === 'detail') return
    setSalesRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]:
                key === 'projectAmount'
                  ? formatAmount(value)
                  : key === 'projectStage'
                    ? normalizeSalesProjectStage(value)
                    : value,
            }
          : row
      )
    )
  }

  const renderSalesSummaryCell = (row) => {
    const summaryPreview = extractLatestSalesDetailEntry(row.summary)
    return (
      <button
        type="button"
        className={`sales-record-btn${
          hasSalesRecordStoredContent(row.summary) ? ' sales-record-btn--has-content' : ''
        }`}
        title={summaryPreview || '요약'}
        aria-label="요약 보기 및 작성"
        onClick={(e) => {
          e.stopPropagation()
          const rowId = safeString(row?.id).trim()
          if (!rowId || rowId === 'undefined' || row.isDraft || rowId.startsWith('sales-draft-')) {
            showAppAlert('행을 저장한 뒤 요약을 작성할 수 있습니다.', '알림')
            return
          }
          const sourceRow = salesRows.find((item) => item.id === rowId) || row
          const summaryRawInitial = buildSalesSummaryFallbackFromRow(sourceRow)
          const summaryDisplay = getSalesRecordHistoryForDisplay(
            summaryRawInitial,
            sourceRow.registerDate
          )
          setSalesRecordModal({
            rowId,
            client: safeString(sourceRow.client).trim(),
            projectName: safeString(sourceRow.projectName).trim(),
            manager: safeString(sourceRow.manager).trim(),
            department: safeString(sourceRow.department).trim(),
            summary: summaryDisplay,
            summaryRaw: getSalesRecordRawHistory(summaryRawInitial),
            summaryDraft: summaryDisplay,
            summaryDisplayInitial: summaryDisplay,
            isEditingSummary: false,
            newEntry: '',
            saving: false,
          })
        }}
      >
        <FileText size={18} aria-hidden />
      </button>
    )
  }

  const closeSalesRecordModal = () => setSalesRecordModal(null)

  const saveSalesRecordModal = async () => {
    if (!salesRecordModal?.rowId) return
    const rowId = safeString(salesRecordModal.rowId).trim()
    if (!rowId || rowId === 'undefined') {
      showAppAlert('저장 경로를 찾을 수 없거나 서버 통신에 실패했습니다.', '알림')
      return
    }
    const hasNewEntry = safeString(salesRecordModal.newEntry).trim().length > 0
    const summaryEdited =
      safeString(salesRecordModal.summaryDraft).trim() !==
      safeString(salesRecordModal.summaryDisplayInitial).trim()
    if (!hasNewEntry && !summaryEdited) {
      showAppAlert('변경된 내용이 없습니다.', '알림')
      return
    }
    const baseSummary = summaryEdited ? salesRecordModal.summaryDraft : salesRecordModal.summaryRaw
    const merged = buildSalesRecordDetailWithNewEntry(baseSummary, salesRecordModal.newEntry)
    const summaryPayload = normalizeSalesRecordForSave(merged)
    setSalesRecordModal((prev) => (prev ? { ...prev, saving: true } : prev))
    try {
      await salesRegisterApi.update(rowId, { summary: summaryPayload })
      setSalesRows((prev) =>
        prev.map((row) =>
          row.id === rowId ? normalizeSalesRow({ ...row, summary: summaryPayload }) : row
        )
      )
      closeSalesRecordModal()
      await fetchSalesRows(true)
    } catch (error) {
      console.error('영업관리대장 요약 저장 실패', { rowId, summaryLength: summaryPayload.length, error })
      const errorMessage = safeString(error?.message).trim()
      showAppAlert(errorMessage || '요약 저장에 실패했습니다.', '알림')
      setSalesRecordModal((prev) => (prev ? { ...prev, saving: false } : prev))
    }
  }

  const startSalesEdit = (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return

    setSalesEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingSalesIds([rowId])
  }

  const cancelSalesRow = (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setSalesRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setSalesRows((prev) =>
      prev.map((row) => (row.id === rowId ? salesEditSnapshots[rowId] ?? row : row))
    )
    setEditingSalesIds((prev) => prev.filter((id) => id !== rowId))
    setSalesEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteSalesRow = async (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setSalesRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setContractConfirmDialog({
      title: '영업관리대장 삭제',
      message: '이 영업관리대장 항목을 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await salesRegisterApi.remove(rowId)
        } catch (error) {
          logApiOperationError('영업관리대장 삭제', error)
          return
        }

        setEditingSalesIds((prev) => prev.filter((id) => id !== rowId))
        setSalesEditSnapshots((prev) => removeObjectKey(prev, rowId))
        await fetchSalesRows(false)
      },
    })
  }

  const saveSalesRow = async (rowId) => {
    const targetRow = salesRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isSalesRowEmpty(targetRow)) {
      showAppAlert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingSales(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await salesRegisterApi.create({
          ...toSalesPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await salesRegisterApi.update(rowId, toSalesPayload(targetRow, timestamp))
      }

      await fetchSalesRows(false)
      setEditingSalesIds((prev) => prev.filter((id) => id !== rowId))
      setSalesEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('영업관리대장 저장', error)
    } finally {
      setIsSavingSales(false)
    }
  }

  const toggleSalesSelection = (rowId) => {
    setSelectedSalesIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedSalesRows = async () => {
    const validSelectedIds = selectedSalesIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      showAppAlert('삭제할 행을 선택해주세요.')
      return
    }

    setContractConfirmDialog({
      title: '선택 삭제',
      message: '선택한 데이터를 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        const persistedIds = salesRows
          .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
          .map((row) => row.id)
          .filter((id) => safeString(id).trim() !== '')

        if (persistedIds.length > 0) {
          const remainingDrafts = salesRows.filter(
            (row) => row.isDraft && !validSelectedIds.includes(row.id)
          )
          try {
            await salesRegisterApi.bulkDelete(persistedIds)
          } catch (error) {
            logApiOperationError('영업관리대장 선택 삭제', error)
            return
          }

          setSalesRows(remainingDrafts)
          setSelectedSalesIds([])
          setEditingSalesIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
          await fetchSalesRows(true)
          return
        }

        setSalesRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
        setSelectedSalesIds([])
        setEditingSalesIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      },
    })
  }

  const saveSalesRows = async () => {
    const rowsToInsert = salesRows.filter((row) => row.isDraft && !isSalesRowEmpty(row))
    const rowsToUpdate = salesRows.filter((row) => !row.isDraft && editingSalesIds.includes(row.id))
    const hasEmptyDraftRows = salesRows.some((row) => row.isDraft && isSalesRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      showAppAlert('저장할 행이 없습니다.')
      return
    }

    setIsSavingSales(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toSalesPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await salesRegisterApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            salesRegisterApi.update(row.id, toSalesPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setSalesRows((prev) => prev.filter((row) => !(row.isDraft && isSalesRowEmpty(row))))
        setSelectedSalesIds([])
        setEditingSalesIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchSalesRows(false)
      setSelectedSalesIds([])
      setEditingSalesIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('영업관리대장 일괄 저장', error)
    } finally {
      setIsSavingSales(false)
    }
  }

  const handleSalesExcelDownload = () => {
    const rows = filteredSalesRows.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.registerDate,
      발주처: row.client,
      사업명: row.projectName,
      사업금액: formatAmountDisplay(row.projectAmount),
      담당자: row.manager,
      상태: normalizeSalesProjectStage(row.projectStage),
      담당부서: row.department,
      세부내용: row.detail,
      출처: row.source,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '영업관리대장')

    const now = new Date()
    const filename = `영업관리대장_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddDiscoveryRow = () => {
    setRegistryCreateModal({ scope: 'discovery', draft: createDiscoveryDraftRow() })
    setSelectedDiscoveryIds([])
  }

  const handleDiscoveryCellChange = (rowId, key, value) => {
    setDiscoveryRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: key === 'projectAmount' ? formatAmount(value) : value,
            }
          : row
      )
    )
  }

  const startDiscoveryEdit = (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return

    setDiscoveryEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingDiscoveryIds([rowId])
  }

  const cancelDiscoveryRow = (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDiscoveryRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setDiscoveryRows((prev) =>
      prev.map((row) => (row.id === rowId ? discoveryEditSnapshots[rowId] ?? row : row))
    )
    setEditingDiscoveryIds((prev) => prev.filter((id) => id !== rowId))
    setDiscoveryEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteDiscoveryRow = async (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setDiscoveryRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setContractConfirmDialog({
      title: '건축정보 삭제',
      message: '이 건축정보 항목을 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await projectDiscoveryApi.remove(rowId)
        } catch (error) {
          logApiOperationError('건축정보 삭제', error)
          return
        }

        setEditingDiscoveryIds((prev) => prev.filter((id) => id !== rowId))
        setDiscoveryEditSnapshots((prev) => removeObjectKey(prev, rowId))
        await fetchDiscoveryRows(false)
      },
    })
  }

  const saveDiscoveryRow = async (rowId) => {
    const targetRow = discoveryRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isDiscoveryRowEmpty(targetRow)) {
      showAppAlert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingDiscovery(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await projectDiscoveryApi.create({
          ...toDiscoveryPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await projectDiscoveryApi.update(rowId, toDiscoveryPayload(targetRow, timestamp))
      }

      await fetchDiscoveryRows(false)
      setEditingDiscoveryIds((prev) => prev.filter((id) => id !== rowId))
      setDiscoveryEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('건축정보 저장', error)
    } finally {
      setIsSavingDiscovery(false)
    }
  }

  const toggleDiscoverySelection = (rowId) => {
    setSelectedDiscoveryIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedDiscoveryRows = async () => {
    const validSelectedIds = selectedDiscoveryIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      showAppAlert('삭제할 행을 선택해주세요.')
      return
    }

    setContractConfirmDialog({
      title: '선택 삭제',
      message: '선택한 데이터를 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        const persistedIds = discoveryRows
          .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
          .map((row) => row.id)
          .filter((id) => safeString(id).trim() !== '')

        const applyDiscoveryDeleteToState = () => {
          const nextRows = discoveryRows.filter((row) => !validSelectedIds.includes(row.id))
          const persisted = nextRows.filter((row) => !row.isDraft)
          setDiscoveryRows(nextRows)
          setDiscoveryTableData(persisted.map(discoveryRowToExcelTableItem))
          saveStoredDiscoveryRows(persisted)
          setSelectedDiscoveryIds([])
          setEditingDiscoveryIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
          setToastMessage('삭제되었습니다.')
        }

        if (persistedIds.length > 0) {
          try {
            await projectDiscoveryApi.bulkDelete(persistedIds)
          } catch (error) {
            logApiOperationError('건축정보 선택 삭제', error)
            return
          }
          applyDiscoveryDeleteToState()
          return
        }

        applyDiscoveryDeleteToState()
      },
    })
  }

  const saveDiscoveryRows = async () => {
    const rowsToInsert = discoveryRows.filter((row) => row.isDraft && !isDiscoveryRowEmpty(row))
    const rowsToUpdate = discoveryRows.filter(
      (row) => !row.isDraft && editingDiscoveryIds.includes(row.id)
    )
    const hasEmptyDraftRows = discoveryRows.some((row) => row.isDraft && isDiscoveryRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      showAppAlert('저장할 행이 없습니다.')
      return
    }

    setIsSavingDiscovery(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toDiscoveryPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await projectDiscoveryApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            projectDiscoveryApi.update(row.id, toDiscoveryPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setDiscoveryRows((prev) => prev.filter((row) => !(row.isDraft && isDiscoveryRowEmpty(row))))
        setSelectedDiscoveryIds([])
        setEditingDiscoveryIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchDiscoveryRows(false)
      setSelectedDiscoveryIds([])
      setEditingDiscoveryIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('건축정보 일괄 저장', error)
    } finally {
      setIsSavingDiscovery(false)
    }
  }

  const handleDiscoveryExcelDownload = () => {
    const rows = filteredDiscoveryRows.filter((row) => !row.isDraft).map((row) => ({
      건축정보일자: row.permitDate,
      확인: row.checkStatus,
      영업자: row.salesTarget,
      사업구분: row.projectCategory,
      발주처: row.client,
      사업명: row.projectName,
      사업금액: formatAmountDisplay(row.projectAmount),
      준공시기: row.completionPeriod,
      담당자: row.manager,
      세부내용: row.note,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '건축정보')

    const now = new Date()
    const filename = `건축정보_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const handleAddExcludedRow = () => {
    setRegistryCreateModal({ scope: 'excluded', draft: createExcludedDraftRow() })
    setSelectedExcludedIds([])
  }

  const handleExcludedCellChange = (rowId, key, value) => {
    setExcludedRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: key === 'projectAmount' ? formatAmount(value) : value,
            }
          : row
      )
    )
  }

  const startExcludedEdit = (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow || targetRow.isDraft) return

    setExcludedEditSnapshots((prev) =>
      prev[rowId]
        ? prev
        : {
            ...prev,
            [rowId]: { ...targetRow },
          }
    )
    setEditingExcludedIds([rowId])
  }

  const cancelExcludedRow = (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setExcludedRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setExcludedRows((prev) =>
      prev.map((row) => (row.id === rowId ? excludedEditSnapshots[rowId] ?? row : row))
    )
    setEditingExcludedIds((prev) => prev.filter((id) => id !== rowId))
    setExcludedEditSnapshots((prev) => removeObjectKey(prev, rowId))
  }

  const deleteExcludedRow = async (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (targetRow.isDraft) {
      setExcludedRows((prev) => prev.filter((row) => row.id !== rowId))
      return
    }

    setContractConfirmDialog({
      title: '사업검색이력 삭제',
      message: '이 사업검색이력 항목을 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await excludedProjectsApi.remove(rowId)
        } catch (error) {
          logApiOperationError('사업검색이력 삭제', error)
          return
        }

        setEditingExcludedIds((prev) => prev.filter((id) => id !== rowId))
        setExcludedEditSnapshots((prev) => removeObjectKey(prev, rowId))
        await fetchExcludedRows(false)
      },
    })
  }

  const saveExcludedRow = async (rowId) => {
    const targetRow = excludedRows.find((row) => row.id === rowId)
    if (!targetRow) return

    if (isExcludedRowEmpty(targetRow)) {
      showAppAlert('입력 내용을 확인해주세요.')
      return
    }

    setIsSavingExcluded(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await excludedProjectsApi.create({
          ...toExcludedPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await excludedProjectsApi.update(rowId, toExcludedPayload(targetRow, timestamp))
      }

      await fetchExcludedRows(false)
      setEditingExcludedIds((prev) => prev.filter((id) => id !== rowId))
      setExcludedEditSnapshots((prev) => removeObjectKey(prev, rowId))
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('사업검색이력 저장', error)
    } finally {
      setIsSavingExcluded(false)
    }
  }

  const toggleExcludedSelection = (rowId) => {
    setSelectedExcludedIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }

  const deleteSelectedExcludedRows = async () => {
    const validSelectedIds = selectedExcludedIds.filter((id) => safeString(id).trim() !== '')

    if (validSelectedIds.length === 0) {
      showAppAlert('삭제할 행을 선택해주세요.')
      return
    }

    setContractConfirmDialog({
      title: '선택 삭제',
      message: '선택한 데이터를 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        const persistedIds = excludedRows
          .filter((row) => validSelectedIds.includes(row.id) && !row.isDraft)
          .map((row) => row.id)
          .filter((id) => safeString(id).trim() !== '')

        if (persistedIds.length > 0) {
          const remainingDrafts = excludedRows.filter(
            (row) => row.isDraft && !validSelectedIds.includes(row.id)
          )
          try {
            await excludedProjectsApi.bulkDelete(persistedIds)
          } catch (error) {
            logApiOperationError('사업검색이력 선택 삭제', error)
            return
          }

          setExcludedRows(remainingDrafts)
          setSelectedExcludedIds([])
          setEditingExcludedIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
          await fetchExcludedRows(true)
          return
        }

        setExcludedRows((prev) => prev.filter((row) => !validSelectedIds.includes(row.id)))
        setSelectedExcludedIds([])
        setEditingExcludedIds((prev) => prev.filter((id) => !validSelectedIds.includes(id)))
      },
    })
  }

  const saveExcludedRows = async () => {
    const rowsToInsert = excludedRows.filter((row) => row.isDraft && !isExcludedRowEmpty(row))
    const rowsToUpdate = excludedRows.filter(
      (row) => !row.isDraft && editingExcludedIds.includes(row.id)
    )
    const hasEmptyDraftRows = excludedRows.some((row) => row.isDraft && isExcludedRowEmpty(row))

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && !hasEmptyDraftRows) {
      showAppAlert('저장할 행이 없습니다.')
      return
    }

    setIsSavingExcluded(true)

    try {
      const timestamp = new Date().toISOString()

      if (rowsToInsert.length > 0) {
        const insertPayload = rowsToInsert.map((row) => ({
          ...toExcludedPayload(row, timestamp),
          createdAt: timestamp,
        }))

        await excludedProjectsApi.importRows(insertPayload)
      }

      if (rowsToUpdate.length > 0) {
        await Promise.all(
          rowsToUpdate.map((row) =>
            excludedProjectsApi.update(row.id, toExcludedPayload(row, timestamp))
          )
        )
      }

      if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && hasEmptyDraftRows) {
        setExcludedRows((prev) => prev.filter((row) => !(row.isDraft && isExcludedRowEmpty(row))))
        setSelectedExcludedIds([])
        setEditingExcludedIds([])
        setToastMessage('저장되었습니다.')
        return
      }

      await fetchExcludedRows(false)
      setSelectedExcludedIds([])
      setEditingExcludedIds([])
      setToastMessage('저장되었습니다.')
    } catch (error) {
      logApiOperationError('사업검색이력 일괄 저장', error)
    } finally {
      setIsSavingExcluded(false)
    }
  }

  const handleExcludedExcelDownload = () => {
    const rows = filteredExcludedRows.filter((row) => !row.isDraft).map((row) => ({
      등록일: row.writeDate,
      공개일: row.openDate,
      상태: row.category,
      검색어: row.keyword,
      작성자: row.writer,
      사업명: row.projectName,
      발주처: row.client,
      사업금액: formatAmountDisplay(row.projectAmount),
      '제외 사유': row.exclusionReason,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '사업검색이력')

    const now = new Date()
    const filename = `사업검색이력_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, filename)
  }

  const openRegistryUpload = (target) => {
    console.log('[excel-upload] open file dialog', { target })
    registryUploadTargetRef.current = target
    setRegistryUploadTarget(target)
    if (registryUploadInputRef.current) {
      registryUploadInputRef.current.value = ''
      registryUploadInputRef.current.click()
    }
  }

  const getRegistryUploadConfig = (target) => {
    switch (target) {
      case 'documents':
        return {
          importEndpoint: '/api/document-register/import',
          columns: DOCUMENT_COLUMNS,
          rows: documents,
          createDraftRow: createDocumentDraftRow,
          isEmptyRow: isDocumentRowEmpty,
          toPayload: toDocumentPayload,
          fetchRows: fetchDocuments,
          importRows: documentRegisterApi.importRows,
        }
      case 'sales':
        return {
          importEndpoint: '/api/sales-register/import',
          columns: SALES_COLUMNS,
          rows: salesRows,
          createDraftRow: createSalesDraftRow,
          isEmptyRow: isSalesRowEmpty,
          toPayload: toSalesPayload,
          fetchRows: fetchSalesRows,
          importRows: salesRegisterApi.importRows,
        }
      case 'discovery':
        return {
          importEndpoint: DISCOVERY_API_PATHS.import,
          columns: DISCOVERY_COLUMNS,
          rows: discoveryRows,
          createDraftRow: createDiscoveryDraftRow,
          isEmptyRow: isDiscoveryRowEmpty,
          toPayload: toDiscoveryPayload,
          fetchRows: fetchDiscoveryRows,
          importRows: projectDiscoveryApi.importRows,
        }
      case 'excluded':
        return {
          importEndpoint: '/api/excluded-projects/import',
          columns: EXCLUDED_COLUMNS,
          rows: excludedRows,
          createDraftRow: createExcludedDraftRow,
          isEmptyRow: isExcludedRowEmpty,
          toPayload: toExcludedPayload,
          fetchRows: fetchExcludedRows,
          importRows: excludedProjectsApi.importRows,
        }
      default:
        return null
    }
  }

  const REGISTRY_EXCEL_HEADER_ALIASES = {
    registerDate: ['등록일', '등록일자', '작성일'],
    permitDate: ['건축정보일자', '건축정보 일자', '허가일', '허가일자', '인허가일', '건축허가일', '건축 인허가일'],
    checkStatus: ['확인여부', '체크', '확인상태'],
    salesTarget: ['영업자', '영업대상', '영업 담당', '영업담당'],
    projectCategory: ['사업 구분', '구분', '사업구분'],
    projectStage: ['상태', '진행상태', '단계', '프로젝트 상태'],
    localGov: ['지자체', '지방자치단체', '시군구', '지역'],
    client: ['발주처', '수요기관', '발주 기관'],
    projectName: ['사업명', '공사명', '과업명', '건명', '프로젝트명'],
    projectAmount: ['사업금액', '금액', '사업 금액', '계약금액'],
    completionPeriod: ['준공시기', '준공', '납기'],
    manager: ['담당자', '담당', 'PM'],
    note: ['세부내용', '비고', '메모', '참고'],
    docDate: ['문서일자', '일자', '날짜'],
    docNo: ['문서번호', '문서 번호', '번호'],
    senderReceiver: ['발신수신', '발신/수신', '상대방'],
    title: ['제목', '문서제목'],
    method: ['방법', '수단'],
    writer: ['작성자', '기안자'],
    writeDate: ['작성일', '작성일자'],
    openDate: ['공개일', '공개일자'],
    category: ['분류', '카테고리'],
    keyword: ['키워드', '검색어'],
    exclusionReason: ['제외사유', '제외 사유'],
    orderNo: ['순번', '번호', 'No'],
  }

  const getRegistryExcelHeaderCandidates = (column) => [
    column.label,
    column.key,
    ...(REGISTRY_EXCEL_HEADER_ALIASES[column.key] || []),
  ]

  const collectRegistryExcelHeaderKeywords = (columns) => {
    const keywords = new Set()
    columns.forEach((column) => {
      getRegistryExcelHeaderCandidates(column).forEach((kw) => {
        const t = safeString(kw).trim()
        if (t) keywords.add(t)
      })
    })
    return [...keywords]
  }

  const buildRegistryImportRows = (rows, columns, createDraftRow, isEmptyRow) => {
    const preparedRows = []
    const skippedLines = []

    rows.forEach((sourceRow, index) => {
      const nextRow = {
        ...createDraftRow(),
        isDraft: false,
      }

      columns.forEach((column) => {
        if (column.type === 'importance') return

        const rawValue = getValueByHeader(sourceRow, getRegistryExcelHeaderCandidates(column), '')

        if (column.type === 'date') {
          nextRow[column.key] = excelDateToInput(rawValue)
          return
        }

        if (column.type === 'amount') {
          nextRow[column.key] = formatAmount(rawValue)
          return
        }

        if (column.type === 'select' || column.type === 'text' || column.type === 'textarea') {
          const text = safeString(rawValue).trim()
          nextRow[column.key] =
            column.key === 'projectStage' ? normalizeSalesProjectStage(text) : text
          return
        }

        nextRow[column.key] = safeString(rawValue).trim()
      })

      const hasMeaningfulData =
        !isEmptyRow(nextRow) ||
        columns.some((column) => safeString(nextRow[column.key]).trim() !== '')

      if (hasMeaningfulData) {
        preparedRows.push({
          row: nextRow,
          sourceLine: index + 2,
        })
      } else {
        const hasAnyCell = Object.values(sourceRow).some(
          (v) => v !== null && v !== undefined && safeString(v).trim() !== ''
        )
        if (hasAnyCell) skippedLines.push(index + 2)
      }
    })

    return { prepared: preparedRows, skippedLines }
  }

  const handleRegistryUploadFileChange = async (e) => {
    if (registryUploadInProgressRef.current) {
      console.log('[excel-upload] duplicate input event skipped')
      return
    }

    registryUploadInProgressRef.current = true
    const file = e.target.files?.[0]
    const target = registryUploadTargetRef.current || registryUploadTarget
    console.log('[excel-upload] 시작', {
      target,
      file: file
        ? {
            name: file.name,
            size: file.size,
            type: file.type,
          }
        : null,
    })
    e.target.value = ''
    registryUploadTargetRef.current = ''
    setRegistryUploadTarget('')

    try {
      if (!file) return

      if (!target) {
        console.error('엑셀 업로드 대상 메뉴를 확인할 수 없습니다.')
        showAppAlert('엑셀 업로드 대상 메뉴를 확인할 수 없습니다. 다시 시도해주세요.')
        return
      }

      const config = getRegistryUploadConfig(target)
      if (!config?.importRows) {
        console.error('엑셀 업로드 설정을 찾을 수 없습니다.', { target, config })
        showAppAlert('엑셀 업로드 설정을 찾을 수 없습니다. 다시 시도해주세요.')
        return
      }

      console.log('[excel-upload] config 확인', {
        target,
        endpoint: config.importEndpoint,
        hasImportRows: typeof config.importRows === 'function',
      })

      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true, cellDates: false })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        showAppAlert('업로드할 시트를 찾을 수 없습니다.')
        return
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const headerKeywords = collectRegistryExcelHeaderKeywords(config.columns)

      let rows = []
      let headerRowIndex = 0

      if (target === 'discovery') {
        try {
          const parsed = sheetToJsonWithDiscoveryDynamicHeader(worksheet)
          const parsedData = parsed.rows
          rows = parsedData
          headerRowIndex = parsed.headerRowIndex
          console.log('최종 렌더링될 데이터:', parsedData)
          const previewRows = parsedData.map((item, index) => excelTableItemToDiscoveryRow(item, index))
          setDiscoveryTableData(parsedData)
          setDiscoveryRows(previewRows)
        } catch (parseError) {
          const message =
            parseError?.message === DISCOVERY_EXCEL_FORMAT_ERROR
              ? DISCOVERY_EXCEL_FORMAT_ERROR
              : parseError?.message === DISCOVERY_EXCEL_NO_DATA_ERROR
                ? DISCOVERY_EXCEL_NO_DATA_ERROR
                : parseError?.message || DISCOVERY_EXCEL_FORMAT_ERROR
          console.error('[excel-upload] 건축정보 파싱 실패', parseError)
          showAppAlert(message)
          return
        }
      } else {
        const parsed = sheetToJsonWithSmartHeader(worksheet, headerKeywords)
        rows = parsed.rows
        headerRowIndex = parsed.headerRowIndex
      }

      console.log('[excel-upload] parsed object rows', {
        target,
        headerRowIndex,
        rowCount: rows.length,
        sample: rows.slice(0, 3),
      })

      if (!rows.length) {
        const headerHint =
          target === 'discovery'
            ? `'사업명'·'발주처' 헤더 행(${headerRowIndex + 1}행) 이후 데이터 없음`
            : `헤더 행 자동 탐지: ${headerRowIndex + 1}행`
        showAppAlert(
          `업로드할 데이터가 없습니다.\n` +
            `(${headerHint} — 컬럼명이 시스템과 일치하는지 확인해 주세요.)`
        )
        return
      }

      const { prepared: preparedRows, skippedLines } = buildRegistryImportRows(
        rows,
        config.columns,
        config.createDraftRow,
        config.isEmptyRow
      )

      if (!preparedRows.length) {
        const headerSample = Object.keys(rows[0] || {})
          .filter((k) => !k.startsWith('__EMPTY'))
          .slice(0, 10)
          .join(', ')
        const skippedHint =
          skippedLines.length > 0
            ? `\n데이터가 있으나 컬럼 매핑 실패한 행: ${skippedLines.slice(0, 5).join(', ')}${skippedLines.length > 5 ? '…' : ''}`
            : ''
        showAppAlert(
          `업로드할 유효한 데이터가 없습니다.\n` +
            `헤더는 ${headerRowIndex + 1}행에서 인식했습니다. 컬럼명(예: 건축정보일자, 사업명)을 확인해 주세요.\n` +
            `(인식된 헤더: ${headerSample || '없음'})${skippedHint}`
        )
        return
      }

      const baseTime = Date.now()
      const payloadRows = preparedRows.map(({ row }, index) => {
        const timestamp = new Date(baseTime + index).toISOString()
        return {
          ...config.toPayload(row, timestamp),
          createdAt: timestamp,
        }
      })

      try {
        console.log('[excel-upload] API 호출 전', {
          target,
          endpoint: config.importEndpoint,
          rowCount: payloadRows.length,
        })
        const { rows: insertedRows, duplicateItems } = await config.importRows(payloadRows)
        const dupCount = Array.isArray(duplicateItems) ? duplicateItems.length : 0
        const intro = `엑셀 업로드 성공: 신규 ${insertedRows.length}건 추가, 중복 ${dupCount}건 제외`
        const msg = intro

        await config.fetchRows(false)
        console.log('[excel-upload] 완료', {
          target,
          importedCount: insertedRows.length,
          duplicateCount: dupCount,
        })
        showAppAlert(msg)
      } catch (error) {
        console.error('[excel-upload] 업로드 실패', error)
        logApiOperationError('엑셀 업로드 실패', error)
        const preserveParsedDiscoveryTable = target === 'discovery'
        if (!preserveParsedDiscoveryTable) {
          await config.fetchRows(false)
        }
        const saveFailPrefix = preserveParsedDiscoveryTable
          ? `서버 저장에 실패했습니다. 파싱된 ${rows.length.toLocaleString('ko-KR')}건은 화면에 그대로 표시됩니다.\n\n`
          : ''
        showAppAlert(`${saveFailPrefix}${error?.message ?? String(error)}`)
        return
      }
    } catch (error) {
      console.error('업로드 중 오류가 발생했습니다.', error)
      showAppAlert(error?.message ?? String(error))
    } finally {
      registryUploadInProgressRef.current = false
    }
  }

  useEffect(() => {
    const input = registryUploadInputRef.current
    if (!input) return undefined

    const handleNativeFileEvent = (event) => {
      console.log('[excel-upload] native file input event', { type: event.type })
      handleRegistryUploadFileChange(event)
    }

    input.addEventListener('change', handleNativeFileEvent)
    input.addEventListener('input', handleNativeFileEvent)

    return () => {
      input.removeEventListener('change', handleNativeFileEvent)
      input.removeEventListener('input', handleNativeFileEvent)
    }
  })

  const trackWorkWeek = (weekStartDate, { selectWeek = true } = {}) => {
    const normalized = buildWorkReportWeekMeta(weekStartDate).weekStartDate
    setGeneratedWorkWeeks((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
    if (selectWeek) setSelectedWorkWeek(normalized)
  }

  const handleShiftWorkWeek = (offset) => {
    const nextWeek = formatDateInput(
      addDays(getWeekStartMonday(selectedWorkWeekMeta.weekStartDate), offset * 7)
    )
    trackWorkWeek(nextWeek)
  }

  const getWorkReportCellKey = (date, section, orderIndex = 1) =>
    `${normalizeWorkReportDateKey(date)}__${safeString(section).trim()}__${Number(orderIndex || 1)}`

  const getStoredWorkReportEntry = (date, section, orderIndex = 1) => {
    const sectionNorm = safeString(section).trim()
    const oi = Number(orderIndex || 1)

    if (sectionNorm === WORK_REPORT_SECTION_KEYS.meetingMinutes) {
      return pickMeetingMinutesStoredRow(date, workReportRowsRef.current, oi)
    }

    const matches = workReportRowsRef.current.filter((row) =>
      workReportRowKeyMatch(row, date, section, orderIndex)
    )
    return pickLatestWorkReportRow(matches)
  }

  const getDisplayedWorkReportEntry = (date, section, orderIndex = 1) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    if (editingWorkCellKey === cellKey && editingWorkCellData) {
      return editingWorkCellData
    }
    return getStoredWorkReportEntry(date, section, orderIndex)
  }

  const startWorkReportCellEdit = (date, section, orderIndex = 1) => {
    const cellKey = getWorkReportCellKey(date, section, orderIndex)
    if (editingWorkCellKey === cellKey) return

    const existingEntry = getStoredWorkReportEntry(date, section, orderIndex)

    setEditingWorkCellKey(cellKey)
    setEditingWorkCellData(
      existingEntry
        ? { ...existingEntry }
        : createWorkReportDraftRow({
            reportDate: date,
            section,
            user: workReportFilters.assignee,
            orderIndex,
          })
    )
  }

  const handleWorkReportEditorChange = (key, value) => {
    setEditingWorkCellData((prev) =>
      prev
        ? {
            ...prev,
            [key]: key === 'orderIndex' ? Number(value || 1) : value,
          }
        : prev
    )
  }

  const cancelWorkReportEdit = () => {
    setEditingWorkCellKey('')
    setEditingWorkCellData(null)
  }

  const commitWorkReportEdit = async () => {
    const targetRow = editingWorkCellData
    if (!targetRow) return

    if (isWorkReportRowEmpty(targetRow)) {
      if (!targetRow.isDraft && targetRow.id) {
        try {
          await weeklyWorkReportsApi.remove(targetRow.id)
        } catch (error) {
          logApiOperationError('주간업무보고서 삭제', error)
          return
        }
        await fetchWorkReportRows()
      }
      cancelWorkReportEdit()
      return
    }

    setIsSavingWorkReports(true)

    try {
      const timestamp = new Date().toISOString()

      if (targetRow.isDraft) {
        await weeklyWorkReportsApi.create({
          ...toWorkReportPayload(targetRow, timestamp),
          createdAt: timestamp,
        })
      } else {
        await weeklyWorkReportsApi.update(targetRow.id, toWorkReportPayload(targetRow, timestamp))
      }

      await fetchWorkReportRows()
      trackWorkWeek(targetRow.date)
      cancelWorkReportEdit()
    } catch (error) {
      logApiOperationError('주간업무보고서 저장', error)
    } finally {
      setIsSavingWorkReports(false)
    }
  }

  const handleWorkReportPdfDownload = () => {
    const popup = window.open('', '_blank', 'width=1480,height=980')
    if (!popup) {
      showAppAlert('팝업을 허용한 뒤 다시 시도해주세요.')
      return
    }

    const cardMarkup = selectedWorkWeekDays
      .map((day) => {
        const checklistCombined = getWorkReportChecklistCombinedText(
          day.date,
          WORK_REPORT_SECTION_KEYS.checklist,
          workReportRows,
          workReportDrafts
        )
        const checklistLines = safeString(checklistCombined)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
        const mainCheckItems = (checklistLines.length ? checklistLines : [''])
          .map((line) => `<li>${escapeHtml(line) || '&nbsp;'}</li>`)
          .join('')

        const externalEntry = getDisplayedWorkReportEntry(day.date, '외부업무', 1)
        const internalEntry = getDisplayedWorkReportEntry(day.date, '내부업무', 1)
        const contractEntry = getDisplayedWorkReportEntry(day.date, '도급사업', 1)
        const partnerEntry = getDisplayedWorkReportEntry(day.date, '협력사현황', 1)

        return `
          <div class="weekly-card">
            <div class="weekly-card-head">
              <div class="weekly-card-weekday">${escapeHtml(day.label)}</div>
              <div class="weekly-card-date">${escapeHtml(day.date)}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">주요 확인사항</div>
              <ol class="weekly-check-list">${mainCheckItems}</ol>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">외부업무</div>
              <div class="weekly-user">${escapeHtml(externalEntry?.user || '-')}</div>
              <div class="weekly-content">${escapeHtml(externalEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">내부업무</div>
              <div class="weekly-content">${escapeHtml(internalEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">도급사업</div>
              <div class="weekly-content">${escapeHtml(contractEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
            <div class="weekly-section">
              <div class="weekly-section-title">협력사현황</div>
              <div class="weekly-content">${escapeHtml(partnerEntry?.content || '-').replaceAll('\n', '<br />')}</div>
            </div>
          </div>
        `
      })
      .join('')

    const meetingMinutesMarkup = buildMeetingMinutesPdfMarkup(
      selectedWorkWeekMeta.weekStartDate,
      (date, section, orderIndex) =>
        getWorkReportBoardEntry(date, section, orderIndex, workReportDrafts),
      escapeHtml
    )

    popup.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>주간업무보고서</title>
          <link rel="stylesheet" href="${WORK_REPORT_PDF_PRINT_FONT_LINK}" />
          <style>${WORK_REPORT_PDF_PRINT_STYLES}</style>
        </head>
        <body>
          <div class="pdf-print-root">
            <div class="report-shell pdf-shell">
              <div class="pdf-header report-header">
                <div class="pdf-title report-title">주간업무보고서</div>
                <div class="pdf-meta report-subtitle">${escapeHtml(
                  `${getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)} · 담당자 ${
                    workReportFilters.assignee || '전체'
                  }`
                )}</div>
              </div>
              <div class="weekly-grid pdf-grid">${cardMarkup}</div>
              ${meetingMinutesMarkup}
            </div>
          </div>
          <script>${WORK_REPORT_PDF_PRINT_ONLOAD_SCRIPT}</script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  const getWorkReportBoardEntry = (date, section, orderIndex = 1, draftsMap = workReportDrafts) => {
    const sectionNorm = safeString(section).trim()
    const oi = Number(orderIndex || 1)

    if (sectionNorm === WORK_REPORT_SECTION_KEYS.checklist) {
      if (oi !== WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX) {
        return createWorkReportDraftRow({
          reportDate: date,
          section: sectionNorm,
          user: '',
          content: '',
          orderIndex: oi,
        })
      }
      const cellKey1 = getWorkReportCellKey(date, sectionNorm, WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX)
      const draft1 = draftsMap[cellKey1]
      const row1 = getStoredWorkReportEntry(date, sectionNorm, 1)
      const primary = getWorkReportPrimaryChecklistStoredRow(date, sectionNorm, workReportRowsRef.current)
      const mergedText = getWorkReportChecklistCombinedText(date, sectionNorm, workReportRowsRef.current, draftsMap)

      if (draft1) {
        const hasPersisted = !!(draft1.id || row1?.id || primary?.id)
        const base =
          row1 ||
          primary ||
          createWorkReportDraftRow({ reportDate: date, section: sectionNorm, user: '', orderIndex: 1 })
        return {
          ...base,
          ...draft1,
          date,
          section: sectionNorm,
          orderIndex: WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX,
          content: resolveWorkReportChecklistContent(draft1.content, hasPersisted),
          id: draft1.id || row1?.id || primary?.id,
          isDraft: !hasPersisted,
        }
      }

      if (mergedText || row1 || primary) {
        const hasPersisted = !!(row1?.id || primary?.id)
        const base =
          row1 ||
          primary ||
          createWorkReportDraftRow({ reportDate: date, section: sectionNorm, user: '', orderIndex: 1 })
        return {
          ...base,
          id: row1?.id || primary?.id,
          content: resolveWorkReportChecklistContent(mergedText, hasPersisted),
          date,
          section: sectionNorm,
          orderIndex: WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX,
          user: row1?.user || primary?.user || '',
          isDraft: !hasPersisted,
        }
      }

      return createWorkReportDraftRow({
        reportDate: date,
        section: sectionNorm,
        user: '',
        content: WORK_REPORT_CHECKLIST_BULLET_PREFIX,
        orderIndex: WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX,
      })
    }

    const cellKey = getWorkReportCellKey(date, sectionNorm, oi)
    const draftEntry = draftsMap[cellKey]
    const storedEntry = getStoredWorkReportEntry(date, sectionNorm, oi)
    if (draftEntry) {
      const persistedId =
        storedEntry?.id || (!isWorkReportDraftRowId(draftEntry.id) ? safeString(draftEntry.id).trim() : '')
      return {
        ...(storedEntry ||
          createWorkReportDraftRow({
            reportDate: date,
            section: sectionNorm,
            orderIndex: oi,
          })),
        ...draftEntry,
        date: normalizeWorkReportDateKey(date),
        section: sectionNorm,
        orderIndex: oi,
        id: persistedId || draftEntry.id,
        isDraft: !persistedId,
      }
    }

    if (storedEntry) return storedEntry

    return createWorkReportDraftRow({
      reportDate: date,
      section: sectionNorm,
      user:
        [WORK_REPORT_SECTION_KEYS.external, WORK_REPORT_SECTION_KEYS.di, WORK_REPORT_SECTION_KEYS.road].includes(
          sectionNorm
        ) && WORK_REPORT_MANAGER_OPTIONS.includes(workReportFilters.assignee)
          ? workReportFilters.assignee
          : '',
      orderIndex: oi,
    })
  }

  const updateWorkReportBoardEntry = (date, section, orderIndex, patch) => {
    const sectionNorm = safeString(section).trim()
    const oi =
      sectionNorm === WORK_REPORT_SECTION_KEYS.checklist
        ? WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX
        : Number(orderIndex || 1)
    const cellKey = getWorkReportCellKey(date, sectionNorm, oi)
    setWorkReportDrafts((prev) => {
      const baseEntry = {
        ...getWorkReportBoardEntry(date, sectionNorm, oi, prev),
        ...prev[cellKey],
      }
      const resolvedPatch = typeof patch === 'function' ? patch(baseEntry) : patch
      const storedEntry = getStoredWorkReportEntry(date, sectionNorm, oi)
      const nextEntry = {
        ...baseEntry,
        ...resolvedPatch,
        date: normalizeWorkReportDateKey(date),
        section: sectionNorm,
        orderIndex: oi,
      }
      if (storedEntry?.id) {
        nextEntry.id = storedEntry.id
        nextEntry.isDraft = false
      } else if (!isWorkReportDraftRowId(nextEntry.id)) {
        nextEntry.isDraft = false
      }
      const next = { ...prev, [cellKey]: nextEntry }
      workReportDraftsRef.current = next
      return next
    })
  }

  const yieldToReactStateFlush = () =>
    new Promise((resolve) => {
      queueMicrotask(() => queueMicrotask(resolve))
    })

  const saveWorkReportBoardEntry = async (date, section, orderIndex = 1) => {
    const runSave = async () => {
      await yieldToReactStateFlush()
      const sectionNorm = safeString(section).trim()
      const oi =
        sectionNorm === WORK_REPORT_SECTION_KEYS.checklist
          ? WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX
          : Number(orderIndex || 1)
      const cellKey = getWorkReportCellKey(date, sectionNorm, oi)
      const targetRow = {
        ...getWorkReportBoardEntry(date, sectionNorm, oi, workReportDraftsRef.current),
        date: normalizeWorkReportDateKey(date),
        section: sectionNorm,
        orderIndex: oi,
      }
      const savedSnapshot = serializeWorkReportEntrySnapshot(targetRow)
      if (isWorkReportRowEmpty(targetRow)) {
        if (sectionNorm === WORK_REPORT_SECTION_KEYS.checklist && oi === WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX) {
          const idsToRemove = new Set()
          for (let idx = 1; idx <= WORK_REPORT_MAIN_CHECK_COUNT; idx += 1) {
            const ex = getStoredWorkReportEntry(date, sectionNorm, idx)
            if (ex?.id) idsToRemove.add(ex.id)
          }
          for (const id of idsToRemove) {
            try {
              await weeklyWorkReportsApi.remove(id)
            } catch (error) {
              logApiOperationError('주간업무보고서 삭제', error)
              return
            }
          }
          await fetchWorkReportRows()
          setWorkReportDrafts((prev) => {
            const next = { ...prev }
            for (let idx = 1; idx <= WORK_REPORT_MAIN_CHECK_COUNT; idx += 1) {
              delete next[getWorkReportCellKey(date, sectionNorm, idx)]
            }
            workReportDraftsRef.current = next
            return next
          })
          return
        }

        if (!targetRow.isDraft && targetRow.id) {
          try {
            await weeklyWorkReportsApi.remove(targetRow.id)
          } catch (error) {
            logApiOperationError('주간업무보고서 삭제', error)
            return
          }
          await fetchWorkReportRows()
        }

        setWorkReportDrafts((prev) => {
          const next = removeObjectKey(prev, cellKey)
          workReportDraftsRef.current = next
          return next
        })
        return
      }

      const checklistExtraIdsToDelete = []
      if (sectionNorm === WORK_REPORT_SECTION_KEYS.checklist && oi === WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX) {
        for (let idx = 2; idx <= WORK_REPORT_MAIN_CHECK_COUNT; idx += 1) {
          const ex = getStoredWorkReportEntry(date, sectionNorm, idx)
          if (ex?.id && ex.id !== targetRow.id) checklistExtraIdsToDelete.push(ex.id)
        }
      }

      setIsSavingWorkReports(true)

      try {
        const timestamp = new Date().toISOString()
        const apiPayload = toWorkReportPayload(targetRow, timestamp)
        const existingStored = getStoredWorkReportEntry(date, sectionNorm, oi)
        const persistedId =
          existingStored?.id ||
          (!isWorkReportDraftRowId(targetRow.id) ? safeString(targetRow.id).trim() : '')
        let savedRow

        if (!persistedId) {
          savedRow = await weeklyWorkReportsApi.create({
            ...apiPayload,
            createdAt: timestamp,
          })
        } else {
          savedRow = await weeklyWorkReportsApi.update(persistedId, apiPayload)
        }

        let normalizedSaved = normalizeWorkReportRow(savedRow)

        const duplicateIds = workReportRowsRef.current
          .filter(
            (row) =>
              row.id &&
              row.id !== normalizedSaved.id &&
              workReportRowKeyMatch(
                row,
                normalizedSaved.date,
                normalizedSaved.section,
                normalizedSaved.orderIndex
              )
          )
          .map((row) => row.id)
        workReportRowsRef.current = upsertWorkReportRowInList(workReportRowsRef.current, normalizedSaved)
        setWorkReportRows(workReportRowsRef.current)

        for (const duplicateId of duplicateIds) {
          try {
            await weeklyWorkReportsApi.remove(duplicateId)
          } catch (error) {
            logApiOperationError('주간업무보고서 중복 정리', error)
          }
        }

        for (const rid of checklistExtraIdsToDelete) {
          try {
            await weeklyWorkReportsApi.remove(rid)
          } catch (error) {
            logApiOperationError('주간업무보고서(주요확인사항 정리) 삭제', error)
          }
        }

        trackWorkWeek(targetRow.date, { selectWeek: false })
        setToastMessage('저장되었습니다.')

        setWorkReportDrafts((prev) => {
          const next = { ...prev }
          const currentDraft = prev[cellKey]

          const serverSnapshot = serializeWorkReportEntrySnapshot({
            ...normalizedSaved,
            section: sectionNorm,
          })
          const draftUnchanged =
            !currentDraft || serializeWorkReportEntrySnapshot(currentDraft) === savedSnapshot
          const serverMatches = serverSnapshot === savedSnapshot
          if (draftUnchanged && serverMatches) {
            if (sectionNorm === WORK_REPORT_SECTION_KEYS.checklist && oi === WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX) {
              for (let idx = 1; idx <= WORK_REPORT_MAIN_CHECK_COUNT; idx += 1) {
                delete next[getWorkReportCellKey(date, sectionNorm, idx)]
              }
            } else {
              delete next[cellKey]
            }
          }
          workReportDraftsRef.current = next
          return next
        })
      } catch (error) {
        const saveFailureLabel =
          sectionNorm === WORK_REPORT_SECTION_KEYS.meetingMinutes
            ? '회의록'
            : '주간업무보고서'
        logApiOperationError(`${saveFailureLabel} 저장`, error)
        const message = safeString(error?.message || error)
        const hint = /failed to fetch|networkerror|load failed|500/i.test(message)
          ? 'Cloudflare 보안(WAF)이 긴 저장 요청을 막았을 수 있습니다. 페이지를 새로고침(Ctrl+Shift+R)한 뒤 다시 저장해 보세요. 계속되면 NAS 백엔드를 최신으로 재시작해 주세요.'
          : '로그인 상태를 확인한 뒤 다시 시도해주세요.'
        showAppAlert(`${saveFailureLabel} 저장에 실패했습니다.\n${message.slice(0, 200)}\n\n${hint}`)
      } finally {
        setIsSavingWorkReports(false)
      }
    }

    const queued = workReportSaveChainRef.current.then(runSave, runSave)
    workReportSaveChainRef.current = queued.catch(() => {})
    return queued
  }

  saveWorkReportBoardEntryRef.current = saveWorkReportBoardEntry

  const resolveWorkReportSaveCellMeta = (date, section, orderIndex = 1) => {
    const sectionNorm = safeString(section).trim()
    const oi =
      sectionNorm === WORK_REPORT_SECTION_KEYS.checklist
        ? WORK_REPORT_CHECKLIST_CONSOLIDATED_ORDER_INDEX
        : Number(orderIndex || 1)
    return {
      cellKey: getWorkReportCellKey(date, sectionNorm, oi),
      sectionNorm,
      orderIndex: oi,
    }
  }

  const flushWorkReportEntrySave = (date, section, orderIndex = 1) => {
    const { sectionNorm, orderIndex: oi } = resolveWorkReportSaveCellMeta(date, section, orderIndex)
    return saveWorkReportBoardEntry(date, sectionNorm, oi)
  }

  const flushAllPendingWorkReportSaves = () => {
    const flushed = new Set()
    const pending = []
    for (const cellKey of Object.keys(workReportDraftsRef.current)) {
      if (flushed.has(cellKey)) continue
      const meta = parseWorkReportCellKey(cellKey)
      if (!meta) continue
      flushed.add(cellKey)
      const draft = workReportDraftsRef.current[cellKey]
      if (!draft) continue
      const stored = getStoredWorkReportEntry(meta.date, meta.section, meta.orderIndex)
      const draftSnapshot = serializeWorkReportEntrySnapshot(draft)
      const storedSnapshot = stored ? serializeWorkReportEntrySnapshot(stored) : ''
      if (draftSnapshot === storedSnapshot) continue
      pending.push(
        saveWorkReportBoardEntryRef.current(meta.date, meta.section, meta.orderIndex)
      )
    }
    return Promise.all(pending)
  }

  useEffect(() => {
    const onPageHide = () => {
      void flushAllPendingWorkReportSaves()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onPageHide()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  useEffect(() => {
    if (skipWorkReportWeekFlushRef.current) {
      skipWorkReportWeekFlushRef.current = false
      return
    }
    void flushAllPendingWorkReportSaves()
  }, [selectedWorkWeekMeta.weekStartDate])

  useEffect(() => {
    if (isWorkReportRelatedMenu(menu)) return
    void (async () => {
      await flushAllPendingWorkReportSaves()
      if (menu === 'dashboard') await fetchWorkReportRows()
    })()
  }, [menu])

  const handleWorkReportBoardBlur = (date, section, orderIndex = 1) => async (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    await flushWorkReportEntrySave(date, section, orderIndex)
  }

  const getWorkReportDayLabel = (dateYmd) => {
    const dateKey = normalizeWorkReportDateKey(dateYmd)
    const days = getWorkReportWeekDays(selectedWorkWeekMeta.weekStartDate)
    const match = days.find((day) => day.date === dateKey)
    return match ? `${match.label} (${match.monthDay})` : dateKey
  }

  const isWorkReportChecklistDisplayEmpty = (content) => {
    const text = safeString(content).trim()
    if (!text) return true
    return !text.split('\n').some(
      (line) => !isWorkReportChecklistEmptyBulletLine(line) && safeString(line).trim() !== ''
    )
  }

  const handleWorkReportBoardPdfDownload = () => {
    const popup = window.open('', '_blank', 'width=1680,height=980')
    if (!popup) {
      showAppAlert('팝업을 허용한 뒤 다시 시도해주세요.')
      return
    }

    const renderPdfText = (value) => escapeHtml(value || '-').replaceAll('\n', '<br />')
    const renderPdfRows = (date, section, rowCount, includeDestination = false, includeDeadline = false) =>
      Array.from({ length: rowCount }, (_, index) => {
        const entry = getWorkReportBoardEntry(date, section, index + 1)
        return `
          <tr>
            <td class="pdf-index">${index + 1}</td>
            <td class="pdf-manager">${escapeHtml(entry.user || '-')}</td>
            <td>${renderPdfText(entry.content || '-')}</td>
            ${includeDestination ? `<td class="pdf-destination">${renderPdfText(entry.destination || '-')}</td>` : ''}
            ${includeDeadline ? `<td class="pdf-deadline">${escapeHtml(entry.deadline || '-')}</td>` : ''}
          </tr>
        `
      }).join('')

    const cards = selectedWorkWeekDays
      .map((day) => {
        const checklistCombined = getWorkReportChecklistCombinedText(
          day.date,
          WORK_REPORT_SECTION_KEYS.checklist,
          workReportRows,
          workReportDrafts
        )
        const checklistLines = safeString(checklistCombined)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
        const checkItems = (checklistLines.length ? checklistLines : [''])
          .map((line) => `<li>${escapeHtml(line) || '&nbsp;'}</li>`)
          .join('')

        const renderPdfSupportRows = (sectionKey) =>
          Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
            const entry = getWorkReportBoardEntry(day.date, sectionKey, index + 1)
            return `
              <tr>
                <td class="pdf-index">${index + 1}</td>
                <td>${renderPdfText(entry.content || '-')}</td>
                <td class="pdf-deadline">${escapeHtml(entry.deadline || '-')}</td>
              </tr>
            `
          }).join('')

        const supportProgressRows = renderPdfSupportRows(WORK_REPORT_SECTION_KEYS.supportProgress)
        const supportDoneRows = renderPdfSupportRows(WORK_REPORT_SECTION_KEYS.supportDone)

        return `
          <section class="pdf-day-card">
            <header class="pdf-day-head">
              <div class="pdf-day-weekday">${escapeHtml(day.label)}</div>
              <div class="pdf-day-date">${escapeHtml(day.date)}</div>
            </header>
            <div class="pdf-section">
              <div class="pdf-section-title">주요 확인사항</div>
              <ol class="pdf-check-list">${checkItems}</ol>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">외부일정</div>
              <table class="pdf-table">
                <thead>
                  <tr><th class="pdf-index">#</th><th class="pdf-manager">담당자</th><th>내용</th><th class="pdf-destination">목적지</th></tr>
                </thead>
                <tbody>${renderPdfRows(day.date, WORK_REPORT_SECTION_KEYS.external, WORK_REPORT_EXTERNAL_ROW_COUNT, true)}</tbody>
              </table>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">DI사업</div>
              <table class="pdf-table">
                <thead>
                  <tr><th class="pdf-index">#</th><th class="pdf-manager">담당자</th><th>내용</th><th class="pdf-deadline">기한</th></tr>
                </thead>
                <tbody>${renderPdfRows(day.date, WORK_REPORT_SECTION_KEYS.di, WORK_REPORT_DI_ROW_COUNT, false, true)}</tbody>
              </table>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">도로사업</div>
              <table class="pdf-table">
                <thead>
                  <tr><th class="pdf-index">#</th><th class="pdf-manager">담당자</th><th>내용</th><th class="pdf-deadline">기한</th></tr>
                </thead>
                <tbody>${renderPdfRows(day.date, WORK_REPORT_SECTION_KEYS.road, WORK_REPORT_ROAD_ROW_COUNT, false, true)}</tbody>
              </table>
            </div>
            <div class="pdf-section">
              <div class="pdf-section-title">영업지원</div>
              <div class="pdf-support-title">진행업무</div>
              <table class="pdf-table pdf-support-table">
                <thead><tr><th class="pdf-index">#</th><th>내용</th><th class="pdf-deadline">기한</th></tr></thead>
                <tbody>${supportProgressRows}</tbody>
              </table>
              <div class="pdf-support-title">완료업무</div>
              <table class="pdf-table pdf-support-table">
                <thead><tr><th class="pdf-index">#</th><th>내용</th><th class="pdf-deadline">기한</th></tr></thead>
                <tbody>${supportDoneRows}</tbody>
              </table>
            </div>
          </section>
        `
      })
      .join('')

    popup.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>주간업무보고서</title>
          <link rel="stylesheet" href="${WORK_REPORT_PDF_PRINT_FONT_LINK}" />
          <style>${WORK_REPORT_PDF_PRINT_STYLES}</style>
        </head>
        <body>
          <div class="pdf-print-root">
            <div class="pdf-shell">
              <div class="pdf-header">
              <div class="pdf-title">주간업무보고서</div>
              <div class="pdf-meta">${escapeHtml(
                `${getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)} · 담당자 ${
                  workReportFilters.assignee || '전체'
                }`
              )}</div>
            </div>
              <div class="pdf-grid">${cards}</div>
            </div>
          </div>
          <script>${WORK_REPORT_PDF_PRINT_ONLOAD_SCRIPT}</script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  const handleMeetingMinutesPdfDownload = () => {
    const meetingMinutesMarkup = buildMeetingMinutesPdfMarkup(
      selectedWorkWeekMeta.weekStartDate,
      getWorkReportBoardEntry,
      escapeHtml,
      { includeHeading: false }
    )
    if (!meetingMinutesMarkup) {
      showAppAlert('저장된 회의록 내용이 없습니다.')
      return
    }

    const popup = window.open('', '_blank', 'width=1200,height=900')
    if (!popup) {
      showAppAlert('팝업을 허용한 뒤 다시 시도해주세요.')
      return
    }

    popup.document.write(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8" />
          <title>회의록</title>
          <link rel="stylesheet" href="${WORK_REPORT_PDF_PRINT_FONT_LINK}" />
          <style>${WORK_REPORT_PDF_PRINT_STYLES}</style>
        </head>
        <body>
          <div class="pdf-print-root">
            <div class="pdf-shell">
              <div class="pdf-header">
                <div class="pdf-title">회의록</div>
                <div class="pdf-meta">${escapeHtml(
                  `${getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)} · 담당자 ${
                    workReportFilters.assignee || '전체'
                  }`
                )}</div>
              </div>
              ${meetingMinutesMarkup}
            </div>
          </div>
          <script>${WORK_REPORT_PDF_PRINT_ONLOAD_SCRIPT}</script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  const openContractRegisterModal = () => {
    if (!requireAdmin()) return
    setContractRegisterModalOpen(true)
    setNewRow({ ...emptyContract })
    setSelectedContractRowKeys(new Set())
  }

  const closeContractRegisterModal = () => {
    setContractRegisterModalOpen(false)
    setNewRow({ ...emptyContract })
  }

  const saveAddRow = async () => {
    if (!requireAdmin()) return

    if (!newRow.projectName.trim()) {
      setToastMessage('사업명은 필수입니다.')
      return
    }

    const savedRows = await saveContractToApi(newRow)
    if (!savedRows || savedRows.length === 0) return

    await fetchContracts()
    closeContractRegisterModal()
    setToastMessage('저장되었습니다.')
  }

  const deleteRow = async (id) => {
    if (!requireAdmin()) return

    const nid = normalizeRegistryRowId(id)
    if (!nid || !isUsableContractPathId(nid)) {
      console.error('Failed to find ID for record:', { id })
      setToastMessage('유효한 ID가 없습니다')
      return
    }

    setContractConfirmDialog({
      title: '계약 삭제',
      message: '이 계약현황을 삭제하시겠습니까?',
      payloadIds: [nid],
      single: true,
    })
  }

  const handleDeleteSelected = () => {
    if (!requireAdmin()) return

    if (selectedContractRowKeys.size === 0) {
      setToastMessage('삭제할 데이터를 선택해주세요.')
      return
    }

    /** 선택 키 = 행의 `id`; 서버 경로용 id는 문자열로 통일 (숫자 PK 대응) */
    const validSelectedIds = [
      ...new Set(
        [...selectedContractRowKeys]
          .map((selectedKey) => {
            const rec = getContractRowBySelectKey(selectedKey)
            const fromRowId = normalizeRegistryRowId(rec?.id)
            const merged = fromRowId || firstUsableContractPathId(rec?.key, rec?.id)
            const s = normalizeRegistryRowId(merged)
            if (import.meta.env.DEV && s && /^\d+$/.test(s)) {
              console.info('[계약현황 삭제] 숫자형 id 사용:', s)
            }
            return s
          })
          .filter((id) => isUsableContractPathId(id))
      ),
    ]

    if (validSelectedIds.length === 0) {
      if (selectedContractRowKeys.size > 0) {
        for (const selectedKey of selectedContractRowKeys) {
          const rec = getContractRowBySelectKey(selectedKey)
          console.error('Failed to find ID for record:', rec ?? { selectedKey })
        }
      }
      setToastMessage(
        selectedContractRowKeys.size > 0 ? '유효한 ID가 없습니다' : '삭제할 데이터를 선택해주세요.'
      )
      return
    }

    setContractConfirmDialog({
      title: '선택 삭제',
      message: `선택한 ${validSelectedIds.length}건을 삭제합니다. 계속하시겠습니까?`,
      payloadIds: validSelectedIds,
      single: false,
    })
  }

  const runContractDeleteConfirmed = async () => {
    const dialog = contractConfirmDialog
    if (!dialog?.payloadIds?.length) {
      setContractConfirmDialog(null)
      return
    }
    const ids = dialog.payloadIds
      .map((x) => normalizeRegistryRowId(x))
      .filter((id) => isUsableContractPathId(id))
    if (!ids.length) {
      setContractConfirmDialog(null)
      console.error('Failed to find ID for record:', { payloadIds: dialog.payloadIds })
      setToastMessage('유효한 ID가 없습니다')
      return
    }
    setContractConfirmDialog(null)

    let deleteSucceeded = false
    try {
      if (import.meta.env.DEV) {
        console.info('[계약현황 삭제] 요청 URL id 목록:', ids)
      }
      if (dialog.single) {
        await contractsApi.remove(ids[0])
      } else {
        await contractsApi.bulkRemove(ids)
      }
      deleteSucceeded = true
    } catch (error) {
      console.error('[계약현황 삭제] 요청 실패 (전문)', error)
      console.error('[계약현황 삭제] stack:', error?.stack)
      logApiOperationError(dialog.single ? '계약현황 삭제' : '계약현황 선택 삭제', error)
      setToastMessage(`삭제 중 오류가 발생했습니다. ${safeString(error?.message)}`)
    } finally {
      try {
        await fetchContracts()
      } catch (reloadErr) {
        console.error('[계약현황] 삭제 후 목록 갱신 실패 (전문)', reloadErr)
        console.error('[계약현황] 삭제 후 목록 갱신 stack:', reloadErr?.stack)
      }
    }

    if (!deleteSucceeded) return

    const editingServerId =
      normalizeRegistryRowId(contractEdit?.serverRowId) ||
      normalizeRegistryRowId(getContractRowBySelectKey(contractEdit?.rowKey || '')?.key) ||
      normalizeRegistryRowId(getContractRowBySelectKey(contractEdit?.rowKey || '')?.id) ||
      normalizeRegistryRowId(contractEdit?.rowKey)
    if (editingServerId && ids.some((id) => normalizeRegistryRowId(id) === normalizeRegistryRowId(editingServerId))) {
      cancelEdit()
    }

    setSelectedContractRowKeys(new Set())
    setToastMessage(dialog.single ? '삭제되었습니다.' : '선택한 항목이 삭제되었습니다.')
  }

  const handleConfirmDialogPrimary = () => {
    const d = contractConfirmDialog
    if (!d) return
    if (Array.isArray(d.payloadIds) && d.payloadIds.length > 0) {
      void runContractDeleteConfirmed()
      return
    }
    if (d.prompt && typeof d.onConfirm === 'function') {
      void Promise.resolve(d.onConfirm(d.prompt.value)).finally(() =>
        setContractConfirmDialog(null)
      )
      return
    }
    if (typeof d.onConfirm === 'function') {
      void Promise.resolve(d.onConfirm()).finally(() => setContractConfirmDialog(null))
      return
    }
    setContractConfirmDialog(null)
  }

  const startEdit = (rowKey, key, value, row) => {
    if (!isAdmin) return
    if (!rowKey) return

    const serverRowId = firstUsableContractPathId(row?.id, row?.key) || null

    setContractEdit({ rowKey, key, serverRowId })

    if (key === 'amount') {
      setContractEditDraft(normalizeAmountValue(value))
      return
    }

    setContractEditDraft(safeString(value))
  }

  const cancelEdit = () => {
    setContractEdit(null)
    setContractEditDraft('')
  }

  const saveEdit = async () => {
    const snap = contractEditRef.current
    const snapDraft = contractEditDraftRef.current
    if (!snap) return
    if (snap.saving) return

    const rowLookup = getContractRowBySelectKey(snap.rowKey)
    const record = rowLookup
    /** PATCH `/api/contracts/{id}` — DB PK 만 (계약번호·UI 키 사용 금지) */
    const id = firstUsableContractPathId(record?.id, snap.serverRowId, record?.key)

    console.log('[계약현황 saveEdit] editingRow (full row):', record ? { ...record } : null, {
      contractEdit: snap,
      draft: snapDraft,
      recordKey: record?.key,
      recordId: record?.id,
    })

    console.log('Final ID for PATCH /api/contracts/{id}:', id)
    if (import.meta.env.DEV && id && /^\d+$/.test(String(id))) {
      console.info('[계약현황 수정] 숫자형 id 사용:', id)
    }

    if (!isUsableContractPathId(id)) {
      console.error('Failed to find ID for record:', record ?? { rowKey: snap.rowKey })
      setToastMessage('유효한 ID가 없습니다')
      return
    }

    const value = normalizeEditValue(snap.key, snapDraft)

    setContractEdit((prev) =>
      prev?.rowKey === snap.rowKey && prev?.key === snap.key ? { ...prev, saving: true } : prev
    )

    try {
      await contractsApi.update(id, { [snap.key]: value })
    } catch (error) {
      console.error('[계약현황 PATCH] 요청 실패 (전문)', error)
      console.error('[계약현황 PATCH] stack:', error?.stack)
      logApiOperationError('계약현황 수정', error)
      setToastMessage(`저장에 실패했습니다. ${safeString(error?.message)}`)
      setContractEdit((prev) =>
        prev?.rowKey === snap.rowKey && prev?.key === snap.key ? { ...prev, saving: false } : prev
      )
      return
    }

    await fetchContracts()

    if (
      contractEditRef.current?.rowKey === snap.rowKey &&
      contractEditRef.current?.key === snap.key
    ) {
      setContractEdit(null)
      setContractEditDraft('')
    }
  }

  const renderContractCellInlineEditor = (column) => {
    const commonProps = {
      className: TABLE_INLINE_INPUT_STANDARD_CLASS,
      style: { textAlign: column.align || 'left' },
      value: contractEditDraft,
      autoFocus: true,
      onChange: (e) => {
        const value =
          column.key === 'amount' ? normalizeAmountValue(e.target.value) : e.target.value
        setContractEditDraft(value)
      },
      onBlur: () => {
        void saveEdit()
      },
      onClick: (e) => e.stopPropagation(),
      onKeyDown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
          return
        }
        if (column.type === 'textarea' && e.shiftKey && e.key === 'Enter') {
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          void saveEdit()
        }
      },
    }

    if (column.type === 'date') {
      return <input {...commonProps} type="date" />
    }
    if (column.type === 'textarea') {
      return <textarea {...commonProps} className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} resize-none`} rows={2} />
    }
    return <input {...commonProps} type="text" />
  }

  const addManualEvent = async () => {
    const title = eventForm.title.trim()
    const ds = safeString(eventForm.dateStart).trim()
    const deRaw = safeString(eventForm.dateEnd).trim()
    const de = deRaw || ds
    if (!ds || !title) {
      showAppAlert('시작일과 일정 내용을 입력해주세요.')
      return
    }
    const pds = parseDateOnly(ds)
    const pde = parseDateOnly(de)
    if (!pds) {
      showAppAlert('시작일 형식을 확인해주세요.')
      return
    }
    let startYmd = formatDateInput(pds)
    let endYmd = formatDateInput(pde && !Number.isNaN(pde.getTime()) ? pde : pds)
    if (parseDateOnly(startYmd) > parseDateOnly(endYmd)) {
      const t = startYmd
      startYmd = endYmd
      endYmd = t
    }

    const payload = calendarManualEventToPayload({
      dateStart: startYmd,
      dateEnd: endYmd,
      title,
      owner: safeString(eventForm.owner).trim(),
      pm: safeString(eventForm.pm).trim(),
      note: safeString(eventForm.note).trim(),
    })

    try {
      const created = await calendarEventsApi.create(payload)
      const row = normalizeCalendarManualEvent(created)
      if (!row) {
        showAppAlert('일정 등록에 실패했습니다.')
        return
      }
      setManualEvents((prev) => [{ ...row, ...normalizeManualEventRangeInPlace(row) }, ...prev])
      setEventForm({ ...emptyEvent })
      setCalendarEventRegisterOpen(false)
    } catch (error) {
      console.error('[캘린더] 일정 등록 실패', error)
      if (error?.response) {
        console.error('[캘린더] 응답 상세', error.response)
      }
      showAppAlert('일정 등록에 실패했습니다. 서버 관리자에게 문의하세요.')
    }
  }

  const openCalendarEventRegisterModal = () => {
    setEventForm({ ...emptyEvent })
    setCalendarEventRegisterOpen(true)
  }

  const deleteManualEvent = (id, options = {}) => {
    const { onDeleted } = options
    setContractConfirmDialog({
      title: '일정 삭제',
      message: '이 일정을 삭제하시겠습니까?',
      destructive: true,
      confirmLabel: '삭제',
      onConfirm: async () => {
        try {
          await calendarEventsApi.remove(String(id))
          setManualEvents((prev) => prev.filter((item) => String(item.id) !== String(id)))
          onDeleted?.()
        } catch (error) {
          console.error('[캘린더] 일정 삭제 실패', error)
          if (error?.response) {
            console.error('[캘린더] 응답 상세', error.response)
          }
          showAppAlert('일정 삭제에 실패했습니다. 서버 관리자에게 문의하세요.')
        }
      },
    })
  }

  const getManualDetailDraftDday = (draft) => {
    if (!draft) return '-'
    const ds = safeString(draft.dateStart).trim()
    const deRaw = safeString(draft.dateEnd).trim()
    const de = deRaw || ds
    const pde = parseDateOnly(de)
    if (!pde || Number.isNaN(pde.getTime())) return '-'
    return getCalendarListRelativeDayLabel('manual', formatDateInput(pde)) || '-'
  }

  const beginCalendarManualDetailInlineEdit = () => {
    if (detailModal?.manualEventId == null) return
    setCalendarManualDetailDraft({
      dateStart: detailModal.manualDateStart || '',
      dateEnd: detailModal.manualDateEnd || detailModal.manualDateStart || '',
      projectName: safeString(detailModal.projectName).trim(),
      salesOwner: safeString(detailModal.salesOwner).trim(),
      pm: safeString(detailModal.pm).trim(),
      note: safeString(detailModal.note).trim(),
    })
    setCalendarManualDetailEditMode(true)
  }

  const cancelCalendarManualDetailInlineEdit = () => {
    setCalendarManualDetailEditMode(false)
    setCalendarManualDetailDraft(null)
  }

  const saveCalendarManualDetailInlineEdit = async () => {
    if (detailModal?.manualEventId == null || calendarManualDetailDraft == null) return
    const id = detailModal.manualEventId
    const title = safeString(calendarManualDetailDraft.projectName).trim()
    const ds = safeString(calendarManualDetailDraft.dateStart).trim()
    const deRaw = safeString(calendarManualDetailDraft.dateEnd).trim()
    const de = deRaw || ds
    if (!ds || !title) {
      showAppAlert('시작일과 일정 내용을 입력해주세요.')
      return
    }
    const pds = parseDateOnly(ds)
    const pde = parseDateOnly(de)
    if (!pds) {
      showAppAlert('시작일 형식을 확인해주세요.')
      return
    }
    let startYmd = formatDateInput(pds)
    let endYmd = formatDateInput(pde && !Number.isNaN(pde.getTime()) ? pde : pds)
    if (parseDateOnly(startYmd) > parseDateOnly(endYmd)) {
      const t = startYmd
      startYmd = endYmd
      endYmd = t
    }
    const ownerVal = safeString(calendarManualDetailDraft.salesOwner).trim()
    const pmVal = safeString(calendarManualDetailDraft.pm).trim()
    const noteVal = safeString(calendarManualDetailDraft.note).trim()

    if (!manualEvents.some((e) => String(e.id) === String(id))) {
      showAppAlert('수정 중인 일정을 찾을 수 없습니다.')
      cancelCalendarManualDetailInlineEdit()
      return
    }

    const payload = calendarManualEventToPayload({
      dateStart: startYmd,
      dateEnd: endYmd,
      title,
      owner: ownerVal,
      pm: pmVal,
      note: noteVal,
    })

    try {
      const updated = await calendarEventsApi.update(String(id), payload)
      const row = normalizeCalendarManualEvent(updated)
      if (!row) {
        showAppAlert('일정 수정에 실패했습니다.')
        return
      }
      const normalized = { ...row, ...normalizeManualEventRangeInPlace(row) }
      setManualEvents((prev) =>
        prev.map((e) => (String(e.id) === String(id) ? normalized : e))
      )
      setDetailModal((prev) => {
        if (!prev || String(prev.manualEventId) !== String(id)) return prev
        return {
          ...prev,
          date: formatCalendarManualRangeLabel(startYmd, endYmd),
          dday: getCalendarListRelativeDayLabel('manual', endYmd),
          projectName: title,
          salesOwner: ownerVal,
          pm: pmVal,
          note: noteVal,
          manualDateStart: startYmd,
          manualDateEnd: endYmd,
        }
      })
      cancelCalendarManualDetailInlineEdit()
      setToastMessage('일정이 수정되었습니다.')
    } catch (error) {
      console.error('[캘린더] 일정 수정 실패', error)
      if (error?.response) {
        console.error('[캘린더] 응답 상세', error.response)
      }
      showAppAlert('일정 수정에 실패했습니다. 서버 관리자에게 문의하세요.')
    }
  }

  const closeCalendarDetailModal = () => {
    setDetailModal(null)
    setCalendarManualDetailEditMode(false)
    setCalendarManualDetailDraft(null)
  }

  const prevMonth = () => {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const openCalendarDetail = (item, options = {}) => {
    const startManualInlineEdit = options.startManualInlineEdit === true

    if (item.type === 'manual') {
      const r = normalizeManualEventRangeInPlace(item)
      const baseModal = {
        title: '일정 상세',
        typeLabel: '기타 일정',
        date: formatCalendarManualRangeLabel(r.dateStart, r.dateEnd),
        dday: item.dday || '',
        projectName: item.text,
        salesOwner: item.owner || '',
        pm: item.pm || '',
        client: '',
        department: '',
        contractMethod: '',
        contractType: '',
        identNo: '',
        contractDate: '',
        dueDate: '',
        amount: '',
        note: item.note || '',
        manualEventId: item.originalId,
        manualDateStart: r.dateStart,
        manualDateEnd: r.dateEnd,
      }
      if (startManualInlineEdit) {
        setDetailModal(baseModal)
        setCalendarManualDetailDraft({
          dateStart: r.dateStart,
          dateEnd: r.dateEnd,
          projectName: safeString(item.text || item.title).trim(),
          salesOwner: safeString(item.owner).trim(),
          pm: safeString(item.pm).trim(),
          note: safeString(item.note).trim(),
        })
        setCalendarManualDetailEditMode(true)
        return
      }
      setCalendarManualDetailEditMode(false)
      setCalendarManualDetailDraft(null)
      setDetailModal(baseModal)
      return
    }

    setCalendarManualDetailEditMode(false)
    setCalendarManualDetailDraft(null)

    const contract = item.contract
    if (!contract) return

    setDetailModal({
      title: '계약현황 상세',
      typeLabel: item.type === 'contract' ? '계약일자' : '준공일자',
      date: item.date,
      dday: item.dday || '',
      projectName: contract.projectName,
      salesOwner: contract.salesOwner,
      pm: contract.pm,
      client: contract.client,
      department: contract.department,
      contractMethod: contract.contractMethod,
      contractType: contract.contractType,
      identNo: contract.identNo,
      contractDate: contract.contractDate,
      dueDate: contract.dueDate,
      amount: contract.amount,
      note: contract.note,
      contractNo: contract.contractNo,
      year: contract.year,
      refNo: contract.refNo,
      segment: contract.segment,
    })
  }

  const getRegistryColumnsByScope = (scope) => {
    switch (scope) {
      case 'sales':
        return SALES_COLUMNS
      case 'discovery':
        return DISCOVERY_COLUMNS
      case 'excluded':
        return EXCLUDED_COLUMNS
      case 'documents':
        return DOCUMENT_COLUMNS
      case 'contactsManage':
        return CONTACTS_MANAGE_COLUMNS
      default:
        return []
    }
  }

  const normalizeRegistryCellDraftValue = (column, rawValue) => {
    if (column.type === 'amount') {
      return formatAmount(rawValue)
    }
    if (column.type === 'date') {
      return safeString(rawValue).trim()
    }
    if (column.key === 'projectStage') {
      return normalizeSalesProjectStage(rawValue)
    }
    return safeString(rawValue ?? '').trim()
  }

  const applyRegistryRowFieldPatch = (scope, rowId, column, rawValue) => {
    if (!scope || !rowId || !column || column.type === 'importance') return

    const value = normalizeRegistryCellDraftValue(column, rawValue)
    const patch = { [column.key]: value }
    const matchesRow = (row) => safeString(row.id).trim() === safeString(rowId).trim()

    switch (scope) {
      case 'sales':
        setSalesRows((prev) => prev.map((row) => (matchesRow(row) ? { ...row, ...patch } : row)))
        break
      case 'discovery':
        setDiscoveryRows((prev) => prev.map((row) => (matchesRow(row) ? { ...row, ...patch } : row)))
        break
      case 'excluded':
        setExcludedRows((prev) => prev.map((row) => (matchesRow(row) ? { ...row, ...patch } : row)))
        break
      case 'documents':
        setDocuments((prev) => prev.map((row) => (matchesRow(row) ? { ...row, ...patch } : row)))
        break
      case 'contactsManage':
        setContactsManageRows((prev) => prev.map((row) => (matchesRow(row) ? { ...row, ...patch } : row)))
        break
      default:
        break
    }
  }

  const buildRegistryCellApiPatch = (column, draftStr) => {
    if (column.type === 'amount') {
      return { [column.key]: parseAmount(draftStr) }
    }
    if (column.type === 'date') {
      return { [column.key]: toDbDate(draftStr) }
    }
    if (column.key === 'projectStage') {
      return { projectStage: normalizeSalesProjectStage(draftStr) }
    }
    return { [column.key]: safeString(draftStr ?? '').trim() }
  }

  const findAdjacentEditableRegistryColumn = (columns, startIndex, direction) => {
    let index = startIndex + (direction === 'prev' ? -1 : 1)
    while (index >= 0 && index < columns.length) {
      if (columns[index].type !== 'importance') return columns[index]
      index += direction === 'prev' ? -1 : 1
    }
    return null
  }

  const cancelRegistryCellEdit = () => {
    setRegistryCellEdit(null)
    setRegistryCellEditDraft('')
  }

  const startRegistryCellEdit = (scope, rowId, columnKey, value, row) => {
    if (!row || row.isDraft) return
    const columns = getRegistryColumnsByScope(scope)
    const col = columns.find((c) => c.key === columnKey)
    if (!col) return

    setRegistryCellEdit({ scope, rowId, columnKey })
    if (isRegistrySmartDetailColumn(col, scope)) {
      setRegistryCellEditDraft(getRegistrySmartDetailEditValue(scope, col, row))
      return
    }
    if (col.type === 'amount') {
      setRegistryCellEditDraft(normalizeAmountValue(value))
      return
    }
    setRegistryCellEditDraft(safeString(value ?? ''))
  }

  const persistRegistryCellPatch = async (scope, rowId, column, rawValue) => {
    if (!scope || !rowId || !column) return false

    let rows
    switch (scope) {
      case 'sales':
        rows = salesRows
        break
      case 'discovery':
        rows = discoveryRows
        break
      case 'excluded':
        rows = excludedRows
        break
      case 'documents':
        rows = documents
        break
      case 'contactsManage':
        rows = contactsManageRows
        break
      default:
        return false
    }

    const targetRow = rows.find((r) => safeString(r.id).trim() === safeString(rowId).trim())
    if (!targetRow || targetRow.isDraft) return false

    if (isRegistrySmartDetailColumn(column, scope)) {
      const payload = buildRegistrySmartDetailSavePayload(scope, column, targetRow, rawValue)
      if (!payload) return false

      const previous =
        scope === 'sales'
          ? { detail: targetRow.detail, summary: targetRow.summary }
          : { note: targetRow.note }

      if (scope === 'sales') {
        applyRegistryRowFieldPatch(scope, rowId, { key: 'detail', type: 'textarea' }, payload.detail)
        applyRegistryRowFieldPatch(scope, rowId, { key: 'summary', type: 'text' }, payload.summary)
      } else if (scope === 'discovery') {
        applyRegistryRowFieldPatch(scope, rowId, { key: 'note', type: 'textarea' }, payload.note)
      }

      try {
        if (scope === 'sales') {
          await salesRegisterApi.update(rowId, payload)
        } else if (scope === 'discovery') {
          await projectDiscoveryApi.update(rowId, payload)
        }
        return true
      } catch (error) {
        if (scope === 'sales') {
          applyRegistryRowFieldPatch(scope, rowId, { key: 'detail', type: 'textarea' }, previous.detail)
          applyRegistryRowFieldPatch(scope, rowId, { key: 'summary', type: 'text' }, previous.summary)
        } else if (scope === 'discovery') {
          applyRegistryRowFieldPatch(scope, rowId, { key: 'note', type: 'textarea' }, previous.note)
        }
        const labelMap = {
          sales: '영업관리대장',
          discovery: '건축정보',
        }
        logApiOperationError(`${labelMap[scope] || '등록'} 세부내용 저장`, error)
        setToastMessage(`저장에 실패했습니다. ${safeString(error?.message)}`)
        return false
      }
    }

    const patch = buildRegistryCellApiPatch(column, rawValue)
    const patchValue = patch[column.key]
    const prevVal = targetRow[column.key]
    const sameAmount =
      column.type === 'amount' &&
      parseAmount(String(prevVal ?? '')) === parseAmount(String(rawValue ?? ''))
    const sameText =
      column.type !== 'amount' &&
      safeString(prevVal ?? '').trim() === safeString(patchValue ?? '').trim()
    if (sameAmount || sameText) return false

    const previous = targetRow[column.key]
    applyRegistryRowFieldPatch(scope, rowId, column, rawValue)

    if (scope === 'contactsManage') {
      return true
    }

    try {
      switch (scope) {
        case 'sales':
          await salesRegisterApi.update(rowId, patch)
          break
        case 'discovery':
          await projectDiscoveryApi.update(rowId, patch)
          break
        case 'excluded':
          await excludedProjectsApi.update(rowId, patch)
          break
        case 'documents':
          await documentRegisterApi.update(rowId, patch)
          break
        default:
          return false
      }
      return true
    } catch (error) {
      applyRegistryRowFieldPatch(scope, rowId, column, previous)
      const labelMap = {
        sales: '영업관리대장',
        discovery: '건축정보',
        excluded: '사업검색이력',
        documents: '문서수발신대장',
        contactsManage: '연락처',
      }
      const label = labelMap[scope] || '등록'
      logApiOperationError(`${label} 셀 저장`, error)
      setToastMessage(`저장에 실패했습니다. ${safeString(error?.message)}`)
      return false
    }
  }

  const openRegistryLongTextModal = (scope, rowId, column, row) => {
    if (!scope || !rowId || !column || !row || row.isDraft) return
    if (!column.modalEditor) return
    const modalContextLabel =
      safeString(row.manager_name).trim() ||
      safeString(row.category).trim() ||
      '(연락처 없음)'
    setRegistryLongTextModal({
      scope,
      rowId,
      columnKey: column.key,
      columnLabel: column.label,
      projectName: modalContextLabel,
      draft: safeString(row[column.key] ?? ''),
      saving: false,
    })
  }

  const closeRegistryLongTextModal = () => {
    setRegistryLongTextModal(null)
  }

  const saveRegistryLongTextModal = async () => {
    if (!registryLongTextModal?.rowId || registryLongTextModal.saving) return
    const scope = registryLongTextModal.scope
    const columns = getRegistryColumnsByScope(scope)
    const column = columns.find((col) => col.key === registryLongTextModal.columnKey)
    if (!column) return

    const rowId = registryLongTextModal.rowId
    const rows = scope === 'contactsManage' ? contactsManageRows : []
    const targetRow = rows.find((row) => safeString(row.id).trim() === safeString(rowId).trim())
    if (!targetRow || targetRow.isDraft) {
      closeRegistryLongTextModal()
      return
    }

    const patch = buildRegistryCellApiPatch(column, registryLongTextModal.draft)
    const patchValue = patch[column.key]
    const previous = targetRow[column.key]
    if (safeString(previous ?? '').trim() === safeString(patchValue ?? '').trim()) {
      closeRegistryLongTextModal()
      return
    }

    setRegistryLongTextModal((prev) => (prev ? { ...prev, saving: true } : prev))
    applyRegistryRowFieldPatch(scope, rowId, column, registryLongTextModal.draft)
    closeRegistryLongTextModal()
  }

  const handleRegistryTextCellSave = useCallback(
    async (scope, rowId, column, rawValue) => {
      if (!isEditableTextColumn(column)) return
      if (
        registryCellEditRef.current?.scope === scope &&
        registryCellEditRef.current?.rowId === rowId &&
        registryCellEditRef.current?.columnKey === column.key
      ) {
        cancelRegistryCellEdit()
      }
      await persistRegistryCellPatch(scope, rowId, column, rawValue)
    },
    [salesRows, discoveryRows, excludedRows, documents, contactsManageRows]
  )

  const saveRegistryCellEdit = async () => {
    const snap = registryCellEditRef.current
    const draft = registryCellEditDraftRef.current
    if (!snap?.scope || !snap.rowId || !snap.columnKey) return

    const columns = getRegistryColumnsByScope(snap.scope)
    const colDef = columns.find((c) => c.key === snap.columnKey)
    if (!colDef) return

    const saved = await persistRegistryCellPatch(snap.scope, snap.rowId, colDef, draft)
    if (!saved) {
      cancelRegistryCellEdit()
      return
    }

    if (
      registryCellEditRef.current?.scope === snap.scope &&
      registryCellEditRef.current?.rowId === snap.rowId &&
      registryCellEditRef.current?.columnKey === snap.columnKey
    ) {
      cancelRegistryCellEdit()
    }
  }

  const moveRegistryCellEdit = (direction) => {
    const snap = registryCellEditRef.current
    if (!snap?.scope) return
    const columns = getRegistryColumnsByScope(snap.scope)
    const idx = columns.findIndex((c) => c.key === snap.columnKey)
    const nextCol = findAdjacentEditableRegistryColumn(columns, idx, direction)
    if (!nextCol) return
    let rows
    switch (snap.scope) {
      case 'sales':
        rows = salesRows
        break
      case 'discovery':
        rows = discoveryRows
        break
      case 'excluded':
        rows = excludedRows
        break
      case 'documents':
        rows = documents
        break
      case 'contactsManage':
        rows = contactsManageRows
        break
      default:
        return
    }
    const row = rows.find((r) => r.id === snap.rowId)
    if (!row) return
    setRegistryCellEdit({ ...snap, columnKey: nextCol.key })
    if (nextCol.type === 'amount') {
      setRegistryCellEditDraft(normalizeAmountValue(row[nextCol.key]))
    } else {
      setRegistryCellEditDraft(safeString(row[nextCol.key] ?? ''))
    }
  }

  const renderRegistryCellInlineEditor = (column, editContext) => {
    const { scope, rowId } = editContext || {}
    const commonProps = {
      className: TABLE_INLINE_INPUT_STANDARD_CLASS,
      style: { textAlign: column.align || 'left' },
      value: registryCellEditDraft,
      autoFocus: true,
      onChange: (e) => {
        const value = column.type === 'amount' ? normalizeAmountValue(e.target.value) : e.target.value
        setRegistryCellEditDraft(value)
        if (scope && rowId && !isRegistrySmartDetailColumn(column, scope)) {
          applyRegistryRowFieldPatch(scope, rowId, column, value)
        }
      },
      onBlur: () => {
        void saveRegistryCellEdit()
      },
      onKeyDown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelRegistryCellEdit()
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          moveRegistryCellEdit(e.shiftKey ? 'prev' : 'next')
          return
        }
        if (column.type === 'textarea' && e.shiftKey && e.key === 'Enter') {
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          void saveRegistryCellEdit()
        }
      },
    }

    if (column.type === 'date') {
      return <input {...commonProps} type="date" />
    }
    if (column.type === 'textarea') {
      return (
        <textarea
          {...commonProps}
          className={`${TABLE_INLINE_INPUT_STANDARD_CLASS} resize-none`}
          rows={2}
        />
      )
    }
    if (column.type === 'select') {
      return (
        <select
          {...commonProps}
          onBlur={() => {
            void saveRegistryCellEdit()
          }}
          onChange={(e) => {
            const value = e.target.value
            setRegistryCellEditDraft(value)
            registryCellEditDraftRef.current = value
            if (scope && rowId) {
              applyRegistryRowFieldPatch(scope, rowId, column, value)
            }
            queueMicrotask(() => {
              void saveRegistryCellEdit()
            })
          }}
        >
          <option value="">선택</option>
          {column.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }
    return <input {...commonProps} type="text" />
  }

  const handleRegistryEditorKeyDown = async (e, column, onSave, onCancel) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }

    if (column.type === 'textarea') {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        await onSave()
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      await onSave()
    }
  }

  const handleRegistryRowBlur = async (e, row, isSaving, onSave, onCancel, isEmptyRow) => {
    if (e.currentTarget.contains(e.relatedTarget) || isSaving) return

    if (row.isDraft && isEmptyRow(row)) {
      onCancel()
      return
    }

    await onSave()
  }

  const renderRegistryEditor = (row, column, onChange, { onSave, onCancel }) => {
    if (column.type === 'textarea') {
      return (
        <textarea
          className={TABLE_INLINE_INPUT_STANDARD_CLASS}
          style={{ textAlign: column.align || 'left' }}
          rows={1}
          value={row[column.key] ?? ''}
          onChange={(e) => onChange(row.id, column.key, e.target.value)}
          onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
        />
      )
    }

    if (column.type === 'date') {
      return (
        <input
          className={TABLE_INLINE_INPUT_STANDARD_CLASS}
          style={{ textAlign: 'center' }}
          type="date"
          value={row[column.key] ?? ''}
          onChange={(e) => onChange(row.id, column.key, e.target.value)}
          onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
        />
      )
    }

    if (column.type === 'select') {
      return (
        <select
          className={TABLE_INLINE_INPUT_STANDARD_CLASS}
          style={{ textAlign: 'center' }}
          value={row[column.key] ?? ''}
          onChange={(e) => onChange(row.id, column.key, e.target.value)}
          onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
        >
          <option value="">선택</option>
          {column.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        className={TABLE_INLINE_INPUT_STANDARD_CLASS}
        style={{ textAlign: column.align || 'left' }}
        type="text"
        value={row[column.key] ?? ''}
        onChange={(e) => onChange(row.id, column.key, e.target.value)}
        onKeyDown={(e) => handleRegistryEditorKeyDown(e, column, onSave, onCancel)}
      />
    )
  }

  const renderRegistryDataRow = ({
    row,
    index,
    rowKey: rowKeyProp,
    columns,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
    selectedIds,
    onToggleSelection,
    cellEditScope = null,
    isAdminForRegistry = false,
    registryCellEdit: registryCellEditProp = null,
    onRegistryCellStart = null,
    renderAfterImportanceCell = null,
  }) => {
    const rowKey = rowKeyProp ?? getRegistryTableRowDomKey(row, index)
    const rowId = safeString(row?.id).trim() || rowKey
    const displayRow = safeString(row?.id).trim() ? row : { ...row, id: rowId }
    const useCellMode = Boolean(cellEditScope && onRegistryCellStart)
    const isRowLegacyEditing = !useCellMode && (row.isDraft || editingIds.includes(rowId))
    const showDraftOrLegacyRow = row.isDraft || isRowLegacyEditing

    return (
      <tr
        key={rowKey}
        className={index % 2 === 0 ? 'row-even' : 'row-odd'}
        onBlur={
          row.isDraft && showDraftOrLegacyRow
            ? (e) => handleRegistryRowBlur(e, row, isSaving, onSaveRow, onCancelRow, isEmptyRow)
            : undefined
        }
      >
        <td
          className="td-align-center registry-check-cell discovery-check-col"
        >
          <input
            className="registry-row-checkbox"
            type="checkbox"
            checked={selectedIds.includes(rowId)}
            onChange={() => onToggleSelection(rowId)}
          />
        </td>

        {columns.map((column) => {
          const isImportanceCell = column.type === 'importance'
          const isSmartDetailCell = isRegistrySmartDetailColumn(column, cellEditScope)
          const canUseRegistryModalEditor =
            cellEditScope === 'contactsManage' &&
            column.modalEditor &&
            isEditableTextColumn(column) &&
            useCellMode &&
            isAdminForRegistry &&
            !row.isDraft &&
            !isImportanceCell
          const isEditableText =
            !isSmartDetailCell &&
            isEditableTextColumn(column) &&
            !(
              column.type === 'textarea' &&
              (cellEditScope === 'excluded' || cellEditScope === 'documents')
            ) &&
            useCellMode &&
            isAdminForRegistry &&
            !row.isDraft &&
            !isImportanceCell &&
            !canUseRegistryModalEditor
          const cellAlign =
            getTableBodyAlignClass(column).replace('td-align-', '') || 'center'
          const isThisCell =
            !isImportanceCell &&
            !isEditableText &&
            useCellMode &&
            !row.isDraft &&
            registryCellEditProp?.scope === cellEditScope &&
            registryCellEditProp.rowId === rowId &&
            registryCellEditProp.columnKey === column.key
          const showInput =
            !isImportanceCell &&
            !isEditableText &&
            (showDraftOrLegacyRow || isThisCell)
          const usesTableInlineInput =
            !isImportanceCell &&
            !canUseRegistryModalEditor &&
            (isEditableText || showInput || isSmartDetailCell)
          const discoveryTextWrapClass =
            cellEditScope === 'discovery' && column.type !== 'amount'
              ? 'whitespace-pre-wrap break-words'
              : ''
          const cells = [
            <td
              key={column.key}
              className={`${getTableBodyAlignClass(column)} ${
                isLongTextTableColumn(column) ? 'multiline-cell' : ''
              } ${
                isImportanceCell ? 'registry-importance-cell' : ''
              } ${getTableColumnLayoutClass(column)} ${column.cellClass || ''} ${discoveryTextWrapClass} ${
                usesTableInlineInput
                  ? `editable-cell ${TABLE_INLINE_EDITABLE_CELL_CLASS}`
                  : isAdminForRegistry && !row.isDraft && !isImportanceCell
                    ? 'editable-cell'
                    : ''
              }`}
              onClick={() => {
                if (isImportanceCell || isEditableText) return
                if (!isAdminForRegistry) return
                if (row.isDraft) return
                if (canUseRegistryModalEditor) {
                  openRegistryLongTextModal(cellEditScope, rowId, column, row)
                  return
                }
                if (useCellMode && onRegistryCellStart) {
                  onRegistryCellStart(rowId, column.key, row[column.key], row)
                  return
                }
                if (!showInput) {
                  onStartEdit()
                }
              }}
            >
              {isImportanceCell ? (
                <div className="cell-display cell-display--importance">
                  <RegistryImportanceBadge
                    status={resolveRegistryImportanceStatus(displayRow, column)}
                  />
                </div>
              ) : isSmartDetailCell ? (
                isThisCell ? (
                  renderRegistryCellInlineEditor(column, {
                    scope: cellEditScope,
                    rowId,
                  })
                ) : (
                  <div
                    className={`cell-display ${
                      cellEditScope === 'discovery'
                        ? 'break-words whitespace-pre-wrap'
                        : 'table-cell-clamp'
                    } editable-text-cell-display editable-text-cell-display--${cellAlign}`}
                    role="button"
                    tabIndex={0}
                    title={getRegistrySmartDetailDisplayValue(cellEditScope, column, row) || '세부내용'}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onRegistryCellStart) {
                        onRegistryCellStart(rowId, column.key, row[column.key], row)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (onRegistryCellStart) {
                          onRegistryCellStart(rowId, column.key, row[column.key], row)
                        }
                      }
                    }}
                  >
                    {getRegistrySmartDetailDisplayValue(cellEditScope, column, row) || '\u00a0'}
                  </div>
                )
              ) : canUseRegistryModalEditor ? (
                <div
                  className={`cell-display table-cell-clamp${
                    cellEditScope === 'contactsManage' ? ' table-cell-clamp-2' : ''
                  } sales-modal-text-display${
                    cellEditScope === 'discovery' ? ' discovery-modal-text-display' : ''
                  }${cellEditScope === 'contactsManage' ? ' contacts-modal-text-display' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    openRegistryLongTextModal(cellEditScope, rowId, column, row)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openRegistryLongTextModal(cellEditScope, rowId, column, row)
                    }
                  }}
                >
                  {getRegistryPlainDisplayValue(row, column) || '\u00a0'}
                </div>
              ) : isEditableText ? (
                <EditableTextCell
                  value={row[column.key]}
                  align={cellAlign}
                  className={
                    isLongTextTableColumn(column)
                      ? cellEditScope === 'discovery'
                        ? 'break-words whitespace-pre-wrap'
                        : 'table-cell-clamp'
                      : ''
                  }
                  onSave={(nextValue) =>
                    handleRegistryTextCellSave(cellEditScope, rowId, column, nextValue)
                  }
                />
              ) : showInput ? (
                isThisCell ? (
                  renderRegistryCellInlineEditor(column, {
                    scope: cellEditScope,
                    rowId,
                  })
                ) : (
                  renderRegistryEditor(displayRow, column, onChange, {
                    onSave: onSaveRow,
                    onCancel: onCancelRow,
                  })
                )
              ) : (
                <div
                  className={`cell-display${
                    isLongTextTableColumn(column)
                      ? cellEditScope === 'discovery'
                        ? ' break-words whitespace-pre-wrap'
                        : ' table-cell-clamp'
                      : ''
                  }`}
                >
                  {getRegistryPlainDisplayValue(row, column)}
                </div>
              )}
            </td>,
          ]
          if (isImportanceCell && renderAfterImportanceCell) {
            cells.push(
              <td key={`${column.key}-record`} className="td-align-center sales-record-cell">
                {renderAfterImportanceCell(displayRow)}
              </td>
            )
          }
          return cells
        })}
      </tr>
    )
  }

  const renderFlatRegistryRows = ({
    rows,
    columns,
    emptyMessage,
    selectedIds,
    onToggleSelection,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
    cellEditScope = null,
    isAdminForRegistry = false,
    registryCellEdit: registryCellEditFlat = null,
    onRegistryCellStart = null,
  }) => {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length + 1} className="empty-cell">
            {emptyMessage}
          </td>
        </tr>
      )
    }

    return rows.map((row, index) =>
      renderRegistryDataRow({
        row,
        index,
        rowKey: getRegistryTableRowDomKey(row, index),
        columns,
        editingIds,
        isSaving,
        onStartEdit: () => onStartEdit(safeString(row.id).trim() || getRegistryTableRowDomKey(row, index)),
        onSaveRow: () => onSaveRow(safeString(row.id).trim() || getRegistryTableRowDomKey(row, index)),
        onCancelRow: () => onCancelRow(safeString(row.id).trim() || getRegistryTableRowDomKey(row, index)),
        onChange,
        isEmptyRow,
        selectedIds,
        onToggleSelection,
        cellEditScope,
        isAdminForRegistry,
        registryCellEdit: registryCellEditFlat,
        onRegistryCellStart,
      })
    )
  }

  const renderGroupedRegistryRows = ({
    groups,
    columns,
    emptyMessage,
    selectedIds,
    onToggleSelection,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
    isYearOpen,
    onToggleYear,
    cellEditScope = null,
    isAdminForRegistry = false,
    registryCellEdit: registryCellEditGrouped = null,
    onRegistryCellStart = null,
  }) => {
    if (groups.length === 0) {
      return (
        <tr>
          <td colSpan={columns.length + 1} className="empty-cell">
            {emptyMessage}
          </td>
        </tr>
      )
    }

    return groups.flatMap((yearBlock) => {
      const collapsed = !isYearOpen(yearBlock.year)
      const yearRow = (
        <tr
          className="contract-year-row contract-year-row--toggle"
          key={`year-${yearBlock.year}`}
          {...bindExpandCollapseRow(() => onToggleYear(yearBlock.year), !collapsed)}
        >
          <td colSpan={columns.length + 1}>
            <div className="contract-year-toggle" aria-hidden="true">
              <span className="contract-year-sign">{collapsed ? '+' : '-'}</span>
              <span>{yearBlock.year}년</span>
              <span className="contract-year-count">
                {yearBlock.items.length.toLocaleString('ko-KR')}건
              </span>
            </div>
          </td>
        </tr>
      )

      if (collapsed) return [yearRow]

      return [
        yearRow,
        ...yearBlock.items.map((row, index) => {
          const rowDomKey = getRegistryTableRowDomKey(row, index, String(yearBlock.year))
          const rowId = safeString(row.id).trim() || rowDomKey
          return renderRegistryDataRow({
            row,
            index,
            rowKey: rowDomKey,
            columns,
            editingIds,
            isSaving,
            onStartEdit: () => onStartEdit(rowId),
            onSaveRow: () => onSaveRow(rowId),
            onCancelRow: () => onCancelRow(rowId),
            onChange,
            isEmptyRow,
            selectedIds,
            onToggleSelection,
            cellEditScope,
            isAdminForRegistry,
            registryCellEdit: registryCellEditGrouped,
            onRegistryCellStart,
          })
        }),
      ]
    })
  }

  const renderSalesGroupedRegistryRows = ({
    groups,
    columns,
    emptyMessage,
    selectedIds,
    onToggleSelection,
    editingIds,
    isSaving,
    onStartEdit,
    onSaveRow,
    onCancelRow,
    onChange,
    isEmptyRow,
    isYearOpen,
    onToggleYear,
    cellEditScope = null,
    isAdminForRegistry = false,
    registryCellEdit: registryCellEditGrouped = null,
    onRegistryCellStart = null,
    renderAfterImportanceCell = null,
  }) => {
    const tableColSpan = columns.length + 1 + (renderAfterImportanceCell ? 1 : 0)

    if (groups.length === 0) {
      return (
        <tr>
          <td colSpan={tableColSpan} className="empty-cell">
            {emptyMessage}
          </td>
        </tr>
      )
    }

    return groups.flatMap((yearBlock) => {
      const sourceItems = Array.isArray(yearBlock.items) ? yearBlock.items : []
      const hasPreSplit =
        Array.isArray(yearBlock.activeItems) && Array.isArray(yearBlock.completedItems)
      const { activeItems, contractClosedItems } = hasPreSplit
        ? {
            activeItems: yearBlock.activeItems,
            contractClosedItems: yearBlock.completedItems,
          }
        : partitionSalesRowsByContractClosed(sourceItems)
      const completedItems = contractClosedItems
      const collapsed = !isYearOpen(yearBlock.year)
      const contractClosedGroupLabel = formatSalesContractClosedGroupLabel(
        yearBlock.contractClosedSectionLabel ?? yearBlock.groupLabel ?? yearBlock.groupName
      )

      const yearRow = (
        <tr
          className="contract-year-row contract-year-row--toggle"
          key={`year-${yearBlock.year}`}
          {...bindExpandCollapseRow(() => onToggleYear(yearBlock.year), !collapsed)}
        >
          <td colSpan={tableColSpan}>
            <div className="contract-year-toggle" aria-hidden="true">
              <span className="contract-year-sign">{collapsed ? '+' : '-'}</span>
              <span>{yearBlock.year}년</span>
              <span className="contract-year-count">
                {yearBlock.items.length.toLocaleString('ko-KR')}건
              </span>
            </div>
          </td>
        </tr>
      )

      if (collapsed) return [yearRow]

      const activeRows = activeItems.map((row, index) => {
        const rowDomKey = getRegistryTableRowDomKey(row, index, `${yearBlock.year}-active`)
        const rowId = safeString(row.id).trim() || rowDomKey
        return renderRegistryDataRow({
          row,
          index,
          rowKey: rowDomKey,
          columns,
          editingIds,
          isSaving,
          onStartEdit: () => onStartEdit(rowId),
          onSaveRow: () => onSaveRow(rowId),
          onCancelRow: () => onCancelRow(rowId),
          onChange,
          isEmptyRow,
          selectedIds,
          onToggleSelection,
          cellEditScope,
          isAdminForRegistry,
          registryCellEdit: registryCellEditGrouped,
          onRegistryCellStart,
          renderAfterImportanceCell,
        })
      })

      const completedCount = completedItems.length
      if (completedCount === 0) {
        return [yearRow, ...activeRows]
      }

      const completedOpen = isSalesCompletedSectionOpen(yearBlock.year)
      const completedToggleRow = (
        <tr
          className="contract-category-group-row contract-year-row--toggle"
          key={`sales-done-${yearBlock.year}`}
          {...bindExpandCollapseRow(
            () => toggleSalesCompletedSection(yearBlock.year),
            completedOpen
          )}
        >
          <td colSpan={tableColSpan}>
            <div className="contract-year-toggle" aria-hidden="true">
              <span className="contract-year-sign">{completedOpen ? '-' : '+'}</span>
              <span>{contractClosedGroupLabel}</span>
              <span className="contract-year-count">
                {completedCount.toLocaleString('ko-KR')}건
              </span>
            </div>
          </td>
        </tr>
      )

      const completedRows = completedOpen
        ? completedItems.map((row, index) => {
            const rowDomKey = getRegistryTableRowDomKey(row, index, `${yearBlock.year}-completed`)
            const rowId = safeString(row.id).trim() || rowDomKey
            return renderRegistryDataRow({
              row,
              index,
              rowKey: rowDomKey,
              columns,
              editingIds,
              isSaving,
              onStartEdit: () => onStartEdit(rowId),
              onSaveRow: () => onSaveRow(rowId),
              onCancelRow: () => onCancelRow(rowId),
              onChange,
              isEmptyRow,
              selectedIds,
              onToggleSelection,
              cellEditScope,
              isAdminForRegistry,
              registryCellEdit: registryCellEditGrouped,
              onRegistryCellStart,
              renderAfterImportanceCell,
            })
          })
        : []

      return [yearRow, completedToggleRow, ...completedRows, ...activeRows]
    })
  }

  const renderWorkReportSectionCard = (date, sectionConfig) => {
    const { section, label, type } = sectionConfig
    const cellKey = getWorkReportCellKey(date, section, 1)
    const isEditing = editingWorkCellKey === cellKey
    const entry = getDisplayedWorkReportEntry(date, section, 1)

    if (type === 'checklist') {
      const ckSection = WORK_REPORT_SECTION_KEYS.checklist
      const ckEntry = getWorkReportBoardEntry(date, ckSection, 1)
      return (
        <div
          className="work-report-section-card work-report-section-card-checklist"
          onBlur={handleWorkReportBoardBlur(date, ckSection, 1)}
        >
          <div className="work-report-section-card-title">{label}</div>
          <textarea
            className="work-report-section-textarea work-report-section-textarea-checklist-combined"
            value={ckEntry.content}
            placeholder="주요 확인사항 입력 (여러 줄 입력 가능)"
            onChange={(e) =>
              updateWorkReportBoardEntry(date, ckSection, 1, {
                content: applyWorkReportChecklistInputValue(ckEntry.content, e.target.value),
              })
            }
            onFocus={(e) =>
              handleWorkReportChecklistTextareaFocus(e, ckEntry.content, (content) =>
                updateWorkReportBoardEntry(date, ckSection, 1, { content })
              )
            }
            onKeyDown={(e) =>
              handleWorkReportChecklistTextEditKeyDown(e, (content) =>
                updateWorkReportBoardEntry(date, ckSection, 1, { content })
              )
            }
          />
        </div>
      )
    }

    if (isEditing && editingWorkCellData) {
      return (
        <div
          className="work-report-section-card work-report-section-card-editing"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              commitWorkReportEdit()
            }
          }}
        >
          <div className="work-report-section-card-title">{label}</div>
          {type === 'external' && (
            <select
              className="contract-filter-select work-report-user-select"
              value={editingWorkCellData.user}
              autoFocus
              onChange={(e) => handleWorkReportEditorChange('user', e.target.value)}
            >
              <option value="">담당자</option>
              {WORK_REPORT_EXTERNAL_USER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
          <textarea
            className="work-report-section-textarea"
            rows={type === 'external' ? 3 : 4}
            autoFocus={type !== 'external'}
            value={editingWorkCellData.content}
            placeholder="내용 입력"
            onChange={(e) => handleWorkReportEditorChange('content', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelWorkReportEdit()
                return
              }
              handleWorkReportTextEditKeyDown(e, {
                multiline: true,
                onSave: () => commitWorkReportEdit(),
              })
            }}
          />
        </div>
      )
    }

    return (
      <button
        type="button"
        className={`work-report-section-card ${entry?.content ? 'has-value' : ''}`}
        onClick={() => startWorkReportCellEdit(date, section, 1)}
      >
        <div className="work-report-section-card-title">{label}</div>
        {type === 'external' && <div className="work-report-section-user">{entry?.user || '담당자'}</div>}
        <div className="work-report-section-content">{entry?.content || ''}</div>
      </button>
    )
  }

  const renderWorkReportChecklistSection = (date) => (
    <section className="work-report-board-section work-report-board-section-blue">
      <div className="work-report-board-section-title">주요 확인사항</div>
      <div className="work-report-board-table work-report-board-checklist-single-wrap">
        <div
          className="work-report-board-row work-report-board-row-checklist-single"
          onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.checklist, 1)}
        >
          <textarea
            className="work-report-board-textarea work-report-board-textarea-checklist-combined"
            value={getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content}
            placeholder="주요 확인사항 입력 (여러 줄 입력 가능)"
            onChange={(e) => {
              const current = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content
              updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, {
                content: applyWorkReportChecklistInputValue(current, e.target.value),
              })
            }}
            onFocus={(e) => {
              const current = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content
              handleWorkReportChecklistTextareaFocus(e, current, (content) =>
                updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, { content })
              )
            }}
            onKeyDown={(e) =>
              handleWorkReportChecklistTextEditKeyDown(e, (content) =>
                updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, { content })
              )
            }
          />
        </div>
      </div>
    </section>
  )

  const renderWorkReportManagedSection = (
    date,
    title,
    section,
    rowCount,
    contentClassName,
    fixedManagers = []
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row work-report-board-header-row-journal">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-deadline-header">기한</div>
        </div>
        {Array.from({ length: rowCount }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-journal"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { user: e.target.value })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
              <input
                type="date"
                className="work-report-board-date-input work-report-board-date-input-support"
                value={normalizeWorkReportDeadlineForDateInput(entry.deadline)}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    deadline: normalizeWorkReportDeadlineForDateInput(e.target.value),
                  })
                }
                onKeyDown={(e) =>
                  handleWorkReportTextEditKeyDown(e, {
                    multiline: false,
                    onSave: () => e.currentTarget.blur(),
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportExternalSection = (date) => (
    <section className="work-report-board-section work-report-board-section-blue">
      <div className="work-report-board-section-title">외부일정</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row work-report-board-header-row-external">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-destination-header">목적지</div>
        </div>
        {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

          return (
            <div
              key={`${date}-external-${orderIndex}`}
              className="work-report-board-row work-report-board-row-external"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    user: e.target.value,
                  })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-external"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    content: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-destination"
                value={entry.destination}
                placeholder="목적지 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    destination: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportArea = (date, title, section) => {
    const entry = getWorkReportBoardEntry(date, section, 1)

    return (
      <div className="work-report-board-support-block" onBlur={handleWorkReportBoardBlur(date, section, 1)}>
        <div className="work-report-board-support-title">{title}</div>
        <div className="work-report-board-support-row">
          <div className="work-report-board-support-number">
            {WORK_REPORT_SUPPORT_NUMBER_GUIDE.map((numberLabel) => (
              <span key={`${section}-${numberLabel}`}>{numberLabel}</span>
            ))}
          </div>
          <textarea
            className="work-report-board-textarea work-report-board-textarea-support"
            value={entry.content}
            placeholder="내용 입력"
            onChange={(e) => updateWorkReportBoardEntry(date, section, 1, { content: e.target.value })}
            onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
          />
        </div>
      </div>
    )
  }

  const renderWorkReportSupportSection = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaList(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaList(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaList = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="?댁슜 ?낅젰"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportChecklistSectionV2 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">주요 확인사항</div>
      <div className="work-report-board-table work-report-board-checklist-single-wrap">
        <div
          className="work-report-board-row work-report-board-row-checklist-single"
          onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.checklist, 1)}
        >
          <textarea
            className="work-report-board-textarea work-report-board-textarea-checklist-combined"
            value={getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content}
            placeholder="주요 확인사항 입력 (여러 줄 입력 가능)"
            onChange={(e) => {
              const current = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content
              updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, {
                content: applyWorkReportChecklistInputValue(current, e.target.value),
              })
            }}
            onFocus={(e) => {
              const current = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content
              handleWorkReportChecklistTextareaFocus(e, current, (content) =>
                updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, { content })
              )
            }}
            onKeyDown={(e) =>
              handleWorkReportChecklistTextEditKeyDown(e, (content) =>
                updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, { content })
              )
            }
          />
        </div>
      </div>
    </section>
  )

  const renderWorkReportExternalSectionV2 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">외부일정</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row work-report-board-header-row-external">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-destination-header">목적지</div>
        </div>
        {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

          return (
            <div
              key={`external-v2-${date}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-external"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <select
                className="work-report-board-select"
                value={entry.user}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    user: e.target.value,
                  })
                }
              >
                <option value="">선택</option>
                {WORK_REPORT_MANAGER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-external"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    content: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-destination"
                value={entry.destination}
                placeholder="목적지 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    destination: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportFixedManagerSectionV2 = (
    date,
    title,
    section,
    managers,
    contentClassName
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`fixed-v2-${section}-${date}-${orderIndex}`}
              className="work-report-board-row"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <div className="work-report-board-fixed-manager">{managerName}</div>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    user: managerName,
                    content: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaListV2 = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`support-v2-${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV2 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaListV2(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaListV2(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportFixedManagerSectionV3 = (
    date,
    title,
    section,
    managers,
    contentClassName
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row">
          <div className="work-report-board-index">#</div>
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`fixed-v3-${section}-${date}-${orderIndex}`}
              className="work-report-board-row"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <div className="work-report-board-fixed-manager">{managerName}</div>
              <textarea
                className={`work-report-board-textarea ${contentClassName}`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    user: managerName,
                    content: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaListV3 = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`support-v3-${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV3 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaListV3(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaListV3(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportDayBoardV2 = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense">
        {renderWorkReportChecklistSectionV2(day.date)}
        {renderWorkReportExternalSectionV2(day.date)}
        {renderWorkReportManagedSection(
          day.date,
          'DI사업',
          WORK_REPORT_SECTION_KEYS.di,
          WORK_REPORT_DI_ROW_COUNT,
          'work-report-board-textarea-di'
        )}
        {renderWorkReportManagedSection(
          day.date,
          '도로사업',
          WORK_REPORT_SECTION_KEYS.road,
          WORK_REPORT_ROAD_ROW_COUNT,
          'work-report-board-textarea-road'
        )}
        {renderWorkReportSupportSectionV3(day.date)}
      </div>
    </div>
  )

  const renderWorkReportDayBoard = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense">
        {renderWorkReportChecklistSection(day.date)}
        {renderWorkReportExternalSection(day.date)}
        {renderWorkReportManagedSection(
          day.date,
          'DI사업',
          WORK_REPORT_SECTION_KEYS.di,
          WORK_REPORT_DI_ROW_COUNT,
          'work-report-board-textarea-di'
        )}
        {renderWorkReportManagedSection(
          day.date,
          '도로사업',
          WORK_REPORT_SECTION_KEYS.road,
          WORK_REPORT_ROAD_ROW_COUNT,
          'work-report-board-textarea-road'
        )}
        {renderWorkReportSupportSection(day.date)}
      </div>
    </div>
  )

  const renderWorkReportChecklistSectionV4 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">주요 확인사항</div>
      <div className="work-report-board-table work-report-board-checklist-single-wrap">
        <div
          className="work-report-board-row work-report-board-row-checklist-single"
          onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.checklist, 1)}
        >
          <textarea
            className="work-report-board-textarea work-report-board-textarea-checklist-combined"
            value={getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content}
            placeholder="주요 확인사항 입력 (여러 줄 입력 가능)"
            onChange={(e) => {
              const current = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content
              updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, {
                content: applyWorkReportChecklistInputValue(current, e.target.value),
              })
            }}
            onFocus={(e) => {
              const current = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1).content
              handleWorkReportChecklistTextareaFocus(e, current, (content) =>
                updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, { content })
              )
            }}
            onKeyDown={(e) =>
              handleWorkReportChecklistTextEditKeyDown(e, (content) =>
                updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.checklist, 1, { content })
              )
            }
          />
        </div>
      </div>
    </section>
  )

  const renderWorkReportExternalSectionV4 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">외부일정</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row-external-no-index">
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
          <div className="work-report-board-destination-header">목적지</div>
        </div>
        {Array.from({ length: WORK_REPORT_EXTERNAL_ROW_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)

          return (
            <div
              key={`external-v4-${date}-${orderIndex}`}
              className="work-report-board-row-external-no-index"
              onBlur={handleWorkReportBoardBlur(date, WORK_REPORT_SECTION_KEYS.external, orderIndex)}
            >
              <WorkReportExternalManagerMultiSelect
                value={entry.user}
                onChange={(next) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    user: next,
                  })
                }
                options={WORK_REPORT_EXTERNAL_USER_OPTIONS}
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-external resize-none"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    content: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
              <textarea
                className="work-report-board-textarea work-report-board-textarea-destination resize-none"
                value={entry.destination}
                placeholder="목적지 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, WORK_REPORT_SECTION_KEYS.external, orderIndex, {
                    destination: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportFixedManagerSectionV4 = (
    date,
    title,
    section,
    managers,
    contentClassName
  ) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">{title}</div>
      <div className="work-report-board-table">
        <div className="work-report-board-header-row-no-index">
          <div className="work-report-board-manager-header">담당자</div>
          <div className="work-report-board-content-header">내용</div>
        </div>
        {managers.map((managerName, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`fixed-v4-${section}-${date}-${orderIndex}`}
              className="work-report-board-row-no-index"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-fixed-manager">{managerName}</div>
              <textarea
                className={`work-report-board-textarea ${contentClassName} resize-none`}
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    user: managerName,
                    content: e.target.value,
                  })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderWorkReportSupportAreaListV4 = (date, title, section) => (
    <div className="work-report-board-support-block">
      <div className="work-report-board-support-title">{title}</div>
      <div className="work-report-board-table">
        {Array.from({ length: WORK_REPORT_SUPPORT_ITEM_COUNT }, (_, index) => {
          const orderIndex = index + 1
          const entry = getWorkReportBoardEntry(date, section, orderIndex)

          return (
            <div
              key={`support-v4-${date}-${section}-${orderIndex}`}
              className="work-report-board-row work-report-board-row-simple"
              onBlur={handleWorkReportBoardBlur(date, section, orderIndex)}
            >
              <div className="work-report-board-index">{orderIndex}</div>
              <textarea
                className="work-report-board-textarea work-report-board-textarea-support-line resize-none"
                value={entry.content}
                placeholder="내용 입력"
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, { content: e.target.value })
                }
                onKeyDown={(e) => handleWorkReportTextEditKeyDown(e, { multiline: true })}
              />
              <input
                type="date"
                className="work-report-board-date-input work-report-board-date-input-support"
                value={normalizeWorkReportDeadlineForDateInput(entry.deadline)}
                onChange={(e) =>
                  updateWorkReportBoardEntry(date, section, orderIndex, {
                    deadline: normalizeWorkReportDeadlineForDateInput(e.target.value),
                  })
                }
                onKeyDown={(e) =>
                  handleWorkReportTextEditKeyDown(e, {
                    multiline: false,
                    onSave: () => e.currentTarget.blur(),
                  })
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderWorkReportSupportSectionV4 = (date) => (
    <section className="work-report-board-section">
      <div className="work-report-board-section-title">영업지원</div>
      <div className="work-report-board-support-wrap">
        {renderWorkReportSupportAreaListV4(date, '진행업무', WORK_REPORT_SECTION_KEYS.supportProgress)}
        {renderWorkReportSupportAreaListV4(date, '완료업무', WORK_REPORT_SECTION_KEYS.supportDone)}
      </div>
    </section>
  )

  const renderWorkReportDayBoardV4 = (day) => (
    <div key={day.date} className={`work-report-day-board work-report-day-board-dense ${day.isToday ? 'is-today' : ''}`}>
      <div className="work-report-day-head">
        <div className="work-report-day-weekday">{day.label}</div>
        <div className="work-report-day-date">{day.date}</div>
      </div>
      <div className="work-report-day-sections work-report-day-sections-dense">
        {renderWorkReportChecklistSectionV4(day.date)}
        {renderWorkReportExternalSectionV4(day.date)}
        {renderWorkReportManagedSection(
          day.date,
          'DI사업',
          WORK_REPORT_SECTION_KEYS.di,
          WORK_REPORT_DI_ROW_COUNT,
          'work-report-board-textarea-di'
        )}
        {renderWorkReportManagedSection(
          day.date,
          '도로사업',
          WORK_REPORT_SECTION_KEYS.road,
          WORK_REPORT_ROAD_ROW_COUNT,
          'work-report-board-textarea-road'
        )}
        {renderWorkReportSupportSectionV4(day.date)}
      </div>
    </div>
  )


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="company-logo-box">
            <img className="company-logo-img" src="/logo.png" alt="스마트DI" />
          </div>

          <div className="menu">
            <button
              type="button"
              className={menu === 'dashboard' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('dashboard')}
            >
              대시보드
            </button>

            {SIDEBAR_MENU_GROUPS.map((group) => {
              const isExpanded = Boolean(expandedMenuGroups[group.id])
              const hasActiveChild = group.items.some((item) => item.key === menu)
              return (
                <div key={group.id} className="menu-group">
                  <button
                    type="button"
                    className={`menu-group-btn${hasActiveChild ? ' menu-group-btn--has-active' : ''}`}
                    onClick={() => toggleMenuGroup(group.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${group.label} ${isExpanded ? '접기' : '펼치기'}`}
                  >
                    <span className="menu-group-label">{group.label}</span>
                    <span className="menu-group-chevron" aria-hidden>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                  {isExpanded ? (
                    <ul className="menu-group-items">
                      {group.items.map((item) => (
                        <li key={item.key} className="menu-group-item">
                          <button
                            type="button"
                            className={`${menu === item.key ? 'menu-btn menu-btn--child active' : 'menu-btn menu-btn--child'}${
                              ADMIN_ONLY_MENU_KEYS.has(item.key) && !isAdmin ? ' menu-btn--disabled' : ''
                            }`}
                            disabled={ADMIN_ONLY_MENU_KEYS.has(item.key) && !isAdmin}
                            onClick={() => {
                              if (ADMIN_ONLY_MENU_KEYS.has(item.key) && !isAdmin) return
                              setMenu(item.key)
                            }}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            })}

            <button
              type="button"
              className={menu === 'materialsBoard' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('materialsBoard')}
            >
              게시판
            </button>

            <button
              type="button"
              className={menu === 'installCases' ? 'menu-btn active' : 'menu-btn'}
              onClick={() => setMenu('installCases')}
            >
              설치사례
            </button>

            <button
              type="button"
              className={`${menu === 'unitPrice' ? 'menu-btn active' : 'menu-btn'}${
                !isAdmin ? ' menu-btn--disabled' : ''
              }`}
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return
                setMenu('unitPrice')
              }}
            >
              단가관리
            </button>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="viewer-badge">{isAdmin ? '관리자 모드' : '뷰어 모드'}</div>
          <button
            className="logout-btn"
            type="button"
            onClick={handleAppLogout}
            style={{ width: '100%' }}
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="main-area">
        <div className="top-system-bar">
          <div className="top-system-title">
            <span>스마트DI사업부 통합관리 시스템</span>
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 30,
                  padding: '0 10px',
                  borderRadius: 999,
                  background: isLongLivedSession
                    ? '#ecfdf5'
                    : remainingSessionMinutes <= 1
                      ? '#fef2f2'
                      : '#eef5ff',
                  border: isLongLivedSession
                    ? '1px solid #bbf7d0'
                    : remainingSessionMinutes <= 1
                      ? '1px solid #fecaca'
                      : '1px solid #cfe0ff',
                  color: isLongLivedSession
                    ? '#15803d'
                    : remainingSessionMinutes <= 1
                      ? '#b91c1c'
                      : '#1f4fd1',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {isLongLivedSession
                  ? '🟢 자동 로그인'
                  : `남은 시간 ${remainingSessionMinutes}분`}
              </span>
              <button
                className="secondary-btn"
                type="button"
                onClick={handleExtendLogin}
                style={{ minHeight: 34, padding: '7px 12px' }}
              >
                로그인 연장
              </button>
            </div>
          </div>
        </div>

        <div className="page-title-bar unified-title-bar">
          <h1>{PAGE_TITLE_MAP[menu]}</h1>
        </div>

        <input
          ref={registryUploadInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onClick={(e) => {
            console.log('[excel-upload] file input click')
            e.currentTarget.value = ''
          }}
          onInput={handleRegistryUploadFileChange}
          onChange={handleRegistryUploadFileChange}
          style={{ display: 'none' }}
        />

        {toastMessage && <div className="mode-toast">{toastMessage}</div>}

        {showSessionWarning && !isLongLivedSession && (
          <div
            className="main-area-session-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
              padding: '12px 14px',
              border: remainingSessionMinutes <= 1 ? '1px solid #fecaca' : '1px solid #fed7aa',
              borderRadius: 8,
              background: remainingSessionMinutes <= 1 ? '#fef2f2' : '#fff7ed',
              color: remainingSessionMinutes <= 1 ? '#b91c1c' : '#b45309',
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                lineHeight: 1.45,
              }}
            >
              세션이 곧 만료됩니다 (약 {remainingSessionMinutes}분 남음)
            </div>

            <button
              className="primary-btn"
              type="button"
              onClick={handleExtendLogin}
              style={{ minWidth: 108, whiteSpace: 'nowrap' }}
            >
              로그인 연장
            </button>
          </div>
        )}

        {menu === 'dashboard' && (
          <section className="stat-card stat-card--dashboard">
            <div className="dashboard-stack">
              <div className="dashboard-surface-card">
                <div className="dashboard-work-report-briefing">
                  <div className="dashboard-work-report-briefing-top">
                    <div>
                      <h2 className="dashboard-work-report-briefing-title">
                        오늘 업무 브리핑 <span className="dashboard-work-report-briefing-title-sep">/</span>{' '}
                        {formatYmdWithWeekdayKo(new Date())}
                      </h2>
                    </div>
                    <div className="dashboard-work-report-briefing-actions">
                      <button
                        className="primary-btn dashboard-work-report-briefing-cta"
                        type="button"
                        onClick={() => {
                          trackWorkWeek(dashboardWorkReportWeekMeta.weekStartDate)
                          setMenu('workReports')
                        }}
                      >
                        주간업무보고서 바로가기
                      </button>
                      <button
                        className="primary-btn dashboard-work-report-briefing-cta"
                        type="button"
                        onClick={() => {
                          trackWorkWeek(dashboardWorkReportWeekMeta.weekStartDate)
                          setMenu('meetingMinutes')
                        }}
                      >
                        회의록 바로가기
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-briefing-grid">
                    <div className="dashboard-briefing-box">
                      <h3 className="dashboard-briefing-box-title">주요 확인사항</h3>
                      <div className="dashboard-briefing-box-body">
                        {dashboardTodayWorkBrief.hasChecklist ? (
                          <ul className="dashboard-briefing-due-list">
                            {splitDashboardBriefingChecklistLines(dashboardTodayWorkBrief.checklistText).map(
                              (line, idx) => (
                                <li
                                  key={`checklist-brief-${idx}`}
                                  className="dashboard-briefing-due-item dashboard-briefing-checklist-item"
                                >
                                  <div className="dashboard-briefing-due-title">{line}</div>
                                </li>
                              )
                            )}
                          </ul>
                        ) : (
                          <p className="dashboard-briefing-box-empty">등록된 주요 확인사항이 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="dashboard-briefing-box">
                      <h3 className="dashboard-briefing-box-title">금주 업무</h3>
                      <div className="dashboard-briefing-box-body">
                        {dashboardWeekWorkRows.length > 0 ? (
                          <ul className="dashboard-briefing-due-list">
                            {dashboardWeekWorkRows.map((item) => (
                              <li key={item.id} className="dashboard-briefing-due-item dashboard-briefing-week-work-item">
                                <div className="dashboard-briefing-week-work-main">
                                  <span className="dashboard-briefing-week-work-label">
                                    {item.prefixLabel}
                                  </span>
                                  <span className="dashboard-briefing-week-work-content">{item.content}</span>
                                </div>
                                <div className="dashboard-briefing-due-meta dashboard-briefing-week-work-meta">
                                  <span>{item.deadlineLabel}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="dashboard-briefing-box-empty">이번 주 기한인 업무가 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="dashboard-briefing-box">
                      <h3 className="dashboard-briefing-box-title">외부일정</h3>
                      <div className="dashboard-briefing-box-body">
                        {dashboardTodayWorkBrief.hasExternal ? (
                          <ul className="dashboard-briefing-due-list">
                            {dashboardTodayWorkBrief.externalRows.map((row, idx) => {
                              const managers = safeString(row.user)
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                              const managerLabel = managers.length ? managers.join(', ') : '—'
                              const contentText = row.content || '—'
                              const destinationText = safeString(row.destination).trim() || '—'
                              return (
                                <li
                                  key={`ext-brief-${idx}`}
                                  className="dashboard-briefing-due-item dashboard-briefing-external-item"
                                >
                                  <div className="dashboard-briefing-external-main">
                                    <span className="dashboard-briefing-external-label">
                                      [{managerLabel}]
                                    </span>
                                    <span
                                      className="dashboard-briefing-external-content"
                                      title={contentText !== '—' ? contentText : undefined}
                                    >
                                      {contentText}
                                    </span>
                                  </div>
                                  <div
                                    className="dashboard-briefing-due-meta dashboard-briefing-external-meta"
                                    title={destinationText !== '—' ? destinationText : undefined}
                                  >
                                    <span>{destinationText}</span>
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          <p className="dashboard-briefing-box-empty">등록된 외부일정이 없습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="dashboard-briefing-box">
                      <h3 className="dashboard-briefing-box-title">준공임박</h3>
                      <div className="dashboard-briefing-box-body">
                        {dashboardWeekDueRows.length > 0 ? (
                          <ul className="dashboard-briefing-due-list">
                            {dashboardWeekDueRows.map((item) => (
                              <li key={item.id} className="dashboard-briefing-due-item">
                                <div className="dashboard-briefing-due-title">{item.projectName || '—'}</div>
                                <p className="dashboard-briefing-due-sub">
                                  {item.client || '—'} | 영업: {item.salesManager || '—'} | PM:{' '}
                                  {item.fieldPM || '—'}
                                </p>
                                <div className="dashboard-briefing-due-meta">
                                  <span>{item.dueDate}</span>
                                  {item.dday ? (
                                    <span className="dashboard-briefing-due-dday">{item.dday}</span>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="dashboard-briefing-box-empty">
                            금주({getWorkReportWeekLabel(dashboardTodayWorkBrief.weekStartDate)}) 준공 예정 건이
                            없습니다.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-surface-card">
                <div className="dashboard-panel">
                  <ImportanceLegend />
                  <div className="dashboard-recent-grid">
                    {dashboardData.recentGroups.map((group) => {
                      const { base, counts } = splitDashboardRecentTitleLabel(group.label)
                      return (
                        <div className="dashboard-recent-card" key={group.key}>
                          <button
                            className="dashboard-recent-title"
                            type="button"
                            onClick={() => setMenu(group.menu)}
                          >
                            <span className="dashboard-recent-title-base">{base}</span>
                            {counts ? (
                              <span className="dashboard-recent-title-counts">{counts}</span>
                            ) : null}
                          </button>

                          <div className="dashboard-recent-list">
                            {group.items.length > 0 ? (
                              group.items.map((item) => (
                                <button
                                  className="dashboard-recent-item"
                                  type="button"
                                  key={`${group.key}-${item.id || item.title}-${item.date}`}
                                  onClick={() => setMenu(group.menu)}
                                >
                                  <span className="dashboard-recent-date">{item.date}</span>
                                  <span className="dashboard-recent-main">
                                    <RegistryImportanceDot status={item.status} size="sm" />
                                    <span className="dashboard-recent-main-text">{item.title}</span>
                                  </span>
                                  <span className="dashboard-recent-meta">{item.meta}</span>
                                </button>
                              ))
                            ) : (
                              <div className="dashboard-recent-empty">등록 내역이 없습니다.</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="dashboard-surface-card">
                <div className="dashboard-year-list">
                  {dashboardSummary.years.map((yearBlock) => {
                    const isCollapsed = !isDashboardYearOpen(yearBlock.year)

                    return (
                      <section
                        className={`dashboard-year-accordion${
                          isCollapsed ? '' : ' is-expanded'
                        }`}
                        key={yearBlock.year}
                      >
                        <div
                          className="dashboard-year-summary dashboard-year-summary--toggle"
                          aria-label={`${yearBlock.year}년 ${isCollapsed ? '펼치기' : '접기'}`}
                          {...bindExpandCollapseRow(
                            () => toggleDashboardYear(yearBlock.year),
                            !isCollapsed
                          )}
                        >
                          <div className="dashboard-year-title">
                            <span>{yearBlock.year}년</span>
                            <span className="dashboard-year-total">
                              총 {yearBlock.totalAmount.toLocaleString('ko-KR')}원
                            </span>
                          </div>

                          <span className="panel-toggle-btn panel-toggle-btn--decor" aria-hidden="true">
                            {isCollapsed ? '+' : '-'}
                          </span>
                        </div>

                        {!isCollapsed && (
                          <YearContractAmountCategoryCards
                            items={yearBlock.items}
                            keyPrefix={yearBlock.year}
                            formatCategoryTitle={getContractPageSummaryCategoryTitle}
                          />
                        )}
                      </section>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {menu === 'workReports' && (
          <section className="stat-card stat-card--work-reports">
            <div className="work-report-page-body">
              <div className="contracts-header-actions work-report-toolbar">
                <button className="secondary-btn" type="button" onClick={() => handleShiftWorkWeek(-1)}>
                  이전 주
                </button>
                <select
                  className="contract-filter-select work-report-week-select"
                  value={selectedWorkWeek}
                  onChange={(e) => trackWorkWeek(e.target.value)}
                >
                  {workReportWeekOptions.map((option) => (
                    <option key={option.weekStartDate} value={option.weekStartDate}>
                      {getWorkReportWeekLabel(option.weekStartDate)}
                    </option>
                  ))}
                </select>
                <button className="secondary-btn" type="button" onClick={() => handleShiftWorkWeek(1)}>
                  다음 주
                </button>
                <input
                  className="table-search-input work-report-filter-input"
                  type="text"
                  placeholder="담당자"
                  value={workReportFilters.assignee}
                  onChange={(e) =>
                    setWorkReportFilters((prev) => ({ ...prev, assignee: e.target.value }))
                  }
                />
                <button className="secondary-btn" type="button" onClick={handleWorkReportBoardPdfDownload}>
                  PDF 다운로드
                </button>
              </div>

              <div className="work-report-summary-card">
                <div className="work-report-summary-title">
                  {getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)}
                </div>
                <div className="work-report-summary-meta">
                  <span>주차 {selectedWorkWeekMeta.weekNumber}주차</span>
                  <span>시작일 {selectedWorkWeekMeta.weekStartDate}</span>
                  <span>담당자 {workReportFilters.assignee || '전체'}</span>
                </div>
              </div>

              <div className="work-report-week-board-area">
                <div className="work-report-week-grid">
                  {selectedWorkWeekDays.map((day) => renderWorkReportDayBoardV4(day))}
                </div>
              </div>

              {isSavingWorkReports && (
                <div className="work-report-saving-indicator">업무보고 내용을 저장하고 있습니다.</div>
              )}
            </div>
          </section>
        )}

        {menu === 'meetingMinutes' && (
          <section className="stat-card stat-card--work-reports stat-card--meeting-minutes">
            <div className="work-report-page-body">
              <div className="contracts-header-actions work-report-toolbar">
                <button className="secondary-btn" type="button" onClick={() => handleShiftWorkWeek(-1)}>
                  이전 주
                </button>
                <select
                  className="contract-filter-select work-report-week-select"
                  value={selectedWorkWeek}
                  onChange={(e) => trackWorkWeek(e.target.value)}
                >
                  {workReportWeekOptions.map((option) => (
                    <option key={option.weekStartDate} value={option.weekStartDate}>
                      {getWorkReportWeekLabel(option.weekStartDate)}
                    </option>
                  ))}
                </select>
                <button className="secondary-btn" type="button" onClick={() => handleShiftWorkWeek(1)}>
                  다음 주
                </button>
                <button className="secondary-btn" type="button" onClick={handleMeetingMinutesPdfDownload}>
                  PDF 다운로드
                </button>
              </div>

              <div className="work-report-summary-card">
                <div className="work-report-summary-title">
                  {getWorkReportWeekLabel(selectedWorkWeekMeta.weekStartDate)}
                </div>
                <div className="work-report-summary-meta">
                  <span>주차 {selectedWorkWeekMeta.weekNumber}주차</span>
                  <span>시작일 {selectedWorkWeekMeta.weekStartDate}</span>
                </div>
              </div>

              <div className="work-report-meeting-minutes-block">
                <WorkReportMeetingMinutesSection
                  weekStartDate={selectedWorkWeekMeta.weekStartDate}
                  getEntry={getWorkReportBoardEntry}
                  updateEntry={updateWorkReportBoardEntry}
                  onEntryBlur={handleWorkReportBoardBlur(
                    selectedWorkWeekMeta.weekStartDate,
                    WORK_REPORT_SECTION_KEYS.meetingMinutes,
                    1
                  )}
                />
              </div>

              {isSavingWorkReports && (
                <div className="work-report-saving-indicator">업무보고 내용을 저장하고 있습니다.</div>
              )}
            </div>
          </section>
        )}

        {menu === 'contracts' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              {isAdmin && (
                <>
                  <button className="primary-btn" type="button" onClick={openContractRegisterModal}>
                    등록
                  </button>

                  <button className="secondary-btn" type="button" onClick={handleExcelImportClick}>
                    엑셀 업로드
                  </button>

                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={selectedContractRowKeys.size === 0}
                  >
                    선택 삭제
                  </button>
                </>
              )}

              <button className="secondary-btn" type="button" onClick={handleExcelDownload}>
                엑셀로 내려받기
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                style={{ display: 'none' }}
              />
            </div>

            {contractPageYearSummaryBlock && (
              <div className="contracts-year-summary-embed" aria-label="연도별 계약금액 현황 요약">
                <div
                  className="contracts-year-summary-embed-head contracts-year-summary-embed-head--toggle"
                  aria-label={
                    isContractPageYearSummaryOpen
                      ? '연도별 계약금액 요약 접기'
                      : '연도별 계약금액 요약 펼치기'
                  }
                  {...bindExpandCollapseRow(
                    () => setIsContractPageYearSummaryOpen((prev) => !prev),
                    isContractPageYearSummaryOpen
                  )}
                >
                  <span className="contracts-year-summary-embed-total">
                    {contractPageSummaryFocusYear}년 · 총{' '}
                    {contractPageYearSummaryBlock.totalAmount.toLocaleString('ko-KR')}원
                  </span>
                  <span className="panel-toggle-btn panel-toggle-btn--decor" aria-hidden="true">
                    {isContractPageYearSummaryOpen ? '-' : '+'}
                  </span>
                </div>
                <div
                  className={`contracts-year-summary-embed-panel${
                    isContractPageYearSummaryOpen ? '' : ' is-collapsed'
                  }`}
                >
                  <div className="contracts-year-summary-embed-panel-inner">
                    <YearContractAmountCategoryCards
                      items={contractPageYearSummaryBlock.items}
                      keyPrefix={`contracts-${contractPageSummaryFocusYear}`}
                      formatCategoryTitle={getContractPageSummaryCategoryTitle}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="table-toolbar contract-toolbar-simple contract-toolbar-with-date">
              <div className="registry-search-toolbar-split">
                <input
                  className="table-search-input"
                  placeholder="사업명, 발주처, 담당부서 등 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <RegistryDateRangeFilter
                  startDate={contractDateRange.startDate}
                  endDate={contractDateRange.endDate}
                  onStartChange={(value) =>
                    setContractDateRange((prev) => ({ ...prev, startDate: value }))
                  }
                  onEndChange={(value) =>
                    setContractDateRange((prev) => ({ ...prev, endDate: value }))
                  }
                />
              </div>

              <div className="table-summary-box">
                <div className="table-summary-label">필터 결과 합계 금액</div>
                <div className="table-summary-value">
                  {isContractsTableDefaultFilterState
                    ? '-원'
                    : `${filteredTotalAmount.toLocaleString('ko-KR')}원`}
                </div>
              </div>
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll overflow-x-auto">
                <table
                  className={`contract-table excel-table registry-table ledger-table-ui contracts-fixed-table table-w-full-min${
                    isAdmin ? ' contract-table-admin' : ' contract-table-readonly'
                  }`}
                  data-contract-table-row-key="key"
                >
                  <colgroup>
                    {isAdmin && (
                      <col className="contract-check-col" style={{ width: 44, minWidth: 44 }} />
                    )}
                    <col className="contract-dday-col" style={{ width: 74, minWidth: 74 }} />
                    {CONTRACT_COLUMNS.map((column) => (
                      <col
                        key={column.key}
                        className={`contract-col-${column.key}`}
                        style={
                          column.widthGrow
                            ? { minWidth: column.width }
                            : { width: column.width, minWidth: column.width }
                        }
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {isAdmin && (
                        <th className="th-align-center registry-check-header">
                          <input
                            className="registry-row-checkbox"
                            type="checkbox"
                            role="checkbox"
                            aria-disabled={false}
                            checked={allContractsSelected}
                            style={{ cursor: 'pointer', pointerEvents: 'auto', opacity: 1 }}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setSelectedContractRowKeys((prev) => {
                                const next = new Set(prev)
                                const keys = contractVisibleRowKeysFlat
                                if (checked) {
                                  keys.forEach((k) => next.add(k))
                                } else {
                                  keys.forEach((k) => next.delete(k))
                                }
                                return next
                              })
                            }}
                          />
                        </th>
                      )}
                      <th className="col-dday th-align-center table-col-tight">D-Day</th>
                      {CONTRACT_COLUMNS.map((column) => (
                          <th
                            key={column.key}
                            className={`${column.className} ${getTableColumnLayoutClass(column)} ${
                              column.key === 'amount'
                                ? 'th-align-center'
                                : getTableAlignClass(column.align, column)
                            } contract-th-filterable`}
                          >
                            <div className="contract-th-filter-wrap">
                              <span className="contract-th-label">{column.label}</span>
                              <ContractColumnHeaderFilter
                                columnKey={column.key}
                                options={contractColumnFilterOptionsMap[column.key] ?? []}
                                selected={activeFilters[column.key] ?? []}
                                onApply={handleActiveFiltersApply}
                                isOpen={openContractColumnFilterKey === column.key}
                                onOpenChange={setOpenContractColumnFilterKey}
                              />
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>

                  <tbody>
                    {contractsRawData.length === 0 ? (
                      <tr>
                        <td colSpan={contractTableColSpan} className="empty-cell">
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : isContractTableFilterResultEmpty ? (
                      <tr>
                        <td colSpan={contractTableColSpan} className="empty-cell">
                          필터 조건에 맞는 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      groupedContracts.flatMap((yearBlock) => {
                        const collapsed = !isContractYearOpen(yearBlock.year)

                        const yearRow = (
                          <tr
                            className="contract-year-row contract-year-row--toggle"
                            key={`year-${yearBlock.year}`}
                            {...bindExpandCollapseRow(
                              () => toggleContractYear(yearBlock.year),
                              !collapsed
                            )}
                          >
                            <td colSpan={contractTableColSpan}>
                              <div className="contract-year-toggle" aria-hidden="true">
                                <span className="contract-year-sign">{collapsed ? '+' : '-'}</span>
                                <span>{yearBlock.year}년</span>
                                <span className="contract-year-count">
                                  {yearBlock.items.length.toLocaleString('ko-KR')}건 (총{' '}
                                  {yearBlock.totalAmount.toLocaleString('ko-KR')}원)
                                </span>
                              </div>
                            </td>
                          </tr>
                        )

                        if (collapsed) return [yearRow]

                        const rows = [yearRow]
                        let stripeIndex = 0

                        yearBlock.subGroups.forEach((sub) => {
                          const subCollapsed = !isContractCategoryGroupOpen(yearBlock.year, sub.groupId)
                          rows.push(
                            <tr
                              className="contract-category-group-row contract-year-row--toggle"
                              key={`cat-${yearBlock.year}-${sub.groupId}`}
                              {...bindExpandCollapseRow(
                                () => toggleContractCategoryGroup(yearBlock.year, sub.groupId),
                                !subCollapsed
                              )}
                            >
                              <td colSpan={contractTableColSpan}>
                                <div className="contract-year-toggle" aria-hidden="true">
                                  <span className="contract-year-sign">{subCollapsed ? '+' : '-'}</span>
                                  <span>{sub.label}</span>
                                  <span className="contract-year-count">
                                    {sub.items.length.toLocaleString('ko-KR')}건 (총{' '}
                                    {sub.totalAmount.toLocaleString('ko-KR')}원)
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )

                          if (subCollapsed) return

                          sub.items.forEach((item, index) => {
                            const rowSelectKey = getContractTableRowKey(item)
                            const domRowKey = `${rowSelectKey}::${yearBlock.year}::${sub.groupId}::${index}`
                            const rowStripe = stripeIndex % 2 === 0 ? 'row-even' : 'row-odd'
                            stripeIndex += 1

                            rows.push(
                              <tr key={domRowKey} className={rowStripe}>
                                {isAdmin && (
                                  <td className="td-align-center registry-check-cell">
                                    <input
                                      className="registry-row-checkbox"
                                      type="checkbox"
                                      role="checkbox"
                                      aria-disabled={false}
                                      checked={selectedContractRowKeys.has(rowSelectKey)}
                                      style={{ cursor: 'pointer', pointerEvents: 'auto', opacity: 1 }}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        const checked = e.target.checked
                                        setSelectedContractRowKeys((prev) => {
                                          const next = new Set(prev)
                                          if (checked) next.add(rowSelectKey)
                                          else next.delete(rowSelectKey)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                )}

                                <td className="col-dday td-align-center table-col-tight">
                                  <div className="cell-display dday-cell">{getDdayText(item.dueDate)}</div>
                                </td>

                                {CONTRACT_COLUMNS.map((column) => {
                                  const isContractAmountColumn = column.key === 'amount'
                                  const bodyAlignClass = isContractAmountColumn
                                    ? 'td-align-right'
                                    : getTableBodyAlignClass(column)
                                  const cellAlign = bodyAlignClass.includes('right')
                                    ? 'right'
                                    : bodyAlignClass.includes('left')
                                      ? 'left'
                                      : 'center'
                                  const isThisContractCell =
                                    contractEdit?.rowKey === rowSelectKey &&
                                    contractEdit?.key === column.key

                                  return (
                                    <td
                                      key={column.key}
                                      className={`${column.className} ${bodyAlignClass} ${
                                        isLongTextTableColumn(column) ? 'multiline-cell' : ''
                                      } ${column.key === 'note' ? 'note-cell' : ''} ${getTableColumnLayoutClass(column)} ${
                                        isAdmin ? `editable-cell ${TABLE_INLINE_EDITABLE_CELL_CLASS}` : ''
                                      }`}
                                      onClick={
                                        isAdmin && !isThisContractCell
                                          ? () =>
                                              startEdit(rowSelectKey, column.key, item[column.key], item)
                                          : undefined
                                      }
                                    >
                                      {isThisContractCell ? (
                                        renderContractCellInlineEditor(column)
                                      ) : (
                                        <div
                                          className={`cell-display editable-text-cell-display editable-text-cell-display--${cellAlign}${
                                            isLongTextTableColumn(column) ? ' table-cell-clamp' : ''
                                          }`}
                                          role={isAdmin ? 'button' : undefined}
                                          tabIndex={isAdmin ? 0 : undefined}
                                          onClick={(e) => {
                                            if (!isAdmin) return
                                            e.stopPropagation()
                                            startEdit(rowSelectKey, column.key, item[column.key], item)
                                          }}
                                          onKeyDown={(e) => {
                                            if (!isAdmin) return
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault()
                                              startEdit(rowSelectKey, column.key, item[column.key], item)
                                            }
                                          }}
                                        >
                                          {column.key === 'amount'
                                            ? formatAmountDisplay(item[column.key]) || '\u00a0'
                                            : column.type === 'date'
                                              ? item[column.key] || '-'
                                              : item[column.key] || '\u00a0'}
                                        </div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })
                        })

                        return rows
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'sales' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddSalesRow}>
                등록
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('sales')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedSalesRows}
                disabled={selectedSalesIds.length === 0}
              >
                선택 삭제
              </button>
              <button className="secondary-btn" type="button" onClick={handleSalesExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar registry-toolbar-date-range">
              <div className="registry-search-toolbar-split">
                <input
                  className="table-search-input"
                  placeholder="검색어를 입력하세요"
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                />
                <RegistryDateRangeFilter
                  startDate={salesDateRange.startDate}
                  endDate={salesDateRange.endDate}
                  onStartChange={(value) =>
                    setSalesDateRange((prev) => ({ ...prev, startDate: value }))
                  }
                  onEndChange={(value) =>
                    setSalesDateRange((prev) => ({ ...prev, endDate: value }))
                  }
                />
              </div>
            </div>

            <div className="contract-table-panel">
              <ImportanceLegend />
              <div className="table-wrap contracts-only-scroll overflow-x-auto">
                <table className="contract-table excel-table registry-table sales-registry-table ledger-table-ui table-w-full-min">
                  <colgroup>
                    <col className="sales-registry-check-col" />
                    {SALES_COLUMNS.flatMap((column) => {
                      const cols = [
                        <col
                          key={column.key}
                          className={`sales-col-${column.key}`}
                          style={{ width: column.width, minWidth: column.width }}
                        />,
                      ]
                      if (column.key === 'importance') {
                        cols.push(<col key="sales-record" className="sales-record-col" />)
                      }
                      return cols
                    })}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header table-col-tight">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allSalesSelected}
                          onChange={() =>
                            setSelectedSalesIds((prev) =>
                              allSalesSelected
                                ? prev.filter((id) => !filteredSalesRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredSalesRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {SALES_COLUMNS.flatMap((column) => {
                        const headerCells = [
                          <th
                            key={column.key}
                            className={`${getTableColumnLayoutClass(column)} ${getTableAlignClass(column.align, column)} ${column.headerClass || ''} contract-th-filterable`}
                            style={{ minWidth: column.width }}
                          >
                            <div className="contract-th-filter-wrap">
                              <span className="contract-th-label">{column.label}</span>
                              <ContractColumnHeaderFilter
                                columnKey={column.key}
                                options={salesColumnFilterOptionsMap[column.key] ?? []}
                                selected={salesActiveFilters[column.key] ?? []}
                                onApply={handleSalesActiveFiltersApply}
                                isOpen={openSalesColumnFilterKey === column.key}
                                onOpenChange={setOpenSalesColumnFilterKey}
                                normalizeSelection={normalizeSalesColumnFilterSelection}
                              />
                            </div>
                          </th>,
                        ]
                        if (column.key === 'importance') {
                          headerCells.push(
                            <th
                              key="sales-record"
                              className="th-align-center sales-record-header table-col-tight"
                            >
                              요약
                            </th>
                          )
                        }
                        return headerCells
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {salesRawData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={SALES_COLUMNS.length + 2}
                          className="empty-cell"
                        >
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : isSalesTableFilterResultEmpty ? (
                      <tr>
                        <td
                          colSpan={SALES_COLUMNS.length + 2}
                          className="empty-cell"
                        >
                          필터 조건에 맞는 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      renderSalesGroupedRegistryRows({
                      groups: groupedSalesRows,
                      columns: SALES_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedSalesIds,
                      onToggleSelection: toggleSalesSelection,
                      editingIds: [],
                      isSaving: isSavingSales,
                      onStartEdit: startSalesEdit,
                      onSaveRow: saveSalesRow,
                      onCancelRow: cancelSalesRow,
                      onChange: handleSalesCellChange,
                      isEmptyRow: isSalesRowEmpty,
                      isYearOpen: isSalesYearOpen,
                      onToggleYear: toggleSalesYear,
                      cellEditScope: 'sales',
                      isAdminForRegistry: true,
                      registryCellEdit,
                      onRegistryCellStart: (rowId, columnKey, value, row) =>
                        startRegistryCellEdit('sales', rowId, columnKey, value, row),
                      renderAfterImportanceCell: renderSalesSummaryCell,
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'discovery' && (
          <section className="stat-card">
            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddDiscoveryRow}>
                등록
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('discovery')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedDiscoveryRows}
                disabled={selectedDiscoveryIds.length === 0}
              >
                선택 삭제
              </button>
              <button className="secondary-btn" type="button" onClick={handleDiscoveryExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar registry-toolbar-date-range">
              <div className="registry-search-toolbar-split">
                <input
                  className="table-search-input"
                  placeholder="검색어를 입력하세요"
                  value={discoverySearch}
                  onChange={(e) => setDiscoverySearch(e.target.value)}
                />
                <RegistryDateRangeFilter
                  startDate={discoveryDateRange.startDate}
                  endDate={discoveryDateRange.endDate}
                  onStartChange={(value) =>
                    setDiscoveryDateRange((prev) => ({ ...prev, startDate: value }))
                  }
                  onEndChange={(value) =>
                    setDiscoveryDateRange((prev) => ({ ...prev, endDate: value }))
                  }
                />
              </div>
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll overflow-x-auto">
                <table
                  className="contract-table excel-table registry-table discovery-registry-table ledger-table-ui table-w-full-min table-fixed"
                  style={{ minWidth: '1500px' }}
                >
                  <colgroup>
                    <col className="registry-check-col" />
                    {DISCOVERY_COLUMNS.map((column) => (
                      <col key={column.key} className={column.widthClass || ''} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header discovery-check-col">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allDiscoverySelected}
                          onChange={() =>
                            setSelectedDiscoveryIds((prev) =>
                              allDiscoverySelected
                                ? prev.filter((id) => !filteredDiscoveryRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredDiscoveryRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {DISCOVERY_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`${getTableColumnLayoutClass(column)} ${getTableAlignClass(column.align, column)} ${column.headerClass || ''} ${column.widthClass || ''} contract-th-filterable`}
                        >
                          <div className="contract-th-filter-wrap">
                            <span className="contract-th-label">{column.label}</span>
                            <ContractColumnHeaderFilter
                              columnKey={column.key}
                              options={discoveryColumnFilterOptionsMap[column.key] ?? []}
                              selected={discoveryActiveFilters[column.key] ?? []}
                              onApply={handleDiscoveryActiveFiltersApply}
                              isOpen={openDiscoveryColumnFilterKey === column.key}
                              onOpenChange={setOpenDiscoveryColumnFilterKey}
                              normalizeSelection={normalizeDiscoveryColumnFilterSelection}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryRawData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={DISCOVERY_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : isDiscoveryTableFilterResultEmpty ? (
                      <tr>
                        <td
                          colSpan={DISCOVERY_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          필터 조건에 맞는 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                    renderGroupedRegistryRows({
                      groups: groupedDiscoveryRows,
                      columns: DISCOVERY_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedDiscoveryIds,
                      onToggleSelection: toggleDiscoverySelection,
                      editingIds: editingDiscoveryIds,
                      isSaving: isSavingDiscovery,
                      onStartEdit: startDiscoveryEdit,
                      onSaveRow: saveDiscoveryRow,
                      onCancelRow: cancelDiscoveryRow,
                      onChange: handleDiscoveryCellChange,
                      isEmptyRow: isDiscoveryRowEmpty,
                      isYearOpen: isDiscoveryYearOpen,
                      onToggleYear: toggleDiscoveryYear,
                      cellEditScope: 'discovery',
                      isAdminForRegistry: true,
                      registryCellEdit,
                      onRegistryCellStart: (rowId, columnKey, value, row) =>
                        startRegistryCellEdit('discovery', rowId, columnKey, value, row),
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'excluded' && (
          <section className="stat-card">
            <div className="guide-panel excluded-guide-panel">
              <div
                className="guide-panel-header guide-panel-header--toggle"
                aria-label={`사업검색이력 안내 ${isExcludedGuideCollapsed ? '펼치기' : '접기'}`}
                {...bindExpandCollapseRow(
                  () => setIsExcludedGuideCollapsed((prev) => !prev),
                  !isExcludedGuideCollapsed
                )}
              >
                <div className="guide-panel-title">안내 문구</div>
                <span className="guide-panel-toggle guide-panel-toggle--decor" aria-hidden="true">
                  {isExcludedGuideCollapsed ? '+' : '-'}
                </span>
              </div>

              {!isExcludedGuideCollapsed && (
                <div className="guide-panel-body excluded-guide-copy">
                  <div>
                    ※ 기본 제외사항 : 지역제한, 수의계약, 지명경쟁(전자조합추천) / 서울(1억~), 타지역(3억~)
                  </div>
                  <div>
                    ※ 검색 키워드 : 전광판, 미디어, 파사드, 사이니지, 디스플레이, LED, 앞에 키워드+디지털, ITS, VMS
                  </div>
                  <div>
                    ※ 검색 품명(분류번호) : 안내전광판(5512190301), 기상전광판(5512190302), 교통정보전광판(5512190303), 융복합안내전광판(9955121901), 영상정보디스플레이장치(4511189301)
                  </div>
                </div>
              )}
            </div>

            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddExcludedRow}>
                등록
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('excluded')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedExcludedRows}
                disabled={selectedExcludedIds.length === 0}
              >
                선택 삭제
              </button>
              <button className="secondary-btn" type="button" onClick={handleExcludedExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar registry-toolbar-date-range">
              <div className="registry-search-toolbar-split">
                <input
                  className="table-search-input"
                  placeholder="검색어를 입력하세요"
                  value={excludedSearch}
                  onChange={(e) => setExcludedSearch(e.target.value)}
                />
                <RegistryDateRangeFilter
                  startDate={excludedDateRange.startDate}
                  endDate={excludedDateRange.endDate}
                  onStartChange={(value) =>
                    setExcludedDateRange((prev) => ({ ...prev, startDate: value }))
                  }
                  onEndChange={(value) =>
                    setExcludedDateRange((prev) => ({ ...prev, endDate: value }))
                  }
                />
              </div>
            </div>

            <div className="contract-table-panel">
              <ImportanceLegend />
              <div className="table-wrap contracts-only-scroll overflow-x-auto">
                <table className="contract-table excel-table registry-table excluded-registry-table ledger-table-ui table-w-full-min">
                  <colgroup>
                    <col className="registry-check-col" />
                    {EXCLUDED_COLUMNS.map((column) => (
                      <col key={column.key} className={column.widthClass || ''} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header table-col-tight">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allExcludedSelected}
                          onChange={() =>
                            setSelectedExcludedIds((prev) =>
                              allExcludedSelected
                                ? prev.filter((id) => !filteredExcludedRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredExcludedRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {EXCLUDED_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`${getTableColumnLayoutClass(column)} ${getTableAlignClass(column.align, column)} ${column.headerClass || ''} ${column.widthClass || ''} contract-th-filterable`}
                          style={column.widthClass ? { minWidth: 'max(3rem, 100%)' } : undefined}
                        >
                          <div className="contract-th-filter-wrap">
                            <span className="contract-th-label">{column.label}</span>
                            <ContractColumnHeaderFilter
                              columnKey={column.key}
                              options={excludedColumnFilterOptionsMap[column.key] ?? []}
                              selected={excludedActiveFilters[column.key] ?? []}
                              onApply={handleExcludedActiveFiltersApply}
                              isOpen={openExcludedColumnFilterKey === column.key}
                              onOpenChange={setOpenExcludedColumnFilterKey}
                              normalizeSelection={normalizeExcludedColumnFilterSelection}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excludedRawData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={EXCLUDED_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : isExcludedTableFilterResultEmpty ? (
                      <tr>
                        <td
                          colSpan={EXCLUDED_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          필터 조건에 맞는 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                    renderGroupedRegistryRows({
                      groups: groupedExcludedRows,
                      columns: EXCLUDED_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedExcludedIds,
                      onToggleSelection: toggleExcludedSelection,
                      editingIds: [],
                      isSaving: isSavingExcluded,
                      onStartEdit: startExcludedEdit,
                      onSaveRow: saveExcludedRow,
                      onCancelRow: cancelExcludedRow,
                      onChange: handleExcludedCellChange,
                      isEmptyRow: isExcludedRowEmpty,
                      isYearOpen: isExcludedYearOpen,
                      onToggleYear: toggleExcludedYear,
                      cellEditScope: 'excluded',
                      isAdminForRegistry: true,
                      registryCellEdit,
                      onRegistryCellStart: (rowId, columnKey, value, row) =>
                        startRegistryCellEdit('excluded', rowId, columnKey, value, row),
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'documents' && (
          <section className="stat-card">
            <div className="guide-panel">
              <div
                className="guide-panel-header guide-panel-header--toggle"
                aria-label={`문서수발신대장 안내 ${isDocumentGuideCollapsed ? '펼치기' : '접기'}`}
                {...bindExpandCollapseRow(
                  () => setIsDocumentGuideCollapsed((prev) => !prev),
                  !isDocumentGuideCollapsed
                )}
              >
                <div className="guide-panel-title">안내 문구</div>
                <span className="guide-panel-toggle guide-panel-toggle--decor" aria-hidden="true">
                  {isDocumentGuideCollapsed ? '+' : '-'}
                </span>
              </div>

              {!isDocumentGuideCollapsed && (
                <div className="guide-panel-body">
                  <div className="doc-guide-layout">
                    <div className="doc-guide-pattern">
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>문서번호 체계 안내</div>
                      <div className="doc-guide-code">SIGN-DI-S-260000-01</div>
                      <div className="doc-guide-code">SIGN-DI-R-260000-01</div>
                      <div className="doc-guide-code">SIGN-DI-A-260000-01</div>
                    </div>

                    <div className="doc-guide-owners-wrap">
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>담당자 약어</div>
                      <div className="doc-guide-owners-grid">
                        <div className="doc-guide-owner-col">
                          <div>S1 : 전기웅</div>
                          <div>S2 : 유영무</div>
                          <div>S3 : 김성수</div>
                          <div>S4 : 이재승</div>
                        </div>
                        <div className="doc-guide-owner-col">
                          <div>R1 : 이용자</div>
                          <div>R2 : 박재범</div>
                        </div>
                        <div className="doc-guide-owner-col">
                          <div>A1 : 전재우</div>
                          <div>A2 : 정화영</div>
                          <div>A3 : 정주희</div>
                          <div>A4 : 신상준</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="contracts-header-actions">
              <button className="primary-btn" type="button" onClick={handleAddDocumentRow}>
                등록
              </button>
              <button className="secondary-btn" type="button" onClick={() => openRegistryUpload('documents')}>
                엑셀 업로드
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={deleteSelectedDocuments}
                disabled={selectedDocumentIds.length === 0}
              >
                선택 삭제
              </button>
              <button className="secondary-btn" type="button" onClick={handleDocumentExcelDownload}>
                엑셀 다운로드
              </button>
            </div>

            <div className="table-toolbar registry-toolbar-date-range">
              <div className="registry-search-toolbar-split">
                <input
                  className="table-search-input"
                  placeholder="검색어를 입력하세요"
                  value={documentSearch}
                  onChange={(e) => setDocumentSearch(e.target.value)}
                />
                <RegistryDateRangeFilter
                  startDate={documentDateRange.startDate}
                  endDate={documentDateRange.endDate}
                  onStartChange={(value) =>
                    setDocumentDateRange((prev) => ({ ...prev, startDate: value }))
                  }
                  onEndChange={(value) =>
                    setDocumentDateRange((prev) => ({ ...prev, endDate: value }))
                  }
                />
              </div>
            </div>

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll overflow-x-auto">
                <table className="contract-table excel-table registry-table documents-registry-table ledger-table-ui table-w-full-min">
                  <colgroup>
                    <col className="registry-check-col" />
                    {DOCUMENT_COLUMNS.map((column) => (
                      <col key={column.key} className={column.widthClass || ''} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header table-col-tight">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={allDocumentsSelected}
                          onChange={() =>
                            setSelectedDocumentIds((prev) =>
                              allDocumentsSelected
                                ? prev.filter((id) => !filteredDocuments.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredDocuments.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {DOCUMENT_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`${getTableColumnLayoutClass(column)} ${getTableAlignClass(column.align, column)} ${column.headerClass || ''} ${column.widthClass || ''} contract-th-filterable`}
                          style={column.widthClass ? { minWidth: 'max(3rem, 100%)' } : undefined}
                        >
                          <div className="contract-th-filter-wrap">
                            <span className="contract-th-label">{column.label}</span>
                            <ContractColumnHeaderFilter
                              columnKey={column.key}
                              options={documentColumnFilterOptionsMap[column.key] ?? []}
                              selected={documentActiveFilters[column.key] ?? []}
                              onApply={handleDocumentActiveFiltersApply}
                              isOpen={openDocumentColumnFilterKey === column.key}
                              onOpenChange={setOpenDocumentColumnFilterKey}
                              normalizeSelection={normalizeDocumentColumnFilterSelection}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {documentsRawData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={DOCUMENT_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : isDocumentTableFilterResultEmpty ? (
                      <tr>
                        <td
                          colSpan={DOCUMENT_COLUMNS.length + 1}
                          className="empty-cell"
                        >
                          필터 조건에 맞는 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                    renderGroupedRegistryRows({
                      groups: groupedDocumentRows,
                      columns: DOCUMENT_COLUMNS,
                      emptyMessage: '등록된 데이터가 없습니다.',
                      selectedIds: selectedDocumentIds,
                      onToggleSelection: toggleDocumentSelection,
                      editingIds: [],
                      isSaving: isSavingDocuments,
                      onStartEdit: startDocumentEdit,
                      onSaveRow: saveDocumentRow,
                      onCancelRow: cancelDocumentRow,
                      onChange: handleDocumentCellChange,
                      isEmptyRow: isDocumentRowEmpty,
                      isYearOpen: isDocumentYearOpen,
                      onToggleYear: toggleDocumentYear,
                      cellEditScope: 'documents',
                      isAdminForRegistry: true,
                      registryCellEdit,
                      onRegistryCellStart: (rowId, columnKey, value, row) =>
                        startRegistryCellEdit('documents', rowId, columnKey, value, row),
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'contactsManage' && (
          <section className="stat-card">
            {!isAdmin ? (
              <div className="contracts-header-actions">
                <div style={{ color: '#94a3b8', fontSize: 12 }}>
                  권한이 없습니다. 관리자 계정으로만 접근할 수 있습니다.
                </div>
              </div>
            ) : (
              <div className="contracts-header-actions">
                <button className="primary-btn" type="button" onClick={handleAddContactsRow}>
                  등록
                </button>
                <button className="secondary-btn" type="button" onClick={handleContactsExcelUpload}>
                  엑셀 업로드
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={deleteSelectedContactsRows}
                  disabled={selectedContactsIds.length === 0}
                >
                  선택 삭제
                </button>
                <button className="secondary-btn" type="button" onClick={handleContactsExcelDownload}>
                  엑셀 다운로드
                </button>
              </div>
            )}

            {isAdmin && (
              <div className="table-toolbar">
                <input
                  className="table-search-input"
                  placeholder="검색어를 입력하세요"
                  value={contactsSearch}
                  onChange={(e) => setContactsSearch(e.target.value)}
                />
              </div>
            )}

            <div className="contract-table-panel">
              <div className="table-wrap contracts-only-scroll overflow-x-auto">
                <table className="contract-table excel-table registry-table contacts-registry-table ledger-table-ui table-w-full-min">
                  <colgroup>
                    <col className="registry-check-col" />
                    {CONTACTS_MANAGE_COLUMNS.map((column) => (
                      <col key={column.key} className={column.widthClass || ''} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-align-center registry-check-header table-col-tight">
                        <input
                          className="registry-row-checkbox"
                          type="checkbox"
                          checked={isAdmin && allContactsSelected}
                          disabled={!isAdmin}
                          onChange={() =>
                            setSelectedContactsIds((prev) =>
                              allContactsSelected
                                ? prev.filter((id) => !filteredContactsRows.some((row) => row.id === id))
                                : [...new Set([...prev, ...filteredContactsRows.map((row) => row.id)])]
                            )
                          }
                        />
                      </th>
                      {CONTACTS_MANAGE_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className={`${getTableColumnLayoutClass(column)} ${getTableAlignClass(column.align, column)} ${column.headerClass || ''} ${column.widthClass || ''} contract-th-filterable`}
                        >
                          <div className="contract-th-filter-wrap">
                            <span className="contract-th-label">{column.label}</span>
                            <ContractColumnHeaderFilter
                              columnKey={column.key}
                              options={contactsColumnFilterOptionsMap[column.key] ?? []}
                              selected={contactsActiveFilters[column.key] ?? []}
                              onApply={handleContactsActiveFiltersApply}
                              isOpen={openContactsColumnFilterKey === column.key}
                              onOpenChange={setOpenContactsColumnFilterKey}
                              normalizeSelection={normalizeContactsManageColumnFilterSelection}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!isAdmin ? (
                      <tr>
                        <td colSpan={CONTACTS_MANAGE_COLUMNS.length + 1} className="empty-cell">
                          관리자만 확인할 수 있습니다.
                        </td>
                      </tr>
                    ) : isLoadingContactsManage ? (
                      <tr>
                        <td colSpan={CONTACTS_MANAGE_COLUMNS.length + 1} className="empty-cell">
                          불러오는 중...
                        </td>
                      </tr>
                    ) : contactsRawData.length === 0 ? (
                      <tr>
                        <td colSpan={CONTACTS_MANAGE_COLUMNS.length + 1} className="empty-cell">
                          등록된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : isContactsTableFilterResultEmpty ? (
                      <tr>
                        <td colSpan={CONTACTS_MANAGE_COLUMNS.length + 1} className="empty-cell">
                          필터 조건에 맞는 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      renderFlatRegistryRows({
                        rows: filteredContactsRows,
                        columns: CONTACTS_MANAGE_COLUMNS,
                        emptyMessage: '등록된 데이터가 없습니다.',
                        selectedIds: selectedContactsIds,
                        onToggleSelection: toggleContactsSelection,
                        editingIds: [],
                        isSaving: false,
                        onStartEdit: () => {},
                        onSaveRow: () => {},
                        onCancelRow: () => {},
                        onChange: handleContactsCellChange,
                        isEmptyRow: () => false,
                        cellEditScope: 'contactsManage',
                        isAdminForRegistry: true,
                        registryCellEdit,
                        onRegistryCellStart: (rowId, columnKey, value, row) =>
                          startRegistryCellEdit('contactsManage', rowId, columnKey, value, row),
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {menu === 'installCases' && (
          <section className="stat-card stat-card--install-cases">
            <div className="install-cases-toolbar">
              <div className="install-cases-filters">
                <select
                  className="contract-filter-select install-cases-select"
                  value={installCaseEnvFilter}
                  onChange={(e) => setInstallCaseEnvFilter(e.target.value)}
                  aria-label="대분류 필터"
                >
                  {withInstallCaseSelectPlaceholder(INSTALL_CASE_MAJOR_CATEGORY_OPTIONS, '대분류').map(
                    (opt) => (
                      <option key={opt.value || 'major-all'} value={opt.value}>
                        {opt.label}
                      </option>
                    )
                  )}
                </select>
                <select
                  className="contract-filter-select install-cases-select"
                  value={installCaseMiddleFilter}
                  onChange={(e) => setInstallCaseMiddleFilter(e.target.value)}
                  aria-label="중분류 필터"
                >
                  {withInstallCaseSelectPlaceholder(INSTALL_CASE_MIDDLE_CATEGORY_OPTIONS, '중분류').map(
                    (opt) => (
                      <option key={opt.value || 'middle-all'} value={opt.value}>
                        {opt.label}
                      </option>
                    )
                  )}
                </select>
                <select
                  className="contract-filter-select install-cases-select"
                  value={installCaseAudienceFilter}
                  onChange={(e) => setInstallCaseAudienceFilter(e.target.value)}
                  aria-label="소분류 필터"
                >
                  {withInstallCaseSelectPlaceholder(INSTALL_CASE_MINOR_CATEGORY_OPTIONS, '소분류').map(
                    (opt) => (
                      <option key={opt.value || 'minor-all'} value={opt.value}>
                        {opt.label}
                      </option>
                    )
                  )}
                </select>
              </div>
              {isAdmin && (
                <button className="primary-btn" type="button" onClick={handleOpenInstallCaseRegister}>
                  등록
                </button>
              )}
            </div>

            <div className="install-cases-gallery">
              {filteredInstallCases.map((row) => (
                <div key={row.id} className="install-case-card-shell">
                  <button
                    type="button"
                    className="install-case-card"
                    onClick={() => setInstallCaseDetailModal(row)}
                  >
                    <div className="install-case-card-thumb">
                      <InstallCaseHeroMedia
                        src={row.heroImage || INSTALL_CASE_FALLBACK_HERO}
                        loading="lazy"
                        variant="card"
                      />
                    </div>
                    <div className="install-case-card-body">
                      <div className="install-case-card-title">{getInstallCaseProjectTitle(row)}</div>
                      <div className="install-case-card-meta">{formatInstallCaseCardSubline(row)}</div>
                    </div>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="install-case-card-delete"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        deleteInstallCaseById(row.id)
                      }}
                      aria-label={`${getInstallCaseProjectTitle(row)} 삭제`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {filteredInstallCases.length === 0 && (
              <div className="install-cases-empty">
                {installCases.length === 0 &&
                !installCaseEnvFilter &&
                !installCaseMiddleFilter &&
                !installCaseAudienceFilter
                  ? '조회된 설치사례가 없습니다.'
                  : '조건에 맞는 설치사례가 없습니다.'}
              </div>
            )}
          </section>
        )}

        {menu === 'unitPrice' && (
          <section className="stat-card stat-card--unit-price">
            {!isAdmin ? (
              <div className="contracts-header-actions">
                <div style={{ color: '#94a3b8', fontSize: 12 }}>
                  권한이 없습니다. 관리자 계정으로만 접근할 수 있습니다.
                </div>
              </div>
            ) : (
              <UnitPriceManagement />
            )}
          </section>
        )}

        {menu === 'materialsBoard' && (
          <section className="stat-card stat-card--materials-board">
            <div className="materials-board-layout">
              <aside className="materials-board-sidebar" aria-label="게시판 폴더">
                {isAdmin && (
                  <button
                    type="button"
                    className="materials-board-folder-add-btn"
                    onClick={handleAddMaterialsBoardFolder}
                  >
                    + 새 폴더
                  </button>
                )}
                <nav className="materials-board-folder-list">
                  {materialsBoardFolderNav.map((folderItem) => {
                    const isActive = materialsBoardSelectedFolder === folderItem.id
                    const showFolderActions =
                      isAdmin && folderItem.id !== MATERIALS_BOARD_FOLDER_ALL
                    return (
                      <div
                        key={folderItem.id}
                        className={`materials-board-folder-row${isActive ? ' active' : ''}`}
                      >
                        <button
                          type="button"
                          className="materials-board-folder-item"
                          onClick={() => setMaterialsBoardSelectedFolder(folderItem.id)}
                          aria-current={isActive ? 'true' : undefined}
                        >
                          <span className="materials-board-folder-icon" aria-hidden="true">
                            📂
                          </span>
                          <span className="materials-board-folder-label">{folderItem.label}</span>
                        </button>
                        {showFolderActions ? (
                          <div className="materials-board-folder-actions">
                            <button
                              type="button"
                              className="materials-board-folder-action-btn"
                              aria-label={`${folderItem.label} 폴더명 수정`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRenameMaterialsBoardFolder(folderItem.id)
                              }}
                            >
                              <Pencil size={14} strokeWidth={2} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="materials-board-folder-action-btn materials-board-folder-action-btn--danger"
                              aria-label={`${folderItem.label} 폴더 삭제`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteMaterialsBoardFolder(folderItem.id)
                              }}
                            >
                              <Trash2 size={14} strokeWidth={2} aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </nav>
              </aside>

              <div className="materials-board-main">
                <div className="materials-board-toolbar">
                  <input
                    className="table-search-input"
                    placeholder="제목 검색"
                    value={materialsBoardSearch}
                    onChange={(e) => setMaterialsBoardSearch(e.target.value)}
                  />
                  <div className="materials-board-toolbar-right">
                    {isAdmin && (
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleOpenMaterialsBoardRegister}
                      >
                        등록
                      </button>
                    )}
                  </div>
                </div>

                <div className="materials-board-table-panel">
                  <table className="materials-board-table">
                    <thead>
                      <tr>
                        <th className="materials-board-th materials-board-th--no">No</th>
                        <th className="materials-board-th materials-board-th--title">제목</th>
                        <th className="materials-board-th materials-board-th--attach">첨부</th>
                        <th className="materials-board-th materials-board-th--downloads">다운로드</th>
                        <th className="materials-board-th materials-board-th--date">등록일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMaterialsBoardPosts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="materials-board-empty">
                            {materialsBoardPosts.length === 0
                              ? '등록된 글이 없습니다.'
                              : materialsBoardSelectedFolder !== MATERIALS_BOARD_FOLDER_ALL
                                ? '이 폴더에 등록된 글이 없습니다.'
                                : '검색 결과가 없습니다.'}
                          </td>
                        </tr>
                      ) : (
                        filteredMaterialsBoardPosts.map((row, index) => (
                          <tr
                            key={row.id}
                            className="materials-board-row materials-board-row--clickable"
                            onClick={(event) => {
                              void handleDownloadMaterialsBoardFile(row, event)
                            }}
                          >
                            <td className="materials-board-td materials-board-td--no">{index + 1}</td>
                            <td className="materials-board-td materials-board-td--title materials-board-td--download">
                              <div className="materials-board-title-cell">
                                <span className="materials-board-title-text">{row.title}</span>
                                <button
                                  type="button"
                                  className="materials-board-inline-download-btn"
                                  disabled={materialsBoardDownloadingId === row.id}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void handleDownloadMaterialsBoardFile(row, event)
                                  }}
                                >
                                  {materialsBoardDownloadingId === row.id ? '다운로드 중…' : '다운로드'}
                                </button>
                              </div>
                            </td>
                            <td className="materials-board-td materials-board-td--attach">
                              {(() => {
                                const attach = getMaterialsBoardAttachSummary(row)
                                if (!attach) {
                                  return (
                                    <span className="materials-board-attach materials-board-attach--empty">
                                      —
                                    </span>
                                  )
                                }
                                return (
                                  <span
                                    className="materials-board-attach"
                                    title={attach.title}
                                    aria-label={`첨부 ${attach.count}개: ${attach.title}`}
                                  >
                                    <span className="materials-board-attach-icon" aria-hidden>
                                      📎
                                    </span>
                                    {attach.count > 1 ? (
                                      <span className="materials-board-attach-count">{attach.count}</span>
                                    ) : null}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="materials-board-td materials-board-td--downloads">
                              <span className="materials-board-download-count">
                                {Number(row.downloadCount) || 0}
                              </span>
                            </td>
                            <td className="materials-board-td materials-board-td--date">
                              <div className="materials-board-date-cell">
                                <span className="materials-board-date-text">{row.registeredAt}</span>
                                {isAdmin && (
                                  <div
                                    className="materials-board-row-actions"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="materials-board-row-btn"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleOpenMaterialsBoardEdit(row)
                                      }}
                                    >
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      className="materials-board-row-btn materials-board-row-btn--danger"
                                      onClick={(e) => handleDeleteMaterialsBoardPost(row, e)}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {menu === 'calendar' && (
          <section className="stat-card stat-card--calendar">
            <div className="calendar-page">
              <div className="calendar-page-body">
                <div className="calendar-page-main">
                  <div className="calendar-body">
                    <div className="calendar-main-toolbar">
                      <div className="calendar-toolbar-left">
                        <div className="calendar-toolbar-nav" role="group" aria-label="월 이동">
                          <button
                            className="month-nav-btn"
                            type="button"
                            aria-label="이전 달"
                            onClick={() => prevMonth()}
                          >
                            ◀
                          </button>
                          <div className="calendar-month-title" aria-live="polite">
                            {getMonthLabel(calendarCursor)}
                          </div>
                          <button
                            className="month-nav-btn"
                            type="button"
                            aria-label="다음 달"
                            onClick={() => nextMonth()}
                          >
                            ▶
                          </button>
                        </div>
                        <div className="calendar-legend-divider" aria-hidden="true" />
                        <div className="calendar-legend" aria-label="일정 색상 범례">
                          <span className="calendar-legend-item">
                            <span className="calendar-legend-dot calendar-legend-dot--contract" />
                            계약
                          </span>
                          <span className="calendar-legend-item">
                            <span className="calendar-legend-dot calendar-legend-dot--due" />
                            준공
                          </span>
                          <span className="calendar-legend-item">
                            <span className="calendar-legend-dot calendar-legend-dot--manual" />
                            기타
                          </span>
                        </div>
                      </div>
                      <div className="calendar-toolbar-form calendar-toolbar-form--register-only">
                        <button
                          className="primary-btn calendar-add-btn"
                          type="button"
                          onClick={openCalendarEventRegisterModal}
                        >
                          등록
                        </button>
                      </div>
                    </div>

                    <div className="calendar-surface">
                      <div className="calendar-weekday-row" aria-hidden>
                        {CALENDAR_WEEKDAY_LABELS_KO.map((label, wi) => (
                          <div
                            key={label}
                            className={`calendar-weekday-cell${
                              wi === 0 ? ' calendar-weekday-cell--sun' : wi === 6 ? ' calendar-weekday-cell--sat' : ''
                            }`}
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                      <div className="calendar-month-weeks">
                        {chunkArray(monthDays, 7).map((weekDays, wi) => {
                          const spanData = buildWeekManualSpanBarPlacements(weekDays, calendarItems)
                          return (
                            <div key={wi} className="calendar-week-stack">
                              <div className="calendar-grid calendar-grid--days calendar-grid--week">
                                {weekDays.map((day, di) => {
                                  const index = wi * 7 + di
                                  const dateObj = day ? parseDateOnly(day) : null
                                  const dow = dateObj ? dateObj.getDay() : null
                                  const isHoliday = day ? isKoreanPublicHoliday(day) : false
                                  const dayNum = day ? parseInt(day.slice(8, 10), 10) : null
                                  const dayNumberClass = [
                                    'day-number',
                                    isHoliday
                                      ? 'day-number--holiday'
                                      : dow === 0
                                        ? 'day-number--sun'
                                        : dow === 6
                                          ? 'day-number--sat'
                                          : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')
                                  const dayBoxClass = [
                                    day ? 'day-box' : 'day-box empty',
                                    day && day === calendarTodayYmd ? 'day-box--today' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')
                                  return (
                                    <div key={index} className={dayBoxClass}>
                                      {day && (
                                        <>
                                          <div className={dayNumberClass}>{dayNum}</div>
                                          <div className="day-events">
                                            {calendarItems
                                              .filter((item) => {
                                                if (item.type === 'manual') {
                                                  const r = normalizeManualEventRangeInPlace(item)
                                                  if (
                                                    r.dateStart &&
                                                    r.dateEnd &&
                                                    r.dateStart !== r.dateEnd
                                                  ) {
                                                    return false
                                                  }
                                                }
                                                return item.date === day
                                              })
                                              .map((item) => (
                                                <button
                                                  key={item.id}
                                                  type="button"
                                                  className={`event-pill event-pill-button ${getCalendarEventPillTypeClass(item.type)}`}
                                                  onClick={() => openCalendarDetail(item)}
                                                >
                                                  {item.text}
                                                </button>
                                              ))}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              {spanData.laneCount > 0 ? (
                                <div
                                  className="calendar-week-multi-lane"
                                  style={{
                                    gridTemplateRows: `repeat(${spanData.laneCount}, 28px)`,
                                  }}
                                >
                                  {spanData.placed.map((seg) => (
                                    <button
                                      key={`${seg.item.id}-w${wi}-c${seg.startCol}-${seg.endCol}-L${seg.lane}`}
                                      type="button"
                                      className={`event-pill calendar-span-bar event-pill-button ${getCalendarEventPillTypeClass(seg.item.type)}`}
                                      style={{
                                        gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                                        gridRow: seg.lane + 1,
                                      }}
                                      onClick={() => openCalendarDetail(seg.item)}
                                    >
                                      {seg.item.text}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <aside className="calendar-page-sidebar">
                  <div className="selected-events-wrap calendar-month-list-panel">
                    <div className="month-list-header">
                      <div className="month-list-tools">
                        <div className="calendar-month-list-controls">
                          <select
                            className="calendar-filter-select"
                            value={monthTypeFilter}
                            onChange={(e) => {
                              const v = e.target.value
                              if (
                                v === CALENDAR_MONTH_LIST_CATEGORY.ALL ||
                                v === CALENDAR_MONTH_LIST_CATEGORY.CONTRACT ||
                                v === CALENDAR_MONTH_LIST_CATEGORY.DUE ||
                                v === CALENDAR_MONTH_LIST_CATEGORY.MANUAL
                              ) {
                                setMonthTypeFilter(v)
                              }
                            }}
                          >
                            <option value={CALENDAR_MONTH_LIST_CATEGORY.ALL}>전체</option>
                            <option value={CALENDAR_MONTH_LIST_CATEGORY.CONTRACT}>계약</option>
                            <option value={CALENDAR_MONTH_LIST_CATEGORY.DUE}>준공</option>
                            <option value={CALENDAR_MONTH_LIST_CATEGORY.MANUAL}>기타</option>
                          </select>

                          <input
                            className="calendar-search-input"
                            type="text"
                            placeholder="계약 / 준공 / 기타 일정 검색"
                            value={monthSearch}
                            onChange={(e) => setMonthSearch(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="month-event-list">
                        {monthEventList.length === 0 ? (
                          <div className="empty-text">이 달에 등록된 일정이 없습니다.</div>
                        ) : (
                          monthEventList.map((item) => {
                            return (
                              <div
                                key={item.id}
                                className={`selected-event-card clickable ${getCalendarEventTypeClassName(
                                  item.type
                                )}`}
                                onClick={() => openCalendarDetail(item)}
                              >
                                <div className="selected-event-click">
                                  <div className="selected-event-title">
                                    {formatCalendarMonthListTitleLine(item)}
                                  </div>
                                  <div className="selected-event-meta">
                                    <div className="selected-event-memo-line">
                                      영업담당자: {item.owner ? item.owner : '\u00a0'}
                                    </div>
                                    <div className="selected-event-memo-line">
                                      현장 PM: {item.pm ? item.pm : '\u00a0'}
                                    </div>
                                  </div>
                                  {item.note ? (
                                    <div className="selected-event-note-snippet" title={item.note}>
                                      {item.note}
                                    </div>
                                  ) : null}
                                </div>

                                {item.type === 'manual' && (
                                  <div
                                    className="calendar-manual-event-actions"
                                    role="group"
                                    aria-label="기타 일정 작업"
                                  >
                                    <button
                                      className="delete-btn"
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        deleteManualEvent(item.originalId)
                                      }}
                                    >
                                      삭제
                                    </button>
                                    <button
                                      type="button"
                                      className="calendar-manual-action-btn calendar-manual-action-btn--edit"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openCalendarDetail(item, { startManualInlineEdit: true })
                                      }}
                                    >
                                      수정
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        )}
      </main>

      {installCaseDetailModal && (
        <div className="modal-backdrop" onClick={() => setInstallCaseDetailModal(null)}>
          <div
            className="install-case-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-case-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="install-case-detail-modal-header">
              <h3 id="install-case-detail-title" className="install-case-detail-modal-title">
                {getInstallCaseProjectTitle(installCaseDetailModal)}
              </h3>
              <div className="install-case-detail-modal-actions">
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="secondary-btn install-case-modal-edit-btn"
                      onClick={() => {
                        const row = installCaseDetailModal
                        setInstallCaseDetailModal(null)
                        handleOpenInstallCaseEdit(row)
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="secondary-btn install-case-modal-delete-btn"
                      onClick={() => deleteInstallCaseById(installCaseDetailModal.id)}
                    >
                      삭제
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setInstallCaseDetailModal(null)}
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="install-case-detail-modal-body">
              <div className="install-case-detail-inner">
              <div className="install-case-detail-hero-zone">
                <div className="install-case-detail-hero">
                  <InstallCaseHeroMedia
                    src={installCaseDetailModal.heroImage || INSTALL_CASE_FALLBACK_HERO}
                    variant="detail"
                  />
                </div>
              </div>
              <div className="install-case-detail-lower-shell">
                <div className="install-case-detail-lower">
                  <div className="install-case-detail-info-col">
                    <dl className="install-case-detail-meta">
                      <div className="install-case-meta-row">
                        <dt>사업년도</dt>
                        <dd>{formatInstallCaseYearDetailDisplay(installCaseDetailModal.year)}</dd>
                      </div>
                      <div className="install-case-meta-row">
                        <dt>대분류</dt>
                        <dd>{getInstallCaseEnvironmentLabel(installCaseDetailModal.environment)}</dd>
                      </div>
                      <div className="install-case-meta-row">
                        <dt>중분류</dt>
                        <dd>{getInstallCaseMiddleCategoryLabel(installCaseDetailModal.middleCategory)}</dd>
                      </div>
                      <div className="install-case-meta-row">
                        <dt>소분류</dt>
                        <dd>{getInstallCaseAudienceLabel(installCaseDetailModal.audience)}</dd>
                      </div>
                      <div className="install-case-meta-row">
                        <dt>용도</dt>
                        <dd>{installCaseDetailModal.purpose ?? '-'}</dd>
                      </div>
                      <div className="install-case-meta-row">
                        <dt>발주처</dt>
                        <dd>{installCaseDetailModal.client ?? '-'}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="install-case-detail-specs-col">
                    <dl className="install-case-detail-meta">
                      {INSTALL_CASE_SPEC_ROWS.filter(({ key }) => {
                        if (key !== 'moduleSize2' && key !== 'moduleQty2') return true
                        const value = safeString(installCaseDetailModal.specs?.[key]).trim()
                        return value && value !== '-'
                      }).map(({ key, label }) => (
                        <div className="install-case-meta-row" key={key}>
                          <dt>{label}</dt>
                          <dd>{formatInstallCaseSpecDetailDisplay(key, installCaseDetailModal.specs[key])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {contractRegisterModalOpen && (
        <div className="modal-backdrop" onClick={closeContractRegisterModal}>
          <div
            className="install-case-form-modal contract-register-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-register-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="install-case-form-modal-header">
              <h3 id="contract-register-title">{PAGE_TITLE_MAP.contracts}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeContractRegisterModal}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="install-case-form-modal-body">
              <div className="global-register-form-grid">
                <div className="global-register-field global-register-field--full">
                  <span className="install-case-form-label">D-Day (준공일자 기준)</span>
                  <div className="global-register-dday">{getDdayText(newRow.dueDate)}</div>
                </div>
                {CONTRACT_COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    className={`global-register-field${
                      column.type === 'textarea' ? ' global-register-field--full' : ''
                    }`}
                  >
                    <label className="install-case-form-label" htmlFor={`contract-reg-${column.key}`}>
                      {column.label}
                    </label>
                    {column.type === 'textarea' ? (
                      <textarea
                        id={`contract-reg-${column.key}`}
                        className="table-search-input install-case-form-input global-register-control"
                        rows={column.key === 'note' ? 4 : 2}
                        placeholder={CONTRACT_FIELD_PLACEHOLDERS[column.key] || ''}
                        value={newRow[column.key] ?? ''}
                        onChange={(e) =>
                          setNewRow((prev) => ({
                            ...prev,
                            [column.key]:
                              column.key === 'amount' || column.type === 'amount'
                                ? formatAmount(e.target.value)
                                : e.target.value,
                          }))
                        }
                      />
                    ) : column.type === 'date' ? (
                      <input
                        id={`contract-reg-${column.key}`}
                        className="table-search-input install-case-form-input global-register-control"
                        type="date"
                        value={newRow[column.key] ?? ''}
                        onChange={(e) =>
                          setNewRow((prev) => ({ ...prev, [column.key]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        id={`contract-reg-${column.key}`}
                        className={`table-search-input install-case-form-input global-register-control${
                          column.align === 'right' ? ' align-right' : ''
                        }`}
                        type="text"
                        placeholder={CONTRACT_FIELD_PLACEHOLDERS[column.key] || ''}
                        value={newRow[column.key] ?? ''}
                        onChange={(e) =>
                          setNewRow((prev) => ({
                            ...prev,
                            [column.key]:
                              column.key === 'amount' || column.type === 'amount'
                                ? formatAmount(e.target.value)
                                : e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="install-case-form-actions">
                <button type="button" className="secondary-btn" onClick={closeContractRegisterModal}>
                  취소
                </button>
                <button type="button" className="primary-btn" onClick={() => void saveAddRow()}>
                  등록
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {registryLongTextModal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!registryLongTextModal.saving) closeRegistryLongTextModal()
          }}
        >
          <div
            className="sales-long-text-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registry-long-text-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sales-record-modal-header">
              <div>
                <p className="sales-long-text-modal-eyebrow">
                  {registryLongTextModal.columnLabel}
                </p>
                <h3 id="registry-long-text-modal-title" className="sales-record-modal-title">
                  {registryLongTextModal.projectName}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeRegistryLongTextModal}
                aria-label="닫기"
                disabled={registryLongTextModal.saving}
              >
                ✕
              </button>
            </div>
            <div className="sales-record-modal-body">
              <textarea
                className="sales-long-text-textarea"
                rows={10}
                autoFocus
                value={registryLongTextModal.draft}
                onChange={(e) =>
                  setRegistryLongTextModal((prev) =>
                    prev ? { ...prev, draft: e.target.value } : prev
                  )
                }
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    void saveRegistryLongTextModal()
                  }
                }}
                disabled={registryLongTextModal.saving}
              />
            </div>
            <div className="sales-record-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeRegistryLongTextModal}
                disabled={registryLongTextModal.saving}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => void saveRegistryLongTextModal()}
                disabled={registryLongTextModal.saving}
              >
                {registryLongTextModal.saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {registryCreateModal &&
        (() => {
          const { scope, draft } = registryCreateModal
          const columns = getRegistryColumnsByScope(scope)
          const titleMap = {
            sales: PAGE_TITLE_MAP.sales,
            discovery: PAGE_TITLE_MAP.discovery,
            excluded: PAGE_TITLE_MAP.excluded,
            documents: PAGE_TITLE_MAP.documents,
          }
          const saving =
            scope === 'sales'
              ? isSavingSales
              : scope === 'discovery'
                ? isSavingDiscovery
                : scope === 'excluded'
                  ? isSavingExcluded
                  : isSavingDocuments
          return (
            <div className="modal-backdrop" onClick={closeRegistryCreateModal}>
              <div
                className="install-case-form-modal registry-create-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="registry-create-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="install-case-form-modal-header">
                  <h3 id="registry-create-title">{titleMap[scope] || '등록'}</h3>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={closeRegistryCreateModal}
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
                <div className="install-case-form-modal-body">
                  <div className="global-register-form-grid">
                    {columns.map((column) => (
                      <div
                        key={column.key}
                        className={`global-register-field${
                          column.type === 'textarea' ? ' global-register-field--full' : ''
                        }`}
                      >
                        <label className="install-case-form-label" htmlFor={`registry-create-${scope}-${column.key}`}>
                          {column.label}
                        </label>
                        {column.type === 'textarea' ? (
                          <textarea
                            id={`registry-create-${scope}-${column.key}`}
                            className="table-search-input install-case-form-input global-register-control"
                            rows={3}
                            placeholder={getRegistryFieldPlaceholder(scope, column)}
                            value={draft[column.key] ?? ''}
                            onChange={(e) => patchRegistryCreateDraft(column.key, e.target.value)}
                          />
                        ) : column.type === 'date' ? (
                          <input
                            id={`registry-create-${scope}-${column.key}`}
                            className="table-search-input install-case-form-input global-register-control"
                            type="date"
                            value={draft[column.key] ?? ''}
                            onChange={(e) => patchRegistryCreateDraft(column.key, e.target.value)}
                          />
                        ) : column.type === 'select' ? (
                          <select
                            id={`registry-create-${scope}-${column.key}`}
                            className="contract-filter-select install-case-form-input global-register-control-select"
                            value={draft[column.key] ?? ''}
                            onChange={(e) => patchRegistryCreateDraft(column.key, e.target.value)}
                          >
                            <option value="">선택</option>
                            {(column.options || []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`registry-create-${scope}-${column.key}`}
                            className={`table-search-input install-case-form-input global-register-control${
                              column.align === 'right' ? ' align-right' : ''
                            }`}
                            type="text"
                            placeholder={getRegistryFieldPlaceholder(scope, column)}
                            value={draft[column.key] ?? ''}
                            onChange={(e) => patchRegistryCreateDraft(column.key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="install-case-form-actions">
                    <button type="button" className="secondary-btn" onClick={closeRegistryCreateModal}>
                      취소
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={saving}
                      onClick={() => void saveRegistryCreateModal()}
                    >
                      등록
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      {salesRecordModal && (
        <div className="modal-backdrop" onClick={closeSalesRecordModal}>
          <div
            className="sales-record-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-record-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sales-record-modal-header">
              <div>
                <h3 id="sales-record-modal-title" className="sales-record-modal-title">
                  요약
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeSalesRecordModal}
                aria-label="닫기"
                disabled={salesRecordModal.saving}
              >
                ✕
              </button>
            </div>
            <div className="sales-record-modal-body">
              <div className="sales-record-modal-info" aria-label="선택 항목 기본 정보">
                <div className="sales-record-modal-info-item">
                  <span className="sales-record-modal-info-label">발주처</span>
                  <span className="sales-record-modal-info-value">{salesRecordModal.client || '-'}</span>
                </div>
                <div className="sales-record-modal-info-item">
                  <span className="sales-record-modal-info-label">사업명</span>
                  <span className="sales-record-modal-info-value">{salesRecordModal.projectName || '-'}</span>
                </div>
                <div className="sales-record-modal-info-item">
                  <span className="sales-record-modal-info-label">담당자</span>
                  <span className="sales-record-modal-info-value">{salesRecordModal.manager || '-'}</span>
                </div>
                <div className="sales-record-modal-info-item">
                  <span className="sales-record-modal-info-label">담당부서</span>
                  <span className="sales-record-modal-info-value">{salesRecordModal.department || '-'}</span>
                </div>
              </div>
              <div className="sales-record-modal-timeline">
                <div className="sales-record-modal-section">
                  <div className="sales-record-modal-section-label-row">
                    <span className="sales-record-modal-section-label" id="sales-record-history-label">
                      지난 기록
                    </span>
                    <button
                      type="button"
                      className="sales-record-modal-history-edit-toggle"
                      onClick={() =>
                        setSalesRecordModal((prev) =>
                          prev ? { ...prev, isEditingSummary: !prev.isEditingSummary } : prev
                        )
                      }
                      disabled={salesRecordModal.saving}
                      aria-pressed={salesRecordModal.isEditingSummary}
                    >
                      {salesRecordModal.isEditingSummary ? '완료' : '수정'}
                    </button>
                  </div>
                  {salesRecordModal.isEditingSummary ? (
                    <textarea
                      className="sales-record-modal-history-edit resize-none"
                      rows={6}
                      aria-labelledby="sales-record-history-label"
                      value={salesRecordModal.summaryDraft}
                      onChange={(e) =>
                        setSalesRecordModal((prev) =>
                          prev ? { ...prev, summaryDraft: e.target.value } : prev
                        )
                      }
                      disabled={salesRecordModal.saving}
                    />
                  ) : (
                    <div
                      className="sales-record-modal-history"
                      role="region"
                      aria-labelledby="sales-record-history-label"
                    >
                      {salesRecordModal.summaryDraft ? (
                        <div className="sales-record-modal-history-text">{salesRecordModal.summaryDraft}</div>
                      ) : (
                        <p className="sales-record-modal-history-empty">기록된 요약이 없습니다.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="sales-record-modal-section">
                  <label className="sales-record-modal-section-label" htmlFor="sales-record-new-entry">
                    새 업데이트
                  </label>
                  <textarea
                    id="sales-record-new-entry"
                    className="sales-record-modal-entry resize-none"
                    rows={3}
                    placeholder="오늘 날짜로 추가할 업데이트 내용을 입력하세요."
                    value={salesRecordModal.newEntry}
                    onChange={(e) =>
                      setSalesRecordModal((prev) => (prev ? { ...prev, newEntry: e.target.value } : prev))
                    }
                    disabled={salesRecordModal.saving}
                  />
                </div>
              </div>
            </div>
            <div className="sales-record-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeSalesRecordModal}
                disabled={salesRecordModal.saving}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => void saveSalesRecordModal()}
                disabled={salesRecordModal.saving}
              >
                {salesRecordModal.saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {calendarEventRegisterOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setCalendarEventRegisterOpen(false)
            setEventForm({ ...emptyEvent })
          }}
        >
          <div
            className="install-case-form-modal calendar-event-register-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-register-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="install-case-form-modal-header">
              <h3 id="calendar-event-register-title">{PAGE_TITLE_MAP.calendar}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setCalendarEventRegisterOpen(false)
                  setEventForm({ ...emptyEvent })
                }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="install-case-form-modal-body">
              <div className="calendar-register-form">
                <div className="calendar-register-section calendar-register-date-range" aria-label="일정 기간">
                  <span className="install-case-form-label">시작일</span>
                  <input
                    type="date"
                    className="table-search-input install-case-form-input calendar-input-date"
                    value={eventForm.dateStart}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, dateStart: e.target.value }))}
                  />
                  <span className="calendar-date-range-sep" aria-hidden>
                    ~
                  </span>
                  <span className="install-case-form-label">종료일</span>
                  <input
                    type="date"
                    className="table-search-input install-case-form-input calendar-input-date"
                    value={eventForm.dateEnd}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, dateEnd: e.target.value }))}
                  />
                </div>
                <div className="calendar-register-section">
                  <label className="install-case-form-label" htmlFor="calendar-reg-title">
                    일정 내용
                  </label>
                  <input
                    id="calendar-reg-title"
                    type="text"
                    className="table-search-input install-case-form-input"
                    placeholder="예: OO시청 현장 미팅"
                    value={eventForm.title}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="calendar-register-section calendar-register-assignees">
                  <div className="calendar-register-split-field">
                    <label className="install-case-form-label" htmlFor="calendar-reg-owner">
                      영업담당자
                    </label>
                    <input
                      id="calendar-reg-owner"
                      type="text"
                      className="table-search-input install-case-form-input"
                      placeholder="예: OOO"
                      value={eventForm.owner}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, owner: e.target.value }))}
                    />
                  </div>
                  <div className="calendar-register-split-field">
                    <label className="install-case-form-label" htmlFor="calendar-reg-pm">
                      현장 PM
                    </label>
                    <input
                      id="calendar-reg-pm"
                      type="text"
                      className="table-search-input install-case-form-input"
                      placeholder="예: OOO"
                      value={eventForm.pm}
                      onChange={(e) => setEventForm((prev) => ({ ...prev, pm: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="calendar-register-section">
                  <label className="install-case-form-label" htmlFor="calendar-reg-note">
                    비고
                  </label>
                  <textarea
                    id="calendar-reg-note"
                    className="table-search-input install-case-form-input"
                    rows={4}
                    placeholder="비고를 입력하세요 (선택)"
                    value={eventForm.note}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, note: e.target.value }))}
                  />
                </div>
              </div>
              <div className="install-case-form-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setCalendarEventRegisterOpen(false)
                    setEventForm({ ...emptyEvent })
                  }}
                >
                  취소
                </button>
                <button type="button" className="primary-btn" onClick={addManualEvent}>
                  등록
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {isAdmin && materialsBoardRegisterOpen && (
        <div className="modal-backdrop" onClick={handleCloseMaterialsBoardRegister}>
          <div
            className="install-case-form-modal materials-board-register-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="materials-board-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="install-case-form-modal-header">
              <h3 id="materials-board-form-title">{PAGE_TITLE_MAP.materialsBoard}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseMaterialsBoardRegister}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="install-case-form-modal-body materials-board-register-modal-body">
              <div className="materials-board-register-field">
                <label className="install-case-form-label" htmlFor="materials-board-title">
                  제목
                </label>
                <input
                  id="materials-board-title"
                  className="table-search-input install-case-form-input"
                  type="text"
                  value={materialsBoardFormDraft.title}
                  onChange={(e) =>
                    setMaterialsBoardFormDraft((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="예: LED 견적 가이드"
                />
              </div>
              <div className="materials-board-register-field">
                <label className="install-case-form-label" htmlFor="materials-board-folder">
                  폴더
                </label>
                <select
                  id="materials-board-folder"
                  className="contract-filter-select install-case-form-input global-register-control"
                  value={safeString(materialsBoardRegisterFolderId).trim() || '기타'}
                  onChange={(e) => setMaterialsBoardRegisterFolderId(e.target.value)}
                >
                  {materialsBoardRegisterFolderOptions.map((folderName) => (
                    <option key={folderName} value={folderName}>
                      {folderName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="materials-board-register-field">
                <label className="install-case-form-label">첨부 파일 (다중 선택)</label>
                <MaterialBoardMultiFileDropzone
                  inputId="materials-board-file-input"
                  pendingFiles={materialsBoardFile}
                  onAddFiles={(entries) =>
                    setMaterialsBoardFile((prev) => [...prev, ...entries])
                  }
                  onRemoveFile={(fileId) =>
                    setMaterialsBoardFile((prev) => prev.filter((e) => e.id !== fileId))
                  }
                />
              </div>
              <div className="install-case-form-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCloseMaterialsBoardRegister}
                  disabled={materialsBoardSubmitting}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void handleSaveMaterialsBoardRegister()}
                  disabled={materialsBoardSubmitting}
                >
                  {materialsBoardSubmitting
                    ? materialsBoardEditingId
                      ? '저장 중...'
                      : '등록 중...'
                    : materialsBoardEditingId
                      ? '저장'
                      : '등록'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {installCaseRegisterOpen && (
        <div className="modal-backdrop" onClick={handleCloseInstallCaseRegister}>
          <div
            className="install-case-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-case-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="install-case-form-modal-header">
              <h3 id="install-case-form-title">{PAGE_TITLE_MAP.installCases}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  if (!installCaseSubmitting) handleCloseInstallCaseRegister()
                }}
                disabled={installCaseSubmitting}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="install-case-form-modal-body">
              <InstallCaseFormTwoColumn
                key={installCaseEditingId ? `edit-${installCaseEditingId}` : 'create'}
                formDraft={installCaseFormDraft}
                setFormDraft={setInstallCaseFormDraft}
                icImageFile={icImageFile}
                setIcImageFile={setIcImageFile}
                icImagePreview={icImagePreview}
                icImagePreviewIsVideo={
                  icImageFile
                    ? isInstallCaseVideoFile(icImageFile)
                    : isInstallCaseVideo(icImagePreview)
                }
                onClearInstallCaseImage={clearInstallCaseImage}
                pairDigitChange={handleInstallCasePairDigitChange}
                onLedPitchChange={handleInstallCaseLedPitchChange}
                onInvalidImageFile={() =>
                  showAppAlert('이미지 또는 동영상 파일만 업로드할 수 있습니다.', '알림')
                }
                onFileTooLarge={(file) =>
                  showAppAlert(
                    `파일 용량이 너무 큽니다. 최대 ${formatInstallCaseMediaMaxSize(file)}까지 업로드할 수 있습니다.`,
                    '알림'
                  )
                }
              />
            </div>
            <div className="install-case-form-modal-footer">
              <div className="install-case-form-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCloseInstallCaseRegister}
                  disabled={installCaseSubmitting}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSaveInstallCaseRegister}
                  disabled={installCaseSubmitting}
                >
                  {installCaseSubmitting
                    ? installCaseEditingId
                      ? '저장 중...'
                      : '등록 중...'
                    : installCaseEditingId
                      ? '저장'
                      : '등록'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contractConfirmDialog &&
        (() => {
          const d = contractConfirmDialog
          const isContractDel = Array.isArray(d.payloadIds) && d.payloadIds.length > 0
          const primaryDanger = isContractDel || d.destructive === true
          const primaryLabel = isContractDel ? '삭제' : d.confirmLabel || '확인'
          return (
            <div
              className="modal-backdrop contract-confirm-backdrop"
              onClick={() => {
                if (typeof d.onCancel === 'function') d.onCancel()
                setContractConfirmDialog(null)
              }}
            >
              <div
                className="confirm-dialog-shell"
                style={{
                  maxWidth: 400,
                  width: 'min(400px, calc(100vw - 40px))',
                  boxSizing: 'border-box',
                  flex: '0 0 auto',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="confirm-dialog-title">{d.title}</h3>
                <p className="confirm-dialog-message">{d.message}</p>
                {d.prompt ? (
                  <input
                    type="text"
                    className="table-search-input confirm-dialog-prompt-input"
                    value={d.prompt.value}
                    placeholder={d.prompt.placeholder || ''}
                    autoFocus
                    onChange={(e) =>
                      setContractConfirmDialog((prev) =>
                        prev?.prompt
                          ? {
                              ...prev,
                              prompt: { ...prev.prompt, value: e.target.value },
                            }
                          : prev
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleConfirmDialogPrimary()
                      }
                    }}
                  />
                ) : null}
                <div className="confirm-dialog-actions">
                  {!d.alert && (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        if (typeof d.onCancel === 'function') d.onCancel()
                        setContractConfirmDialog(null)
                      }}
                    >
                      취소
                    </button>
                  )}
                  <button
                    type="button"
                    className={`primary-btn${primaryDanger ? ' danger-btn' : ''}`}
                    onClick={handleConfirmDialogPrimary}
                  >
                    {primaryLabel}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      {detailModal &&
        (() => {
          const inManualInlineEdit =
            detailModal.manualEventId != null &&
            calendarManualDetailEditMode &&
            calendarManualDetailDraft != null
          const md = calendarManualDetailDraft

          return (
        <div className="modal-backdrop" onClick={closeCalendarDetailModal}>
          <div
            className="install-case-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-detail-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="install-case-detail-modal-header">
              <h3 id="calendar-detail-modal-title">상세 정보</h3>
              <div className="install-case-detail-modal-actions">
                {detailModal.manualEventId != null && (
                  <>
                    {!calendarManualDetailEditMode ? (
                      <>
                        <button
                          type="button"
                          className="secondary-btn install-case-modal-delete-btn"
                          onClick={() => {
                            deleteManualEvent(detailModal.manualEventId, {
                              onDeleted: () => closeCalendarDetailModal(),
                            })
                          }}
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          className="secondary-btn install-case-modal-edit-btn"
                          onClick={beginCalendarManualDetailInlineEdit}
                        >
                          수정
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={cancelCalendarManualDetailInlineEdit}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className="secondary-btn install-case-modal-edit-btn"
                          onClick={saveCalendarManualDetailInlineEdit}
                        >
                          저장
                        </button>
                      </>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={closeCalendarDetailModal}
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="install-case-detail-modal-body install-case-detail-modal-body--plain">
              <div className="detail-modal-grid detail-modal-grid--calendar">
              <div className="detail-item">
                <span className="detail-label">D-Day</span>
                <span className="detail-value">
                  {inManualInlineEdit && md ? getManualDetailDraftDday(md) : detailModal.dday || '-'}
                </span>
              </div>
              <div className="detail-item detail-item-full">
                <span className="detail-label">사업명</span>
                {inManualInlineEdit && md ? (
                  <div className="detail-value detail-value--edit-cell">
                    <input
                      type="text"
                      className="detail-inline-field"
                      value={md.projectName}
                      onChange={(e) =>
                        setCalendarManualDetailDraft((prev) =>
                          prev ? { ...prev, projectName: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                ) : (
                  <span className="detail-value">{detailModal.projectName || '-'}</span>
                )}
              </div>
              <div className="detail-item">
                <span className="detail-label">영업담당자</span>
                {inManualInlineEdit && md ? (
                  <div className="detail-value detail-value--edit-cell">
                    <input
                      type="text"
                      className="detail-inline-field"
                      placeholder="예: OOO"
                      value={md.salesOwner}
                      onChange={(e) =>
                        setCalendarManualDetailDraft((prev) =>
                          prev ? { ...prev, salesOwner: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                ) : (
                  <span className="detail-value">{detailModal.salesOwner || '-'}</span>
                )}
              </div>
              <div className="detail-item">
                <span className="detail-label">현장 PM</span>
                {inManualInlineEdit && md ? (
                  <div className="detail-value detail-value--edit-cell">
                    <input
                      type="text"
                      className="detail-inline-field"
                      placeholder="예: OOO"
                      value={md.pm}
                      onChange={(e) =>
                        setCalendarManualDetailDraft((prev) =>
                          prev ? { ...prev, pm: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                ) : (
                  <span className="detail-value">{detailModal.pm || '-'}</span>
                )}
              </div>


              {inManualInlineEdit && md ? (
                <div className="detail-item detail-item-full">
                  <span className="detail-label">일정 기간</span>
                  <div className="detail-value detail-value--edit-cell">
                    <div className="calendar-detail-modal-date-range" role="group" aria-label="일정 기간">
                      <input
                        type="date"
                        className="detail-inline-field calendar-input calendar-input-date"
                        value={md.dateStart}
                        onChange={(e) =>
                          setCalendarManualDetailDraft((prev) =>
                            prev ? { ...prev, dateStart: e.target.value } : prev
                          )
                        }
                      />
                      <span className="calendar-detail-modal-date-sep" aria-hidden>
                        ~
                      </span>
                      <input
                        type="date"
                        className="detail-inline-field calendar-input calendar-input-date"
                        value={md.dateEnd}
                        onChange={(e) =>
                          setCalendarManualDetailDraft((prev) =>
                            prev ? { ...prev, dateEnd: e.target.value } : prev
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {'contractNo' in detailModal && (
                <>
                  <div className="detail-item">
                    <span className="detail-label">사업년도</span>
                    <span className="detail-value">{detailModal.year || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">구분</span>
                    <span className="detail-value">{detailModal.segment || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">참고번호</span>
                    <span className="detail-value">{detailModal.refNo || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약번호</span>
                    <span className="detail-value">{detailModal.contractNo || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">발주처</span>
                    <span className="detail-value">{detailModal.client || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">담당부서</span>
                    <span className="detail-value">{detailModal.department || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약방식</span>
                    <span className="detail-value">{detailModal.contractMethod || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약분류</span>
                    <span className="detail-value">{detailModal.contractType || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약일자</span>
                    <span className="detail-value">{detailModal.contractDate || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">준공일자</span>
                    <span className="detail-value">{detailModal.dueDate || '-'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">계약금액</span>
                    <span className="detail-value">{formatAmountWithWon(detailModal.amount)}</span>
                  </div>
                </>
              )}

              {inManualInlineEdit && md ? (
                <div className="detail-item detail-item-full detail-item-note-row">
                  <span className="detail-label">비고</span>
                  <div className="detail-value detail-value--edit-cell detail-value--textarea-wrap">
                    <textarea
                      className="detail-inline-field detail-inline-textarea"
                      rows={4}
                      value={md.note}
                      onChange={(e) =>
                        setCalendarManualDetailDraft((prev) =>
                          prev ? { ...prev, note: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                </div>
              ) : (
                detailModal.note && (
                  <div className="detail-item detail-item-full detail-item-note-row">
                    <span className="detail-label">비고</span>
                    <span className="detail-value prewrap">{detailModal.note}</span>
                  </div>
                )
              )}
              </div>
            </div>
          </div>
        </div>
          )
        })()}
    </div>
  )
}

export default App
