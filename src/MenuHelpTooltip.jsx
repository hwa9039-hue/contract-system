import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRightLeft,
  Briefcase,
  CalendarRange,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Files,
  Filter,
  Layers,
  LayoutGrid,
  List,
  ListChecks,
  ListPlus,
  Mail,
  Megaphone,
  Newspaper,
  Palette,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ToggleRight,
  Trash2,
  Upload,
} from 'lucide-react'

/*
 * 화면 버튼에 아이콘이 있는 항목은 그 아이콘을 그대로 쓴다
 * (선택 삭제 Trash2, 준공임박 AlertTriangle, 복사 Copy, 다운로드 Download, 갤러리/리스트 LayoutGrid,
 *  외부용/내부용 Eye, 게시판 업로드 Upload).
 * 글자만 있는 버튼은 같은 lucide 세트에서 의미가 맞는 아이콘을 쓴다.
 */
const REGISTER = { icon: Plus, title: '등록' }
const EXCEL = { icon: FileSpreadsheet, title: '엑셀 다운로드' }
const SELECT_DELETE = { icon: Trash2, title: '선택 삭제' }
const PREV_NEXT = { icon: ArrowLeftRight, title: '이전 주 / 다음 주' }
const STATUS_FILTER = { icon: Filter, title: '진행 상태 필터링' }
const MOVE_TO_SALES = { icon: ArrowRightLeft, title: '영업관리대장으로 이동' }

