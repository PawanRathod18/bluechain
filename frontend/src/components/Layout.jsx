import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

const LEAF = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21c0-6 0-9 0-13" />
    <path d="M12 21c-4.5 0-8-3-8-7 4.5 0 8 2.6 8 7Z" />
    <path d="M12 15c0-3.9 3.1-7 7-7 0 4-3.1 7-7 7Z" />
  </svg>
)

const LOGOUT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 17l5-5-5-5" /><path d="M20 12H9" />
    <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
  </svg>
)

function initials(name) {
  if (!name) return 'BC'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase()
}

export default function Layout() {
  const { user, logout, isVerifier } = useAuth()
  const navigate = useNavigate()

  const onLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  const links = user
    ? [
        { to: '/', label: 'Home', end: true },
        { to: '/projects', label: 'Projects' },
        { to: '/projects/new', label: 'Register' },
        ...(isVerifier ? [{ to: '/verifier', label: 'Verifier' }] : []),
        { to: '/assets', label: 'Assets' },
        { to: '/research', label: 'Research' },
      ]
    : [
        { to: '/', label: 'Home', end: true },
        { to: '/research', label: 'Research' },
      ]

  return (
    <>
      <header className="hdr">
        <div className="hdr-in">
          <NavLink to="/" className="hdr-brand" aria-label="BlueChain home">
            <span className="hdr-logo">{LEAF}</span>
            <span className="hdr-word">
              <b>BlueChain</b>
              <i>PELAGIX · dMRV</i>
            </span>
          </NavLink>

          <nav className="hdr-nav">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `hdr-link${isActive ? ' on' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hdr-right">
            {user ? (
              <>
                <span className="hdr-chain"><span className="dot" />Localhost 8545</span>
                <div className="hdr-user">
                  <span className="hdr-avatar">{initials(user.full_name)}</span>
                  <span className="hdr-user-txt">
                    <b>{user.full_name}</b>
                    <i>{user.role}</i>
                  </span>
                </div>
                <button className="hdr-logout" onClick={onLogout} title="Sign out">
                  {LOGOUT}
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <Link className="btn btn-sm btn-ghost hdr-signin" to="/login">Sign in</Link>
                <Link className="btn btn-sm btn-primary" to="/register">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="wrap">
        <Outlet />
      </main>
    </>
  )
}
