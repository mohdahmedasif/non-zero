import type { Habit } from '@non-zero/shared';
import { computeStreaks, goalOf, isDone, isScheduled } from '@non-zero/shared';
import { Link } from 'react-router-dom';
import { type Values, valuesOf } from '../api/queries';
import { fillFor } from '../lib/color';
import { formatNumber, percent } from '../lib/format';
import { isNonZero, stepOf } from '../lib/stats';
import { Sheet, Square, Stat } from '../ui';

interface Props {
  habits: Habit[];
  values: Values;
  today: string;
  onChange: (habitId: string, date: string, value: number) => void;
}

/** Beside the month sheet: today's list, running streaks and this month's totals. */
export function SummaryPanel({ habits, values, today, onChange }: Props) {
  const due = habits.filter((h) => isScheduled(h, today));
  const doneToday = due.filter((h) => isDone(h, valuesOf(values, h.id).get(today))).length;

  const streaks = habits
    .map((habit) => ({ habit, current: computeStreaks(habit, valuesOf(values, habit.id), today).current }))
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current);

  const elapsed = Number(today.slice(8));
  let nonZero = 0;
  let met = 0;
  let planned = 0;
  for (let d = 1; d <= elapsed; d++) {
    const day = `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
    if (isNonZero(habits, values, day)) nonZero++;
    for (const h of habits) {
      if (!isScheduled(h, day) || (day === today && !isDone(h, valuesOf(values, h.id).get(day)))) continue;
      planned++;
      if (isDone(h, valuesOf(values, h.id).get(day))) met++;
    }
  }

  return (
    <aside className="grid content-start gap-4 md:grid-cols-3 xl:grid-cols-1">
      <Sheet title="Today" aside={`${doneToday} of ${due.length}`} flush>
        <div className="h-1 bg-line">
          <div className="h-full bg-accent transition-[width]" style={{ width: due.length ? `${(doneToday / due.length) * 100}%` : 0 }} />
        </div>
        <ul>
          {due.map((habit) => {
            const value = valuesOf(values, habit.id).get(today) ?? 0;
            const done = isDone(habit, value);
            return (
              <li key={habit.id} className="flex h-11 items-center gap-3 border-b border-line px-4 last:border-b-0">
                <Square
                  size={22}
                  fill={fillFor(habit, value)}
                  checked={done}
                  label={habit.type === 'boolean' ? `${habit.name} done` : `Add to ${habit.name}`}
                  onClick={() =>
                    onChange(habit.id, today, habit.type === 'boolean' ? (done ? 0 : 1) : +(value + stepOf(goalOf(habit))).toFixed(2))
                  }
                />
                <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-muted line-through' : ''}`}>{habit.name}</span>
                {habit.type === 'quantity' && (
                  <span className="text-xs text-muted tabular-nums">
                    {formatNumber(value)}/{formatNumber(goalOf(habit))}
                  </span>
                )}
              </li>
            );
          })}
          {due.length === 0 && <li className="px-4 py-3 text-sm text-muted">Nothing scheduled today.</li>}
        </ul>
      </Sheet>

      <Sheet title="Streaks" flush>
        <ul>
          {streaks.slice(0, 6).map(({ habit, current }) => (
            <li key={habit.id}>
              <Link to={`/stats/${habit.id}`} className="flex h-11 items-center gap-3 border-b border-line px-4 text-sm hover:underline">
                <span aria-hidden>{habit.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{habit.name}</span>
                <span className="text-muted tabular-nums">
                  {current} day{current === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
          {streaks.length === 0 && <li className="px-4 py-3 text-sm text-muted">No streak running yet. Today can start one.</li>}
        </ul>
      </Sheet>

      <Sheet title="This month">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Non-zero days" value={`${nonZero}/${elapsed}`} />
          <Stat label="Goals met" value={percent(met, planned)} hint={`${met} of ${planned}`} />
        </div>
      </Sheet>
    </aside>
  );
}
