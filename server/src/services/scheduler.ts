import cron from 'node-cron';
import { db } from '../db';
import { env } from '../env';
import { getNightForecast } from './forecast';
import { sendTelegramMessage } from './telegramBot';
import { getNightWindow } from './sun';
import { parseEnabledModels } from './openMeteo';
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
  const logPrefix = `[scheduler] ${loc.name} (night ${nightDate}):`;

  // Only worth evaluating in the lookahead window before sunset (and shortly after),
  // unless NOTIFY_IGNORE_WINDOW=true is set for manual testing.
  if (
    !env.notifyIgnoreWindow &&
    (hoursUntilSunset > env.notifyLookaheadHours || hoursUntilSunset < -1)
  ) {
    console.log(
      `${logPrefix} outside notification window (sunset in ${hoursUntilSunset.toFixed(
        1
      )}h, lookahead ${env.notifyLookaheadHours}h) - skipping`
    );
    return;
  }

  const previousRow = db
    .prepare('SELECT last_good FROM notification_log WHERE location_id = ? AND night_date = ?')
    .get(loc.id, nightDate) as { last_good: number } | undefined;
  const previousGood = previousRow ? !!previousRow.last_good : null;

  const forecast = await getNightForecast(
    loc.latitude,
    loc.longitude,
    {
      cloudCoverThreshold: loc.cloud_cover_threshold,
      precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
    },
    parseEnabledModels(loc.enabled_models),
    now
  );

  console.log(
    `${logPrefix} overallGood=${forecast.overallGood} - ${forecast.modelSummaries
      .map(
        (m) =>
          `${m.label}: hasData=${m.hasData} avgCloud=${m.avgCloudCover?.toFixed(0) ?? 'n/a'}% maxPrecip=${
            m.maxPrecipitationProbability ?? 'n/a'
          }% isGood=${m.isGood}`
      )
      .join(' | ')}`
  );

  const currentGood = forecast.overallGood;

  // Notify the first time a night turns out good, and again any time the verdict flips
  // afterward (good -> bad = "it got worse", bad -> good = "it cleared up again"). A
  // first check that comes back bad is just the baseline, not a change - no notification.
  const stateChanged = previousGood !== null && previousGood !== currentGood;
  const shouldNotify = stateChanged || (previousGood === null && currentGood);

  // Always persist the latest verdict so the next check has something to compare against.
  db.prepare(
    `INSERT INTO notification_log (location_id, night_date, last_good) VALUES (?, ?, ?)
     ON CONFLICT(location_id, night_date) DO UPDATE SET last_good = excluded.last_good, sent_at = datetime('now')`
  ).run(loc.id, nightDate, currentGood ? 1 : 0);

  if (!shouldNotify) {
    console.log(`${logPrefix} no change since last check - skipping`);
    return;
  }

  const subscribers = db
    .prepare(
      `SELECT u.* FROM users u
       JOIN location_subscribers ls ON ls.user_id = u.id
       WHERE ls.location_id = ? AND u.telegram_chat_id IS NOT NULL`
    )
    .all(loc.id) as UserRow[];

  console.log(
    `${logPrefix} verdict is now ${currentGood ? 'good' : 'not good'} (changed=${stateChanged}), notifying ${
      subscribers.length
    } subscriber(s) with Telegram linked`
  );

  const summaryLines = forecast.modelSummaries
    .map((m) => `- ${m.label}: oblacnost ~${m.avgCloudCover?.toFixed(0) ?? '?'} %`)
    .join('\n');
  const message = currentGood
    ? `Jasna obloha na noc: ${loc.name}\n` +
      `Zapad slunce: ${formatTime(forecast.sunset)}, vychod: ${formatTime(forecast.sunrise)}\n` +
      summaryLines
    : `Predpoved na noc se zhorsila: ${loc.name}\n` +
      `Uz nejspis nebude jasno.\n` +
      summaryLines;

  for (const user of subscribers) {
    await sendTelegramMessage(user.telegram_chat_id as string, message).catch((err) =>
      console.error(`Failed to notify user ${user.id}`, err)
    );
  }
}

function formatTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`;
}
