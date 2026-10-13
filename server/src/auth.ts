import crypto from 'node:crypto';
import type { DB } from './db';

export const SESSION_COOKIE = 'nz_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_COOKIE = 'nz_device';
export const DEVICE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const MAX_ATTEMPTS = 5;
// Lock length after the 5th, 6th, 7th… consecutive wrong PIN.
const LOCK_STEPS_MS = [1, 5, 30, 120].map((min) => min * 60_000);

export function hashPin(pin: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pin, Buffer.from(salt, 'hex'), 32).toString('hex');
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  return safeEqual(hashPin(pin, salt).hash, hash);
}

/** Constant-time string comparison that does not leak length. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

export function lockDuration(failedAttempts: number): number | null {
  if (failedAttempts < MAX_ATTEMPTS) return null;
  return LOCK_STEPS_MS[Math.min(failedAttempts - MAX_ATTEMPTS, LOCK_STEPS_MS.length - 1)];
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Registers a browser as trusted and returns the token for its cookie. */
export function pairDevice(db: DB, label: string, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO devices (token_hash, label, created_at) VALUES (?, ?, ?)').run(hashToken(token), label, now);
  return token;
}

export function isPaired(db: DB, token: string | undefined): boolean {
  return !!token && db.prepare('SELECT 1 FROM devices WHERE token_hash = ?').get(hashToken(token)) !== undefined;
}

export function unpairDevice(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM devices WHERE token_hash = ?').run(hashToken(token));
}

/** Unpairs every device except the one holding `token`. */
export function unpairOthers(db: DB, token: string | undefined): number {
  return db.prepare('DELETE FROM devices WHERE token_hash <> ?').run(hashToken(token ?? '')).changes;
}

export function createSession(db: DB, profileId: string, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, profile_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    profileId,
    now + SESSION_TTL_MS,
  );
  return token;
}

export function sessionProfile(db: DB, token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const row = db
    .prepare('SELECT profile_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(token), now) as { profile_id: string } | undefined;
  return row?.profile_id ?? null;
}

export function deleteSession(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}
