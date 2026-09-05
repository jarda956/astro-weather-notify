import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../middleware/requireAuth';
import { toPublicUser, UserRow } from '../types';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/', (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY username').all() as UserRow[];
  res.json({ users: users.map(toPublicUser) });
});

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(200),
  isAdmin: z.boolean().optional().default(false),
});

usersRouter.post('/', requireAdmin, (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid username or password (min 8 chars)' });
    return;
  }
  const { username, password, isAdmin } = parsed.data;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, passwordHash, isAdmin ? 1 : 0);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow;
  res.status(201).json({ user: toPublicUser(user) });
});

usersRouter.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});
