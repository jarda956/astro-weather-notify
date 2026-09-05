import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Location, MODEL_OPTIONS, PublicUser } from '../types';
import MapPicker from '../components/MapPicker';

function ModelCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  function toggle(id: string, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((m) => m !== id);
    if (next.length === 0) return; // always keep at least one model enabled
    onChange(next);
  }

  return (
    <div className="model-checkboxes">
      {MODEL_OPTIONS.map((m) => (
        <label key={m.id} className="checkbox-label">
          <input
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={(e) => toggle(m.id, e.target.checked)}
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}

function parseCoords(text: string): { lat: number; lon: number } | null {
  const parts = text.split(',').map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function AddLocationForm({ onCreated }: { onCreated: (loc: Location) => void }) {
  const [name, setName] = useState('');
  const [coordsText, setCoordsText] = useState('');
  const [cloudCoverThreshold, setCloudCoverThreshold] = useState(30);
  const [precipitationProbabilityThreshold, setPrecipitationProbabilityThreshold] = useState(20);
  const [enabledModels, setEnabledModels] = useState<string[]>(MODEL_OPTIONS.map((m) => m.id));
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const coords = parseCoords(coordsText);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError('Zadej platne GPS souradnice ve tvaru "lat, lon" nebo je vyber na mape.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { location } = await api.createLocation({
        name,
        latitude: coords.lat,
        longitude: coords.lon,
        cloudCoverThreshold,
        precipitationProbabilityThreshold,
        enabledModels,
      });
      onCreated(location);
      setName('');
      setCoordsText('');
      setCloudCoverThreshold(30);
      setPrecipitationProbabilityThreshold(20);
      setEnabledModels(MODEL_OPTIONS.map((m) => m.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ulozeni se nezdarilo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="location-form" onSubmit={handleSubmit}>
      <input
        placeholder="Nazev lokality"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        placeholder="GPS: 49.8175, 15.4730"
        value={coordsText}
        onChange={(e) => setCoordsText(e.target.value)}
        required
      />
      <button type="button" onClick={() => setShowMap(true)}>
        Vybrat na mape
      </button>
      <label className="threshold-label">
        Max. oblacnost %
        <input
          type="number"
          min={0}
          max={100}
          value={cloudCoverThreshold}
          onChange={(e) => setCloudCoverThreshold(Number(e.target.value))}
        />
      </label>
      <label className="threshold-label">
        Max. srazky %
        <input
          type="number"
          min={0}
          max={100}
          value={precipitationProbabilityThreshold}
          onChange={(e) => setPrecipitationProbabilityThreshold(Number(e.target.value))}
        />
      </label>
      <ModelCheckboxes selected={enabledModels} onChange={setEnabledModels} />
      <button type="submit" disabled={busy}>
        Ulozit
      </button>
      {error && <div className="error">{error}</div>}
      {showMap && (
        <MapPicker
          initialLat={coords?.lat}
          initialLon={coords?.lon}
          onSelect={(lat, lon) => {
            setCoordsText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            setShowMap(false);
          }}
          onClose={() => setShowMap(false)}
        />
      )}
    </form>
  );
}

function LocationSubscribers({
  location,
  users,
  onChange,
}: {
  location: Location;
  users: PublicUser[];
  onChange: (subscriberIds: number[]) => void;
}) {
  async function toggle(userId: number, checked: boolean) {
    const next = checked
      ? [...location.subscriberIds, userId]
      : location.subscriberIds.filter((id) => id !== userId);
    const { subscriberIds } = await api.setSubscribers(location.id, next);
    onChange(subscriberIds);
  }

  return (
    <div className="subscribers">
      <span className="muted small">Posilat upozorneni:</span>
      {users.map((u) => (
        <label key={u.id} className="checkbox-label">
          <input
            type="checkbox"
            checked={location.subscriberIds.includes(u.id)}
            onChange={(e) => toggle(u.id, e.target.checked)}
          />
          {u.username}
          {!u.telegramLinked && <span className="muted"> (Telegram nepropojen)</span>}
        </label>
      ))}
    </div>
  );
}

function LocationItem({
  location,
  users,
  onUpdated,
  onDeleted,
}: {
  location: Location;
  users: PublicUser[];
  onUpdated: (loc: Location) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(location.name);
  const [coordsText, setCoordsText] = useState(
    `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
  );
  const [cloudCoverThreshold, setCloudCoverThreshold] = useState(location.cloudCoverThreshold);
  const [precipitationProbabilityThreshold, setPrecipitationProbabilityThreshold] = useState(
    location.precipitationProbabilityThreshold
  );
  const [enabledModels, setEnabledModels] = useState<string[]>(location.enabledModels);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const coords = parseCoords(coordsText);
    if (!coords) {
      setError('Neplatne souradnice');
      return;
    }
    try {
      const { location: updated } = await api.updateLocation(location.id, {
        name,
        latitude: coords.lat,
        longitude: coords.lon,
        cloudCoverThreshold,
        precipitationProbabilityThreshold,
        enabledModels,
      });
      onUpdated({ ...updated, subscriberIds: location.subscriberIds });
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ulozeni se nezdarilo');
    }
  }

  async function handleDelete() {
    if (!confirm(`Opravdu smazat lokalitu "${location.name}"?`)) return;
    await api.deleteLocation(location.id);
    onDeleted(location.id);
  }

  return (
    <li className="location-item">
      {editing ? (
        <div className="location-form">
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <input value={coordsText} onChange={(e) => setCoordsText(e.target.value)} />
          <button type="button" onClick={() => setShowMap(true)}>
            Vybrat na mape
          </button>
          <label className="threshold-label">
            Max. oblacnost %
            <input
              type="number"
              min={0}
              max={100}
              value={cloudCoverThreshold}
              onChange={(e) => setCloudCoverThreshold(Number(e.target.value))}
            />
          </label>
          <label className="threshold-label">
            Max. srazky %
            <input
              type="number"
              min={0}
              max={100}
              value={precipitationProbabilityThreshold}
              onChange={(e) => setPrecipitationProbabilityThreshold(Number(e.target.value))}
            />
          </label>
          <ModelCheckboxes selected={enabledModels} onChange={setEnabledModels} />
          <button type="button" onClick={handleSave}>
            Ulozit
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            Zrusit
          </button>
          {error && <div className="error">{error}</div>}
          {showMap && (
            <MapPicker
              initialLat={location.latitude}
              initialLon={location.longitude}
              onSelect={(lat, lon) => {
                setCoordsText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
                setShowMap(false);
              }}
              onClose={() => setShowMap(false)}
            />
          )}
        </div>
      ) : (
        <div className="location-item-header">
          <div>
            <strong>{location.name}</strong>
            <span className="muted small">
              {' '}
              ({location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}) - max. oblacnost{' '}
              {location.cloudCoverThreshold} %, max. srazky{' '}
              {location.precipitationProbabilityThreshold} %, modely:{' '}
              {location.enabledModels
                .map((id) => MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id)
                .join(', ')}
            </span>
          </div>
          <div className="location-item-actions">
            <button type="button" onClick={() => setEditing(true)}>
              Upravit
            </button>
            <button type="button" onClick={handleDelete}>
              Smazat
            </button>
          </div>
        </div>
      )}
      <LocationSubscribers
        location={location}
        users={users}
        onChange={(subscriberIds) => onUpdated({ ...location, subscriberIds })}
      />
    </li>
  );
}

function TelegramSection() {
  const [status, setStatus] = useState<{
    enabled: boolean;
    botUsername: string | null;
    linked: boolean;
  } | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  function refresh() {
    api.telegramStatus().then(setStatus);
  }

  useEffect(refresh, []);

  async function handleLink() {
    if (!status?.botUsername) return;
    const { code } = await api.telegramLink();
    setLinkUrl(`https://t.me/${status.botUsername}?start=${code}`);
  }

  async function handleUnlink() {
    await api.telegramUnlink();
    setLinkUrl(null);
    refresh();
  }

  if (!status) return null;

  return (
    <section className="settings-section">
      <h2>Telegram notifikace</h2>
      {!status.enabled && (
        <p className="muted">
          Telegram bot neni na serveru nastaven (chybi TELEGRAM_BOT_TOKEN v .env).
        </p>
      )}
      {status.enabled && status.linked && (
        <div>
          <p>Tvuj ucet je propojen s Telegramem.</p>
          <button onClick={handleUnlink}>Odpojit Telegram</button>
        </div>
      )}
      {status.enabled && !status.linked && (
        <div>
          <button onClick={handleLink}>Propojit Telegram</button>
          {linkUrl && (
            <p>
              Otevri v Telegramu:{' '}
              <a href={linkUrl} target="_blank" rel="noreferrer">
                {linkUrl}
              </a>{' '}
              a stiskni Start. Pak se sem vrat a{' '}
              <button type="button" onClick={refresh}>
                zkontrolovat propojeni
              </button>
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function UsersSection({ currentUser }: { currentUser: PublicUser }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.listUsers().then(({ users }) => setUsers(users));
  }

  useEffect(refresh, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser(username, password, isAdmin);
      setUsername('');
      setPassword('');
      setIsAdmin(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vytvoreni uctu se nezdarilo');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Opravdu smazat tento ucet?')) return;
    await api.deleteUser(id);
    refresh();
  }

  return (
    <section className="settings-section">
      <h2>Uzivatelske ucty</h2>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id}>
            {u.username} {u.isAdmin && <span className="badge">admin</span>}
            {u.id !== currentUser.id && (
              <button type="button" onClick={() => handleDelete(u.id)}>
                Smazat
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="location-form" onSubmit={handleCreate}>
        <input
          placeholder="Uzivatelske jmeno"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
        />
        <input
          type="password"
          placeholder="Heslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin
        </label>
        <button type="submit">Pridat ucet</button>
        {error && <div className="error">{error}</div>}
      </form>
    </section>
  );
}

export default function Settings({ currentUser }: { currentUser: PublicUser }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    api.listLocations().then(({ locations }) => setLocations(locations));
    api.listUsers().then(({ users }) => setUsers(users));
  }, []);

  return (
    <div className="settings-page">
      <section className="settings-section">
        <h2>Lokality</h2>
        <AddLocationForm onCreated={(loc) => setLocations((prev) => [...prev, loc])} />
        <ul className="location-list">
          {locations.map((loc) => (
            <LocationItem
              key={loc.id}
              location={loc}
              users={users}
              onUpdated={(updated) =>
                setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
              }
              onDeleted={(id) => setLocations((prev) => prev.filter((l) => l.id !== id))}
            />
          ))}
        </ul>
      </section>

      <TelegramSection />

      {currentUser.isAdmin && <UsersSection currentUser={currentUser} />}
    </div>
  );
}
