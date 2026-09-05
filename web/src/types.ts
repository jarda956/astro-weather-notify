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
  createdBy: number;
  subscriberIds: number[];
}

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
