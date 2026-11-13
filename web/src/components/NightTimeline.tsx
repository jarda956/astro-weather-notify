import { HourlyPoint, ModelSummary } from '../types';

function cloudColor(cover: number | null): string {
  if (cover === null) return '#444';
  // 0% cloud -> blue (clear), 100% cloud -> grey
  const lightness = 25 + (cover / 100) * 55;
  return `hsl(210, 20%, ${lightness}%)`;
}

function visibilityColor(vis: number | null): string {
  if (vis === null) return '#444';
  // Lower visibility (fog/haze) is worse. Open-Meteo reports meters, capped around 24km for
  // "unlimited" visibility - 15km is already excellent for astro, so clamp the scale there.
  const clamped = Math.min(Math.max(vis, 0), 15000);
  const fogFraction = 1 - clamped / 15000;
  const lightness = 25 + fogFraction * 55;
  return `hsl(45, 45%, ${lightness}%)`;
}

function windColor(speed: number | null): string {
  if (speed === null) return '#444';
  // Wind speed is requested from Open-Meteo in m/s. Calm (<3 m/s) is ideal for a steady
  // tripod/mount; above ~11 m/s starts to matter for long exposures.
  const clamped = Math.min(Math.max(speed, 0), 11);
  const lightness = 25 + (clamped / 11) * 55;
  return `hsl(160, 40%, ${lightness}%)`;
}

function formatHour(iso: string): string {
  // The server sends UTC timestamps; render them in the viewer's own local time.
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function TimelineRow({
  label,
  hasData,
  hourly,
  model,
  getValue,
  getColor,
  formatTooltip,
}: {
  label: string;
  hasData: boolean;
  hourly: HourlyPoint[];
  model: string;
  getValue: (hourly: HourlyPoint, model: string) => number | null;
  getColor: (value: number | null) => string;
  formatTooltip: (hour: string, value: number | null) => string;
}) {
  return (
    <div className="timeline-row">
      <div className="timeline-label">
        {label}
        {!hasData && <span className="muted"> (bez dat)</span>}
      </div>
      <div className="timeline-cells">
        {hourly.map((point) => {
          const value = getValue(point, model);
          return (
            <div
              key={point.time}
              className="timeline-cell"
              style={{ background: getColor(value) }}
              data-tooltip={formatTooltip(formatHour(point.time), value)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function NightTimeline({
  hourly,
  modelSummaries,
  showVisibility,
  showWind,
}: {
  hourly: HourlyPoint[];
  modelSummaries: ModelSummary[];
  showVisibility: boolean;
  showWind: boolean;
}) {
  if (hourly.length === 0) {
    return <p className="muted">Pro tuto noc nejsou k dispozici hodinova data.</p>;
  }

  return (
    <div className="night-timeline">
      {modelSummaries.map((summary) => {
        const hasVisibility = hourly.some(
          (h) => h.models[summary.model]?.visibility !== null && h.models[summary.model] !== undefined
        );
        const hasWind = hourly.some(
          (h) => h.models[summary.model]?.windSpeed !== null && h.models[summary.model] !== undefined
        );
        return (
          <div key={summary.model} className="timeline-group">
            <TimelineRow
              label={`${summary.label} - oblacnost`}
              hasData={summary.hasData}
              hourly={hourly}
              model={summary.model}
              getValue={(h, m) => h.models[m]?.cloudCover ?? null}
              getColor={cloudColor}
              formatTooltip={(hour, v) => `${hour} - oblacnost ${v ?? '?'}%`}
            />
            {showVisibility && (
              <TimelineRow
                label={`${summary.label} - viditelnost`}
                hasData={hasVisibility}
                hourly={hourly}
                model={summary.model}
                getValue={(h, m) => h.models[m]?.visibility ?? null}
                getColor={visibilityColor}
                formatTooltip={(hour, v) => `${hour} - viditelnost ${v ?? '?'} m`}
              />
            )}
            {showWind && (
              <TimelineRow
                label={`${summary.label} - vitr`}
                hasData={hasWind}
                hourly={hourly}
                model={summary.model}
                getValue={(h, m) => h.models[m]?.windSpeed ?? null}
                getColor={windColor}
                formatTooltip={(hour, v) => `${hour} - vitr ${v ?? '?'} m/s`}
              />
            )}
          </div>
        );
      })}
      <div className="timeline-row timeline-axis">
        <div className="timeline-label" />
        <div className="timeline-cells">
          {hourly.map((point, i) => (
            <div key={point.time} className="timeline-cell timeline-axis-cell">
              {i % 3 === 0 ? formatHour(point.time) : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
