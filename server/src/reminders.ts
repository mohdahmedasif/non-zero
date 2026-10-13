import { isDone, isScheduled, localParts } from '@non-zero/shared';
import webpush from 'web-push';
import type { Config } from './config';
import type { DB } from './db';
import type { HabitRow } from './routes/habits';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/** Rejects with a `statusCode` when the push service refuses the message. */
export type PushSender = (target: PushTarget, message: PushMessage) => Promise<void>;

export function webPushSender(vapid: Config['vapid']): PushSender {
  return async (target, message) => {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      { vapidDetails: vapid, TTL: 60 * 60 },
    );
  };
}

interface SubscriptionRow extends PushTarget {
  profile_id: string;
  timezone: string;
}

/**
 * Sends a reminder for every habit whose reminder time is the current minute
 * on the subscribed device's clock, is scheduled today and is not yet done.
 */
export async function runReminders(db: DB, push: PushSender, now = new Date()): Promise<number> {
  const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all() as SubscriptionRow[];
  const dueHabits = db.prepare(
    'SELECT * FROM habits WHERE profile_id = ? AND reminder_time = ? AND archived_at IS NULL',
  );
  const valueOn = db.prepare('SELECT value FROM entries WHERE habit_id = ? AND date = ?');
  const forget = db.prepare('DELETE FROM push_subscriptions WHERE profile_id = ? AND endpoint = ?');

  let sent = 0;
  for (const sub of subscriptions) {
    const local = localParts(sub.timezone, now);
    for (const habit of dueHabits.all(sub.profile_id, local.time) as HabitRow[]) {
      if (!isScheduled({ weekdays: habit.weekdays, monthWeek: habit.month_week }, local.date)) continue;
      const entry = valueOn.get(habit.id, local.date) as { value: number } | undefined;
      if (isDone(habit, entry?.value)) continue;
      try {
        await push(sub, { title: `${habit.emoji} ${habit.name}`, body: 'Not done yet today.', url: '/' });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser dropped this subscription; stop trying it.
        if (status === 404 || status === 410) forget.run(sub.profile_id, sub.endpoint);
      }
    }
  }
  return sent;
}

/** Runs `runReminders` once at the start of every minute. */
export function startReminders(db: DB, push: PushSender, onError: (err: unknown) => void): () => void {
  let timer: NodeJS.Timeout;
  const schedule = () => {
    timer = setTimeout(() => {
      runReminders(db, push).catch(onError);
      schedule();
    }, 60_000 - (Date.now() % 60_000) + 50);
  };
  schedule();
  return () => clearTimeout(timer);
}
