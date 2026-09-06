// Weather models used for astrophotography forecasts.
// - icon_d2: DWD ICON-D2, ~2km resolution, covers Central Europe including Czechia and most of Slovakia.
// - chmi_aladin_cz_1km: CHMI's own ALADIN run, 1km resolution, Czechia only (does not reach Slovakia).
// - chmi_aladin_central_europe_2km: CHMI's ALADIN, 2km resolution, wider Central European domain
//   that does cover Slovakia. Deterministic (no ensemble), so it has no precipitation_probability -
//   handled the same way as any other model missing a field (null, doesn't block "isGood").
//   Named domains only, never chmi_aladin_seamless / icon_seamless etc.: those blend in a coarser
//   global model (ECMWF/ICON-EU) past the native horizon, which would misrepresent it as ALADIN/ICON-D2.
export const WEATHER_MODELS = [
  'icon_d2',
  'chmi_aladin_cz_1km',
  'chmi_aladin_central_europe_2km',
] as const;
export type WeatherModel = (typeof WEATHER_MODELS)[number];

export const MODEL_LABELS: Record<WeatherModel, string> = {
  icon_d2: 'ICON D2 (DWD)',
  chmi_aladin_cz_1km: 'ALADIN 1km CR (CHMU)',
  chmi_aladin_central_europe_2km: 'ALADIN 2km stredni Evropa (CHMU)',
};

export const DEFAULT_ENABLED_MODELS = WEATHER_MODELS.join(',');

// Native high-resolution forecast horizon of each model, in hours. Open-Meteo silently
// extends a named model's data past this point by blending in a coarser model instead of
// returning null, so we can't detect the cutoff from the data itself - it has to be
// enforced as an explicit time limit.
export const MODEL_HORIZON_HOURS: Record<WeatherModel, number> = {
  icon_d2: 48,
  chmi_aladin_cz_1km: 72,
  chmi_aladin_central_europe_2km: 72,
};

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
    forecast_days: '4',
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
