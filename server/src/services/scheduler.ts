import cron from 'node-cron';
import { db } from '../db';
import { env } from '../env';
import { getUpcomingNights, NightForecast } from './forecast';
import { sendTelegramMessage } from './telegramBot';
import { parseEnabledModels } from './openMeteo';
import { LocationRow } from '../types';

interface Recipient {
  label: string;
  chatId: string;
}

// The location's owner is notified via their own account's Telegram link (if set) - they don't
// need a notification_recipients row. Everyone else who has clicked their own link gets added
// too.
function recipientsFor(loc: LocationRow): Recipient[] {
  const recipients: Recipient[] = [];
  const owner = db
    .prepare('SELECT username, telegram_chat_id FROM users WHERE id = ?')
    .get(loc.created_by) as { username: string; telegram_chat_id: string | null } | undefined;
  if (owner?.telegram_chat_id) {
    recipients.push({ label: owner.username, chatId: owner.telegram_chat_id });
  }
  const guests = db
    .prepare(
      'SELECT name, telegram_chat_id FROM notification_recipients WHERE location_id = ? AND telegram_chat_id IS NOT NULL'
    )
    .all(loc.id) as { name: string; telegram_chat_id: string }[];
  for (const g of guests) {
    recipients.push({ label: g.name, chatId: g.telegram_chat_id });
  }
  return recipients;
}

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
  const nights = await getUpcomingNights(
    loc.latitude,
    loc.longitude,
    {
      cloudCoverThreshold: loc.cloud_cover_threshold,
      precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
    },
    parseEnabledModels(loc.enabled_models)
  );

  if (nights.length === 0) {
    console.log(`[scheduler] ${loc.name}: no enabled model covers any upcoming night yet - skipping`);
    return;
  }

  const recipients = recipientsFor(loc);

  for (let i = 0; i < nights.length; i++) {
    await checkNight(loc, nights[i], i, recipients);
  }
}

async function checkNight(
  loc: LocationRow,
  night: NightForecast,
  index: number,
  recipients: Recipient[]
): Promise<void> {
  const logPrefix = `[scheduler] ${loc.name} (night ${night.nightDate}):`;

  const previousRow = db
    .prepare('SELECT last_good FROM notification_log WHERE location_id = ? AND night_date = ?')
    .get(loc.id, night.nightDate) as { last_good: number } | undefined;
  const previousGood = previousRow ? !!previousRow.last_good : null;
  const currentGood = night.overallGood;

  console.log(
    `${logPrefix} overallGood=${currentGood} - ${night.modelSummaries
      .map(
        (m) =>
          `${m.label}: hasData=${m.hasData} avgCloud=${m.avgCloudCover?.toFixed(0) ?? 'n/a'}% maxPrecip=${
            m.maxPrecipitationProbability ?? 'n/a'
          }% isGood=${m.isGood}`
      )
      .join(' | ')}`
  );

  // Notify the first time a night turns out good, and again any time the verdict flips
  // afterward (good -> bad = "it got worse", bad -> good = "it cleared up again"). A
  // first check that comes back bad is just the baseline, not a change - no notification.
  const stateChanged = previousGood !== null && previousGood !== currentGood;
  const shouldNotify = stateChanged || (previousGood === null && currentGood);

  // Always persist the latest verdict so the next check has something to compare against.
  db.prepare(
    `INSERT INTO notification_log (location_id, night_date, last_good) VALUES (?, ?, ?)
     ON CONFLICT(location_id, night_date) DO UPDATE SET last_good = excluded.last_good, sent_at = datetime('now')`
  ).run(loc.id, night.nightDate, currentGood ? 1 : 0);

  if (!shouldNotify) {
    console.log(`${logPrefix} no change since last check - skipping`);
    return;
  }

  console.log(
    `${logPrefix} verdict is now ${currentGood ? 'good' : 'not good'} (changed=${stateChanged}), notifying ${
      recipients.length
    } recipient(s) with Telegram linked`
  );

  const heading = nightHeading(index, night.sunset);
  const summaryLines = night.modelSummaries
    .map((m) => `- ${m.label}: oblacnost ~${m.avgCloudCover?.toFixed(0) ?? '?'} %`)
    .join('\n');
  const message = currentGood
    ? `Jasna obloha ${heading}: ${loc.name}\n` +
      `Zapad slunce: ${formatTime(night.sunset)}, vychod: ${formatTime(night.sunrise)} (mistni cas)\n` +
      summaryLines
    : `Predpoved na ${heading} se zhorsila: ${loc.name}\n` +
      `Uz nejspis nebude jasno.\n` +
      summaryLines;

  for (const recipient of recipients) {
    await sendTelegramMessage(recipient.chatId, message).catch((err) =>
      console.error(`Failed to notify ${recipient.label}`, err)
    );
  }
}

// Telegram messages go to a Czech/Slovak astrophotography group, so render times/dates in
// Europe/Prague regardless of what timezone the server itself happens to run in.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('cs-CZ', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nightHeading(index: number, sunsetIso: string): string {
  if (index === 0) return 'dnes v noci';
  if (index === 1) return 'zitra v noci';
  const label = new Date(sunsetIso).toLocaleDateString('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  });
  return `v noci ${label}`;
}
