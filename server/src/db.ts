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
