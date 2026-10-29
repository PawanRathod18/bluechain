import { useEffect, useState } from 'react'
import { api, formatNumber } from '../api'
import { Empty } from '../components/ui'

export default function Assets() {
  const [assets, setAssets] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/assets')
      .then(setAssets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Digital assets</div>
        <h1>Issued carbon-credit tokens</h1>
        <p className="sub">ERC-721 tokens recorded after on-chain minting. A token is not evidence of an actual carbon-market transaction, external certification or legal ownership.</p>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="card-pad" style={{ paddingTop: 16 }}>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : assets.length === 0 ? (
            <Empty title="No tokens issued yet"
              hint="Verify a project, then mint its carbon-credit token from the project page." />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Token</th><th>Project</th><th className="num">Tonnes C</th>
                    <th className="num">Listing (ETH)</th><th>Chain</th><th>Status</th><th>Tx hash</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td className="p-name">#{a.token_id}</td>
                      <td>{a.project_name}</td>
                      <td className="num">{formatNumber(a.tonnes, 2)}</td>
                      <td className="num">{a.listing_price_eth ?? '—'}</td>
                      <td className="mono-sm">{a.chain_id === 0 ? '—' : a.chain_id}</td>
                      <td>
                        <span className={`badge ${a.status === 'SIMULATED' ? 'pending' : 'issued'}`}>
                          {a.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="mono-sm" title={a.tx_hash}>
                        {a.status === 'SIMULATED' ? 'simulated' : `${a.tx_hash.slice(0, 10)}…${a.tx_hash.slice(-6)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
