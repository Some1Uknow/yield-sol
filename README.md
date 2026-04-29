# yield.sol

`yield.sol` is a Solana frontend for live USD stablecoin deposits into marginfi.

Current product scope:
- `@solana/web3.js` + Solana wallet-adapter runtime
- Wallet Standard browser wallet connection
- Live marginfi bank APY, TVL, and utilization from Solana RPC
- Live wallet stablecoin balances
- Live marginfi deposit reconciliation from the user's marginfi accounts
- Signed deposit and withdraw transactions for supported marginfi stablecoin banks
- Cluster is selected from `VITE_MARGINFI_ENV` or inferred from the RPC URL

Current v1 constraints:
- marginfi only
- `production` and `dev` groups supported
- Supported assets currently filtered to `USDC`, `USDT`, `PYUSD`, and `USDS`
- The app uses the first existing marginfi account for new deposits, or creates one if none exists
- No routing, backend indexing, or alerting layer yet

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
3. Start the app:
   ```bash
   npm run dev
   ```

## Environment

```bash
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VITE_MARGINFI_ENV=production
```

Use a paid Solana RPC for any serious usage. Public endpoints will rate limit and can break live deposits under load.

## Build

```bash
npm run build
npm run preview
```

## Deploy

This is still a static Vite app. Vercel, Netlify, and Cloudflare Pages all work.

Production checklist:
- Set a production Solana RPC endpoint
- Test wallet discovery in the target browser matrix
- Test deposit and withdraw flows with the exact wallets you support
- Run `npm run build`
- Smoke test live bank loads, balances, account creation, deposits, withdrawals, and transaction links

## Notes

- Transactions are signed client-side. This app is non-custodial.
- The current implementation does not add protocol routing, risk scoring, backend analytics, or legal disclosures.
- The official marginfi SDK uses `@solana/web3.js`, so this app intentionally stays on the straightforward `web3.js` path instead of mixing in Solana Kit.
