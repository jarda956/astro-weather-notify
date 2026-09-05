// Weather models used for astrophotography forecasts.
// - icon_d2: DWD ICON-D2, ~2km resolution, covers Central Europe including Czechia and most of Slovakia.
// - knmi_harmonie_arome_europe: HARMONIE-AROME (KNMI), ~2km, pan-European domain.
//   ALADIN itself (used historically by CHMI) has no public free API; HARMONIE-AROME is the
//   closest available high-resolution alternative (same ACCORD model-consortium lineage that
//   most former ALADIN countries have moved to) with full coverage of Czechia and Slovakia.
export const WEATHER_MODELS = ['icon_d2', 'knmi_harmonie_arome_europe'] as const;
export type WeatherModel = (typeof WEATHER_MODELS)[number];

export const MODEL_LABELS: Record<WeatherModel, string> = {
  icon_d2: 'ICON D2 (DWD)',
  knmi_harmonie_arome_europe: 'HARMONIE-AROME (KNMI)',
};

export const DEFAULT_ENABLED_MODELS = WEATHER_MODELS.join(',');

export function isWeatherModel(value: string): value is WeatherModel {
  return (WEATHER_MODELS as readonly string[]).includes(value);
}

// Locations store their enabled models as a comma-separated list (see locations.enabled_models).
export function parseEnabledModels(value: string): WeatherModel[] {
  const models = value
    .split(',')
    .map((v) => v.trim())
    .filter(isWeatherModel);
  return models.length > 0 ? models : [...WEATHER_MODELS];
}

const HOURLY_FIELDS = [
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'precipitation_probability',
  'precipitation',
  'visibility',
  'wind_speed_10m',
  'temperature_2m',
] as const;

export type HourlyField = (typeof HOURLY_FIELDS)[number];

export interface OpenMeteoHourly {
  time: string[];
  [key: string]: string[] | (number | null)[];
}

export async function fetchOpenMeteoHourly(lat: number, lon: number): Promise<OpenMeteoHourly> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: HOURLY_FIELDS.join(','),
    models: WEATHER_MODELS.join(','),
    timezone: 'UTC',
    forecast_days: '3',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Open-Meteo request failed with ${resp.status}: ${body}`);
  }
  const data = (await resp.json()) as { hourly: OpenMeteoHourly };
  return data.hourly;
}

export function hourlyValue(
  hourly: OpenMeteoHourly,
  field: HourlyField,
  model: WeatherModel,
  index: number
): number | null {
  const key = `${field}_${model}`;
  const series = hourly[key] as (number | null)[] | undefined;
  const value = series?.[index];
  return value === undefined ? null : value;
}
