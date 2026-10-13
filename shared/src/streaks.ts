import { addDays, inMonthWeek, toDateStr, weekdayOf } from './dates';
import type { Habit } from './types';

type Schedule = Pick<Habit, 'weekdays'> & { monthWeek?: number | null };
type Goal = Pick<Habit, 'type' | 'target'>;

export const EVERY_DAY = 127;

export function isScheduled(habit: Schedule, date: string): boolean {
  const mask = habit.weekdays & EVERY_DAY || EVERY_DAY;
  return (mask & (1 << weekdayOf(date))) !== 0 && inMonthWeek(date, habit.monthWeek ?? null);
}

export function goalOf(habit: Goal): number {
  return habit.type === 'quantity' ? Math.max(habit.target, 1) : 1;
}

export function isDone(habit: Goal, value: number | undefined): boolean {
  return value !== undefined && value >= goalOf(habit);
}

export interface Streaks {
  current: number;
  longest: number;
}

/**
 * Streaks count consecutive scheduled days that met the goal. Unscheduled
 * days are skipped, and today does not break a streak while still pending.
 */
export function computeStreaks(
  habit: Schedule & Goal,
  values: ReadonlyMap<string, number>,
  today: string,
): Streaks {
  let start: string | undefined;
  for (const [date, value] of values) {
    if (isDone(habit, value) && (start === undefined || date < start)) start = date;
  }
  if (start === undefined || start > today) return { current: 0, longest: 0 };

  let run = 0;
  let longest = 0;
  for (let day = start; day <= today; day = addDays(day, 1)) {
    if (!isScheduled(habit, day)) continue;
    if (isDone(habit, values.get(day))) {
      run++;
      longest = Math.max(longest, run);
    } else if (day !== today) {
      run = 0;
    }
  }
  return { current: run, longest };
}

export interface Completion {
  done: number;
  total: number;
}

/**
 * Scheduled days met in the last `days` days. Counting starts when the habit
 * was created, or at its earliest entry if history was back-filled.
 */
export function completion(
  habit: Schedule & Goal & Pick<Habit, 'createdAt'>,
  values: ReadonlyMap<string, number>,
  today: string,
  days: number,
): Completion {
  let start = toDateStr(new Date(habit.createdAt));
  for (const date of values.keys()) if (date < start) start = date;

  let done = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (day < start) break;
    if (!isScheduled(habit, day)) continue;
    const met = isDone(habit, values.get(day));
    // Today is still in play, so it only counts once it is done.
    if (day === today && !met) continue;
    total++;
    if (met) done++;
  }
  return { done, total };
}
