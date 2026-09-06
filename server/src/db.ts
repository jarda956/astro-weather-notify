import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from './env';

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

export const db = new Database(env.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

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
