import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { env } from '../env';
import { getBotUsername } from '../services/telegramBot';

export const telegramRouter = Router();

telegramRouter.use(requireAuth);

telegramRouter.get('/status', async (req, res) => {
  const botUsername = env.telegramBotToken ? await getBotUsername() : null;
  res.json({
    enabled: !!env.telegramBotToken,
    botUsername,
    linked: !!req.user!.telegram_chat_id,
  });
});

telegramRouter.post('/link', (req, res) => {
  if (!env.telegramBotToken) {
    res.status(400).json({ error: 'Telegram notifications are not configured on this server' });
    return;
  }
  const code = crypto.randomBytes(12).toString('hex');
  db.prepare('UPDATE users SET telegram_link_code = ? WHERE id = ?').run(code, req.user!.id);
  res.json({ code });
});

telegramRouter.delete('/link', (req, res) => {
  db.prepare(
    'UPDATE users SET telegram_chat_id = NULL, telegram_link_code = NULL WHERE id = ?'
  ).run(req.user!.id);
  res.json({ ok: true });
});
