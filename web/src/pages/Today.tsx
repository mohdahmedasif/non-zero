import type { Habit } from '@non-zero/shared';
import { addDays, computeStreaks, goalOf, isDone, isScheduled, weekdayOf } from '@non-zero/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type Values, useHabits, useMoveHabit, useSetEntry, useToday, useValues, valuesOf } from '../api/queries';
import { MonthGrid } from '../components/MonthGrid';
import { SummaryPanel } from '../components/SummaryPanel';
import { fillFor } from '../lib/color';
import { dayTitle, formatDay, formatNumber } from '../lib/format';
import { isNonZero, stepOf } from '../lib/stats';
import { DropLine, Grip, useDragReorder } from '../lib/useDragReorder';
import { useMedia } from '../lib/useMedia';
import { Page, Sheet, Square } from '../ui';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function Today() {
  const today = useToday();
  const { data: habits, isPending } = useHabits();
  const values = useValues();
  const setEntry = useSetEntry();
  const moveHabit = useMoveHabit();
  const wide = useMedia('(min-width: 1024px)');
  const active = habits?.filter((h) => !h.archivedAt) ?? [];

  const addHabit = (
    <Link to="/habit/new" className="btn btn-primary">
      + Add habit
    </Link>
  );

  // Laptops get the whole month as a sheet; phones get one day.
  if (wide) {
    return (
      <Page title={formatDay(today, { weekday: 'long', day: 'numeric', month: 'long' })} actions={addHabit}>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.75rem]">
          <MonthGrid habits={active} values={values} today={today} loading={isPending} onChange={setEntry} onMove={moveHabit} />
          <SummaryPanel habits={active} values={values} today={today} onChange={setEntry} />
        </div>
      </Page>
    );
  }
  return <DaySheet habits={active} values={values} today={today} loading={isPending} onChange={setEntry} onMove={moveHabit} actions={addHabit} />;
}

interface DayProps {
  habits: Habit[];
  values: Values;
  today: string;
  loading: boolean;
  onChange: (habitId: string, date: string, value: number) => void;
  onMove: (habitId: string, targetId: string) => void;
  actions: React.ReactNode;
}

function DaySheet({ habits, values, today, loading, onChange, onMove, actions }: DayProps) {
  const [date, setDate] = useState(today);
  // The strip shows the seven days ending here.
  const [stripEnd, setStripEnd] = useState(today);
  const strip = Array.from({ length: 7 }, (_, i) => addDays(stripEnd, i - 6));

  const due = habits.filter((h) => isScheduled(h, date));
  const done = due.filter((h) => isDone(h, valuesOf(values, h.id).get(date))).length;
  const reorder = useDragReorder(
    due.map((h) => h.id),
    onMove,
  );
  const shift = (days: number) => {
    const end = addDays(stripEnd, days) > today ? today : addDays(stripEnd, days);
    setStripEnd(end);
    setDate(end);
  };

  return (
    <Page title={dayTitle(date, today)} actions={actions}>
      <div className="mb-4 grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))_2.5rem] items-center gap-1">
        <button type="button" className="btn btn-icon" onClick={() => shift(-7)} aria-label="Earlier week">
          ‹
        </button>
        {strip.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => setDate(day)}
            aria-pressed={day === date}
            aria-label={formatDay(day)}
            className={`flex h-14 flex-col items-center justify-center rounded-xl border text-sm tabular-nums ${
              day === date ? 'border-ink bg-ink text-sheet' : 'border-line bg-sheet'
            }`}
          >
            <span className={`text-[10px] ${day === date ? '' : 'text-muted'}`}>{WEEKDAY_INITIALS[weekdayOf(day)]}</span>
            {Number(day.slice(8))}
            <span className={`mt-0.5 size-1 rounded-full ${isNonZero(habits, values, day) ? (day === date ? 'bg-sheet' : 'bg-accent') : ''}`} />
          </button>
        ))}
        <button type="button" className="btn btn-icon" onClick={() => shift(7)} disabled={stripEnd === today} aria-label="Later week">
          ›
        </button>
      </div>

      <Sheet title={formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })} aside={due.length ? `${done} of ${due.length}` : undefined} flush>
        <ul>
          {due.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              reorder={reorder}
              value={valuesOf(values, habit.id).get(date) ?? 0}
              streak={computeStreaks(habit, valuesOf(values, habit.id), today).current}
              onChange={(value) => onChange(habit.id, date, value)}
            />
          ))}
        </ul>
        {!loading && due.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">{habits.length === 0 ? 'No habits yet. Add the first one above.' : 'Nothing scheduled for this day.'}</p>
        )}
      </Sheet>
    </Page>
  );
}

interface RowProps {
  habit: Habit;
  value: number;
  streak: number;
  onChange: (value: number) => void;
  reorder: ReturnType<typeof useDragReorder>;
}

function HabitRow({ habit, value, streak, onChange, reorder }: RowProps) {
  const done = isDone(habit, value);
  return (
    <li className={`relative flex h-16 items-center gap-2 border-b border-line pr-4 pl-1 last:border-b-0 ${reorder.dragging === habit.id ? 'opacity-40' : ''}`} {...reorder.row(habit.id)}>
      <DropLine at={reorder.marker(habit.id)} />
      <Grip label={`Reorder ${habit.name}`} className="h-full" {...reorder.grip(habit.id)} />
      <Link to={`/stats/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-6 text-center text-lg" aria-hidden>
          {habit.emoji}
        </span>
        <span className="min-w-0">
          <span className={`block truncate ${done ? 'text-muted line-through' : ''}`}>{habit.name}</span>
          <span className="hint block truncate">
            {[habit.type === 'quantity' && `Goal ${formatNumber(goalOf(habit))} ${habit.unit}`.trim(), streak > 0 && `${streak} day streak`]
              .filter(Boolean)
              .join(' · ') || 'No streak yet'}
          </span>
        </span>
      </Link>
      {habit.type === 'boolean' ? (
        <Square size={32} fill={fillFor(habit, value)} checked={done} label={`${habit.name} done`} onClick={() => onChange(done ? 0 : 1)} />
      ) : (
        <Stepper habit={habit} value={value} onChange={onChange} />
      )}
    </li>
  );
}

function Stepper({ habit, value, onChange }: Pick<RowProps, 'habit' | 'value' | 'onChange'>) {
  // Holds the text while the field is being edited; null shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const step = stepOf(goalOf(habit));

  const commit = () => {
    const typed = Number(draft);
    if (draft !== null && draft !== '' && Number.isFinite(typed) && typed >= 0) onChange(typed);
    setDraft(null);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Square size={32} label={`Less ${habit.name}`} disabled={value <= 0} dim={value <= 0} onClick={() => onChange(Math.max(0, +(value - step).toFixed(2)))}>
        −
      </Square>
      <input
        className="h-8 w-12 rounded-md border border-line text-center text-sm font-medium tabular-nums outline-none focus:border-ink"
        style={{ background: fillFor(habit, value) }}
        inputMode="decimal"
        aria-label={`${habit.name} amount`}
        value={draft ?? formatNumber(value)}
        onFocus={(e) => (setDraft(formatNumber(value)), e.target.select())}
        onChange={(e) => setDraft(e.target.value.replace(',', '.'))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <Square size={32} label={`More ${habit.name}`} onClick={() => onChange(+(value + step).toFixed(2))}>
        +
      </Square>
    </div>
  );
}
