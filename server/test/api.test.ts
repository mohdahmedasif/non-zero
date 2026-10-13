import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { type DB, openDb } from '../src/db';
import { type PushMessage, type PushTarget, runReminders } from '../src/reminders';

const ADMIN_KEY = 'test-admin-key';
const config: Config = {
  port: 0,
  dataDir: '',
  adminKey: ADMIN_KEY,
  logger: false,
  webDist: null,
  vapid: { publicKey: 'public', privateKey: 'private', subject: 'mailto:test@localhost' },
};

let db: DB;
let app: FastifyInstance;
let pushed: { target: PushTarget; message: PushMessage }[];
/** Pairing cookie sent with every call unless a test opts out. */
let device: string;

beforeEach(async () => {
  db = openDb(':memory:');
  pushed = [];
  app = await buildApp({ db, config, push: async (target, message) => void pushed.push({ target, message }) });
  device = '';
  device = (await pair()).cookie!;
});

afterEach(async () => {
  await app.close();
  db.close();
});

interface Call {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  cookie?: string;
  /** Send as a browser that was never paired. */
  unpaired?: boolean;
}

async function call({ method, url, body, cookie, unpaired }: Call) {
  const cookies = [unpaired ? '' : device, cookie].filter(Boolean).join('; ');
  const res = await app.inject({
    method,
    url,
    payload: body as object | undefined,
    headers: cookies ? { cookie: cookies } : undefined,
  });
  const setCookie = [res.headers['set-cookie'] ?? []].flat();
  return { status: res.statusCode, json: res.json(), setCookie };
}

const cookieNamed = (setCookie: string[], name: string) =>
  setCookie.find((c) => c.startsWith(`${name}=`))?.split(';')[0];

async function pair(adminKey = ADMIN_KEY) {
  const res = await call({ method: 'POST', url: '/api/device/pair', body: { adminKey }, unpaired: true });
  return { ...res, cookie: cookieNamed(res.setCookie, 'nz_device') };
}

async function createProfile(name: string, pin: string): Promise<string> {
  const res = await call({
    method: 'POST',
    url: '/api/profiles',
    body: { name, color: '#22c55e', emoji: '🌱', pin },
  });
  expect(res.status).toBe(201);
  return res.json.id;
}

async function unlock(profileId: string, pin: string) {
  const res = await call({ method: 'POST', url: '/api/auth/unlock', body: { profileId, pin } });
  return { ...res, cookie: cookieNamed(res.setCookie, 'nz_session') };
}

const habit = (overrides: object = {}) => ({
  name: 'Read',
  emoji: '📚',
  color: '#3b82f6',
  type: 'boolean',
  target: 1,
  unit: '',
  weekdays: 127,
  reminderTime: null,
  ...overrides,
});

