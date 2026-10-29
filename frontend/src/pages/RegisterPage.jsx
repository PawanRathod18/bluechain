import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Alert } from '../components/ui'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm: '',
  })
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (form.password !== form.confirm) { setError('The two passwords do not match'); return }
    setBusy(true)
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      navigate(from !== '/' ? from : '/projects', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not create the account')
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
        <h1>Create an account</h1>
        <p className="sub">Developers register projects. Verifiers review and approve them.</p>

        {error && <Alert kind="error">{error}</Alert>}

        <form onSubmit={submit}>
          <div className="field">
            <label className="fld" htmlFor="name">Full name</label>
            <input id="name" className="inp" value={form.full_name} required autoComplete="name"
              placeholder="Pawan Rathod" onChange={set('full_name')} />
          </div>
          <div className="field">
            <label className="fld" htmlFor="remail">Email</label>
            <input id="remail" className="inp" type="email" value={form.email} required autoComplete="email"
              placeholder="you@example.com" onChange={set('email')} />
          </div>
          <div className="field">
            <label className="fld" htmlFor="rpassword">Password</label>
            <div className="pwd">
              <input id="rpassword" className="inp" type={show ? 'text' : 'password'} minLength={8}
                value={form.password} required autoComplete="new-password"
                placeholder="At least 8 characters" onChange={set('password')} />
              <button type="button" className="pwd-toggle" onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="field">
            <label className="fld" htmlFor="rconfirm">Confirm password</label>
            <input id="rconfirm" className="inp" type={show ? 'text' : 'password'} value={form.confirm}
              required autoComplete="new-password" placeholder="Type it again" onChange={set('confirm')} />
          </div>
          <div className="field">
            <span className="fld">Account type</span>
            <div className="role-fixed">
              <span className="role-dot on" />
              <div>
                <b>Project developer</b>
                <span>Register boundaries, run the carbon pipeline and submit projects for review.</span>
              </div>
            </div>
            <p className="role-note">
              Verifier accounts are issued by the platform administrator — review rights are never
              self-assigned. If you are the project verifier, sign in with the account you were given.
            </p>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-alt">
          Already have an account?{' '}
          <Link className="link" to="/login" state={{ from }}>Sign in</Link>
        </p>

        <div className="hint">
          Verifier access is granted, not claimed. The platform administrator issues verifier
          accounts, so a project cannot be approved by whoever signs up to review it.
        </div>
      </div>
    </div>
  )
}
