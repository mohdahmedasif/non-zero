import type { Habit } from '@non-zero/shared';
import { addDays, isDone } from '@non-zero/shared';
import { type Values, valuesOf } from '../api/queries';

/** Whether at least one habit met its goal on a day. */
export const isNonZero = (habits: Habit[], values: Values, day: string) =>
  habits.some((h) => isDone(h, valuesOf(values, h.id).get(day)));

/** Non-zero days: how many of the last 30, and the current run. */
export function nonZeroDays(habits: Habit[], values: Values, today: string) {
  let last30 = 0;
  for (let i = 0; i < 30; i++) if (isNonZero(habits, values, addDays(today, -i))) last30++;
  // Today only extends the run; it cannot break it until the day is over.
  let run = isNonZero(habits, values, today) ? 1 : 0;
  for (let day = addDays(today, -1); isNonZero(habits, values, day); day = addDays(day, -1)) run++;
  return { last30, run };
}

/** Size of one +/− press: small goals count by one, larger ones in sensible chunks. */
export const stepOf = (goal: number) => (goal <= 20 ? 1 : goal <= 100 ? 5 : Math.round(goal / 10));