describe('device pairing', () => {
  it('hides everything from a browser that is not paired', async () => {
    const id = await createProfile('Work', '1234');
    const closed: Call[] = [
      { method: 'GET', url: '/api/profiles' },
      { method: 'POST', url: '/api/profiles', body: { name: 'X', color: '#22c55e', emoji: '🌱', pin: '1234' } },
      { method: 'POST', url: '/api/auth/unlock', body: { profileId: id, pin: '1234' } },
      { method: 'POST', url: `/api/profiles/${id}/reset-pin`, body: { adminKey: ADMIN_KEY, pin: '4321' } },
      { method: 'GET', url: '/api/habits' },
      { method: 'GET', url: '/%61pi/profiles' },
    ];
    for (const request of closed) {
      const res = await call({ ...request, unpaired: true });
      expect(res.status).toBe(403);
      expect(res.json.code).toBe('unpaired');
    }
    expect((await call({ method: 'GET', url: '/api/device', unpaired: true })).json).toEqual({ paired: false });
  });

  it('cannot be used to lock a profile from an unpaired browser', async () => {
    const id = await createProfile('Work', '1234');
    for (let i = 0; i < 6; i++) {
      await call({ method: 'POST', url: '/api/auth/unlock', body: { profileId: id, pin: '0000' }, unpaired: true });
    }
    expect((await unlock(id, '1234')).status).toBe(200);
  });

  it('pairs only with the admin key', async () => {
    const wrong = await pair('nope');
    expect(wrong.status).toBe(403);
    expect(wrong.cookie).toBeUndefined();
    expect((await call({ method: 'GET', url: '/api/device' })).json).toEqual({ paired: true });
  });

  it('marks cookies HTTPS-only exactly when the request came over HTTPS', async () => {
    const pairOver = async (proto: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/device/pair',
        payload: { adminKey: ADMIN_KEY },
        headers: { 'x-forwarded-proto': proto },
      });
      return String(res.headers['set-cookie']);
    };
    expect(await pairOver('https')).toContain('Secure');
    expect(await pairOver('http')).not.toContain('Secure');
  });

  it('caps pairing attempts for all visitors together, whatever address they claim', async () => {
    const attempt = (n: number) =>
      app.inject({
        method: 'POST',
        url: '/api/device/pair',
        payload: { adminKey: 'guess' },
        headers: { 'x-forwarded-for': `203.0.113.${n}` },
      });
    const statuses: number[] = [];
    for (let n = 1; n <= 25; n++) statuses.push((await attempt(n)).statusCode);
    // One attempt was already used to pair in beforeEach.
    expect(statuses.filter((s) => s === 403)).toHaveLength(19);
    expect(statuses.slice(19).every((s) => s === 429)).toBe(true);
  });

  it('rejects a made-up pairing cookie', async () => {
    device = 'nz_device=not-a-real-token';
    expect((await call({ method: 'GET', url: '/api/profiles' })).status).toBe(403);
  });

  it('unpairs every other device on request', async () => {
    const phone = (await pair()).cookie!;
    const { cookie } = await unlock(await createProfile('Work', '1234'), '1234');

    const res = await call({ method: 'POST', url: '/api/device/unpair-others', cookie });
    expect(res.json).toEqual({ removed: 1 });
    expect((await call({ method: 'GET', url: '/api/profiles' })).status).toBe(200);
    device = phone;
    expect((await call({ method: 'GET', url: '/api/profiles' })).status).toBe(403);
  });

  it('forgets a device that unpairs itself', async () => {
    const laptop = device;
    expect((await call({ method: 'POST', url: '/api/device/unpair' })).status).toBe(200);
    device = laptop;
    expect((await call({ method: 'GET', url: '/api/profiles' })).status).toBe(403);
  });
});

describe('profiles and PIN', () => {
  it('rejects PINs that are not 4 to 8 digits', async () => {
    for (const pin of ['123', '12a4', '123456789']) {
      const res = await call({
        method: 'POST',
        url: '/api/profiles',
        body: { name: 'Work', color: '#22c55e', emoji: '💼', pin },
      });
      expect(res.status).toBe(400);
    }
  });

  it('lists profiles without leaking PIN material', async () => {
    await createProfile('Work', '1234');
    const { json } = await call({ method: 'GET', url: '/api/profiles' });
    expect(Object.keys(json[0]).sort()).toEqual(['color', 'emoji', 'id', 'name']);
  });

  it('unlocks with the right PIN and locks again', async () => {
    const id = await createProfile('Work', '1234');
    expect((await call({ method: 'GET', url: '/api/habits' })).status).toBe(401);

    const { status, cookie } = await unlock(id, '1234');
    expect(status).toBe(200);
    expect((await call({ method: 'GET', url: '/api/auth/me', cookie })).json.name).toBe('Work');

    await call({ method: 'POST', url: '/api/auth/lock', cookie });
    expect((await call({ method: 'GET', url: '/api/auth/me', cookie })).status).toBe(401);
  });

  it('locks the profile after five wrong PINs, even for the right one', async () => {
    const id = await createProfile('Work', '1234');
    for (let i = 1; i <= 4; i++) {
      const res = await unlock(id, '0000');
      expect(res.status).toBe(401);
      expect(res.json.attemptsLeft).toBe(5 - i);
    }
    const fifth = await unlock(id, '0000');
    expect(fifth.status).toBe(423);
    expect(fifth.json.lockedUntil).toBeGreaterThan(Date.now());

    expect((await unlock(id, '1234')).status).toBe(423);

    // Once the lock expires the right PIN works and the counter resets.
    db.prepare('UPDATE profiles SET locked_until = ? WHERE id = ?').run(Date.now() - 1, id);
    expect((await unlock(id, '1234')).status).toBe(200);
    expect((await unlock(id, '0000')).json.attemptsLeft).toBe(4);
  });

  it('changes the PIN only with the current one', async () => {
    const id = await createProfile('Work', '1234');
    const { cookie } = await unlock(id, '1234');
    const wrong = await call({ method: 'POST', url: '/api/auth/change-pin', cookie, body: { oldPin: '9999', newPin: '5678' } });
    expect(wrong.status).toBe(403);
    const ok = await call({ method: 'POST', url: '/api/auth/change-pin', cookie, body: { oldPin: '1234', newPin: '5678' } });
    expect(ok.status).toBe(200);
    expect((await unlock(id, '1234')).status).toBe(401);
    expect((await unlock(id, '5678')).status).toBe(200);
  });

  it('resets a PIN with the admin key and signs existing sessions out', async () => {
    const id = await createProfile('Work', '1234');
    const { cookie } = await unlock(id, '1234');
    const res = await call({ method: 'POST', url: `/api/profiles/${id}/reset-pin`, body: { adminKey: ADMIN_KEY, pin: '4321' } });
    expect(res.status).toBe(200);
    expect((await call({ method: 'GET', url: '/api/auth/me', cookie })).status).toBe(401);
    expect((await unlock(id, '4321')).status).toBe(200);
  });
});

