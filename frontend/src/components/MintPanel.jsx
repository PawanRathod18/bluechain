import { useEffect, useState } from 'react'
import { api, formatNumber } from '../api'
import { Alert } from './ui'

const ABI = [
  'function mint(address to, uint256 projectId, uint256 tonnes, string uri) returns (uint256)',
  'function setListingPrice(uint256 tokenId, uint256 priceWei)',
  'function nextTokenId() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'event CreditIssued(uint256 indexed tokenId, uint256 indexed projectId, uint256 tonnes, string uri)',
]

const DEFAULT_CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337)

const STEPS = [
  'Install MetaMask from metamask.io and reload this page.',
  'Start a local chain: in the contracts folder run "npx hardhat node".',
  'Deploy: "npx hardhat run scripts/deploy.js --network localhost" and paste the printed address below.',
  'In MetaMask add the network Localhost 8545 (chain id 31337) and import a Hardhat test account.',
]

export default function MintPanel({ project, analysis, onIssued }) {
  const [address, setAddress] = useState(() => localStorage.getItem('bluechain.contract') || DEFAULT_CONTRACT)
  const [tonnes, setTonnes] = useState(
    analysis ? Math.min(analysis.stats.total_agc_tc, analysis.stats.mapped_area_ha * 2).toFixed(2) : '')
  const [price, setPrice] = useState('1')
  const [account, setAccount] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState(null)
  const [hasWallet, setHasWallet] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // MetaMask injects window.ethereum after the page loads, so check again on mount
  useEffect(() => {
    const check = () => setHasWallet(typeof window !== 'undefined' && !!window.ethereum)
    check()
    const timer = setTimeout(check, 800)
    window.addEventListener('ethereum#initialized', check, { once: true })
    return () => { clearTimeout(timer); window.removeEventListener('ethereum#initialized', check) }
  }, [])

  const saveAddress = (v) => {
    setAddress(v)
    localStorage.setItem('bluechain.contract', v)
  }

  const connect = async () => {
    setError('')
    if (!window.ethereum) { setHasWallet(false); return }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accounts[0])
      const id = parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16)
      if (id !== CHAIN_ID) {
        setError(`Wallet is on chain ${id}. Switch MetaMask to chain ${CHAIN_ID} (Hardhat localhost).`)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const mint = async () => {
    setError('')
    setIssued(null)
    if (!window.ethereum) { setHasWallet(false); return }
    if (!address || address.length < 10) { setError('Enter the deployed contract address.'); return }
    const amount = Number(tonnes)
    if (!(amount > 0)) { setError('Enter the number of tonnes to tokenise.'); return }

    setBusy(true)
    try {
      const { BrowserProvider, Contract } = await import('ethers')
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const from = await signer.getAddress()
      const contract = new Contract(address, ABI, signer)

      setStatus('Waiting for wallet confirmation…')
      const metadataUri = `bluechain://project/${project.id}/metadata`
      const tx = await contract.mint(from, project.id, BigInt(Math.round(amount * 100)), metadataUri)
      setStatus(`Transaction sent (${tx.hash.slice(0, 12)}…). Waiting for the receipt…`)
      const receipt = await tx.wait()

      let tokenId = 0
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log)
          if (parsed?.name === 'CreditIssued') tokenId = Number(parsed.args.tokenId)
        } catch { /* not our event */ }
      }

      setStatus('Recording the asset in the MRV evidence record…')
      const asset = await api.post(`/api/projects/${project.id}/assets`, {
        token_id: tokenId,
        tx_hash: receipt.hash,
        contract_address: address,
        chain_id: CHAIN_ID,
        tonnes: amount,
        listing_price_eth: price ? Number(price) : null,
        metadata_uri: metadataUri,
      })
      setIssued(asset)
      setStatus('')
      onIssued?.(asset)
    } catch (e) {
      const msg = e?.shortMessage || e?.info?.error?.message || e?.message || 'Minting failed'
      setError(msg)
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  const simulate = async () => {
    setError('')
    setIssued(null)
    const amount = Number(tonnes)
    if (!(amount > 0)) { setError('Enter the number of tonnes to record.'); return }
    setBusy(true)
    try {
      const asset = await api.post(`/api/projects/${project.id}/assets/simulate`, {
        tonnes: amount,
        listing_price_eth: price ? Number(price) : null,
      })
      setIssued(asset)
      onIssued?.(asset)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="row">
        <div className="field">
          <label className="fld">Tonnes C to tokenise</label>
          <input className="inp" type="number" step="0.01" value={tonnes} onChange={(e) => setTonnes(e.target.value)} />
        </div>
        <div className="field">
          <label className="fld">Listing price (ETH)</label>
          <input className="inp" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>

      {analysis && (
        <p className="muted" style={{ marginBottom: 12 }}>
          Modelled stock for this project: {formatNumber(analysis.stats.total_agc_tc, 2)} t C over{' '}
          {formatNumber(analysis.stats.mapped_area_ha, 2)} ha. Only the modelled quantity is tokenised —
          never a verified or certified amount.
        </p>
      )}

      {error && <Alert kind="error">{error}</Alert>}
      {status && <Alert kind="info">{status}</Alert>}
      {issued && (
        <Alert kind="ok">
          {issued.status === 'SIMULATED' ? 'Demonstration record' : 'Token'} #{issued.token_id} ·{' '}
          {formatNumber(issued.tonnes, 2)} t C
          {issued.status === 'SIMULATED'
            ? ' · no on-chain transaction was made'
            : ` · tx ${issued.tx_hash.slice(0, 12)}…`}
        </Alert>
      )}

      {hasWallet ? (
        <>
          <div className="field">
            <label className="fld">Contract address (CarbonCreditNFT)</label>
            <input className="inp mono" value={address} onChange={(e) => saveAddress(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={connect} type="button">
              {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect wallet'}
            </button>
            <button className="btn btn-primary" onClick={mint} disabled={busy} type="button">
              {busy ? 'Minting…' : 'Mint carbon credit'}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 11.5 }}>
            Requires a local Hardhat node on http://127.0.0.1:8545 (chain {CHAIN_ID}) with the contract
            deployed and the deploying account imported into MetaMask. A mint confirmation is not evidence
            of a carbon-market transaction or legal ownership.
          </p>
        </>
      ) : (
        <>
          <Alert kind="info">
            <div>
              <b>No wallet detected in this browser.</b>
              <div style={{ marginTop: 4 }}>
                Minting needs MetaMask plus a local Hardhat chain. You can still record a
                demonstration issuance so the rest of the lifecycle can be shown.
              </div>
            </div>
          </Alert>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => setShowHelp((s) => !s)}>
              {showHelp ? 'Hide setup steps' : 'How to enable real minting'}
            </button>
            <button className="btn" type="button" onClick={() => setHasWallet(!!window.ethereum)}>
              Recheck for wallet
            </button>
            <button className="btn btn-primary" type="button" onClick={simulate} disabled={busy}>
              {busy ? 'Recording…' : 'Record demo issuance'}
            </button>
          </div>

          {showHelp && (
            <div className="card card-pad" style={{ marginTop: 14, background: 'var(--surface-2)' }}>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.9 }}>
                {STEPS.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </div>
          )}

          <p className="muted" style={{ marginTop: 12, fontSize: 11.5 }}>
            A demonstration issuance is stored in the MRV evidence record with status{' '}
            <span className="mono">SIMULATED</span> and a placeholder hash. Nothing is written to a
            blockchain, and the project stays at VERIFIED rather than ISSUED.
          </p>
        </>
      )}
    </div>
  )
}
