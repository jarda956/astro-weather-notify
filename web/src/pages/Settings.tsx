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

// Recipients aren't app accounts - just a name plus their own Telegram link. Adding one
// immediately generates a ready-to-send link; each existing recipient can get a fresh link
// (e.g. the first one expired unused) or be removed.
function LocationRecipients({
  location,
  botUsername,
  onChange,
}: {
  location: Location;
  botUsername: string | null;
  onChange: (recipients: Location['recipients']) => void;
}) {
  const [name, setName] = useState('');
  const [linkUrls, setLinkUrls] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function linkFor(code: string): string | null {
    return botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { recipient, code } = await api.addRecipient(location.id, name.trim());
      onChange([...location.recipients, recipient]);
      const url = linkFor(code);
      if (url) setLinkUrls((prev) => ({ ...prev, [recipient.id]: url }));
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nepodarilo se pridat odberatele');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate(recipientId: number) {
    setError(null);
    try {
      const { code } = await api.regenerateRecipientLink(location.id, recipientId);
      const url = linkFor(code);
      if (url) setLinkUrls((prev) => ({ ...prev, [recipientId]: url }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nepodarilo se vygenerovat odkaz');
    }
  }

  async function handleRemove(recipientId: number) {
    if (!confirm('Odebrat tohoto odberatele?')) return;
    await api.removeRecipient(location.id, recipientId);
    onChange(location.recipients.filter((r) => r.id !== recipientId));
  }

  return (
    <div className="recipients">
      <span className="muted small">Odberatele notifikaci:</span>
      {location.recipients.map((r) => (
        <div key={r.id} className="recipient-row">
          <span>
            {r.name} {r.telegramLinked && <span className="muted small">(propojeno)</span>}
          </span>
          {!r.telegramLinked && (
            <button type="button" onClick={() => handleRegenerate(r.id)}>
              {linkUrls[r.id] ? 'Novy odkaz' : 'Vygenerovat odkaz'}
            </button>
          )}
          <button type="button" onClick={() => handleRemove(r.id)}>
            Smazat
          </button>
          {!r.telegramLinked && linkUrls[r.id] && (
            <span className="small">
              Posli mu:{' '}
              <a href={linkUrls[r.id]} target="_blank" rel="noreferrer">
                {linkUrls[r.id]}
              </a>
            </span>
          )}
        </div>
      ))}
      <form className="recipient-form" onSubmit={handleAdd}>
        <input
          placeholder="Jmeno (napr. Marek)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          Pridat a vygenerovat odkaz
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function LocationItem({
  location,
  botUsername,
  onUpdated,
  onDeleted,
}: {
  location: Location;
  botUsername: string | null;
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
      onUpdated(updated);
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
      <LocationRecipients
        location={location}
        botUsername={botUsername}
        onChange={(recipients) => onUpdated({ ...location, recipients })}
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
      <h2>Tvoje notifikace</h2>
      {!status.enabled && (
        <p className="muted">
          Telegram bot neni na serveru nastaven (chybi TELEGRAM_BOT_TOKEN v .env).
        </p>
      )}
      {status.enabled && status.linked && (
        <div>
          <p>Tvuj ucet je propojen s Telegramem - dostavas upozorneni na vsechny svoje lokality.</p>
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

// currentUser is accepted (not read) to keep the prop shape App.tsx already passes.
export default function Settings({}: { currentUser: PublicUser }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    api.listLocations().then(({ locations }) => setLocations(locations));
    api.telegramStatus().then((s) => setBotUsername(s.botUsername));
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
              botUsername={botUsername}
              onUpdated={(updated) =>
                setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
              }
              onDeleted={(id) => setLocations((prev) => prev.filter((l) => l.id !== id))}
            />
          ))}
        </ul>
      </section>

      <TelegramSection />
    </div>
  );
}
