import { useEffect, useMemo, useState } from 'react'
import { MarginfiClient } from '@mrgnlabs/marginfi-client-v2'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { PublicKey } from '@solana/web3.js'
import { DepositModal } from './components/DepositModal'
import {
  MARGINFI_CONFIG,
  NETWORK_LABEL,
  PROTOCOL_META,
  REFRESH_INTERVAL_MS,
  TOKEN_PROGRAM_IDS,
  createReadOnlyWallet,
  explorerTxUrl,
  formatCurrency,
  formatPercent,
  formatTvl,
  getLatestSignature,
  installMarginfiRpcBatchFallback,
  isSupportedAsset,
  normalizeError,
  shortenAddress,
} from './lib/marginfi'
import './App.css'

function apyClass(value) {
  if (value >= 8) return 'apy-high'
  if (value >= 5) return 'apy-mid'
  return 'apy-low'
}

function assetIconLabel(asset) {
  const symbol = String(asset || '').toUpperCase()

  if (symbol === 'USDC') return 'UC'
  if (symbol === 'USDT') return 'UT'
  if (symbol === 'PYUSD') return 'PY'
  if (symbol === 'USDS') return 'DS'
  return symbol.slice(0, 2) || '$'
}

const TOKEN_ICON_MAP = {
  USDC: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Circle_USDC_Logo.svg',
  USDT: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/USDT_Logo.png',
  PYUSD: 'https://cryptologos.cc/logos/paypal-usd-pyusd-logo.svg',
  USDS: 'https://images.cryptorank.io/coins/usds1724768606452.png',
}

function buildMarketRows(client) {
  return Array.from(client.banks.values())
    .filter((bank) => isSupportedAsset(bank.tokenSymbol))
    .map((bank) => {
      const oraclePrice = client.getOraclePriceByBank(bank.address)

      if (!oraclePrice) return null

      const { lendingRate } = bank.computeInterestRates()

      return {
        id: bank.address.toBase58(),
        bankAddress: bank.address.toBase58(),
        mintAddress: bank.mint.toBase58(),
        decimals: bank.mintDecimals,
        proto: PROTOCOL_META.proto,
        protoKey: PROTOCOL_META.protoKey,
        icon: assetIconLabel(bank.tokenSymbol),
        bg: PROTOCOL_META.bg,
        color: PROTOCOL_META.color,
        asset: bank.tokenSymbol || shortenAddress(bank.mint),
        apy: lendingRate.toNumber() * 100,
        apyBase: lendingRate.toNumber() * 100,
        tvlUsd: bank.computeTvl(oraclePrice).toNumber(),
        utilization: bank.computeUtilizationRate().toNumber() * 100,
      }
    })
    .filter(Boolean)
}

function buildPositionRows(client, accounts) {
  return accounts
    .flatMap((account) =>
      account.activeBalances
        .map((balance) => {
          const bank = client.getBankByPk(balance.bankPk)

          if (!bank || !isSupportedAsset(bank.tokenSymbol)) return null

          const oraclePrice = client.getOraclePriceByBank(bank.address)

          if (!oraclePrice) return null

          const quantity = balance.computeQuantityUi(bank)
          const usdValue = balance.computeUsdValue(bank, oraclePrice)
          const depositAmount = quantity.assets.toNumber()

          if (depositAmount <= 0) return null

          const { lendingRate } = bank.computeInterestRates()

          return {
            id: `${account.address.toBase58()}:${bank.address.toBase58()}`,
            accountAddress: account.address.toBase58(),
            accountLabel: shortenAddress(account.address),
            bankAddress: bank.address.toBase58(),
            mintAddress: bank.mint.toBase58(),
            decimals: bank.mintDecimals,
            proto: PROTOCOL_META.proto,
            protoKey: PROTOCOL_META.protoKey,
            icon: assetIconLabel(bank.tokenSymbol),
            bg: PROTOCOL_META.bg,
            color: PROTOCOL_META.color,
            asset: bank.tokenSymbol || shortenAddress(bank.mint),
            apy: lendingRate.toNumber() * 100,
            apyBase: lendingRate.toNumber() * 100,
            amount: depositAmount,
            amountDisplay: depositAmount.toLocaleString(undefined, { maximumFractionDigits: 4 }),
            amountUsd: usdValue.assets.toNumber(),
            maxWithdraw: account.computeMaxWithdrawForBank(bank.address).toNumber(),
          }
        })
        .filter(Boolean),
    )
    .sort((left, right) => right.amountUsd - left.amountUsd)
}

