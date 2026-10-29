import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import Assets from './pages/Assets'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Login from './pages/Login'
import NewProject from './pages/NewProject'
import ProjectDetail from './pages/ProjectDetail'
import RegisterPage from './pages/RegisterPage'
import Research from './pages/Research'
import ReviewProject from './pages/ReviewProject'
import Verifier from './pages/Verifier'

/** Gate: anything that touches data needs a session, and we remember where they were going. */
function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="center-page">
        <div style={{ textAlign: 'center' }}>
          <span className="spinner" />
          <p className="muted" style={{ marginTop: 12 }}>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />

      <Route element={<Layout />}>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/research" element={<Research />} />

        {/* needs a session */}
        <Route element={<RequireAuth />}>
          <Route path="/projects" element={<Dashboard />} />
          <Route path="/projects/new" element={<NewProject />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/verifier" element={<Verifier />} />
          <Route path="/verifier/:id" element={<ReviewProject />} />
          <Route path="/assets" element={<Assets />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
