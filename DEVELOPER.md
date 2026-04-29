# Developer Guide

This guide covers setup, architecture, and deployment for developers.

## Local Development

### Prerequisites

- Node.js 16+
- npm or pnpm
- A Solana wallet with devnet SOL (for testing on devnet)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Some1Uknow/yield-sol.git
   cd yield-sol
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy and configure environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local` with your Solana RPC endpoint and marginfi environment:
   ```bash
   VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   VITE_MARGINFI_ENV=production
   ```

   For testing on devnet:
   ```bash
   VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
   VITE_MARGINFI_ENV=dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:5173`

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.mainnet-beta.solana.com` |
| `VITE_MARGINFI_ENV` | marginfi environment (`production` or `dev`) | `production` |

**Note:** Use a paid RPC endpoint for production. Public endpoints will rate-limit and can fail under load.

## Project Structure

```
src/
├── App.jsx           # Main app component with state management
├── App.css           # (Legacy, use index.css)
├── index.css         # Global styles and component styles
├── main.jsx          # React entry point
└── index.html        # HTML template
```

## Architecture

- **Frontend:** React 18 + Vite
- **Blockchain:** @solana/web3.js, @solana/wallet-adapter-react
- **Marginfi SDK:** @mrgnlabs/marginfi-client-v2
- **Styling:** Plain CSS with CSS variables

### Key Components

**App.jsx** handles:
- Wallet connection and balance fetching
- marginfi bank data fetching and filtering
- Deposit/withdrawal logic
- Portfolio tracking (your deposits)
- Modal UI for transaction confirmation

### Data Flow

1. **Banks** – Live marginfi bank data (APY, TVL, utilization) fetched from Solana RPC
2. **Wallet Balances** – Token account balances for the connected wallet
3. **Positions** – Your deposits in marginfi, fetched from your marginfi accounts
4. **Transactions** – Deposit and withdraw signed by your wallet

## Building & Deployment

### Build for Production

```bash
npm run build
```

This generates optimized static files in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

### Deploy to Vercel

```bash
vercel deploy
```

### Deploy to Netlify

```bash
netlify deploy --prod --dir=dist
```

### Deploy to Cloudflare Pages

```bash
wrangler pages deploy dist
```

## Linting

```bash
npm run lint
```

## Current Scope

- ✅ marginfi integration
- ✅ Supported assets: USDC, USDT, PYUSD, USDS
- ✅ Production and dev environments
- ❌ Routing / multi-page
- ❌ Backend indexing
- ❌ Alerting system

## Supported Wallets

All wallets using the Solana Wallet Standard:
- Phantom
- Solflare
- Magic Eden
- Ledger
- And others...

## Known Limitations

- First marginfi account is used for deposits; new accounts are created if none exist
- Only USD stablecoins are supported
- No risk scoring or protocol analytics
- No legal/compliance disclosures in-app

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a pull request

## Support

- marginfi docs: [docs.marginfi.com](https://docs.marginfi.com)
- Solana docs: [docs.solana.com](https://docs.solana.com)
- Issues: Open a GitHub issue

## License

See the LICENSE file in the repository.
