import TelegramBot from 'node-telegram-bot-api';
import { env } from '../env';
import { db } from '../db';

let bot: TelegramBot | null = null;
let botUsernameCache: string | null = null;

export function startTelegramBot(): void {
  if (!env.telegramBotToken || bot) return;

  bot = new TelegramBot(env.telegramBotToken, { polling: true });

  bot.getMe().then((me) => {
    botUsernameCache = me.username ?? null;
  });

  bot.onText(/\/start(?:\s+(\S+))?/, (msg, match) => {
    const code = match?.[1];
    if (!code) {
      bot?.sendMessage(
        msg.chat.id,
        'Ahoj! Propoj svůj účet kliknutím na odkaz "Propojit Telegram" v nastavení aplikace.'
      );
      return;
    }
    const user = db
      .prepare('SELECT id, username FROM users WHERE telegram_link_code = ?')
      .get(code) as { id: number; username: string } | undefined;
    if (!user) {
      bot?.sendMessage(msg.chat.id, 'Odkaz pro propojení není platný. Zkus to znovu z nastavení.');
      return;
    }
    db.prepare(
      'UPDATE users SET telegram_chat_id = ?, telegram_link_code = NULL WHERE id = ?'
    ).run(String(msg.chat.id), user.id);
    bot?.sendMessage(
      msg.chat.id,
      `Hotovo! Účet "${user.username}" je propojen. Sem budou chodit upozornění na jasnou oblohu.`
    );
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
