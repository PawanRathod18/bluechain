import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Alert } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fill = (addr) => {
    setEmail(addr)
    setPassword('BlueChain@123')
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <div className="card auth-card">
        <Link to="/" className="auth-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c0-6 0-9 0-13" /><path d="M12 21c-4.5 0-8-3-8-7 4.5 0 8 2.6 8 7Z" /><path d="M12 15c0-3.9 3.1-7 7-7 0 4-3.1 7-7 7Z" />
          </svg>
          BlueChain
        </Link>
        <h1>Sign in</h1>
        <p className="sub">
          {from !== '/'
            ? 'You need an account to do that. Sign in to continue.'
            : 'Verified quantification and provenance for blue carbon assets.'}
        </p>

        {error && <Alert kind="error">{error}</Alert>}

        <form onSubmit={submit}>
          <div className="field">
            <label className="fld" htmlFor="email">Email</label>
            <input id="email" className="inp" type="email" value={email} required autoComplete="email"
              placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="fld" htmlFor="password">Password</label>
            <div className="pwd">
              <input id="password" className="inp" type={show ? 'text' : 'password'} value={password}
                required autoComplete="current-password" placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="pwd-toggle" onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-alt">
          New here?{' '}
          <Link className="link" to="/register" state={{ from }}>Create an account</Link>
        </p>

        <div className="demo-box">
          <div className="demo-title">Demo accounts — password <code>BlueChain@123</code></div>
          <div className="demo-row">
            <button type="button" className="chip" onClick={() => fill('pawan@bluechain.dev')}>
              Project developer
            </button>
            <button type="button" className="chip" onClick={() => fill('verifier@bluechain.dev')}>
              Project verifier
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
