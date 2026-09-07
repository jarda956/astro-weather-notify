import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from './env';

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

export const db = new Database(env.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const locationSubscribersExistedBefore = !!db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'location_subscribers'")
  .get();

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// notification_recipients replaces the old account-based sharing model (location_subscribers +
// location_visibility): a recipient is now just a name and their own Telegram link, no app
// account needed. Convert any existing subscriptions (skipping the location's own owner, who
// is notified via their account's users.telegram_chat_id instead) so already-linked people
// keep getting notified without having to click a new link, then drop the old tables. Only
// runs once - it's gated on the old table's existence, and it's gone after this.
if (locationSubscribersExistedBefore) {
  db.exec(`
    INSERT INTO notification_recipients (location_id, name, telegram_chat_id, telegram_link_code)
    SELECT ls.location_id, u.username, u.telegram_chat_id, u.telegram_link_code
    FROM location_subscribers ls
    JOIN users u ON u.id = ls.user_id
    JOIN locations l ON l.id = ls.location_id
    WHERE ls.user_id != l.created_by
  `);
  db.exec('DROP TABLE IF EXISTS location_subscribers');
  db.exec('DROP TABLE IF EXISTS location_visibility');
}

// Lightweight migration for databases created before a column existed: schema.sql only
// creates tables that don't exist yet, so upgrades need an explicit ALTER TABLE here.
const locationColumns = db.prepare('PRAGMA table_info(locations)').all() as { name: string }[];
if (!locationColumns.some((c) => c.name === 'enabled_models')) {
  db.exec(
    "ALTER TABLE locations ADD COLUMN enabled_models TEXT NOT NULL DEFAULT 'icon_d2,chmi_aladin_cz_1km,chmi_aladin_central_europe_2km'"
  );
}

// HARMONIE-AROME (knmi_harmonie_arome_europe) was replaced by CHMI's own ALADIN runs once we
// found out ALADIN does have a free API after all. Existing locations that had it enabled get
// both ALADIN domains instead; this UPDATE is a no-op once no location mentions the old model.
db.prepare(
  "UPDATE locations SET enabled_models = replace(enabled_models, 'knmi_harmonie_arome_europe', 'chmi_aladin_cz_1km,chmi_aladin_central_europe_2km') WHERE enabled_models LIKE '%knmi_harmonie_arome_europe%'"
).run();

const notificationLogColumns = db.prepare('PRAGMA table_info(notification_log)').all() as {
  name: string;
}[];
if (!notificationLogColumns.some((c) => c.name === 'last_good')) {
  db.exec('ALTER TABLE notification_log ADD COLUMN last_good INTEGER NOT NULL DEFAULT 0');
}
