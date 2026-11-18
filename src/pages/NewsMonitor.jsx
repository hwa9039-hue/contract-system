import { IframeOpenInNewWindowButton } from '../IframeOpenInNewWindowButton.jsx'

const NEWS_MONITOR_URL = 'https://news.signtelecom-smartdi.com/'

export default function NewsMonitor() {
  return (
    <section className="stat-card stat-card--iframe-embed">
      <IframeOpenInNewWindowButton href={NEWS_MONITOR_URL} title="각종뉴스" />
      <div className="iframe-embed-viewer">
        <iframe
          title="각종뉴스"
          src={NEWS_MONITOR_URL}
          className="iframe-embed-frame"
          allowFullScreen
        />
      </div>
    </section>
  )
}
