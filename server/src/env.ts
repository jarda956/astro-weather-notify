import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  databasePath: path.resolve(process.env.DATABASE_PATH ?? './data/astro-weather.sqlite'),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || '',
  notifyCron: process.env.NOTIFY_CRON?.trim() || '0 * * * *',
  notifyLookaheadHours: parseInt(process.env.NOTIFY_LOOKAHEAD_HOURS ?? '6', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
