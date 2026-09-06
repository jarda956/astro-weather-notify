import { getNightWindow } from './sun';
import {
  fetchOpenMeteoHourly,
  hourlyValue,
  MODEL_HORIZON_HOURS,
  MODEL_LABELS,
  OpenMeteoHourly,
  WEATHER_MODELS,
  WeatherModel,
} from './openMeteo';

export interface HourlyModelPoint {
  cloudCover: number | null;
  cloudCoverLow: number | null;
  cloudCoverMid: number | null;
  cloudCoverHigh: number | null;
  precipitationProbability: number | null;
  precipitation: number | null;
  visibility: number | null;
  windSpeed: number | null;
  temperature: number | null;
}

export interface HourlyPoint {
  time: string;
  models: Record<WeatherModel, HourlyModelPoint>;
}

export interface ModelSummary {
  model: WeatherModel;
  label: string;
  hasData: boolean;
  avgCloudCover: number | null;
  maxPrecipitationProbability: number | null;
  isGood: boolean;
}

export interface NightForecast {
  sunset: string;
  sunrise: string;
  nightDate: string;
  hourly: HourlyPoint[];
  modelSummaries: ModelSummary[];
  overallGood: boolean;
}

export interface ForecastThresholds {
  cloudCoverThreshold: number;
  precipitationProbabilityThreshold: number;
}

const MAX_NIGHTS = 5;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildNightForecast(
  hourlyRaw: OpenMeteoHourly,
  times: Date[],
  sunset: Date,
  sunrise: Date,
  nightDate: string,
  modelsForNight: WeatherModel[],
  thresholds: ForecastThresholds
): NightForecast {
  const nightIdx = times
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t >= sunset && t <= sunrise)
    .map(({ i }) => i);

  const hourly: HourlyPoint[] = nightIdx.map((i) => {
    const models = {} as Record<WeatherModel, HourlyModelPoint>;
    for (const model of modelsForNight) {
      models[model] = {
        cloudCover: hourlyValue(hourlyRaw, 'cloud_cover', model, i),
        cloudCoverLow: hourlyValue(hourlyRaw, 'cloud_cover_low', model, i),
        cloudCoverMid: hourlyValue(hourlyRaw, 'cloud_cover_mid', model, i),
        cloudCoverHigh: hourlyValue(hourlyRaw, 'cloud_cover_high', model, i),
        precipitationProbability: hourlyValue(hourlyRaw, 'precipitation_probability', model, i),
        precipitation: hourlyValue(hourlyRaw, 'precipitation', model, i),
        visibility: hourlyValue(hourlyRaw, 'visibility', model, i),
        windSpeed: hourlyValue(hourlyRaw, 'wind_speed_10m', model, i),
        temperature: hourlyValue(hourlyRaw, 'temperature_2m', model, i),
      };
    }
    return { time: hourlyRaw.time[i], models };
  });

  const modelSummaries: ModelSummary[] = modelsForNight.map((model) => {
    const cloudCovers = hourly
      .map((h) => h.models[model].cloudCover)
      .filter((v): v is number => v !== null);
    const precipProbs = hourly
      .map((h) => h.models[model].precipitationProbability)
      .filter((v): v is number => v !== null);
    const avgCloudCover = average(cloudCovers);
    const maxPrecipitationProbability = precipProbs.length ? Math.max(...precipProbs) : null;
    const hasData = cloudCovers.length > 0;
    const isGood =
      hasData &&
      (avgCloudCover as number) <= thresholds.cloudCoverThreshold &&
      (maxPrecipitationProbability === null ||
        maxPrecipitationProbability <= thresholds.precipitationProbabilityThreshold);
    return {
      model,
      label: MODEL_LABELS[model],
      hasData,
      avgCloudCover,
      maxPrecipitationProbability,
      isGood,
    };
  });

  // A night is "good" if at least one of its models (that actually has data) predicts
  // clear enough skies - the models don't need to agree.
  const modelsWithData = modelSummaries.filter((m) => m.hasData);
  const overallGood = modelsWithData.some((m) => m.isGood);

  return {
    sunset: sunset.toISOString(),
    sunrise: sunrise.toISOString(),
    nightDate,
    hourly,
    modelSummaries,
    overallGood,
  };
}

/**
 * Forecasts every upcoming night that at least one enabled model can genuinely cover with
 * its native high-resolution data (see MODEL_HORIZON_HOURS) - further nights are omitted
 * rather than silently backed by a coarser blended model Open-Meteo would otherwise supply.
 */
export async function getUpcomingNights(
  lat: number,
  lon: number,
  thresholds: ForecastThresholds,
  enabledModels: WeatherModel[] = [...WEATHER_MODELS],
  reference: Date = new Date()
): Promise<NightForecast[]> {
  const hourlyRaw = await fetchOpenMeteoHourly(lat, lon);
  const times = hourlyRaw.time.map((t) => new Date(t.endsWith('Z') ? t : `${t}Z`));

  const nights: NightForecast[] = [];
  let cursor = reference;
  for (let i = 0; i < MAX_NIGHTS; i++) {
    const { sunset, sunrise, nightDate } = getNightWindow(lat, lon, cursor);
    const hoursToSunriseFromNow = (sunrise.getTime() - reference.getTime()) / (1000 * 60 * 60);
    const modelsForNight = enabledModels.filter(
      (m) => hoursToSunriseFromNow <= MODEL_HORIZON_HOURS[m]
    );
    if (modelsForNight.length === 0) break;
    nights.push(buildNightForecast(hourlyRaw, times, sunset, sunrise, nightDate, modelsForNight, thresholds));
    cursor = new Date(sunset.getTime() + 24 * 60 * 60 * 1000);
  }
  return nights;
}