function toMarginfiWallet(wallet) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Connect a wallet that supports Solana transaction signing')
  }

  return {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions:
      wallet.signAllTransactions ||
      (async (transactions) => Promise.all(transactions.map((transaction) => wallet.signTransaction(transaction)))),
    signMessage: wallet.signMessage || undefined,
  }
}

async function fetchPortfolio(connection, wallet) {
  installMarginfiRpcBatchFallback(connection)

  const client = await MarginfiClient.fetch(
    MARGINFI_CONFIG,
    toMarginfiWallet(wallet),
    connection,
  )
  const accounts = await client.getMarginfiAccountsForAuthority(wallet.publicKey)
  const positions = buildPositionRows(client, accounts)

  return { accounts, client, positions }
}

export default function App() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { setVisible } = useWalletModal()
  const networkCopy = NETWORK_LABEL === 'devnet' ? 'Solana devnet' : 'Solana mainnet'

  const [marketState, setMarketState] = useState({
    error: '',
    lastUpdated: null,
    loading: true,
    markets: [],
  })
  const [walletBalances, setWalletBalances] = useState({ sol: 0, tokens: {} })
  const [portfolioState, setPortfolioState] = useState({
    accounts: [],
    client: null,
    error: '',
    loading: false,
    positions: [],
  })
  const [filter, setFilter] = useState('All')
  const [sortBy, setSortBy] = useState('apy')
  const [selectedAction, setSelectedAction] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [lastSignature, setLastSignature] = useState('')
  const [lastActionLabel, setLastActionLabel] = useState('')
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [activeTab, setActiveTab] = useState('banks')

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setRefreshIndex((value) => value + 1)
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadMarkets() {
      setMarketState((current) => ({ ...current, error: '', loading: true }))

      try {
        installMarginfiRpcBatchFallback(connection)

        const client = await MarginfiClient.fetch(
          MARGINFI_CONFIG,
          createReadOnlyWallet(),
          connection,
          { readOnly: true, preloadedBankAddresses: [] },
        )

        const markets = buildMarketRows(client)

        if (cancelled) return

        setMarketState({
          error: '',
          lastUpdated: new Date(),
          loading: false,
          markets,
        })
      } catch (error) {
        if (cancelled) return

        setMarketState((current) => ({
          ...current,
          error: normalizeError(error),
          loading: false,
        }))
      }
    }

    loadMarkets()

    return () => {
      cancelled = true
    }
  }, [connection, refreshIndex])

  useEffect(() => {
    let cancelled = false

    async function loadWalletBalances() {
      if (!wallet.publicKey) {
        setWalletBalances({ sol: 0, tokens: {} })
        return
      }

      try {
        const [solLamports, tokenResponses] = await Promise.all([
          connection.getBalance(wallet.publicKey, 'confirmed'),
          Promise.all(
            TOKEN_PROGRAM_IDS.map((programId) =>
              connection.getParsedTokenAccountsByOwner(wallet.publicKey, { programId }, 'confirmed'),
            ),
          ),
        ])

        if (cancelled) return

        const tokens = {}

        tokenResponses.forEach((response) => {
          response.value.forEach(({ account }) => {
            const info = account.data.parsed?.info
            const mintAddress = info?.mint
            const uiAmount = Number(info?.tokenAmount?.uiAmount || 0)

            if (!mintAddress || uiAmount <= 0) return

            tokens[mintAddress] = Number(tokens[mintAddress] || 0) + uiAmount
          })
        })

        setWalletBalances({
          sol: solLamports / 1_000_000_000,
          tokens,
        })
      } catch {
        if (!cancelled) {
          setWalletBalances((current) => ({ ...current, tokens: {} }))
        }
      }
    }

    loadWalletBalances()

    return () => {
      cancelled = true
    }
  }, [connection, refreshIndex, wallet.publicKey])

  useEffect(() => {
    let cancelled = false

    async function loadPortfolio() {
      if (!wallet.connected || !wallet.publicKey) {
        setPortfolioState({
          accounts: [],
          client: null,
          error: '',
          loading: false,
          positions: [],
        })
        return
      }

      if (activeTab !== 'deposits') {
        setPortfolioState({
          accounts: [],
          client: null,
          error: '',
          loading: false,
          positions: [],
        })
        return
      }

      setPortfolioState((current) => ({ ...current, error: '', loading: true }))

      try {
        const nextPortfolio = await fetchPortfolio(connection, wallet)

        if (cancelled) return

        setPortfolioState({
          accounts: nextPortfolio.accounts,
          client: nextPortfolio.client,
          error: '',
          loading: false,
          positions: nextPortfolio.positions,
        })
      } catch (error) {
        if (cancelled) return

        setPortfolioState({
          accounts: [],
          client: null,
          error: normalizeError(error),
          loading: false,
          positions: [],
        })
      }
    }

    loadPortfolio()

    return () => {
      cancelled = true
    }
  }, [
    connection,
    activeTab,
    refreshIndex,
    wallet,
    wallet.connected,
    wallet.publicKey,
    wallet.signAllTransactions,
    wallet.signTransaction,
  ])

  const filters = useMemo(
    () => ['All', ...new Set(marketState.markets.map((entry) => entry.asset))],
    [marketState.markets],
  )

  const filtered = useMemo(() => {
    const scopedMarkets =
      filter === 'All'
        ? marketState.markets
        : marketState.markets.filter((entry) => entry.asset === filter)

    return [...scopedMarkets].sort((left, right) => {
      if (sortBy === 'tvl') return right.tvlUsd - left.tvlUsd
      return right.apy - left.apy
    })
  }, [filter, marketState.markets, sortBy])

  const bestMarket = filtered[0]
  const totalTvl = useMemo(
    () => marketState.markets.reduce((sum, entry) => sum + entry.tvlUsd, 0),
    [marketState.markets],
  )
  const totalDeposited = useMemo(
    () => portfolioState.positions.reduce((sum, entry) => sum + entry.amountUsd, 0),
    [portfolioState.positions],
  )
  const totalEarnings = useMemo(
    () => portfolioState.positions.reduce((sum, entry) => sum + (entry.amountUsd * entry.apy / 100 / 365), 0),
    [portfolioState.positions],
  )
  const stableBalance = useMemo(
    () =>
      marketState.markets.reduce(
        (sum, entry) => sum + Number(walletBalances.tokens[entry.mintAddress] || 0),
        0,
      ),
    [marketState.markets, walletBalances.tokens],
  )

  const activeMarket = selectedAction?.market || null
  const currentPosition = useMemo(() => {
    if (!activeMarket) return 0

    if (selectedAction?.type === 'withdraw') {
      return Number(selectedAction.position?.amount || 0)
    }

    return portfolioState.positions
      .filter((entry) => entry.bankAddress === activeMarket.bankAddress)
      .reduce((sum, entry) => sum + entry.amount, 0)
  }, [activeMarket, portfolioState.positions, selectedAction])
  const walletBalance = activeMarket ? Number(walletBalances.tokens[activeMarket.mintAddress] || 0) : 0
  const maxAmount =
    selectedAction?.type === 'withdraw'
      ? Number(selectedAction.position?.maxWithdraw || 0)
      : walletBalance

  function handleRefresh() {
    setRefreshIndex((value) => value + 1)
  }

  function openDeposit(marketEntry) {
    if (!wallet.connected) {
      setVisible(true)
      return
    }

    setActionError('')
    setSelectedAction({ market: marketEntry, type: 'deposit' })
  }

  function openWithdraw(position) {
    if (!wallet.connected) {
      setVisible(true)
      return
    }

    setActionError('')
    setSelectedAction({
      accountAddress: position.accountAddress,
      market: position,
      position,
      type: 'withdraw',
    })
  }

  async function handleProtocolAction(amountText) {
    if (!selectedAction) return

    try {
      setActionError('')
      setActionPending(true)

      const amount = Number(amountText)

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Enter an amount greater than zero')
      }

      const bankAddress = new PublicKey(selectedAction.market.bankAddress)
      let client = portfolioState.client
      let accounts = portfolioState.accounts
      let signature = ''

      if (!client) {
        const nextPortfolio = await fetchPortfolio(connection, wallet)
        client = nextPortfolio.client
        accounts = nextPortfolio.accounts

        setPortfolioState({
          accounts: nextPortfolio.accounts,
          client: nextPortfolio.client,
          error: '',
          loading: false,
          positions: nextPortfolio.positions,
        })
      }

      if (selectedAction.type === 'deposit') {
        let account =
          accounts.find((entry) =>
            entry.activeBalances.some((balance) => balance.bankPk.toBase58() === selectedAction.market.bankAddress),
          ) || accounts[0]

        if (!account) {
          account = await client.createMarginfiAccount()
        }

        signature = getLatestSignature(await account.deposit(amount, bankAddress))
        setLastActionLabel('Deposit confirmed on marginfi')
      } else {
        const account = accounts.find(
          (entry) => entry.address.toBase58() === selectedAction.accountAddress,
        )

        if (!account) {
          throw new Error('Marginfi account not found for this position')
        }

        signature = getLatestSignature(await account.withdraw(amount, bankAddress, false))
        setLastActionLabel('Withdrawal confirmed on marginfi')
      }

      if (!signature) {
        throw new Error('Transaction signature missing from marginfi response')
      }

      setLastSignature(signature)
      setSelectedAction(null)
      handleRefresh()
    } catch (error) {
      setActionError(normalizeError(error))
    } finally {
      setActionPending(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="logo"><span className="logo-accent">yield</span>.sol</div>
          <div className="header-sub">marginfi stablecoin deposits on {networkCopy}</div>
        </div>
        <div className="topbar-right">
          {marketState.lastUpdated && (
            <button className="refresh-btn" onClick={handleRefresh}>
              ↻ {marketState.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
          )}
          {wallet.connected ? (
            <div className="wallet-connected">
              <div className="wallet-stack">
                <span className="wallet-addr">{shortenAddress(wallet.publicKey)}</span>
                <span className="wallet-meta">
                  {wallet.wallet?.adapter?.name || 'Wallet'} · {walletBalances.sol.toFixed(3)} SOL
                </span>
              </div>
              <button className="wallet-btn disconnect" onClick={() => wallet.disconnect()}>Disconnect</button>
            </div>
          ) : (
            <button className="wallet-btn" onClick={() => setVisible(true)}>
              {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="app-body">
        {lastSignature && (
          <section className="tx-banner">
            <span>{lastActionLabel}</span>
            <a href={explorerTxUrl(lastSignature)} target="_blank" rel="noreferrer">
              {shortenAddress(lastSignature)}
            </a>
          </section>
        )}

        <div className="summary-strip">
          <div className="stat">
            <div className="stat-label">Best APY</div>
            <div className="stat-value green">{bestMarket ? formatPercent(bestMarket.apy) : '—'}</div>
            <div className="stat-sub">{bestMarket ? `${bestMarket.proto} · ${bestMarket.asset}` : 'No bank loaded'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">marginfi TVL</div>
            <div className="stat-value">{totalTvl > 0 ? formatTvl(totalTvl) : '—'}</div>
            <div className="stat-sub">{marketState.markets.length} stablecoin banks live</div>
          </div>
          <div className="stat">
            <div className="stat-label">{activeTab === 'deposits' ? 'Wallet + Deposits' : 'Wallet'}</div>
            <div className="stat-value green">
              {wallet.connected ? formatCurrency(stableBalance + (activeTab === 'deposits' ? totalDeposited : 0)) : '—'}
            </div>
            <div className="stat-sub">
              {!wallet.connected
                ? 'Connect a wallet to load balances'
                : activeTab === 'deposits'
                  ? `${formatCurrency(totalDeposited)} deposited · ${formatCurrency(totalEarnings, 4)} est. daily`
                  : 'Open Deposits to reconcile marginfi positions'}
            </div>
          </div>
        </div>

        <div className="tab-switcher" role="tablist" aria-label="marginfi views">
          <button
            className={'tab-btn' + (activeTab === 'banks' ? ' active' : '')}
            onClick={() => setActiveTab('banks')}
            role="tab"
            aria-selected={activeTab === 'banks'}
          >
            Banks
          </button>
          <button
            className={'tab-btn' + (activeTab === 'deposits' ? ' active' : '')}
            onClick={() => setActiveTab('deposits')}
            role="tab"
            aria-selected={activeTab === 'deposits'}
          >
            Deposits
          </button>
        </div>

        {activeTab === 'banks' && (
          <section className="section">
        <div className="section-header">
          <div>
            <div className="section-title">Stablecoin Banks</div>
            <div className="section-caption">Production group only. Live APY and TVL from marginfi bank state.</div>
          </div>
          <div className="controls">
            <div className="filters">
              {filters.map((entry) => (
                <button
                  key={entry}
                  className={'filter-btn' + (filter === entry ? ' active' : '')}
                  onClick={() => setFilter(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
            <select className="sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="apy">Sort: APY</option>
              <option value="tvl">Sort: TVL</option>
            </select>
          </div>
        </div>

        {marketState.loading && <div className="loading-state"><div className="spinner" /><span>Fetching marginfi bank data from Solana RPC…</span></div>}
        {marketState.error && <div className="error-state">Failed to load marginfi banks: {marketState.error} <button onClick={handleRefresh}>Retry</button></div>}
        {!marketState.loading && !marketState.error && filtered.length === 0 && <div className="empty-state">No supported USD stablecoin banks were returned by the selected RPC.</div>}

        {!marketState.loading && filtered.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th className="right">Wallet</th>
                  <th className="right">Supply APY</th>
                  <th className="right">TVL</th>
                  <th className="right hide-sm">Utilization</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} onClick={() => openDeposit(entry)}>
                    <td>
                      <div className="proto-cell">
                        <div className="proto-icon" style={{ background: entry.bg, color: entry.color }}>
                          {TOKEN_ICON_MAP[entry.asset] ? (
                            <img className="proto-icon-image" src={TOKEN_ICON_MAP[entry.asset]} alt="" />
                          ) : (
                            <span>{entry.icon}</span>
                          )}
                        </div>
                        <div className="proto-copy">
                          <div className="proto-name">{entry.asset}</div>
                        </div>
                      </div>
                    </td>
                    <td className="right tvl-cell">
                      {wallet.connected
                        ? `${Number(walletBalances.tokens[entry.mintAddress] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${entry.asset}`
                        : '—'}
                    </td>
                    <td className="right">
                      <span className={'apy ' + apyClass(entry.apy)}>{formatPercent(entry.apy)}</span>
                    </td>
                    <td className="right tvl-cell">{formatTvl(entry.tvlUsd)}</td>
                    <td className="right hide-sm">
                      <div className="util-wrap">
                        <span className="util-pct">{formatPercent(entry.utilization, 0)}</span>
                        <div className="util-bar"><div className="util-fill" style={{ width: `${Math.min(100, entry.utilization)}%` }} /></div>
                      </div>
                    </td>
                    <td className="right">
                      <button className="deposit-btn" onClick={(event) => { event.stopPropagation(); openDeposit(entry) }}>
                        {wallet.connected ? 'Deposit' : 'Connect'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </section>
        )}

        {activeTab === 'deposits' && (
          <section className="section positions-section">
        <div className="section-header">
          <div>
            <div className="section-title">My Deposits</div>
            <div className="section-caption">Live account reconciliation from Solana RPC. No local paper positions.</div>
          </div>
        </div>

        {portfolioState.error && <div className="error-inline">Portfolio refresh failed: {portfolioState.error}</div>}

        {wallet.connected && portfolioState.loading ? (
          <div className="loading-state"><div className="spinner" /><span>Loading live marginfi accounts…</span></div>
        ) : portfolioState.positions.length === 0 ? (
          <div className="empty-card">
            <div className="empty-icon">↗</div>
            <div>
              {wallet.connected
                ? 'No marginfi USD stablecoin deposits found for this wallet yet.'
                : 'Connect a wallet to load balances and send live marginfi deposits.'}
            </div>
            {!wallet.connected && (
              <button className="wallet-btn" style={{ marginTop: '12px' }} onClick={() => setVisible(true)}>
                Connect Wallet
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap deposits-table-wrap">
            <table className="deposits-table">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th className="right">Deposited</th>
                  <th className="right">Value</th>
                  <th className="right">Supply APY</th>
                  <th className="right hide-sm">Daily Yield</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {portfolioState.positions.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="proto-cell">
                        <div className="proto-icon" style={{ background: entry.bg, color: entry.color }}>
                          {TOKEN_ICON_MAP[entry.asset] ? (
                            <img className="proto-icon-image" src={TOKEN_ICON_MAP[entry.asset]} alt="" />
                          ) : (
                            <span>{entry.icon}</span>
                          )}
                        </div>
                        <div className="proto-copy">
                          <div className="proto-name">{entry.asset}</div>
                          <div className="pos-apy">acct {entry.accountLabel}</div>
                        </div>
                      </div>
                    </td>
                    <td className="right tvl-cell">{entry.amountDisplay} {entry.asset}</td>
                    <td className="right tvl-cell">{formatCurrency(entry.amountUsd)}</td>
                    <td className="right">
                      <span className={'apy ' + apyClass(entry.apy)}>{formatPercent(entry.apy)}</span>
                    </td>
                    <td className="right hide-sm pos-earnings">
                      +{formatCurrency(entry.amountUsd * entry.apy / 100 / 365, 4)}
                    </td>
                    <td className="right">
                      <button className="withdraw-btn" onClick={() => openWithdraw(entry)}>Withdraw</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </section>
        )}

        {activeMarket && (
          <DepositModal
            currentPosition={currentPosition}
            error={actionError}
            market={activeMarket}
            maxAmount={maxAmount}
            mode={selectedAction.type}
            onClose={() => {
              setActionError('')
              setSelectedAction(null)
            }}
            onConfirm={handleProtocolAction}
            pending={actionPending}
            walletBalance={walletBalance}
          />
        )}
      </main>
    </div>
  )
}
