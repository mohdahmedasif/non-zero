import { completion, computeStreaks } from '@non-zero/shared';
import { Link, useParams } from 'react-router-dom';
import { useHabits, useToday, useValues, valuesOf } from '../api/queries';
import { Heatmap } from '../components/Heatmap';
import { WeeklyBars } from '../components/WeeklyBars';
import { percent } from '../lib/format';
import { Page, Sheet, Stat } from '../ui';

export function StatsDetail() {
  const { id } = useParams();
  const today = useToday();
  const { data: habits, isPending } = useHabits();
  const values = useValues();
  const habit = habits?.find((h) => h.id === id);

  if (!habit) {
    return (
      <Page title="Stats" back>
        <p className="text-muted">{isPending ? 'Loading…' : 'This habit no longer exists.'}</p>
      </Page>
    );
  }

  const days = valuesOf(values, habit.id);
  const streaks = computeStreaks(habit, days, today);
  const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  return (
    <Page
      back
      title={
        <>
          {habit.emoji} {habit.name}
        </>
      }
      actions={
        <Link to={`/habit/${habit.id}`} className="btn">
          Edit
        </Link>
      }
    >
      <div className="grid gap-4">
        <Sheet>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Current streak" value={plural(streaks.current)} />
            <Stat label="Longest streak" value={plural(streaks.longest)} />
            {[7, 30, 90].map((span) => {
              const { done, total } = completion(habit, days, today, span);
              return <Stat key={span} label={`Last ${span} days`} value={percent(done, total)} hint={`${done} of ${total}`} />;
            })}
          </div>
        </Sheet>

        <Sheet title="Past year">
          <Heatmap habit={habit} values={days} today={today} />
        </Sheet>

        <Sheet title="Days done per week">
          <WeeklyBars habit={habit} values={days} today={today} />
        </Sheet>
      </div>
    </Page>
  );
}
