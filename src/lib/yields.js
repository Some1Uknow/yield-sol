// Fetches live stablecoin yield data from DeFi Llama's Yields API
// Docs: https://yields.llama.fi/docs

const LLAMA_POOLS_URL = 'https://yields.llama.fi/pools'
const REQUEST_TIMEOUT_MS = 10_000

// Protocols we care about — matched against DeFi Llama's `project` field
const TRACKED_PROTOCOLS = ['kamino', 'marginfi', 'drift', 'solend', 'save', 'orca', 'raydium', 'meteora']

// Stablecoins we show
const STABLECOINS = ['USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'USDH', 'UXD']

// Friendly display names
const PROTO_LABELS = {
  kamino: 'Kamino',
  marginfi: 'MarginFi',
  drift: 'Drift',
  solend: 'Solend',
  save: 'Save',
  orca: 'Orca',
  raydium: 'Raydium',
  meteora: 'Meteora',
}

// Icon config per protocol
const PROTO_ICONS = {
  kamino:   { icon: 'KM', bg: '#0d1f2d', color: '#38bdf8' },
  marginfi: { icon: 'MF', bg: '#1a1420', color: '#a78bfa' },
  drift:    { icon: 'DR', bg: '#1a1a0e', color: '#fbbf24' },
  solend:   { icon: 'SL', bg: '#0e1a1a', color: '#2dd4bf' },
  save:     { icon: 'SV', bg: '#0e1a1a', color: '#34d399' },
  orca:     { icon: 'OR', bg: '#0d1a2d', color: '#60a5fa' },
  raydium:  { icon: 'RY', bg: '#1a0d1a', color: '#c084fc' },
  meteora:  { icon: 'MT', bg: '#1a1200', color: '#fb923c' },
}

export async function fetchYields() {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res
  try {
    res = await fetch(LLAMA_POOLS_URL, { signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Timed out fetching DeFi Llama yields')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!res.ok) throw new Error('DeFi Llama API error: ' + res.status)
  const payload = await res.json()
  const data = Array.isArray(payload?.data) ? payload.data : []

  const markets = data
    .filter(pool =>
      pool.chain === 'Solana' &&
      TRACKED_PROTOCOLS.includes(pool.project) &&
      STABLECOINS.some(s => pool.symbol.toUpperCase().includes(s)) &&
      pool.apy != null &&
      pool.tvlUsd > 100_000   // ignore dust pools
    )
    .map(pool => {
      const protoKey = pool.project
      const asset = STABLECOINS.find(s => pool.symbol.toUpperCase().includes(s)) || pool.symbol
      const icons = PROTO_ICONS[protoKey] || { icon: '??', bg: '#1a1a1a', color: '#888' }
      return {
        id: pool.pool,
        proto: PROTO_LABELS[protoKey] || protoKey,
        protoKey,
        asset,
        symbol: pool.symbol,
        apy: pool.apy,
        apyBase: pool.apyBase ?? pool.apy,
        apyReward: pool.apyReward ?? 0,
        tvlUsd: pool.tvlUsd,
        utilization: pool.utilization ?? null,
        ...icons,
      }
    })
    .sort((a, b) => b.apy - a.apy)

  return markets
}

export function formatTvl(usd) {
  if (usd >= 1_000_000_000) return '$' + (usd / 1_000_000_000).toFixed(1) + 'B'
  if (usd >= 1_000_000)     return '$' + (usd / 1_000_000).toFixed(0) + 'M'
  return '$' + (usd / 1_000).toFixed(0) + 'K'
}
