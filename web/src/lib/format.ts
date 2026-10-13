import type { Habit } from '@non-zero/shared';
import { addDays, goalOf } from '@non-zero/shared';

const asDate = (day: string) => new Date(`${day}T00:00:00`);

export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return asDate(day).toLocaleDateString(undefined, options);
}

export function dayTitle(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatDay(day);
}

/** Up to two decimals, without trailing zeros. */
export const formatNumber = (n: number) => String(+n.toFixed(2));

/** "5 of 8 glasses", "Done" or "Not done" for a habit's value on one day. */
export function describeValue(habit: Habit, value: number | undefined): string {
  if (habit.type === 'boolean') return value ? 'Done' : 'Not done';
  return `${formatNumber(value ?? 0)} of ${formatNumber(goalOf(habit))}${habit.unit ? ` ${habit.unit}` : ''}`;
}

export const percent = (done: number, total: number) => (total ? `${Math.round((done / total) * 100)}%` : '–');
