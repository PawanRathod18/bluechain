import { Link } from 'react-router-dom'

const CHAIN = [
  { t: 'GEE reported modelled AGC', d: 'Sentinel-2 → NDVI → mask (NDVI > 0.4). GEDI rh100 median, rh100/100, H_gap = 15 × NDVI. AGB = H × NDVI × 10.5; AGC = 0.47 × AGB. Total 443,164.99 t C (modelled).', tone: 'green' },
  { t: 'InVEST 3.20.0 baseline', d: 'LULC and supplied pool parameters. 409,383 t C baseline storage. Above-ground pool only is non-zero. A separate, non-equivalent accounting stream.' },
  { t: 'QGIS spatial integration and internal quality control', d: 'CRS · footprint · resolution · alignment · visualization · retained-raster statistics' },
  { t: 'Proposed MRV evidence record', d: 'Source data · methods/version · parameters · outputs/units · uncertainty · validation state · hashes', tone: 'amber' },
  { t: 'Proposed lifecycle', d: 'MODELED → QC → VERIFIED → ISSUED → TRANSFERRED → RETIRED. Only modelled evidence is demonstrated.', tone: 'dim' },
]

export default function Research() {
  return (
    <>
      <div className="page-head">
        <div className="eyebrow">The paper behind the platform</div>
        <h1>PELAGIX — an intelligent decentralized framework</h1>
        <p className="sub">
          Verified quantification and transparent trading of blue carbon assets. IJRASET, Volume 14 Issue X,
          October 2026 · doi:10.22214/ijraset.2026.85316
        </p>
      </div>

      <div className="res-grid">
        <div>
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Abstract</div>
            <p className="abstract">
              Mangrove carbon assessments require spatially explicit methods whose assumptions, data support,
              and verification status remain traceable. This study presents an integrated workflow for
              operational mangrove mapping, modelled above-ground carbon (AGC) estimation, complementary carbon
              accounting, parameter sensitivity, and a prototype digital MRV provenance layer for a Sundarbans
              area bounded by approximately 88.10–89.10°E and 21.50–22.35°N. Sentinel-2 surface-reflectance
              observations from 1 January to 30 April 2023 were cloud-screened, median composited, and used to
              calculate NDVI; NDVI &gt; 0.4 defined the operational mangrove mask. The supplied Google Earth
              Engine workflow quality-screened GEDI monthly rh100, median-composited it, applied its original
              rh100/100 transformation, and filled unobserved structural values using 15 × NDVI. Biomass and
              carbon were modelled as AGB = H × NDVI × 10.5 and AGC = 0.47 × AGB. The retained raster footprint
              contains <strong>15,793,243 mangrove cells</strong> (157,932.43 ha under the nominal 0.01 ha-per-cell
              convention). Mean AGC density was <strong>2.8060 t C ha⁻¹</strong> (median 2.7935; SD 0.6325), with
              total modelled AGC of <strong>443,164.99 t C</strong> and derived AGB of 942,904.24 t. A separate
              InVEST baseline reports 409,383 t C. Combined variation of the project-specific AGB coefficient and
              carbon fraction produced 343,486.54–550,027.47 t C (−22.49 % to +24.11 %); this is parameter
              sensitivity, not a confidence interval.
            </p>
            <div className="tag-row">
              {['mangrove', 'blue carbon', 'Sentinel-2', 'GEDI', 'above-ground carbon', 'Google Earth Engine',
                'InVEST', 'digital MRV', 'provenance'].map((t) => <span className="tag" key={t}>{t}</span>)}
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 14 }}>Integrated evidence-to-asset workflow</div>
            <div className="chain">
              {CHAIN.map((node, i) => (
                <div key={node.t}>
                  <div className="chain-node" style={{
                    borderColor: node.tone === 'green' ? 'var(--green-line)' : node.tone === 'amber' ? 'rgba(245,165,36,.3)' : 'var(--border)',
                    background: node.tone === 'green' ? 'rgba(34,197,94,.05)' : node.tone === 'amber' ? 'rgba(245,165,36,.05)' : undefined,
                  }}>
                    <div className="t" style={{ color: node.tone === 'amber' ? 'var(--amber)' : node.tone === 'dim' ? 'var(--dim)' : undefined }}>{node.t}</div>
                    <div className="d">{node.d}</div>
                  </div>
                  {i < CHAIN.length - 1 && (
                    <div className="chain-arrow">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 4v14" /><path d="M6 13l6 6 6-6" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="figcap">Reproduction of Figure 1(b) — the integrated evidence-to-asset framework.</p>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Principal modelled carbon results</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Metric</th><th className="num">Reported value</th></tr></thead>
                <tbody>
                  {[
                    ['Total raster cells', '30,686,250'],
                    ['Mapped mangrove cells', '15,793,243'],
                    ['Mangrove-cell proportion', '51.4668 %'],
                    ['Mapped mangrove area', '157,932.43 ha'],
                    ['Mean modelled AGC density', '2.8060 t C ha⁻¹'],
                    ['Median modelled AGC density', '2.7935 t C ha⁻¹'],
                    ['Standard deviation', '0.6325 t C ha⁻¹'],
                    ['Minimum modelled AGC density', '0.1606 t C ha⁻¹'],
                    ['Maximum modelled AGC density', '16.0198 t C ha⁻¹'],
                    ['Total modelled AGC', '443,164.99 t C'],
                    ['Mean AGB density', '5.9703 t ha⁻¹'],
                    ['Total modelled AGB', '942,904.24 t'],
                  ].map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="figcap">Table 2 — principal modelled carbon results for the retained raster footprint.</p>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Combined parameter sensitivity</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Scenario</th><th className="num">Total modelled AGC</th><th className="num">Difference</th></tr></thead>
                <tbody>
                  <tr><td>Lower (coefficient 8.5; fraction 0.45)</td><td className="num">343,486.54 t C</td><td className="num" style={{ color: '#ff9b9b' }}>−22.49 %</td></tr>
                  <tr><td>Baseline (coefficient 10.5; fraction 0.47)</td><td className="num">443,164.99 t C</td><td className="num">0.00 %</td></tr>
                  <tr><td>Upper (coefficient 12.5; fraction 0.49)</td><td className="num">550,027.47 t C</td><td className="num" style={{ color: 'var(--green-b)' }}>+24.11 %</td></tr>
                </tbody>
              </table>
            </div>
            <p className="figcap">Table 4 — parameter sensitivity, not a statistical interval.</p>
          </div>
        </div>

        <div>
          <div className="card card-pad">
            <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Study setting</div>
            <div className="kv"><span className="k">Analytical AOI</span><span className="v mono" style={{ fontSize: 11 }}>88.10–89.10°E / 21.50–22.35°N</span></div>
            <div className="kv"><span className="k">Footprint</span><span className="v mono" style={{ fontSize: 11 }}>88.649974–89.100030°E / 21.549955–22.100173°N</span></div>
            <div className="kv"><span className="k">CRS</span><span className="v mono" style={{ fontSize: 11 }}>EPSG:4326 / WGS 84</span></div>
            <div className="kv"><span className="k">Period</span><span className="v mono" style={{ fontSize: 11 }}>2023-01-01 → 2023-04-30</span></div>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Limitations stated in the paper</div>
            <div className="prose" style={{ fontSize: 12.5 }}>
              <p>No independent field validation was available; no RMSE, MAE, R², classification accuracy or
                field-calibrated statistic is reported. NDVI &gt; 0.4 is an operational threshold, not a validated
                universal classifier. The 15 × NDVI fill is empirical.</p>
              <p>GEE and InVEST arise from different frameworks, extents, pool scopes and parameters — their
                difference is not validation. No 2019–2023 carbon change, sequestration rate or carbon-credit
                quantity is established.</p>
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 6 }}>Authors</div>
            <p className="muted" style={{ fontSize: 12.5 }}>
              Sanket Jaiswal, Satish Patel, Soham Nimje, Prachi Jain, Spandan Karandikar, Srujan Barshe<br />
              School of Engineering and Technology, Computer Science &amp; Engineering,
              G H Raisoni University, Amravati, India
            </p>
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>Selected references</div>
            {[
              ['[1]', 'Donato et al., “Mangroves among the most carbon-rich forests in the tropics,” Nature Geoscience, vol. 4, pp. 293–297, 2011.'],
              ['[7]', 'Dutta Roy et al., “Remote sensing-based mangrove blue carbon assessment in the Asia-Pacific,” STOTEN, vol. 938, 2024.'],
              ['[9]', 'Gorelick et al., “Google Earth Engine: Planetary-scale geospatial analysis for everyone,” RSE, vol. 202, 2017.'],
              ['[11]', 'Dubayah et al., “The Global Ecosystem Dynamics Investigation,” Science of Remote Sensing, vol. 1, 2020.'],
              ['[15]', 'Körner et al., “Digital measuring, reporting, and verification (dMRV) for decarbonization,” BISE, vol. 67, 2025.'],
            ].map(([n, t]) => (
              <div className="ref" key={n}><b>{n}</b> {t}</div>
            ))}
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <p className="muted" style={{ fontSize: 12 }}>
              The single-page visual replica of the prototype is also available as a standalone HTML file.
            </p>
            <Link className="btn btn-sm" to="/projects" style={{ marginTop: 10 }}>Back to projects</Link>
          </div>
        </div>
      </div>
    </>
  )
}
