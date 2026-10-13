import { completion, computeStreaks } from '@non-zero/shared';
import { Link } from 'react-router-dom';
import { useHabits, useToday, useValues, valuesOf } from '../api/queries';
import { percent } from '../lib/format';
import { nonZeroDays } from '../lib/stats';
import { Page, Sheet, Stat } from '../ui';

// One column template for the header and every row keeps the numbers in line.
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-x-4 px-4 sm:grid-cols-[minmax(0,1fr)_repeat(5,5rem)]';
const WIDE_ONLY = 'hidden sm:block';

export function Stats() {
  const today = useToday();
  const { data: habits = [] } = useHabits();
  const values = useValues();
  const active = habits.filter((h) => !h.archivedAt);
  const { last30, run } = nonZeroDays(active, values, today);

  return (
    <Page title="Stats">
      <Sheet className="mb-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Non-zero streak" value={run} />
          <Stat label="Non-zero, last 30" value={`${last30}/30`} />
          <Stat label="Habits" value={active.length} />
        </div>
      </Sheet>

      <Sheet title="Habits" flush>
        <div className={`${COLUMNS} h-9 border-b border-line text-right text-xs text-muted`}>
          <span className="text-left">Habit</span>
          <span>Streak</span>
          <span className={WIDE_ONLY}>Best</span>
          <span className={WIDE_ONLY}>7 days</span>
          <span>30 days</span>
          <span className={WIDE_ONLY}>90 days</span>
        </div>
        {active.map((habit) => {
          const days = valuesOf(values, habit.id);
          const streaks = computeStreaks(habit, days, today);
          const rate = (span: number) => {
            const { done, total } = completion(habit, days, today, span);
            return percent(done, total);
          };
          return (
            <Link key={habit.id} to={`/stats/${habit.id}`} className={`${COLUMNS} h-12 border-b border-line text-right text-sm tabular-nums last:border-b-0 hover:bg-bg/40`}>
              <span className="flex min-w-0 items-center gap-3 text-left text-base">
                <span className="w-6 text-center" aria-hidden>
                  {habit.emoji}
                </span>
                <span className="truncate">{habit.name}</span>
              </span>
              <span>{streaks.current}</span>
              <span className={WIDE_ONLY}>{streaks.longest}</span>
              <span className={WIDE_ONLY}>{rate(7)}</span>
              <span>{rate(30)}</span>
              <span className={WIDE_ONLY}>{rate(90)}</span>
            </Link>
          );
        })}
        {active.length === 0 && <p className="p-6 text-center text-sm text-muted">Add a habit to see its stats here.</p>}
      </Sheet>
    </Page>
  );
}
