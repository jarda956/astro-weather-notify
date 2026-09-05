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

export default function LocationCard({ location }: { location: Location }) {
  const [forecast, setForecast] = useState<NightForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getForecast(location.id)
      .then(({ forecast }) => {
        if (!cancelled) setForecast(forecast);
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

  return (
    <section className="location-card">
      <header className="location-card-header">
        <h2>{location.name}</h2>
        {forecast && (
          <span className={`badge ${forecast.overallGood ? 'badge-good' : 'badge-bad'}`}>
            {forecast.overallGood ? 'Jasno na oblohu' : 'Nevhodne'}
          </span>
        )}
      </header>
      <p className="muted small">
        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
      </p>
      {loading && <p className="muted">Nacitani predpovedi...</p>}
      {error && <p className="error">{error}</p>}
      {forecast && !loading && (
        <>
          <p className="small">
            Zapad slunce {formatDateTime(forecast.sunset)} - Vychod slunce{' '}
            {formatDateTime(forecast.sunrise)}
          </p>
          <div className="model-summaries">
            {forecast.modelSummaries.map((m) => (
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
          <NightTimeline hourly={forecast.hourly} modelSummaries={forecast.modelSummaries} />
        </>
      )}
    </section>
  );
}
