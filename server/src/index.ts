import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './env';
import './db';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { locationsRouter } from './routes/locations';
import { telegramRouter } from './routes/telegram';
import { startTelegramBot } from './services/telegramBot';
import { startScheduler } from './services/scheduler';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/telegram', telegramRouter);

const webDist = path.join(__dirname, '..', 'public');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.listen(env.port, () => {
  console.log(`astro-weather-notify listening on port ${env.port}`);
});

startTelegramBot();
startScheduler();
