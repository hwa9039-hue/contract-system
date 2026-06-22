const NARA_MARKET_URL = 'https://tkdwns5119-del.github.io/nara-scout'

export default function NaraMarket() {
  return (
    <section className="stat-card stat-card--iframe-embed">
      <div className="iframe-embed-viewer">
        <iframe
          title="나라장터"
          src={NARA_MARKET_URL}
          className="iframe-embed-frame"
          allowFullScreen
        />
      </div>
    </section>
  )
}
