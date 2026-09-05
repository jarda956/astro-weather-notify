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
    "ALTER TABLE locations ADD COLUMN enabled_models TEXT NOT NULL DEFAULT 'icon_d2,knmi_harmonie_arome_europe'"
  );
}
