CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  telegram_chat_id TEXT,
  telegram_link_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  cloud_cover_threshold INTEGER NOT NULL DEFAULT 30,
  precipitation_probability_threshold INTEGER NOT NULL DEFAULT 20,
  enabled_models TEXT NOT NULL DEFAULT 'icon_d2,chmi_aladin_cz_1km,chmi_aladin_central_europe_2km',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS location_subscribers (
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (location_id, user_id)
);

-- Who besides the owner can even see a location (its forecast card). Being a subscriber
-- implies being visible too, but not the other way round: someone can see a location
-- without getting Telegram notifications for it. The owner is always implicitly visible
-- (see locations.created_by) and doesn't need a row here.
CREATE TABLE IF NOT EXISTS location_visibility (
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (location_id, user_id)
);

-- Tracks the last known "is the sky good for this night" verdict per location,
-- so the scheduler can notify again when that verdict flips (good <-> bad),
-- not just the first time it becomes good.
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  night_date TEXT NOT NULL,
  last_good INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(location_id, night_date)
);
