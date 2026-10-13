import type { Entry, ExportFile } from '@non-zero/shared';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app';
import type { DB } from '../db';
import { type HabitRow, habitInput, toHabit } from './habits';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entry = z.object({
  habitId: z.string(),
  date,
  value: z.number().min(0).max(1_000_000),
  updatedAt: z.number().int().positive(),
});

const importFile = z.object({
  version: z.literal(1),
  habits: z
    .array(
      habitInput.extend({
        id: z.string(),
        sortOrder: z.number().int().default(0),
        archivedAt: z.number().nullable().default(null),
        createdAt: z.number().int().positive(),
      }),
    )
    .max(1000),
  entries: z.array(entry).max(500_000),
});

/** Last write wins per (habit, day); entries for habits outside the profile are dropped. */
function upsertEntries(db: DB, profileId: string, entries: Entry[]): number {
  const owned = new Set(
    (db.prepare('SELECT id FROM habits WHERE profile_id = ?').all(profileId) as { id: string }[]).map((h) => h.id),
  );
  const upsert = db.prepare(
    `INSERT INTO entries (habit_id, date, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (habit_id, date) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
     WHERE excluded.updated_at > entries.updated_at`,
  );
  // A device with a fast clock must not be able to win every future conflict.
  const ceiling = Date.now() + 60_000;
  let written = 0;
  db.transaction(() => {
    for (const e of entries) {
      if (!owned.has(e.habitId)) continue;
      written += upsert.run(e.habitId, e.date, e.value, Math.min(e.updatedAt, ceiling)).changes;
    }
  })();
  return written;
}

export function entryRoutes(app: FastifyInstance, { db }: Ctx): void {
  const entriesOf = (profileId: string, from = '0000-00-00') =>
    db
      .prepare(
        `SELECT e.habit_id AS habitId, e.date, e.value, e.updated_at AS updatedAt
         FROM entries e JOIN habits h ON h.id = e.habit_id
         WHERE h.profile_id = ? AND e.date >= ? ORDER BY e.date`,
      )
      .all(profileId, from) as Entry[];

  app.get('/api/entries', async (req) => {
    const { from } = z.object({ from: date.optional() }).parse(req.query);
    return entriesOf(req.profileId, from);
  });

  app.put('/api/entries', async (req) => {
    const { entries } = z.object({ entries: z.array(entry).max(5000) }).parse(req.body);
    return { written: upsertEntries(db, req.profileId, entries) };
  });

  app.get('/api/export', async (req): Promise<ExportFile> => {
    const profile = db.prepare('SELECT name, color, emoji FROM profiles WHERE id = ?').get(req.profileId) as ExportFile['profile'];
    const habits = db.prepare('SELECT * FROM habits WHERE profile_id = ? ORDER BY sort_order').all(req.profileId) as HabitRow[];
    return {
      version: 1,
      exportedAt: Date.now(),
      profile,
      habits: habits.map(toHabit),
      entries: entriesOf(req.profileId),
    };
  });

  // Merges a backup into the current profile. Habits already in this profile
  // are left as they are; habits from elsewhere are copied in under new ids.
  app.post('/api/import', async (req) => {
    const file = importFile.parse(req.body);
    const now = Date.now();
    const owner = db.prepare('SELECT profile_id FROM habits WHERE id = ?');
    const insert = db.prepare(
      `INSERT INTO habits (id, profile_id, name, emoji, color, type, target, unit, weekdays, month_week, reminder_time, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const idMap = new Map<string, string>();
    let habitsAdded = 0;

    db.transaction(() => {
      for (const h of file.habits) {
        const existing = owner.get(h.id) as { profile_id: string } | undefined;
        if (existing?.profile_id === req.profileId) {
          idMap.set(h.id, h.id);
          continue;
        }
        const id = existing ? crypto.randomUUID() : h.id;
        idMap.set(h.id, id);
        insert.run(
          id,
          req.profileId,
          h.name,
          h.emoji,
          h.color,
          h.type,
          h.type === 'boolean' ? 1 : h.target,
          h.unit,
          h.weekdays,
          h.monthWeek ?? null,
          h.reminderTime,
          h.sortOrder,
          h.archivedAt,
          h.createdAt,
          now,
        );
        habitsAdded++;
      }
    })();

    const entries = file.entries.flatMap((e) => {
      const habitId = idMap.get(e.habitId);
      return habitId ? [{ ...e, habitId }] : [];
    });
    return { habitsAdded, entriesWritten: upsertEntries(db, req.profileId, entries) };
  });
}
