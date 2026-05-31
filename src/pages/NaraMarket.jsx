const NARA_MARKET_URL = 'https://tkdwns5119-del.github.io/nara-scout/di'

export default function NaraMarket() {
  return (
    <div className="monitoring-embed-shell monitoring-embed-shell--full-bleed">
      <iframe
        title="나라장터"
        src={NARA_MARKET_URL}
        className="monitoring-embed-frame w-full h-[calc(100vh-80px)] block border-none"
        allowFullScreen
      />
    </div>
  )
}
