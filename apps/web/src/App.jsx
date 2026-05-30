import { useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './App.css';

export default function App() {
  const { user, checked, checkAuth, login, logout } = useAuth();

  useEffect(() => { checkAuth(); }, [checkAuth]);

  if (!checked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#8b949e', fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  return (
    <div className="app">
      <Dashboard user={user} onLogout={logout} />
    </div>
  );
}
