import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app';

const subscription = z.object({
  endpoint: z.string().url().startsWith('https://').max(2000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
  timezone: z.string().max(64).refine(isTimeZone, 'Unknown timezone'),
});

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function pushRoutes(app: FastifyInstance, { db, config, push }: Ctx): void {
  app.get('/api/push/key', async () => ({ publicKey: config.vapid.publicKey }));

  app.post('/api/push/subscribe', async (req) => {
    const body = subscription.parse(req.body);
    db.prepare(
      `INSERT INTO push_subscriptions (profile_id, endpoint, p256dh, auth, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (profile_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, timezone = excluded.timezone`,
    ).run(req.profileId, body.endpoint, body.keys.p256dh, body.keys.auth, body.timezone, Date.now());
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req) => {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    db.prepare('DELETE FROM push_subscriptions WHERE profile_id = ? AND endpoint = ?').run(req.profileId, endpoint);
    return { ok: true };
  });

  app.post('/api/push/test', async (req, reply) => {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    const sub = db
      .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE profile_id = ? AND endpoint = ?')
      .get(req.profileId, endpoint) as { endpoint: string; p256dh: string; auth: string } | undefined;
    if (!sub) return reply.code(404).send({ error: 'This device is not subscribed' });
    try {
      await push(sub, { title: 'Non-Zero', body: 'Reminders are working on this device.', url: '/' });
    } catch (err) {
      req.log.warn(err);
      return reply.code(502).send({ error: 'The push service rejected the notification' });
    }
    return { ok: true };
  });
}