describe('habits and entries', () => {
  it('keeps each profile to its own habits and entries', async () => {
    const work = await unlock(await createProfile('Work', '1111'), '1111');
    const health = await unlock(await createProfile('Health', '2222'), '2222');

    const created = await call({ method: 'POST', url: '/api/habits', cookie: work.cookie, body: habit() });
    expect(created.status).toBe(201);
    const id = created.json.id;

    expect((await call({ method: 'GET', url: '/api/habits', cookie: health.cookie })).json).toEqual([]);
    expect((await call({ method: 'PATCH', url: `/api/habits/${id}`, cookie: health.cookie, body: { name: 'x' } })).status).toBe(404);
    expect((await call({ method: 'DELETE', url: `/api/habits/${id}`, cookie: health.cookie })).status).toBe(404);

    const foreign = await call({
      method: 'PUT',
      url: '/api/entries',
      cookie: health.cookie,
      body: { entries: [{ habitId: id, date: '2026-10-13', value: 1, updatedAt: 1000 }] },
    });
    expect(foreign.json.written).toBe(0);
    expect((await call({ method: 'GET', url: '/api/entries', cookie: work.cookie })).json).toEqual([]);
  });

  it('forces boolean habits to a target of 1 and keeps quantity targets', async () => {
    const { cookie } = await unlock(await createProfile('Health', '1234'), '1234');
    const read = await call({ method: 'POST', url: '/api/habits', cookie, body: habit({ target: 7 }) });
    expect(read.json.target).toBe(1);
    const water = await call({
      method: 'POST',
      url: '/api/habits',
      cookie,
      body: habit({ name: 'Water', type: 'quantity', target: 8, unit: 'glasses' }),
    });
    expect(water.json).toMatchObject({ type: 'quantity', target: 8, unit: 'glasses', sortOrder: 1 });
  });

  it('stores a monthly schedule and rejects impossible ones', async () => {
    const { cookie } = await unlock(await createProfile('Health', '1234'), '1234');
    const created = await call({ method: 'POST', url: '/api/habits', cookie, body: habit({ name: 'Budgeting', weekdays: 64, monthWeek: -1 }) });
    expect(created.json.monthWeek).toBe(-1);
    const weekly = await call({ method: 'PATCH', url: `/api/habits/${created.json.id}`, cookie, body: { monthWeek: null } });
    expect(weekly.json.monthWeek).toBeNull();
    expect((await call({ method: 'POST', url: '/api/habits', cookie, body: habit() })).json.monthWeek).toBeNull();
    expect((await call({ method: 'POST', url: '/api/habits', cookie, body: habit({ monthWeek: 5 }) })).status).toBe(400);
  });

  it('archives and restores a habit', async () => {
    const { cookie } = await unlock(await createProfile('Health', '1234'), '1234');
    const { json } = await call({ method: 'POST', url: '/api/habits', cookie, body: habit() });
    const archived = await call({ method: 'PATCH', url: `/api/habits/${json.id}`, cookie, body: { archived: true } });
    expect(archived.json.archivedAt).toBeTypeOf('number');
    const restored = await call({ method: 'PATCH', url: `/api/habits/${json.id}`, cookie, body: { archived: false } });
    expect(restored.json.archivedAt).toBeNull();
  });

  it('resolves conflicting entry writes by newest timestamp', async () => {
    const { cookie } = await unlock(await createProfile('Health', '1234'), '1234');
    const { json } = await call({ method: 'POST', url: '/api/habits', cookie, body: habit() });
    const put = (value: number, updatedAt: number) =>
      call({
        method: 'PUT',
        url: '/api/entries',
        cookie,
        body: { entries: [{ habitId: json.id, date: '2026-10-13', value, updatedAt }] },
      });

    await put(1, 2000);
    expect((await put(0, 1000)).json.written).toBe(0); // stale write from another device
    expect((await put(3, 3000)).json.written).toBe(1);

    const { json: entries } = await call({ method: 'GET', url: '/api/entries', cookie });
    expect(entries).toEqual([{ habitId: json.id, date: '2026-10-13', value: 3, updatedAt: 3000 }]);
  });

  it('exports a profile and imports it into another under new ids', async () => {
    const work = await unlock(await createProfile('Work', '1111'), '1111');
    const { json: created } = await call({ method: 'POST', url: '/api/habits', cookie: work.cookie, body: habit() });
    await call({
      method: 'PUT',
      url: '/api/entries',
      cookie: work.cookie,
      body: { entries: [{ habitId: created.id, date: '2026-10-13', value: 1, updatedAt: 1000 }] },
    });
    const { json: backup } = await call({ method: 'GET', url: '/api/export', cookie: work.cookie });

    const health = await unlock(await createProfile('Health', '2222'), '2222');
    const imported = await call({ method: 'POST', url: '/api/import', cookie: health.cookie, body: backup });
    expect(imported.json).toEqual({ habitsAdded: 1, entriesWritten: 1 });

    const { json: habits } = await call({ method: 'GET', url: '/api/habits', cookie: health.cookie });
    expect(habits[0].id).not.toBe(created.id);
    const { json: entries } = await call({ method: 'GET', url: '/api/entries', cookie: health.cookie });
    expect(entries[0].habitId).toBe(habits[0].id);

    // Importing the same file again changes nothing.
    const again = await call({ method: 'POST', url: '/api/import', cookie: work.cookie, body: backup });
    expect(again.json).toEqual({ habitsAdded: 0, entriesWritten: 0 });
  });
});

