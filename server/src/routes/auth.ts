import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { signToken, AUTH_COOKIE } from '../auth';
import { requireAuth } from '../middleware/requireAuth';
import { toPublicUser, UserRow } from '../types';

export const authRouter = Router();

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(200),
});

const cookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// Create the first admin account. Only works while the users table is empty,
// so it can't be used to add arbitrary accounts later (admins do that from Settings).
authRouter.post('/bootstrap', (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (count > 0) {
    res.status(409).json({ error: 'Setup already completed' });
    return;
  }
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid username or password (min 8 chars)' });
    return;
  }
  const { username, password } = parsed.data;
  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
    .run(username, passwordHash);
  const token = signToken({ userId: Number(info.lastInsertRowid) });
  res.cookie(AUTH_COOKIE, token, cookieOptions);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow;
  res.json({ user: toPublicUser(user) });
});

authRouter.get('/needs-setup', (_req, res) => {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  res.json({ needsSetup: count === 0 });
});

authRouter.post('/login', (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid username or password' });
    return;
  }
  const { username, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | UserRow
    | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }
  const token = signToken({ userId: user.id });
  res.cookie(AUTH_COOKIE, token, cookieOptions);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user as UserRow) });
});
