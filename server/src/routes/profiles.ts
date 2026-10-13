import type { Profile } from '@non-zero/shared';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app';
import {
  DEVICE_COOKIE,
  DEVICE_TTL_MS,
  MAX_ATTEMPTS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  hashPin,
  isPaired,
  lockDuration,
  pairDevice,
  safeEqual,
  unpairDevice,
  unpairOthers,
  verifyPin,
} from '../auth';

const pin = z.string().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits');
const look = {
  name: z.string().trim().min(1, 'Name is required').max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  emoji: z.string().min(1).max(16),
};

interface ProfileRow extends Profile {
  pin_hash: string;
  pin_salt: string;
  failed_attempts: number;
  locked_until: number | null;
}

const PUBLIC_COLUMNS = 'id, name, color, emoji';
// Slows guessing of the admin key and of PINs from a single address.
const guessLimit = { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } };

export function publicRoutes(app: FastifyInstance, { db, config }: Ctx): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.cookieSecure,
  };

  const requireAdmin = (key: string, reply: FastifyReply): boolean => {
    if (safeEqual(key, config.adminKey)) return true;
    reply.code(403).send({ error: 'Wrong admin key' });
    return false;
  };

  app.get('/api/device', async (req) => ({ paired: isPaired(db, req.cookies[DEVICE_COOKIE]) }));

  app.post('/api/device/pair', guessLimit, async (req, reply) => {
    const body = z.object({ adminKey: z.string().max(200) }).parse(req.body);
    if (!requireAdmin(body.adminKey, reply)) return;
    unpairDevice(db, req.cookies[DEVICE_COOKIE]);
    const label = String(req.headers['user-agent'] ?? 'Unknown device').slice(0, 200);
    reply.setCookie(DEVICE_COOKIE, pairDevice(db, label), { ...cookieOptions, maxAge: DEVICE_TTL_MS / 1000 });
    return { paired: true };
  });

  app.post('/api/device/unpair', async (req, reply) => {
    deleteSession(db, req.cookies[SESSION_COOKIE]);
    unpairDevice(db, req.cookies[DEVICE_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    reply.clearCookie(DEVICE_COOKIE, cookieOptions);
    return { ok: true };
  });

  app.get('/api/profiles', async () => {
    return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM profiles ORDER BY created_at`).all();
  });

  // A paired device has already proven the admin key, so it may add profiles.
  app.post('/api/profiles', async (req, reply) => {
    const body = z.object({ ...look, pin }).parse(req.body);
    const id = crypto.randomUUID();
    const { hash, salt } = hashPin(body.pin);
    db.prepare(
      'INSERT INTO profiles (id, name, color, emoji, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, body.name, body.color, body.emoji, hash, salt, Date.now());
    return reply.code(201).send({ id, name: body.name, color: body.color, emoji: body.emoji });
  });

  app.post('/api/profiles/:id/reset-pin', guessLimit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ adminKey: z.string(), pin }).parse(req.body);
    if (!requireAdmin(body.adminKey, reply)) return;
    const { hash, salt } = hashPin(body.pin);
    const result = db
      .prepare('UPDATE profiles SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(hash, salt, id);
    if (!result.changes) return reply.code(404).send({ error: 'Profile not found' });
    db.prepare('DELETE FROM sessions WHERE profile_id = ?').run(id);
    return { ok: true };
  });

  app.post('/api/auth/unlock', guessLimit, async (req, reply) => {
    const body = z.object({ profileId: z.string(), pin: z.string().max(16) }).parse(req.body);
    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(body.profileId) as ProfileRow | undefined;
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });

    const now = Date.now();
    if (profile.locked_until && profile.locked_until > now) {
      return reply.code(423).send({ error: 'Too many wrong attempts', lockedUntil: profile.locked_until });
    }

    if (!verifyPin(body.pin, profile.pin_hash, profile.pin_salt)) {
      const attempts = profile.failed_attempts + 1;
      const lock = lockDuration(attempts);
      const lockedUntil = lock ? now + lock : null;
      db.prepare('UPDATE profiles SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(
        attempts,
        lockedUntil,
        profile.id,
      );
      return reply.code(lockedUntil ? 423 : 401).send({
        error: lockedUntil ? 'Too many wrong attempts' : 'Wrong PIN',
        attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
        lockedUntil,
      });
    }

    db.prepare('UPDATE profiles SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(profile.id);
    deleteSession(db, req.cookies[SESSION_COOKIE]);
    reply.setCookie(SESSION_COOKIE, createSession(db, profile.id, now), {
      ...cookieOptions,
      maxAge: SESSION_TTL_MS / 1000,
    });
    // Using the device keeps it paired for another year.
    reply.setCookie(DEVICE_COOKIE, req.cookies[DEVICE_COOKIE]!, { ...cookieOptions, maxAge: DEVICE_TTL_MS / 1000 });
    return { id: profile.id, name: profile.name, color: profile.color, emoji: profile.emoji };
  });

  app.post('/api/auth/lock', async (req, reply) => {
    deleteSession(db, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return { ok: true };
  });
}

export function profileRoutes(app: FastifyInstance, { db }: Ctx): void {
  const current = (id: string) => db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow;

  // For a lost or sold phone: cut off every other paired browser.
  app.post('/api/device/unpair-others', async (req) => {
    return { removed: unpairOthers(db, req.cookies[DEVICE_COOKIE]) };
  });

  app.get('/api/auth/me', async (req) => {
    return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM profiles WHERE id = ?`).get(req.profileId);
  });

  app.patch('/api/profiles/me', async (req) => {
    const body = z.object(look).parse(req.body);
    db.prepare('UPDATE profiles SET name = ?, color = ?, emoji = ? WHERE id = ?').run(
      body.name,
      body.color,
      body.emoji,
      req.profileId,
    );
    return { id: req.profileId, ...body };
  });

  app.post('/api/auth/change-pin', async (req, reply) => {
    const body = z.object({ oldPin: z.string().max(16), newPin: pin }).parse(req.body);
    const profile = current(req.profileId);
    if (!verifyPin(body.oldPin, profile.pin_hash, profile.pin_salt)) {
      return reply.code(403).send({ error: 'Current PIN is wrong' });
    }
    const { hash, salt } = hashPin(body.newPin);
    db.prepare('UPDATE profiles SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(hash, salt, profile.id);
    return { ok: true };
  });

  app.post('/api/profiles/me/delete', async (req, reply) => {
    const body = z.object({ pin: z.string().max(16) }).parse(req.body);
    const profile = current(req.profileId);
    if (!verifyPin(body.pin, profile.pin_hash, profile.pin_salt)) {
      return reply.code(403).send({ error: 'Wrong PIN' });
    }
    db.prepare('DELETE FROM profiles WHERE id = ?').run(profile.id);
    return { ok: true };
  });
}
