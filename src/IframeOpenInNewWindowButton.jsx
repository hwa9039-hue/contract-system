import { ExternalLink } from 'lucide-react'

/** iframe 임베드 화면(모바일) 우측 상단 — 같은 주소를 새 창(전체 화면)으로 연다 */
export function IframeOpenInNewWindowButton({ href, title }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="iframe-embed-open-btn md:hidden"
      title="새 창 열기"
      aria-label={`${title} 새 창으로 열기`}
    >
      <ExternalLink size={14} strokeWidth={2.25} aria-hidden="true" />
      새 창
    </a>
  )
}
