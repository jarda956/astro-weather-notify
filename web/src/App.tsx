import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { PublicUser } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    navigate('/login');
  }

  if (loading) {
    return <div className="center-screen">Nacitani...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLoggedIn={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location }} />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">Astro Weather</div>
        <nav>
          <Link to="/">Prehled</Link>
          <Link to="/settings">Nastaveni</Link>
        </nav>
        <div className="header-user">
          <span>{user.username}</span>
          <button onClick={handleLogout}>Odhlasit</button>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings currentUser={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
