import cron from 'node-cron';
import { db } from '../db';
import { env } from '../env';
import { getNightForecast } from './forecast';
import { sendTelegramMessage } from './telegramBot';
import { getNightWindow } from './sun';
import { LocationRow, UserRow } from '../types';

export function startScheduler(): void {
  cron.schedule(env.notifyCron, () => {
    checkAllLocations().catch((err) => console.error('Notification check failed', err));
  });
  // Also run once shortly after startup so we don't wait for the first cron tick.
  checkAllLocations().catch((err) => console.error('Initial notification check failed', err));
}

async function checkAllLocations(): Promise<void> {
  const locations = db.prepare('SELECT * FROM locations').all() as LocationRow[];
  for (const loc of locations) {
    try {
      await checkLocation(loc);
    } catch (err) {
      console.error(`Failed to evaluate location ${loc.id} (${loc.name})`, err);
    }
  }
}

async function checkLocation(loc: LocationRow): Promise<void> {
  const now = new Date();
  const { sunset, nightDate } = getNightWindow(loc.latitude, loc.longitude, now);
  const hoursUntilSunset = (sunset.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Only worth evaluating in the lookahead window before sunset (and shortly after).
  if (hoursUntilSunset > env.notifyLookaheadHours || hoursUntilSunset < -1) {
    return;
  }

  const alreadySent = db
    .prepare('SELECT 1 FROM notification_log WHERE location_id = ? AND night_date = ?')
    .get(loc.id, nightDate);
  if (alreadySent) return;

  const forecast = await getNightForecast(
    loc.latitude,
    loc.longitude,
    {
      cloudCoverThreshold: loc.cloud_cover_threshold,
      precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
    },
    now
  );

  if (!forecast.overallGood) return;

  const subscribers = db
    .prepare(
      `SELECT u.* FROM users u
       JOIN location_subscribers ls ON ls.user_id = u.id
       WHERE ls.location_id = ? AND u.telegram_chat_id IS NOT NULL`
    )
    .all(loc.id) as UserRow[];

  const summaryLines = forecast.modelSummaries
    .map((m) => `- ${m.label}: oblacnost ~${m.avgCloudCover?.toFixed(0) ?? '?'} %`)
    .join('\n');
  const message =
    `Jasna obloha na noc: ${loc.name}\n` +
    `Zapad slunce: ${formatTime(forecast.sunset)}, vychod: ${formatTime(forecast.sunrise)}\n` +
    summaryLines;

  for (const user of subscribers) {
    await sendTelegramMessage(user.telegram_chat_id as string, message).catch((err) =>
      console.error(`Failed to notify user ${user.id}`, err)
    );
  }

  db.prepare(
    'INSERT OR IGNORE INTO notification_log (location_id, night_date) VALUES (?, ?)'
  ).run(loc.id, nightDate);
}

function formatTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`;
}
