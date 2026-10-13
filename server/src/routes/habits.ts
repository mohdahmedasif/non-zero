import type { Habit } from '@non-zero/shared';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app';

export const habitInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  emoji: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  type: z.enum(['boolean', 'quantity']),
  target: z.number().positive().max(1_000_000),
  unit: z.string().trim().max(20),
  weekdays: z.number().int().min(1, 'Pick at least one day').max(127),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});

const habitPatch = habitInput.partial().extend({ archived: z.boolean().optional() });

export interface HabitRow {
  id: string;
  profile_id: string;
  name: string;
  emoji: string;
  color: string;
  type: Habit['type'];
  target: number;
  unit: string;
  weekdays: number;
  reminder_time: string | null;
  sort_order: number;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    type: row.type,
    target: row.target,
    unit: row.unit,
    weekdays: row.weekdays,
    reminderTime: row.reminder_time,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function habitRoutes(app: FastifyInstance, { db }: Ctx): void {
  const find = (id: string, profileId: string) =>
    db.prepare('SELECT * FROM habits WHERE id = ? AND profile_id = ?').get(id, profileId) as HabitRow | undefined;

  app.get('/api/habits', async (req) => {
    const rows = db
      .prepare('SELECT * FROM habits WHERE profile_id = ? ORDER BY sort_order, created_at')
      .all(req.profileId) as HabitRow[];
    return rows.map(toHabit);
  });

  app.post('/api/habits', async (req, reply) => {
    const body = habitInput.parse(req.body);
    const id = crypto.randomUUID();
    const now = Date.now();
    const { next } = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM habits WHERE profile_id = ?')
      .get(req.profileId) as { next: number };
    db.prepare(
      `INSERT INTO habits (id, profile_id, name, emoji, color, type, target, unit, weekdays, reminder_time, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.profileId,
      body.name,
      body.emoji,
      body.color,
      body.type,
      body.type === 'boolean' ? 1 : body.target,
      body.unit,
      body.weekdays,
      body.reminderTime,
      next,
      now,
      now,
    );
    return reply.code(201).send(toHabit(find(id, req.profileId)!));
  });

  app.patch('/api/habits/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = find(id, req.profileId);
    if (!row) return reply.code(404).send({ error: 'Habit not found' });

    const { archived, ...patch } = habitPatch.parse(req.body);
    const next = { ...toHabit(row), ...patch };
    const archivedAt = archived === undefined ? row.archived_at : archived ? (row.archived_at ?? Date.now()) : null;
    db.prepare(
      `UPDATE habits SET name = ?, emoji = ?, color = ?, type = ?, target = ?, unit = ?, weekdays = ?,
         reminder_time = ?, archived_at = ?, updated_at = ? WHERE id = ?`,
    ).run(
      next.name,
      next.emoji,
      next.color,
      next.type,
      next.type === 'boolean' ? 1 : next.target,
      next.unit,
      next.weekdays,
      next.reminderTime,
      archivedAt,
      Date.now(),
      id,
    );
    return toHabit(find(id, req.profileId)!);
  });

  app.put('/api/habits/order', async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(500) }).parse(req.body);
    const update = db.prepare('UPDATE habits SET sort_order = ? WHERE id = ? AND profile_id = ?');
    db.transaction(() => ids.forEach((id, index) => update.run(index, id, req.profileId)))();
    return { ok: true };
  });

  app.delete('/api/habits/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = db.prepare('DELETE FROM habits WHERE id = ? AND profile_id = ?').run(id, req.profileId);
    if (!result.changes) return reply.code(404).send({ error: 'Habit not found' });
    return { ok: true };
  });
}
