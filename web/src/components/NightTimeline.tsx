import { HourlyPoint, ModelSummary } from '../types';

function cloudColor(cover: number | null): string {
  if (cover === null) return '#444';
  // 0% cloud -> blue (clear), 100% cloud -> grey
  const lightness = 25 + (cover / 100) * 55;
  return `hsl(210, 20%, ${lightness}%)`;
}

function formatHour(iso: string): string {
  return iso.slice(11, 16);
}

export default function NightTimeline({
  hourly,
  modelSummaries,
}: {
  hourly: HourlyPoint[];
  modelSummaries: ModelSummary[];
}) {
  if (hourly.length === 0) {
    return <p className="muted">Pro tuto noc nejsou k dispozici hodinova data.</p>;
  }

  return (
    <div className="night-timeline">
      {modelSummaries.map((summary) => (
        <div key={summary.model} className="timeline-row">
          <div className="timeline-label">
            {summary.label}
            {!summary.hasData && <span className="muted"> (bez dat)</span>}
          </div>
          <div className="timeline-cells">
            {hourly.map((point) => {
              const cover = point.models[summary.model]?.cloudCover ?? null;
              return (
                <div
                  key={point.time}
                  className="timeline-cell"
                  style={{ background: cloudColor(cover) }}
                  title={`${formatHour(point.time)} UTC - oblacnost ${cover ?? '?'}%`}
                />
              );
            })}
          </div>
        </div>
      ))}
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
