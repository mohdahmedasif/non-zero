import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

export interface Config {
  port: number;
  dataDir: string;
  adminKey: string;
  logger: boolean;
  /** Built frontend to serve, if it exists. */
  webDist: string | null;
  vapid: { publicKey: string; privateKey: string; subject: string };
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The only settings are PORT and ADMIN_KEY. Everything else is fixed or kept
 * in the data folder, which is created next to the code on first start.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.join(ROOT, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const webDist = path.join(ROOT, 'web', 'dist');

  return {
    port: Number(env.PORT) || 3210,
    dataDir,
    adminKey: env.ADMIN_KEY || persisted(path.join(dataDir, 'admin-key.txt'), newAdminKey),
    logger: true,
    webDist: fs.existsSync(path.join(webDist, 'index.html')) ? webDist : null,
    vapid: {
      ...JSON.parse(persisted(path.join(dataDir, 'vapid.json'), () => JSON.stringify(webpush.generateVAPIDKeys()))),
      subject: 'mailto:admin@localhost',
    },
  };
}

function newAdminKey(): string {
  return crypto.randomBytes(9).toString('base64url');
}

/** Reads a value from a file in the data folder, creating it on first use. */
function persisted(file: string, create: () => string): string {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const value = create();
  fs.writeFileSync(file, value + '\n', { mode: 0o600 });
  return value;
}
