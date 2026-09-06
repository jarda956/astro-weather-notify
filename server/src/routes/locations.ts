import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { env } from '../env';
import { requireAuth } from '../middleware/requireAuth';
import { LocationRow } from '../types';
import { getUpcomingNights } from '../services/forecast';
import { DEFAULT_ENABLED_MODELS, WEATHER_MODELS, parseEnabledModels } from '../services/openMeteo';

export const locationsRouter = Router();

locationsRouter.use(requireAuth);

function subscriberIds(locationId: number): number[] {
  const rows = db
    .prepare('SELECT user_id FROM location_subscribers WHERE location_id = ?')
    .all(locationId) as { user_id: number }[];
  return rows.map((r) => r.user_id);
}

function visibleUserIds(locationId: number): number[] {
  const rows = db
    .prepare('SELECT user_id FROM location_visibility WHERE location_id = ?')
    .all(locationId) as { user_id: number }[];
  return rows.map((r) => r.user_id);
}

function isVisibleTo(locationId: number, userId: number): boolean {
  return !!db
    .prepare('SELECT 1 FROM location_visibility WHERE location_id = ? AND user_id = ?')
    .get(locationId, userId);
}

// Owner-only actions respond 404 (not 403) to someone who can't even see the location, so a
// location's existence and ownership never leaks to people it hasn't been shared with.
function requireOwner(
  req: Request,
  res: Response,
  locationId: number,
  ownerId: number,
  message: string
): boolean {
  if (ownerId === req.user!.id) return true;
  if (isVisibleTo(locationId, req.user!.id)) {
    res.status(403).json({ error: message });
  } else {
    res.status(404).json({ error: 'Location not found' });
  }
  return false;
}

function serializeLocation(loc: LocationRow) {
  return {
    id: loc.id,
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    cloudCoverThreshold: loc.cloud_cover_threshold,
    precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
    enabledModels: parseEnabledModels(loc.enabled_models),
    createdBy: loc.created_by,
    subscriberIds: subscriberIds(loc.id),
    visibleTo: visibleUserIds(loc.id),
  };
}

// A location is only ever returned to its owner or someone it's been explicitly shared with -
// no one else can see it exists, let alone edit or subscribe to it.
locationsRouter.get('/', (req, res) => {
  const locations = db
    .prepare(
      `SELECT * FROM locations
       WHERE created_by = ?
          OR id IN (SELECT location_id FROM location_visibility WHERE user_id = ?)
       ORDER BY name`
    )
    .all(req.user!.id, req.user!.id) as LocationRow[];
  res.json({ locations: locations.map(serializeLocation) });
});

const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  cloudCoverThreshold: z.number().int().min(0).max(100).optional(),
  precipitationProbabilityThreshold: z.number().int().min(0).max(100).optional(),
  enabledModels: z.array(z.enum(WEATHER_MODELS)).min(1).optional(),
});

