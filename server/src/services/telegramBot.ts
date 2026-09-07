import TelegramBot from 'node-telegram-bot-api';
import { env } from '../env';
import { db } from '../db';

let bot: TelegramBot | null = null;
let botUsernameCache: string | null = null;

export function startTelegramBot(): void {
  if (!env.telegramBotToken || bot) return;

  bot = new TelegramBot(env.telegramBotToken, { polling: true });

  // Without this, a polling failure (bad token, Telegram API hiccup, network blip) becomes an
  // unhandled promise rejection, which crashes the whole process on modern Node - not just
  // Telegram notifications.
  bot.on('polling_error', (err) => console.error('Telegram polling error', err));

  bot.getMe().then((me) => {
    botUsernameCache = me.username ?? null;
  });

  bot.onText(/\/start(?:\s+(\S+))?/, (msg, match) => {
    const code = match?.[1];
    if (!code) {
      bot?.sendMessage(
        msg.chat.id,
        'Ahoj! Propoj se kliknutím na odkaz, který ti poslal správce aplikace.'
      );
      return;
    }

    const user = db
      .prepare('SELECT id, username FROM users WHERE telegram_link_code = ?')
      .get(code) as { id: number; username: string } | undefined;
    if (user) {
      db.prepare(
        'UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?'
      ).run(String(msg.chat.id), user.id);
      bot?.sendMessage(
        msg.chat.id,
        `Hotovo! Účet "${user.username}" je propojen. Sem budou chodit upozornění na jasnou oblohu.`
      );
      return;
    }

    const recipient = db
      .prepare(
        `SELECT nr.id, nr.name, l.name AS location_name
         FROM notification_recipients nr
         JOIN locations l ON l.id = nr.location_id
         WHERE nr.telegram_link_code = ?`
      )
      .get(code) as { id: number; name: string; location_name: string } | undefined;
    if (recipient) {
      db.prepare(
        'UPDATE notification_recipients SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?'
      ).run(String(msg.chat.id), recipient.id);
      bot?.sendMessage(
        msg.chat.id,
        `Hotovo! Sem ti teď budou chodit upozornění na jasnou oblohu pro lokalitu "${recipient.location_name}".`
      );
      return;
    }

    bot?.sendMessage(msg.chat.id, 'Odkaz pro propojení není platný nebo už byl použitý.');
  });

  console.log('Telegram bot started (polling)');
}

export async function getBotUsername(): Promise<string | null> {
  if (!bot) return null;
  if (botUsernameCache) return botUsernameCache;
  const me = await bot.getMe();
  botUsernameCache = me.username ?? null;
  return botUsernameCache;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(chatId, text);
}
