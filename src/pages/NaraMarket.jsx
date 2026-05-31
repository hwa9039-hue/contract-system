const NARA_MARKET_URL = 'https://tkdwns5119-del.github.io/nara-scout/di'

export default function NaraMarket() {
  return (
    <iframe
      title="나라장터"
      src={NARA_MARKET_URL}
      className="monitoring-embed-frame w-full min-h-[85vh] border-none"
      allowFullScreen
    />
  )
}