describe('reminders', () => {
  const endpoint = 'https://push.example/abc';
  // 08:00 on Tuesday 13 Oct 2026 in London (BST, UTC+1).
  const eightInLondon = new Date('2026-10-13T07:00:00Z');
  const sender = async (target: PushTarget, message: PushMessage) => void pushed.push({ target, message });

  async function setup(overrides: object = {}) {
    const { cookie } = await unlock(await createProfile('Health', '1234'), '1234');
    const { json } = await call({
      method: 'POST',
      url: '/api/habits',
      cookie,
      body: habit({ reminderTime: '08:00', ...overrides }),
    });
    const sub = await call({
      method: 'POST',
      url: '/api/push/subscribe',
      cookie,
      body: { endpoint, keys: { p256dh: 'p', auth: 'a' }, timezone: 'Europe/London' },
    });
    expect(sub.status).toBe(200);
    return { cookie, habitId: json.id as string };
  }

  it('reminds at the habit time in the device timezone', async () => {
    await setup();
    expect(await runReminders(db, sender, eightInLondon)).toBe(1);
    expect(pushed[0].message.title).toBe('📚 Read');
    // One minute later the reminder time has passed.
    expect(await runReminders(db, sender, new Date('2026-10-13T07:01:00Z'))).toBe(0);
  });

  it('stays quiet when the habit is already done or not scheduled today', async () => {
    const { cookie, habitId } = await setup();
    await call({
      method: 'PUT',
      url: '/api/entries',
      cookie,
      body: { entries: [{ habitId, date: '2026-10-13', value: 1, updatedAt: 1000 }] },
    });
    expect(await runReminders(db, sender, eightInLondon)).toBe(0);

    // Weekends only; the 13th is a Tuesday.
    await call({ method: 'PATCH', url: `/api/habits/${habitId}`, cookie, body: { weekdays: 0b1000001 } });
    await call({
      method: 'PUT',
      url: '/api/entries',
      cookie,
      body: { entries: [{ habitId, date: '2026-10-13', value: 0, updatedAt: 2000 }] },
    });
    expect(await runReminders(db, sender, eightInLondon)).toBe(0);
  });

  it('forgets subscriptions the push service reports as gone', async () => {
    await setup();
    const gone = async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    };
    expect(await runReminders(db, gone, eightInLondon)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()).toEqual({ n: 0 });
  });
});
