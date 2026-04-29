import { useEffect, useState } from 'react'
import { formatCurrency, formatInputAmount, formatPercent, formatTokenAmount } from '../lib/marginfi'

export function DepositModal({
  currentPosition = 0,
  error,
  market,
  maxAmount,
  mode = 'deposit',
  onClose,
  onConfirm,
  pending = false,
  walletBalance = 0,
}) {
  const [amount, setAmount] = useState('')

  useEffect(() => {
    setAmount('')
  }, [market, mode])

  if (!market) return null

  const parsed = parseFloat(amount)
  const availableAmount = mode === 'deposit' ? walletBalance : maxAmount
  const normalizedAmount = Number.isFinite(parsed) ? parsed : 0
  const annualYield = parsed * (market.apy / 100)
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= availableAmount
  const title = mode === 'deposit' ? `Deposit ${market.asset}` : `Withdraw ${market.asset}`
  const submitLabel =
    mode === 'deposit'
      ? `Deposit ${formatTokenAmount(normalizedAmount, 4)} ${market.asset}`
      : `Withdraw ${formatTokenAmount(normalizedAmount, 4)} ${market.asset}`

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            <div className="modal-sub">{market.proto} production group · {formatPercent(market.apy)} live supply APY</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="input-wrap">
          <input
            className="amount-input"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="0"
            autoFocus
          />
          <span className="input-currency">{market.asset}</span>
          <button
            className="max-btn"
            onClick={() => setAmount(formatInputAmount(availableAmount))}
          >MAX</button>
        </div>

        <div className="modal-rows">
          <div className="modal-row">
            <span>Wallet balance</span>
            <span>{formatTokenAmount(walletBalance, 4)} {market.asset}</span>
          </div>
          <div className="modal-row">
            <span>Deposited now</span>
            <span>{formatTokenAmount(currentPosition, 4)} {market.asset}</span>
          </div>
          <div className="modal-row">
            <span>{mode === 'deposit' ? 'Available to deposit' : 'Available to withdraw'}</span>
            <span>{formatTokenAmount(availableAmount, 4)} {market.asset}</span>
          </div>
          <div className="modal-row">
            <span>Est. annual yield</span>
            <span className="green">+{formatCurrency(annualYield)}</span>
          </div>
          <div className="modal-row">
            <span>Base APY</span>
            <span>{formatPercent(market.apyBase)}</span>
          </div>
        </div>

        <div className="apy-breakdown">
          <div className="apy-total">{formatPercent(market.apy)}</div>
          <div className="apy-label">Live supply APY</div>
        </div>

        {error && <div className="inline-error">{error}</div>}

        <button
          className={`confirm-btn ${valid ? 'active' : 'disabled'}`}
          disabled={!valid || pending}
          onClick={() => valid && onConfirm(amount)}
        >
          {!amount
            ? 'Enter an amount'
            : pending
              ? 'Waiting for wallet…'
              : parsed > availableAmount
                ? mode === 'deposit'
                  ? 'Insufficient balance'
                  : 'Amount exceeds deposit'
                : submitLabel}
        </button>

        <p className="modal-disclaimer">
          Transactions are signed locally in your wallet and submitted directly to marginfi from your connected wallet.
        </p>
      </div>
    </div>
  )
}