locationsRouter.post('/', (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid location data', details: parsed.error.issues });
    return;
  }
  const { name, latitude, longitude, cloudCoverThreshold, precipitationProbabilityThreshold, enabledModels } =
    parsed.data;
  const info = db
    .prepare(
      `INSERT INTO locations (name, latitude, longitude, cloud_cover_threshold, precipitation_probability_threshold, enabled_models, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      latitude,
      longitude,
      cloudCoverThreshold ?? 30,
      precipitationProbabilityThreshold ?? 20,
      enabledModels?.join(',') ?? DEFAULT_ENABLED_MODELS,
      req.user!.id
    );
  // New locations are private to their creator until shared - the creator is subscribed to
  // notifications for it by default (they don't need a location_visibility row, since owners
  // are always implicitly visible).
  db.prepare('INSERT INTO location_subscribers (location_id, user_id) VALUES (?, ?)').run(
    info.lastInsertRowid,
    req.user!.id
  );
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(info.lastInsertRowid) as LocationRow;
  res.status(201).json({ location: serializeLocation(loc) });
});

const updateSchema = locationSchema.partial();

locationsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as
    | LocationRow
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (!requireOwner(req, res, id, existing.created_by, 'Only the owner can edit this location')) {
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid location data', details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  db.prepare(
    `UPDATE locations SET
       name = ?, latitude = ?, longitude = ?,
       cloud_cover_threshold = ?, precipitation_probability_threshold = ?, enabled_models = ?
     WHERE id = ?`
  ).run(
    data.name ?? existing.name,
    data.latitude ?? existing.latitude,
    data.longitude ?? existing.longitude,
    data.cloudCoverThreshold ?? existing.cloud_cover_threshold,
    data.precipitationProbabilityThreshold ?? existing.precipitation_probability_threshold,
    data.enabledModels?.join(',') ?? existing.enabled_models,
    id
  );
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as LocationRow;
  res.json({ location: serializeLocation(loc) });
});

locationsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT created_by FROM locations WHERE id = ?').get(id) as
    | { created_by: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (!requireOwner(req, res, id, existing.created_by, 'Only the owner can delete this location')) {
    return;
  }
  db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  res.json({ ok: true });
});

const idListSchema = z.object({
  userIds: z.array(z.number().int()),
});

// Owner-only: who besides the owner is subscribed to Telegram notifications for this location.
// Subscribing implies visibility, so subscribers who aren't already shared with also get added
// to location_visibility here.
locationsRouter.put('/:id/subscribers', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT created_by FROM locations WHERE id = ?').get(id) as
    | { created_by: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (
    !requireOwner(req, res, id, existing.created_by, 'Only the owner can manage subscribers for this location')
  ) {
    return;
  }
  const parsed = idListSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid subscriber list' });
    return;
  }
  const tx = db.transaction((userIds: number[]) => {
    db.prepare('DELETE FROM location_subscribers WHERE location_id = ?').run(id);
    const insertSub = db.prepare(
      'INSERT OR IGNORE INTO location_subscribers (location_id, user_id) VALUES (?, ?)'
    );
    const insertVis = db.prepare(
      'INSERT OR IGNORE INTO location_visibility (location_id, user_id) VALUES (?, ?)'
    );
    for (const userId of userIds) {
      insertSub.run(id, userId);
      if (userId !== existing.created_by) insertVis.run(id, userId);
    }
  });
  tx(parsed.data.userIds);
  res.json({ subscriberIds: subscriberIds(id), visibleTo: visibleUserIds(id) });
});

// Owner-only: who besides the owner can see this location at all. Removing someone from
// visibility also drops their subscription, if any - they can't be subscribed to something
// they can no longer see.
locationsRouter.put('/:id/visibility', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT created_by FROM locations WHERE id = ?').get(id) as
    | { created_by: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (
    !requireOwner(req, res, id, existing.created_by, 'Only the owner can manage sharing for this location')
  ) {
    return;
  }
  const parsed = idListSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid visibility list' });
    return;
  }
  const userIds = parsed.data.userIds.filter((uid) => uid !== existing.created_by);
  const tx = db.transaction((ids: number[]) => {
    db.prepare('DELETE FROM location_visibility WHERE location_id = ?').run(id);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO location_visibility (location_id, user_id) VALUES (?, ?)'
    );
    for (const uid of ids) insert.run(id, uid);
    db.prepare(
      `DELETE FROM location_subscribers
       WHERE location_id = ? AND user_id != ?
         AND user_id NOT IN (SELECT user_id FROM location_visibility WHERE location_id = ?)`
    ).run(id, existing.created_by, id);
  });
  tx(userIds);
  res.json({ visibleTo: visibleUserIds(id), subscriberIds: subscriberIds(id) });
});

// Owner-only: generate a Telegram link code for someone the owner is sharing this location
// with, so the owner can hand them a ready-to-click link instead of asking them to log into
// the app themselves and do it from Settings.
locationsRouter.post('/:id/subscribers/:userId/telegram-link', (req, res) => {
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const existing = db.prepare('SELECT created_by FROM locations WHERE id = ?').get(id) as
    | { created_by: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (!requireOwner(req, res, id, existing.created_by, 'Only the owner can do this')) {
    return;
  }
  if (!env.telegramBotToken) {
    res.status(400).json({ error: 'Telegram notifications are not configured on this server' });
    return;
  }
  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const code = crypto.randomBytes(12).toString('hex');
  db.prepare('UPDATE users SET telegram_link_code = ? WHERE id = ?').run(code, targetUserId);
  res.json({ code });
});

locationsRouter.get('/:id/forecast', async (req, res) => {
  const id = Number(req.params.id);
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as
    | LocationRow
    | undefined;
  if (!loc) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (loc.created_by !== req.user!.id && !isVisibleTo(id, req.user!.id)) {
    // Same reasoning as requireOwner: don't reveal that a location exists to someone it
    // hasn't been shared with.
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  try {
    const nights = await getUpcomingNights(
      loc.latitude,
      loc.longitude,
      {
        cloudCoverThreshold: loc.cloud_cover_threshold,
        precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
      },
      parseEnabledModels(loc.enabled_models)
    );
    res.json({ nights });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch weather forecast', details: String(err) });
  }
});
