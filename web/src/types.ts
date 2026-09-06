export interface PublicUser {
  id: number;
  username: string;
  isAdmin: boolean;
  telegramLinked: boolean;
}

export interface Location {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  cloudCoverThreshold: number;
  precipitationProbabilityThreshold: number;
  enabledModels: string[];
  createdBy: number;
  subscriberIds: number[];
}

// Keep in sync with server/src/services/openMeteo.ts's WEATHER_MODELS/MODEL_LABELS.
export const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'icon_d2', label: 'ICON D2 (DWD)' },
  { id: 'chmi_aladin_cz_1km', label: 'ALADIN 1km CR (CHMU)' },
  { id: 'chmi_aladin_central_europe_2km', label: 'ALADIN 2km stredni Evropa (CHMU)' },
];

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
  models: Record<string, HourlyModelPoint>;
}

export interface ModelSummary {
  model: string;
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