/** 메뉴 키 → 도움말 항목 { icon, title, text } (문구는 화면에 그대로 표시) */
export const MENU_HELP_CONTENT = Object.freeze({
  dashboard: [
    {
      icon: ClipboardList,
      title: '오늘 업무 브리핑',
      text: '주요 확인사항, 외부일정, 다가오는 준공 일정을 한눈에 확인합니다.',
    },
    {
      icon: Briefcase,
      title: '영업관리 요약',
      text: '영업관리대장, 건축정보, 사업공유의 전주/금주 등록 건수 비교 및 최신 내역을 보여줍니다.',
    },
    {
      icon: FileText,
      title: '문서관리 요약',
      text: '견적·설계 발송 및 문서수발신 대장의 전주/금주 발생 건수와 최신 내역을 보여줍니다.',
    },
    {
      icon: PieChart,
      title: '계약현황 통계',
      text: '디스플레이, BIT 등 사업 분야별 올해 누적 계약 건수, 금액, 점유 비율을 차트로 확인합니다.',
    },
  ],
  workReports: [
    { ...PREV_NEXT, text: '화살표를 눌러 지난주 또는 다음 주의 업무보고서로 빠르게 이동합니다.' },
    {
      icon: Download,
      title: 'PDF 다운로드',
      text: '현재 화면에 보이는 주간업무보고서를 결재/공유용 PDF 문서로 추출합니다.',
    },
    {
      icon: Search,
      title: '검색창',
      text: '입력란에 특정 내용이나 담당자 이름을 검색하여 이전 기록을 빠르게 찾습니다.',
    },
    {
      icon: List,
      title: '주차보기',
      text: '주간 달력 형태의 입력 화면에서, 항목별(구분) 과거 기록을 한눈에 모아보는 리스트 뷰로 전환합니다.',
    },
  ],
  meetingMinutes: [
    { ...PREV_NEXT, text: '화살표를 눌러 과거나 미래 주차의 회의록으로 이동합니다.' },
    {
      icon: ListPlus,
      title: '항목 추가 / 삭제',
      text: '화면 하단의 항목 추가를 눌러 새 회의 안건을 줄 단위로 추가하고, 우측 휴지통 아이콘으로 삭제합니다.',
    },
    {
      icon: Download,
      title: 'PDF 다운로드',
      text: '현재 작성된 회의록 전체 내용을 공유/보고용 PDF 문서로 추출합니다.',
    },
    {
      icon: Search,
      title: '검색창',
      text: '특정 회의 안건 내용이나 담당자 이름을 검색하여 이전 회의 기록을 빠르게 찾습니다.',
    },
    {
      icon: List,
      title: '주차보기',
      text: '과거부터 작성된 모든 회의 안건을 한 줄짜리 누적 리스트 형태로 모아봅니다.',
    },
  ],
  calendar: [
    {
      ...REGISTER,
      text: '계약현황의 일정이 자동으로 연동되며, 새로운 일정이나 이벤트를 수동으로 직접 등록할 수도 있습니다.',
    },
    {
      icon: Palette,
      title: '범례 색상',
      text: '계약(노랑), 준공/준공진행(파랑), 다가오는 준공(빨강), 준공지연(보라), 기타(초록) 등 색상 라벨을 통해 일정 성격을 직관적으로 구분합니다.',
    },
    {
      icon: ArrowLeftRight,
      title: '이동',
      text: '상단의 화살표를 눌러 과거나 미래의 월별 일정표로 이동합니다.',
    },
  ],
  contracts: [
    {
      ...REGISTER,
      text: "새로운 계약건을 등록합니다. (계약분류를 '전광판/VMS'로 지정 시 설치사례 메뉴로 자동 연동됩니다.)",
    },
    { ...SELECT_DELETE, text: '좌측 체크박스로 선택한 여러 개의 계약건을 한 번에 삭제합니다.' },
    { ...EXCEL, text: '리스트에 조회된 전체 계약 데이터를 숫자로 자동 변환하여 엑셀로 추출합니다.' },
    {
      icon: AlertTriangle,
      title: '준공임박',
      text: '상단에 표시된 경고 아이콘이나 버튼을 눌러, 지연되거나 확인이 시급한 공정상태의 건들만 빠르게 필터링합니다.',
    },
    {
      icon: Copy,
      title: '복사 아이콘',
      text: '리스트 좌측의 복사 버튼을 눌러, 기존 계약 내용을 그대로 가져와 새 계약건을 빠르게 작성합니다.',
    },
  ],
  bitHistory: [
    { ...REGISTER, text: '계약현황 자동 연동 외에, 필요한 BIT 이력을 수동으로 신규 등록합니다.' },
    {
      icon: ListPlus,
      title: '줄 추가',
      text: '동일한 계약 내에서 사이즈나 설치 형태가 달라 나누어 입력해야 할 때, 체크 후 하위 행(줄)을 추가합니다.',
    },
    {
      ...SELECT_DELETE,
      text: '체크박스로 선택한 이력 데이터를 일괄 삭제합니다. (※ 계약현황 원본이 지워지면 연동된 줄도 자동으로 사라집니다.)',
    },
    {
      ...EXCEL,
      text: "이력 데이터를 엑셀로 추출합니다. ('줄 추가'된 동일 계약건은 엑셀 출력 시 계약금액 등의 항목이 한 셀로 자동 세로 병합됩니다.)",
    },
  ],
  salesIntegrated: [
    {
      icon: Layers,
      title: '출처(통합) 안내',
      text: '이 메뉴는 직접 등록하는 화면이 아닙니다. 하위 3개 메뉴(영업관리대장, 건축정보, 사업공유)에 등록된 모든 데이터를 한곳으로 자동 취합하여 보여주는 종합 현황판입니다.',
    },
    {
      ...STATUS_FILTER,
      text: "상단의 '초기접촉', '견적단계', '사업공고' 등 상태 버튼을 눌러, 전체 통합 데이터 중 원하는 진행 단계의 건들만 빠르게 모아봅니다.",
    },
  ],
  sales: [
    {
      ...REGISTER,
      text: "새로운 영업 진행 내역을 수동으로 등록합니다. (※ 여기서 등록된 데이터는 '영업관리(통합)' 메뉴표에 자동 취합됩니다.)",
    },
    {
      ...STATUS_FILTER,
      text: "상단의 '초기접촉', '견적단계', '사업공고' 등 상태 버튼을 눌러, 원하는 진행 단계의 건들만 빠르게 모아봅니다.",
    },
    { ...EXCEL, text: '리스트에 조회된 영업관리대장 데이터를 엑셀 파일로 추출합니다.' },
  ],
  discovery: [
    {
      ...REGISTER,
      text: "신규 건축 및 건설 관련 사업 정보를 등록합니다. (※ 등록 시 '영업관리(통합)' 메뉴에 자동 취합됩니다.)",
    },
    {
      ...MOVE_TO_SALES,
      text: '단순 정보였던 건축 건이 실제 당사의 영업 타겟으로 발전했을 때, 체크박스 선택 후 이 버튼을 눌러 영업관리대장으로 데이터를 간편하게 이관(이동)시킵니다.',
    },
    {
      ...STATUS_FILTER,
      text: "상단의 '초기접촉', '견적단계', '사업공고' 등 상태 버튼을 눌러, 원하는 진행 단계의 건들만 빠르게 모아봅니다.",
    },
    { ...EXCEL, text: '건축 사업 정보 리스트를 엑셀 파일로 추출합니다.' },
  ],
  excluded: [
    {
      ...REGISTER,
      text: "사전규격, 발주계획 등 타 부서 담당자와 공유해야 할 사업 정보를 등록합니다. (※ 등록 시 '영업관리(통합)' 메뉴에 자동 취합됩니다.)",
    },
    {
      ...STATUS_FILTER,
      text: '상단의 본공고, 사전규격, 발주계획 버튼을 눌러 특정 성격의 사업공유 건만 모아봅니다.',
    },
    {
      ...MOVE_TO_SALES,
      text: '공유된 사업 정보가 실제 영업 타겟이 되었을 때, 선택 후 이 버튼을 눌러 영업관리대장으로 이관합니다.',
    },
    { ...EXCEL, text: '사업공유 리스트를 엑셀 파일로 추출합니다.' },
  ],
  salesContacts: [
    { ...REGISTER, text: '새로운 발주처나 유관 기관 관계자의 연락처 정보를 수동으로 등록합니다.' },
    { ...EXCEL, text: '조회된 전체 연락처 리스트를 엑셀 파일로 추출합니다.' },
    {
      icon: ToggleRight,
      title: '분류 (활성 / 비활성화)',
      text: '분류 상태를 활성 시 모든 직원에게 공유, 비활성 시 해당 본인과 부서장까지만 공유됩니다.',
    },
  ],
  paymentReport: [
    {
      icon: CalendarRange,
      title: '월 / 결제일 필터링',
      text: "상단의 년/월 화살표와 '10일 결제', '31일 결제' 버튼을 눌러 해당 기간의 기성(결제) 예정 내역만 모아봅니다.",
    },
    {
      icon: Files,
      title: '병합 PDF 다운로드',
      text: '리스트에서 체크한 여러 건의 결제보고서를 하나의 PDF 파일로 합쳐서 일괄 다운로드합니다.',
    },
    {
      icon: FileText,
      title: '결제진행 세부사항',
      text: '위 리스트에서 특정 건을 클릭하면 하단에 열리는 영역으로, 해당 건의 세부 결제 내역과 첨부파일을 확인하고 개별 PDF를 다운로드할 수 있습니다.',
    },
  ],
  quoteDesignDocs: [
    {
      icon: Mail,
      title: '이메일 자동 연동 안내',
      text: "회사 메일 송부 시 signdisign@gmail.com 주소를 '숨은참조'에 추가하면, 이곳 리스트에 발신/수신처, 메일 제목, 첨부파일 내역이 자동으로 취합됩니다.",
    },
    { ...EXCEL, text: '메일 연동으로 취합된 전체 반출 내역 리스트를 엑셀 파일로 추출합니다.' },
  ],
  documents: [
    { ...REGISTER, text: '공문 등 외부로 발송하거나 접수한 공식 문서의 수발신 이력을 기록합니다.' },
    { ...SELECT_DELETE, text: '체크박스로 선택한 잘못 등록된 수발신 이력을 일괄 삭제합니다.' },
    { ...EXCEL, text: '작성된 문서수발신대장 리스트를 엑셀 파일로 추출합니다.' },
  ],
  installCases: [
    {
      icon: RefreshCw,
      title: '자동 연동 및 등록',
      text: "'계약현황'에서 계약분류를 '전광판' 또는 'VMS'로 지정하면 기본 데이터가 이곳으로 자동 연동됩니다. 상단의 등록 버튼을 눌러 수동으로 추가할 수도 있습니다.",
    },
    {
      icon: Eye,
      title: '외부용 / 내부용 필터',
      text: '외부 반출용(파란색 테두리)과 사내용(회색 테두리) 데이터를 원클릭으로 빠르게 구분하여 조회합니다.',
    },
    {
      icon: LayoutGrid,
      title: '뷰 전환 (갤러리/리스트)',
      text: "썸네일 사진 중심의 '갤러리 뷰'와 13개의 상세 제원(사이즈, 피치 등)을 한눈에 비교하는 '리스트 뷰'로 화면을 전환합니다.",
    },
    {
      icon: Copy,
      title: '외부 공유 링크 복사',
      text: '현재 조회 중인 설치사례 화면을 외부 고객(발주처 등)에게 모바일/PC로 바로 보여줄 수 있는 전용 URL 주소를 복사합니다.',
    },
    {
      icon: Download,
      title: 'PDF / 엑셀 다운로드',
      text: '리스트 뷰 상태에서 다운로드 시, 13개 상세 제원과 함께 실제 썸네일 사진이 표(셀) 안에 그대로 삽입된 형태로 엑셀 및 PDF 파일이 추출됩니다.',
    },
  ],
  mainBudget: [
    {
      icon: RefreshCw,
      title: '데이터 자동 분석',
      text: '관리자 화면에서 예산서 PDF를 폴더에 넣고 분석을 시작하면, 시스템이 1시간마다 폴더를 확인해 자동으로 분석합니다. (파일명 오타 시 인식 불가, 기 분석 파일은 건너뜀)',
    },
    {
      icon: ListChecks,
      title: '진행 상태 확인',
      text: "상단의 현황판(1번)을 통해 각 지자체별 '확인완료', '업로드 안됨', '분석대기' 등 현재 상태를 확인할 수 있습니다.",
    },
    {
      icon: Eye,
      title: '조회 전용 안내',
      text: '본 화면은 데이터 보호를 위한 뷰어(읽기 전용)입니다. 상단의 현황(1번) 및 설정(2번) 영역은 상태 확인만 가능하며, 분석 시작 및 데이터 수정은 관리자 화면에서 진행합니다.',
    },
    {
      icon: FileSpreadsheet,
      title: '결과 다운로드',
      text: '하단(3번) 결과 영역에서 전체 예산 내역을 조회할 수 있으며, [엑셀 다운로드] 버튼을 눌러 리스트를 파일로 추출할 수 있습니다.',
    },
  ],
  naraMarket: [
    {
      icon: Megaphone,
      title: '공고 모니터링',
      text: '나라장터 입찰/사전규격 공고를 자동으로 수집하여 보여줍니다. 상단의 상태별 건수(검토대상, 3일 내 마감 등)를 클릭해 필터링합니다.',
    },
    {
      icon: ListChecks,
      title: '검토 상태 관리',
      text: '우측 상세 패널에서 해당 공고에 대한 나의 검토 상태(미검토, 검토 중, 이슈, 완료)를 지정하고 메모를 남길 수 있습니다.',
    },
    {
      icon: ExternalLink,
      title: '원문 읽기 / 보고서 복사',
      text: '나라장터 원문 읽기로 실제 입찰 사이트로 바로 이동하거나, 보고서 복사를 눌러 공고 요약 내용을 복사해 메신저로 공유합니다.',
    },
  ],
  newsMonitor: [
    {
      icon: Newspaper,
      title: '자동 수집 현황',
      text: '특정 모니터링 키워드(전광판, VMS 등)가 포함된 전국 언론사의 최신 뉴스를 24시간 자동으로 수집하여 보여줍니다.',
    },
    {
      icon: ExternalLink,
      title: '기사 원문 보기',
      text: '리스트 우측 끝의 원문보기 버튼을 누르면 해당 뉴스가 발행된 실제 언론사 페이지로 이동하여 상세 내용을 확인합니다.',
    },
  ],
  materialsBoard: [
    {
      icon: Plus,
      title: '폴더 관리',
      text: '좌측 메뉴 하단의 + 새 폴더를 눌러 사내 양식, 제안서, 공지사항 등 자료에 맞게 폴더를 생성하고 분류할 수 있습니다.',
    },
    {
      icon: Upload,
      title: '업로드 및 다운로드',
      text: '우측 상단의 업로드 버튼으로 파일을 업로드하고, 리스트 우측의 아이콘을 눌러 언제든 다운로드하거나 삭제합니다.',
    },
  ],
})

