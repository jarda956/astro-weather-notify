import { Router } from 'express';
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

function recipients(locationId: number) {
  const rows = db
    .prepare('SELECT id, name, telegram_chat_id FROM notification_recipients WHERE location_id = ? ORDER BY id')
    .all(locationId) as { id: number; name: string; telegram_chat_id: string | null }[];
  return rows.map((r) => ({ id: r.id, name: r.name, telegramLinked: !!r.telegram_chat_id }));
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
    recipients: recipients(loc.id),
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
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(info.lastInsertRowid) as LocationRow;
  res.status(201).json({ location: serializeLocation(loc) });
});

const updateSchema = locationSchema.partial();

function findOwned(id: number, ownerId: number): LocationRow | undefined {
  return db.prepare('SELECT * FROM locations WHERE id = ? AND created_by = ?').get(id, ownerId) as
    | LocationRow
    | undefined;
}

locationsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = findOwned(id, req.user!.id);
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
  const existing = findOwned(id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  res.json({ ok: true });
});

const recipientSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

// Add a notification recipient (just a name) and immediately generate their Telegram link
// code in one step, so the owner can add a name and hand out a ready link right away.
locationsRouter.post('/:id/recipients', (req, res) => {
  const id = Number(req.params.id);
  const existing = findOwned(id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (!env.telegramBotToken) {
    res.status(400).json({ error: 'Telegram notifications are not configured on this server' });
    return;
  }
  const parsed = recipientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid recipient name' });
    return;
  }
  const code = crypto.randomBytes(12).toString('hex');
  const info = db
    .prepare(
      'INSERT INTO notification_recipients (location_id, name, telegram_link_code) VALUES (?, ?, ?)'
    )
    .run(id, parsed.data.name, code);
  res.status(201).json({
    recipient: { id: info.lastInsertRowid, name: parsed.data.name, telegramLinked: false },
    code,
  });
});

// Generate a fresh link code for an existing recipient (e.g. their first link expired unused,
// or they're setting up a new phone).
locationsRouter.post('/:id/recipients/:recipientId/telegram-link', (req, res) => {
  const id = Number(req.params.id);
  const recipientId = Number(req.params.recipientId);
  const existing = findOwned(id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  if (!env.telegramBotToken) {
    res.status(400).json({ error: 'Telegram notifications are not configured on this server' });
    return;
  }
  const recipient = db
    .prepare('SELECT id FROM notification_recipients WHERE id = ? AND location_id = ?')
    .get(recipientId, id) as { id: number } | undefined;
  if (!recipient) {
    res.status(404).json({ error: 'Recipient not found' });
    return;
  }
  const code = crypto.randomBytes(12).toString('hex');
  db.prepare('UPDATE notification_recipients SET telegram_link_code = ? WHERE id = ?').run(
    code,
    recipientId
  );
  res.json({ code });
});

locationsRouter.delete('/:id/recipients/:recipientId', (req, res) => {
  const id = Number(req.params.id);
  const recipientId = Number(req.params.recipientId);
  const existing = findOwned(id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Location not found' });
    return;
  }
  db.prepare('DELETE FROM notification_recipients WHERE id = ? AND location_id = ?').run(
    recipientId,
    id
  );
  res.json({ ok: true });
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

