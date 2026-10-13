import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  adminKey: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  logger: boolean;
  /** Built frontend to serve, if it exists. */
  webDist: string | null;
  vapid: { publicKey: string; privateKey: string; subject: string };
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const production = env.NODE_ENV === 'production';
  const webDist = path.join(ROOT, 'web', 'dist');

  return {
    port: Number(env.PORT) || 3210,
    host: env.HOST || '0.0.0.0',
    dataDir,
    adminKey: env.ADMIN_KEY || persisted(path.join(dataDir, 'admin-key.txt'), newAdminKey),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : production,
    trustProxy: env.TRUST_PROXY === '1',
    logger: true,
    webDist: fs.existsSync(path.join(webDist, 'index.html')) ? webDist : null,
    vapid: loadVapid(env, dataDir),
  };
}

function newAdminKey(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function persisted(file: string, create: () => string): string {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const value = create();
  fs.writeFileSync(file, value + '\n', { mode: 0o600 });
  return value;
}

function loadVapid(env: NodeJS.ProcessEnv, dataDir: string): Config['vapid'] {
  const subject = env.VAPID_SUBJECT || 'mailto:admin@localhost';
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject };
  }
  const keys = JSON.parse(
    persisted(path.join(dataDir, 'vapid.json'), () => JSON.stringify(webpush.generateVAPIDKeys())),
  );
  return { ...keys, subject };
}
