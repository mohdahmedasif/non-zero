import type { Habit } from '@non-zero/shared';
import { isDone, isScheduled, toDateStr, weekdayOf } from '@non-zero/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type Values, valuesOf } from '../api/queries';
import { fillFor } from '../lib/color';
import { describeValue, formatDay, formatNumber } from '../lib/format';
import { DropLine, Grip, useDragReorder } from '../lib/useDragReorder';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Height of a habit row; the day tiles are squares centred inside it.
const ROW = 'h-10';
const isWeekend = (day: string) => weekdayOf(day) % 6 === 0;

interface Props {
  habits: Habit[];
  values: Values;
  today: string;
  loading: boolean;
  onChange: (habitId: string, date: string, value: number) => void;
  /** Called when a habit's row is dragged onto another habit's row. */
  onMove: (habitId: string, targetId: string) => void;
}

/**
 * The month sheet: one row per habit, one square per day, like a paper habit
 * tracker. Every row uses the same column template, so squares line up into a
 * true grid. Click a square to tick it; amount habits open a small field.
 */
export function MonthGrid({ habits, values, today, loading, onChange, onMove }: Props) {
  const [monthsBack, setMonthsBack] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const reorder = useDragReorder(
    habits.map((h) => h.id),
    onMove,
  );

  const [year, month] = today.split('-').map(Number);
  const first = new Date(year, month - 1 - monthsBack, 1);
  const dayCount = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: dayCount }, (_, i) => toDateStr(new Date(first.getFullYear(), first.getMonth(), i + 1)));
  const elapsed = days.filter((day) => day <= today);

  const columns = { gridTemplateColumns: `13.5rem repeat(${dayCount}, minmax(1.375rem, 1fr)) 4rem` };
  // Rows are ruled; days are separate rounded tiles rather than boxed-in cells.
  const rule = 'border-b border-line';
  const todayMark = (day: string) => (day === today ? 'bg-accent/12' : '');

  return (
    <section className="sheet">
      <div className="flex h-[4.5rem] items-center gap-2 border-b border-line px-6">
        <h2 className="flex-1 font-display text-2xl tracking-[0.2em]">
          HABIT <span className="tracking-normal text-muted italic">tracker</span>
        </h2>
        <button type="button" className="btn btn-icon" onClick={() => setMonthsBack((m) => m + 1)} aria-label="Previous month">
          ‹
        </button>
        <span className="w-40 text-center font-display text-lg">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button type="button" className="btn btn-icon" onClick={() => setMonthsBack((m) => m - 1)} disabled={monthsBack === 0} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[60rem]" role="grid" aria-label="Habits by day">
          <div className="grid text-center text-[11px] text-muted" style={columns} role="row">
            <span className={`${rule} sticky left-0 z-10 flex items-end bg-sheet px-6 pb-2 text-xs font-semibold tracking-[0.14em] uppercase`}>Habit</span>
            {days.map((day) => (
              <span key={day} className={`${rule} pt-3 pb-2 leading-4 ${day === today ? 'bg-accent/12 font-bold text-ink' : isWeekend(day) ? 'bg-bg/60' : ''}`} role="columnheader">
                <span className="block">{WEEKDAY_INITIALS[weekdayOf(day)]}</span>
                {Number(day.slice(8))}
              </span>
            ))}
            <span className="flex items-end justify-center border-b border-line pb-2 text-xs font-semibold tracking-[0.14em] uppercase">Done</span>
          </div>

          {habits.map((habit) => {
            const row = valuesOf(values, habit.id);
            const done = elapsed.filter((day) => isDone(habit, row.get(day))).length;
            const planned = elapsed.filter((day) => isScheduled(habit, day)).length;
            return (
              <div key={habit.id} className={`group relative grid ${reorder.dragging === habit.id ? 'opacity-40' : ''}`} style={columns} role="row" {...reorder.row(habit.id)}>
                <DropLine at={reorder.marker(habit.id)} />
                <div className={`${rule} sticky left-0 z-10 flex items-center bg-sheet pr-2 pl-1 text-sm`}>
                  <Grip label={`Reorder ${habit.name}`} className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" {...reorder.grip(habit.id)} />
                  <Link to={`/stats/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline" title="Open stats">
                    <span className="w-5 shrink-0 text-center" aria-hidden>
                      {habit.emoji}
                    </span>
                    <span className="truncate">{habit.name}</span>
                  </Link>
                </div>
                {days.map((day) => {
                  const key = `${habit.id}|${day}`;
                  const value = row.get(day);
                  const label = `${habit.name}, ${formatDay(day)}: ${describeValue(habit, value)}`;
                  const tint = day === today ? todayMark(day) : isWeekend(day) ? 'bg-bg/60' : '';
                  if (day > today) return <span key={key} className={`${rule} ${ROW} ${tint}`} role="gridcell" />;
                  const met = isDone(habit, value);
                  const rest = !isScheduled(habit, day) && !value;
                  return (
                    <span key={key} className={`${rule} relative ${ROW} ${tint}`} role="gridcell">
                      <button
                        type="button"
                        title={label}
                        aria-label={label}
                        onClick={() => (habit.type === 'boolean' ? onChange(habit.id, day, met ? 0 : 1) : setEditing(key))}
                        className="absolute top-1/2 left-1/2 flex aspect-square w-[calc(100%-5px)] max-w-7 -translate-1/2 items-center justify-center rounded-md text-[10px] tabular-nums transition-shadow hover:shadow-[0_0_0_2px_var(--color-muted)]"
                        style={{
                          // Rest days are hatched rather than left looking like misses.
                          background: rest
                            ? 'repeating-linear-gradient(135deg, transparent 0 3px, var(--color-line) 3px 4px)'
                            : (fillFor(habit, value) ?? 'color-mix(in srgb, var(--color-line) 55%, var(--color-sheet))'),
                        }}
                      >
                        {habit.type === 'quantity' && value && !met ? formatNumber(value) : ''}
                      </button>
                      {editing === key && (
                        <input
                          autoFocus
                          aria-label={label}
                          inputMode="decimal"
                          defaultValue={value ? formatNumber(value) : ''}
                          className="absolute top-1/2 left-1/2 z-20 h-9 w-16 -translate-1/2 rounded-xl border border-ink bg-sheet text-center text-sm shadow-lg outline-none"
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const typed = Number(e.target.value.replace(',', '.'));
                            if (e.target.value !== '' && Number.isFinite(typed) && typed >= 0 && typed !== (value ?? 0)) onChange(habit.id, day, typed);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') {
                              e.currentTarget.value = '';
                              e.currentTarget.blur();
                            }
                          }}
                        />
                      )}
                    </span>
                  );
                })}
                <span className="flex items-center justify-center border-b border-line text-sm text-muted tabular-nums">
                  {done}/{planned}
                </span>
              </div>
            );
          })}

          {habits.length > 0 && (
            <div className="grid text-center text-[11px] text-muted tabular-nums" style={columns} role="row">
              <span className="sticky left-0 z-10 flex items-center bg-sheet px-6 text-xs">Habits done</span>
              {days.map((day) => (
                <span key={day} className={`py-3 ${day === today ? 'bg-accent/12' : isWeekend(day) ? 'bg-bg/60' : ''}`}>
                  {day <= today ? habits.filter((h) => isDone(h, valuesOf(values, h.id).get(day))).length || '·' : ''}
                </span>
              ))}
              <span />
            </div>
          )}
        </div>
      </div>

      {!loading && habits.length === 0 && (
        <p className="p-10 text-center text-muted">
          No habits yet.{' '}
          <Link to="/habit/new" className="text-ink underline underline-offset-4">
            Add the first one
          </Link>
          .
        </p>
      )}
    </section>
  );
}
