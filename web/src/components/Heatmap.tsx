import type { Habit } from '@non-zero/shared';
import { addDays, goalOf, isScheduled, weekdayOf } from '@non-zero/shared';
import { useEffect, useRef, useState } from 'react';
import { fillFor } from '../lib/color';
import { describeValue, formatDay } from '../lib/format';
import { Square } from '../ui';

const WEEKS = 53;
const CELL = 14;

interface Props {
  habit: Habit;
  values: ReadonlyMap<string, number>;
  today: string;
}

/** A year of days as week columns, Monday at the top, newest on the right. */
export function Heatmap({ habit, values, today }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(today);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const start = addDays(monday, -(WEEKS - 1) * 7);
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)).filter((day) => day <= today),
  );

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px]">
          {weeks.map((days, w) => {
            const first = days[0];
            const newMonth = w === 0 || first.slice(5, 7) !== weeks[w - 1][0].slice(5, 7);
            return (
              <div key={first} className="flex flex-col gap-[3px]">
                <span className="h-4 overflow-visible text-[10px] leading-4 whitespace-nowrap text-muted" style={{ width: CELL }}>
                  {newMonth && formatDay(first, { month: 'short' })}
                </span>
                {days.map((day) => (
                  <span key={day} onMouseEnter={() => setFocus(day)} className="flex">
                    <Square
                      size={CELL}
                      fill={fillFor(habit, values.get(day))}
                      // Rest days are not misses, so they recede.
                      dim={!isScheduled(habit, day) && !values.get(day)}
                      selected={day === focus}
                      title={`${formatDay(day)}: ${describeValue(habit, values.get(day))}`}
                      onClick={() => setFocus(day)}
                    />
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted">
        <span className="text-sm text-ink" role="status">
          {formatDay(focus)}: {describeValue(habit, values.get(focus))}
          {!isScheduled(habit, focus) && ' (rest day)'}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          Missed
          <Square size={CELL} />
          {habit.type === 'quantity' && <Square size={CELL} fill={fillFor(habit, goalOf(habit) / 2)} />}
          <Square size={CELL} fill={fillFor(habit, goalOf(habit))} />
          Done
        </span>
      </div>
    </div>
  );
}