/**
 * 메뉴 타이틀 옆 (?) 뱃지. 마우스를 올리거나 키보드로 포커스하면 도움말을 보여 주고,
 * 터치 환경을 위해 클릭하면 고정으로 열리며 바깥 클릭·ESC 로 닫힌다.
 * 도움말이 없는 메뉴에서는 아무것도 그리지 않는다.
 */
export function MenuHelpBadge({ menuKey, title = '' }) {
  const items = MENU_HELP_CONTENT[menuKey]
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const rootRef = useRef(null)
  const tooltipId = useId()
  const open = hovered || pinned

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      setPinned(false)
      setHovered(false)
    }
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setPinned(false)
      setHovered(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!Array.isArray(items) || items.length === 0) return null

  return (
    <span
      ref={rootRef}
      className="menu-help-badge relative inline-flex flex-shrink-0 items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`w-5 h-5 flex items-center justify-center rounded-full shadow-sm transition-all duration-300 ml-2 text-sm font-bold leading-none hover:animate-none hover:scale-110 hover:bg-blue-600 hover:text-white motion-reduce:animate-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
          open ? 'animate-none bg-blue-600 text-white' : 'animate-bounce bg-blue-100 text-blue-600'
        }`}
        aria-label={`${title || '메뉴'} 도움말`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => setPinned((prev) => !prev)}
      >
        ?
      </button>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="menu-help-tooltip absolute left-0 top-full z-[200] mt-2 w-[min(480px,calc(100vw-48px))] max-h-[min(70vh,560px)] overflow-y-auto rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-lg"
        >
          {title ? <p className="m-0 mb-3 text-[13px] font-bold text-gray-900">{title} 도움말</p> : null}
          <ul className="m-0 list-none space-y-3 p-0">
            {items.map(({ icon: Icon, title: itemTitle, text }) => (
              <li key={itemTitle} className="flex items-start">
                <span className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-600 rounded-md shrink-0 mr-3 border border-gray-100">
                  <Icon className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-gray-600 break-keep">
                  <p className="m-0 font-bold text-gray-900">{itemTitle}</p>
                  <p className="m-0 font-normal">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  )
}
