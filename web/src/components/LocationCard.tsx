import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Location, NightForecast } from '../types';
import NightTimeline from './NightTimeline';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  // No explicit timeZone: renders in the viewer's own local time, not UTC.
  return d.toLocaleString('cs-CZ', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nightHeading(index: number, sunsetIso: string): string {
  if (index === 0) return 'Dnes v noci';
  if (index === 1) return 'Zitra v noci';
  return new Date(sunsetIso).toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  });
}

function NightBlock({ night, index }: { night: NightForecast; index: number }) {
  return (
    <div className="night-block">
      <div className="night-block-header">
        <strong>{nightHeading(index, night.sunset)}</strong>
        <span className={`badge ${night.overallGood ? 'badge-good' : 'badge-bad'}`}>
          {night.overallGood ? 'Jasno na oblohu' : 'Nevhodne'}
        </span>
      </div>
      <p className="small">
        Zapad slunce {formatDateTime(night.sunset)} - Vychod slunce {formatDateTime(night.sunrise)}
      </p>
      <div className="model-summaries">
        {night.modelSummaries.map((m) => (
          <div key={m.model} className="model-summary">
            <strong>{m.label}</strong>
            <span>
              {m.hasData
                ? `prum. oblacnost ${m.avgCloudCover?.toFixed(0)} %, max srazky ${
                    m.maxPrecipitationProbability ?? 0
                  } %`
                : 'zadna data'}
            </span>
          </div>
        ))}
      </div>
      <NightTimeline hourly={night.hourly} modelSummaries={night.modelSummaries} />
    </div>
  );
}

export default function LocationCard({ location }: { location: Location }) {
  const [nights, setNights] = useState<NightForecast[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getForecast(location.id)
      .then(({ nights }) => {
        if (!cancelled) setNights(nights);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Chyba pri nacitani');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location.id]);

  const tonight = nights?.[0];

  return (
    <section className="location-card">
      <header className="location-card-header">
        <h2>{location.name}</h2>
        {tonight && (
          <span className={`badge ${tonight.overallGood ? 'badge-good' : 'badge-bad'}`}>
            {tonight.overallGood ? 'Jasno na oblohu' : 'Nevhodne'}
          </span>
        )}
      </header>
      <p className="muted small">
        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
      </p>
      {loading && <p className="muted">Nacitani predpovedi...</p>}
      {error && <p className="error">{error}</p>}
      {nights && !loading && nights.length === 0 && (
        <p className="muted">Zadny ze zapnutych modelu na tuto lokalitu momentalne nedosahne.</p>
      )}
      {nights && !loading && (
        <div className="night-list">
          {nights.map((night, i) => (
            <NightBlock key={night.nightDate} night={night} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
