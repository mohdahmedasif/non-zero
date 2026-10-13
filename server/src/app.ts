import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DEVICE_COOKIE, SESSION_COOKIE, isPaired, sessionProfile } from './auth';
import type { Config } from './config';
import type { DB } from './db';
import type { PushSender } from './reminders';
import { entryRoutes } from './routes/entries';
import { habitRoutes } from './routes/habits';
import { profileRoutes, publicRoutes } from './routes/profiles';
import { pushRoutes } from './routes/push';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set on every route registered behind `requireAuth`. */
    profileId: string;
  }
}

export interface Ctx {
  db: DB;
  config: Config;
  push: PushSender;
}

export async function buildApp(ctx: Ctx): Promise<FastifyInstance> {
  const { db, config } = ctx;
  const app = Fastify({ logger: config.logger, trustProxy: config.trustProxy, bodyLimit: 5 * 1024 * 1024 });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request' });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Server error' : err.message });
  });

  // Everything except pairing itself is closed to browsers that have not been
  // paired with the admin key.
  const openToAll = new Set(['/api/device', '/api/device/pair']);
  app.addHook('onRequest', async (req, reply) => {
    // The matched route, not the raw URL, so an encoded path cannot slip past.
    const route = req.routeOptions.url;
    if (!route?.startsWith('/api/') || openToAll.has(route)) return;
    if (!isPaired(db, req.cookies[DEVICE_COOKIE])) {
      return reply.code(403).send({ error: 'This device is not paired', code: 'unpaired' });
    }
  });

  publicRoutes(app, ctx);

  await app.register(async (authed) => {
    authed.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
      const profileId = sessionProfile(db, req.cookies[SESSION_COOKIE]);
      if (!profileId) return reply.code(401).send({ error: 'Locked' });
      req.profileId = profileId;
    });
    profileRoutes(authed, ctx);
    habitRoutes(authed, ctx);
    entryRoutes(authed, ctx);
    pushRoutes(authed, ctx);
  });

  if (config.webDist) {
    await app.register(fastifyStatic, { root: config.webDist });
  }
  app.setNotFoundHandler((req, reply) => {
    // Client-side routes fall back to the app shell.
    if (config.webDist && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
