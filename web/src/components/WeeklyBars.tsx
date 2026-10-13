import type { Habit } from '@non-zero/shared';
import { addDays, isDone, isScheduled, weekdayOf } from '@non-zero/shared';
import { useState } from 'react';
import { pastel } from '../lib/color';
import { formatDay } from '../lib/format';

const WEEKS = 12;

interface Props {
  habit: Habit;
  values: ReadonlyMap<string, number>;
  today: string;
}

/** Days the goal was met in each of the last twelve weeks. */
export function WeeklyBars({ habit, values, today }: Props) {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(monday, (i - (WEEKS - 1)) * 7);
    const days = Array.from({ length: 7 }, (_, d) => addDays(start, d)).filter((day) => day <= today);
    return {
      start,
      done: days.filter((day) => isDone(habit, values.get(day))).length,
      planned: days.filter((day) => isScheduled(habit, day)).length,
    };
  });
  const [focus, setFocus] = useState(WEEKS - 1);
  const week = weeks[focus];
  const weekOf = (start: string) => formatDay(start, { day: 'numeric', month: 'short' });

  return (
    <div className="max-w-xl">
      <p className="mb-3 text-sm" role="status">
        Week of {weekOf(week.start)}:{' '}
        <strong className="font-semibold">
          {week.done} of {week.planned}
        </strong>{' '}
        planned days
      </p>
      <div className="flex h-28 items-end gap-2 border-b border-line">
        {weeks.map((w, i) => (
          <button
            key={w.start}
            type="button"
            tabIndex={-1}
            title={`Week of ${weekOf(w.start)}: ${w.done} of ${w.planned}`}
            onMouseEnter={() => setFocus(i)}
            onClick={() => setFocus(i)}
            className="flex h-full flex-1 items-end justify-center"
          >
            <span
              className={`w-full max-w-6 rounded-t-[4px] border border-b-0 ${i === focus ? 'border-ink' : 'border-line'}`}
              // A stub keeps zero weeks visible and hoverable.
              style={{ height: w.done ? `${(w.done / 7) * 100}%` : '3px', background: w.done ? pastel(habit.color) : undefined }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{weekOf(weeks[0].start)}</span>
        <span>This week</span>
      </div>
    </div>
  );
}
