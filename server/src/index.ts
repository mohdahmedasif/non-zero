import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db';
import { startReminders, webPushSender } from './reminders';

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'));
} catch {
  // No .env file; defaults and real environment variables apply.
}

const config = loadConfig();
const db = openDb(path.join(config.dataDir, 'non-zero.db'));
const push = webPushSender(config.vapid);
const app = await buildApp({ db, config, push });

const stopReminders = startReminders(db, push, (err) => app.log.error(err));

await app.listen({ port: config.port, host: '0.0.0.0' });
if (!process.env.ADMIN_KEY) {
  app.log.info(`Admin key (needed to pair a device) is in ${path.join(config.dataDir, 'admin-key.txt')}`);
}
if (!config.webDist) {
  app.log.info('No web build found; run "npm run build" or use the Vite dev server.');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    stopReminders();
    await app.close();
    db.close();
    process.exit(0);
  });
}
