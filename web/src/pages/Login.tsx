import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { PublicUser } from '../types';

export default function Login({ onLoggedIn }: { onLoggedIn: (user: PublicUser) => void }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .needsSetup()
      .then(({ needsSetup }) => setNeedsSetup(needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = needsSetup
        ? await api.bootstrap(username, password)
        : await api.login(username, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Neco se pokazilo');
    } finally {
      setBusy(false);
    }
  }

  if (needsSetup === null) {
    return <div className="center-screen">Nacitani...</div>;
  }

  return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Astro Weather</h1>
        {needsSetup ? (
          <p className="muted">
            Aplikace jeste nema zadny ucet. Vytvor prvni (administratorsky) ucet.
          </p>
        ) : (
          <p className="muted">Prihlas se ke svemu uctu.</p>
        )}
        <label>
          Uzivatelske jmeno
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            minLength={3}
          />
        </label>
        <label>
          Heslo
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {needsSetup ? 'Vytvorit ucet' : 'Prihlasit se'}
        </button>
      </form>
    </div>
  );
}
