import type { Habit } from '@non-zero/shared';
import { goalOf } from '@non-zero/shared';

/** A colour softened into the sheet, so any stored habit colour reads as a pastel. */
export const pastel = (color: string, strength = 55) => `color-mix(in srgb, ${color} ${strength}%, var(--color-sheet))`;

/**
 * Fill for a habit's square on one day: its pastel when the goal is met, a
 * paler wash for a partial amount, nothing when untouched.
 */
export function fillFor(habit: Pick<Habit, 'color' | 'type' | 'target'>, value: number | undefined): string | undefined {
  const ratio = Math.min((value ?? 0) / goalOf(habit), 1);
  if (ratio <= 0) return undefined;
  return pastel(habit.color, ratio >= 1 ? 55 : 12 + Math.round(ratio * 22));
}
