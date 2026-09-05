import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { LocationRow } from '../types';
import { getNightForecast } from '../services/forecast';

export const locationsRouter = Router();

locationsRouter.use(requireAuth);

function subscriberIds(locationId: number): number[] {
  const rows = db
    .prepare('SELECT user_id FROM location_subscribers WHERE location_id = ?')
    .all(locationId) as { user_id: number }[];
  return rows.map((r) => r.user_id);
}

function serializeLocation(loc: LocationRow) {
  return {
    id: loc.id,
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    cloudCoverThreshold: loc.cloud_cover_threshold,
    precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
    createdBy: loc.created_by,
    subscriberIds: subscriberIds(loc.id),
  };
}

locationsRouter.get('/', (_req, res) => {
  const locations = db.prepare('SELECT * FROM locations ORDER BY name').all() as LocationRow[];
  res.json({ locations: locations.map(serializeLocation) });
});

const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  cloudCoverThreshold: z.number().int().min(0).max(100).optional(),
  precipitationProbabilityThreshold: z.number().int().min(0).max(100).optional(),
});

locationsRouter.post('/', (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid location data', details: parsed.error.issues });
    return;
  }
  const { name, latitude, longitude, cloudCoverThreshold, precipitationProbabilityThreshold } =
    parsed.data;
  const info = db
    .prepare(
      `INSERT INTO locations (name, latitude, longitude, cloud_cover_threshold, precipitation_probability_threshold, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      latitude,
      longitude,
      cloudCoverThreshold ?? 30,
      precipitationProbabilityThreshold ?? 20,
      req.user!.id
    );
  // The creator is subscribed to notifications for their own location by default.
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
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid location data', details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  db.prepare(
    `UPDATE locations SET
       name = ?, latitude = ?, longitude = ?,
       cloud_cover_threshold = ?, precipitation_probability_threshold = ?
     WHERE id = ?`
  ).run(
    data.name ?? existing.name,
    data.latitude ?? existing.latitude,
    data.longitude ?? existing.longitude,
    data.cloudCoverThreshold ?? existing.cloud_cover_threshold,
    data.precipitationProbabilityThreshold ?? existing.precipitation_probability_threshold,
    id
  );
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as LocationRow;
  res.json({ location: serializeLocation(loc) });
});

locationsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  res.json({ ok: true });
});

const subscribersSchema = z.object({
  userIds: z.array(z.number().int()),
});

locationsRouter.put('/:id/subscribers', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM locations WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  const parsed = subscribersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid subscriber list' });
    return;
  }
  const tx = db.transaction((userIds: number[]) => {
    db.prepare('DELETE FROM location_subscribers WHERE location_id = ?').run(id);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO location_subscribers (location_id, user_id) VALUES (?, ?)'
    );
    for (const userId of userIds) {
      insert.run(id, userId);
    }
  });
  tx(parsed.data.userIds);
  res.json({ subscriberIds: subscriberIds(id) });
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
  try {
    const forecast = await getNightForecast(loc.latitude, loc.longitude, {
      cloudCoverThreshold: loc.cloud_cover_threshold,
      precipitationProbabilityThreshold: loc.precipitation_probability_threshold,
    });
    res.json({ forecast });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch weather forecast', details: String(err) });
  }
});
