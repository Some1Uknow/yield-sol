import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import { SolanaWalletProvider } from './components/WalletProvider'
import App from './App.jsx'
import './index.css'

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SolanaWalletProvider>
      <App />
    </SolanaWalletProvider>
  </StrictMode>,
)
