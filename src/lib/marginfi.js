import { getConfig } from '@mrgnlabs/marginfi-client-v2'
import { MARGINFI_IDL } from '@mrgnlabs/marginfi-client-v2/dist/idl'
import { PublicKey } from '@solana/web3.js'

export const REFRESH_INTERVAL_MS = 60_000
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
export const MARGINFI_ENV = import.meta.env.VITE_MARGINFI_ENV || inferMarginfiEnvironment(RPC_URL)
export const NETWORK_LABEL = MARGINFI_ENV === 'dev' ? 'devnet' : 'mainnet'
export const MARGINFI_CONFIG = getConfig(MARGINFI_ENV)
export const READ_ONLY_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111')
export const SUPPORTED_ASSETS = ['USDC', 'USDT', 'PYUSD', 'USDS']
export const TOKEN_PROGRAM_IDS = [
  new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
]

export const PROTOCOL_META = {
  proto: 'marginfi',
  protoKey: 'marginfi',
  icon: 'MF',
  bg: '#2a1a12',
  color: '#f59e0b',
}

const RPC_BATCH_FALLBACK_KEY = Symbol.for('yieldSol.marginfiRpcBatchFallback')

patchMarginfiIdl()

function patchMarginfiIdl() {
  if (MARGINFI_IDL.__yieldSolPatched) return

  patchOracleSetupVariants()

  const typeByName = new Map(
    (MARGINFI_IDL.types || [])
      .filter(Boolean)
      .map((entry) => [entry.name, entry.type]),
  )

  MARGINFI_IDL.accounts = (MARGINFI_IDL.accounts || []).map((account) => {
    if (!account || account.type || !typeByName.has(account.name)) {
      return account
    }

    return {
      ...account,
      type: typeByName.get(account.name),
    }
  })

  Object.defineProperty(MARGINFI_IDL, '__yieldSolPatched', {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  })
}

function patchOracleSetupVariants() {
  const oracleSetup = (MARGINFI_IDL.types || []).find((entry) => entry?.name === 'OracleSetup')

  if (!oracleSetup?.type || oracleSetup.type.kind !== 'enum') return

  const variants = [...(oracleSetup.type.variants || [])]

  while (variants.length <= 16) {
    variants.push({ name: `Unknown_${variants.length}` })
  }

  oracleSetup.type.variants = variants
}

export function createReadOnlyWallet() {
  return { publicKey: READ_ONLY_PUBLIC_KEY }
}

export function installMarginfiRpcBatchFallback(connection) {
  if (
    !connection ||
    connection[RPC_BATCH_FALLBACK_KEY] ||
    typeof connection._rpcBatchRequest !== 'function' ||
    typeof connection._rpcRequest !== 'function'
  ) {
    return
  }

  const requestBatch = connection._rpcBatchRequest.bind(connection)
  const requestSingle = connection._rpcRequest.bind(connection)
  let batchRequestsUnsupported = shouldBypassBatchRpc(connection.rpcEndpoint)

  // marginfi's SDK uses web3.js private batch RPC APIs; some RPC plans reject JSON-RPC batches.
  Object.defineProperty(connection, RPC_BATCH_FALLBACK_KEY, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  })

  connection._rpcBatchRequest = async (requests) => {
    if (!Array.isArray(requests) || requests.length === 0) {
      return requestBatch(requests)
    }

    if (batchRequestsUnsupported) {
      return requestRpcRequestsIndividually(requestSingle, requests)
    }

    try {
      return await requestBatch(requests)
    } catch (error) {
      if (!isUnsupportedBatchRpcError(error)) {
        throw error
      }

      batchRequestsUnsupported = true
      return requestRpcRequestsIndividually(requestSingle, requests)
    }
  }
}

async function requestRpcRequestsIndividually(requestSingle, requests) {
  const responses = []

  for (const request of requests) {
    responses.push(await requestSingle(request.methodName, request.args))
  }

  return responses
}

function isUnsupportedBatchRpcError(error) {
  const message = normalizeError(error).toLowerCase()

  return (
    message.includes('batch requests') &&
    (
      message.includes('forbidden') ||
      message.includes('paid plan') ||
      message.includes('not available') ||
      message.includes('unsupported')
    )
  )
}

function shouldBypassBatchRpc(endpoint) {
  return String(endpoint || '').toLowerCase().includes('helius-rpc.com')
}

export function inferMarginfiEnvironment(endpoint) {
  const value = String(endpoint || '').toLowerCase()

  if (
    value.includes('devnet') ||
    value.includes('localhost') ||
    value.includes('127.0.0.1')
  ) {
    return 'dev'
  }

  return 'production'
}

export function isSupportedAsset(symbol) {
  return SUPPORTED_ASSETS.includes((symbol || '').toUpperCase())
}

export function formatTvl(usd) {
  if (usd >= 1_000_000_000) return '$' + (usd / 1_000_000_000).toFixed(1) + 'B'
  if (usd >= 1_000_000) return '$' + (usd / 1_000_000).toFixed(1) + 'M'
  if (usd >= 1_000) return '$' + (usd / 1_000).toFixed(0) + 'K'
  return '$' + Number(usd || 0).toFixed(0)
}

export function formatCurrency(value, digits = 2) {
  return '$' + Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function formatPercent(value, digits = 2) {
  return Number(value || 0).toFixed(digits) + '%'
}

export function formatTokenAmount(value, digits = 4) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0'
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function formatInputAmount(value, digits = 6) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return ''
  return amount.toFixed(digits).replace(/\.?0+$/, '')
}

export function normalizeError(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (Array.isArray(error)) return error.map(normalizeError).join(', ')
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

export function shortenAddress(addressValue) {
  const value = addressValue?.toString?.() || String(addressValue || '')
  if (!value) return '—'
  return value.slice(0, 4) + '…' + value.slice(-4)
}

export function explorerTxUrl(signature) {
  return `https://explorer.solana.com/tx/${signature}`
}

export function getLatestSignature(signatureOrSignatures) {
  if (Array.isArray(signatureOrSignatures)) {
    return signatureOrSignatures[signatureOrSignatures.length - 1] || ''
  }

  return signatureOrSignatures || ''
}
