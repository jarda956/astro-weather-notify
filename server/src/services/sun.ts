import SunCalc from 'suncalc';

export interface NightWindow {
  sunset: Date;
  sunrise: Date;
  nightDate: string;
}

/**
 * The astro-relevant "night" for a reference date: from that day's sunset
 * through the following day's sunrise. nightDate (sunset's calendar day, UTC)
 * is used as the dedupe key for notifications.
 */
export function getNightWindow(lat: number, lon: number, reference: Date = new Date()): NightWindow {
  const todayTimes = SunCalc.getTimes(reference, lat, lon);
  const nextDay = new Date(reference.getTime() + 24 * 60 * 60 * 1000);
  const nextDayTimes = SunCalc.getTimes(nextDay, lat, lon);
  return {
    sunset: todayTimes.sunset,
    sunrise: nextDayTimes.sunrise,
    nightDate: todayTimes.sunset.toISOString().slice(0, 10),
  };
}
