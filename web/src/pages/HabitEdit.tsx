import type { Habit, HabitInput } from '@non-zero/shared';
import { EVERY_DAY } from '@non-zero/shared';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useDeleteHabit, useHabits, useSaveHabit } from '../api/queries';
import { COLORS, LookPicker } from '../components/LookPicker';
import { pastel } from '../lib/color';
import { Confirm, FormRow, Page, Sheet, Square } from '../ui';

const HABIT_EMOJIS = ['✅', '💧', '📚', '🏃', '🧘', '🥗', '😴', '✍️', '💊', '🎸'];
// Monday first; the number is the weekday bit (0 = Sunday).
const WEEKDAYS: [label: string, bit: number][] = [
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
  ['Sun', 0],
];

const MONTH_WEEKS: [value: number | null, label: string][] = [
  [null, 'Every week'],
  [1, 'First week of the month'],
  [2, 'Second week of the month'],
  [3, 'Third week of the month'],
  [4, 'Fourth week of the month'],
  [-1, 'Last week of the month'],
];

export function HabitEdit() {
  const { id } = useParams();
  const { data: habits, isPending } = useHabits();
  const habit = habits?.find((h) => h.id === id);

  if (id && !habit) {
    return (
      <Page title="Edit habit" back narrow>
        <p className="text-muted">{isPending ? 'Loading…' : 'This habit no longer exists.'}</p>
      </Page>
    );
  }
  return <HabitForm key={id ?? 'new'} habit={habit} />;
}

function HabitForm({ habit }: { habit?: Habit }) {
  const navigate = useNavigate();
  const save = useSaveHabit();
  const remove = useDeleteHabit();
  const [form, setForm] = useState<HabitInput>({
    name: habit?.name ?? '',
    emoji: habit?.emoji ?? HABIT_EMOJIS[0],
    color: habit?.color ?? COLORS[0],
    type: habit?.type ?? 'boolean',
    target: habit?.type === 'quantity' ? habit.target : 8,
    unit: habit?.unit ?? '',
    weekdays: habit?.weekdays ?? EVERY_DAY,
    monthWeek: habit?.monthWeek ?? null,
    reminderTime: habit?.reminderTime ?? null,
  });
  const patch = (changes: Partial<HabitInput>) => setForm((f) => ({ ...f, ...changes }));
  const error = save.error ?? remove.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ id: habit?.id, ...form }, { onSuccess: () => navigate(-1) });
  };
  const archive = () => save.mutate({ id: habit!.id, archived: !habit!.archivedAt }, { onSuccess: () => navigate('/') });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const destroy = () => remove.mutate(habit!.id, { onSuccess: () => navigate('/'), onError: () => setConfirmingDelete(false) });

  return (
    <Page title={habit ? 'Edit habit' : 'New habit'} back narrow>
      <form onSubmit={submit} className="grid gap-4">
        <Sheet>
          <div className="grid gap-5">
            <FormRow label="Name">
              <input className="field" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Drink water" maxLength={60} required autoFocus={!habit} />
            </FormRow>

            <LookPicker emoji={form.emoji} color={form.color} emojis={HABIT_EMOJIS} onChange={patch} />

            <FormRow label="Track as" group>
              <span className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['boolean', 'Done or not', 'Tick it off once a day'],
                    ['quantity', 'An amount', 'Count towards a daily goal'],
                  ] as const
                ).map(([type, title, hint]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={form.type === type}
                    onClick={() => patch({ type })}
                    className={`rounded-xl border px-3 py-2 text-left ${form.type === type ? 'border-ink' : 'border-line'}`}
                  >
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="hint block">{hint}</span>
                  </button>
                ))}
              </span>
            </FormRow>

            {form.type === 'quantity' && (
              <FormRow label="Daily goal" group>
                <span className="grid grid-cols-2 gap-2">
                  <input className="field" type="number" min="0.01" step="any" aria-label="Daily goal" value={form.target || ''} onChange={(e) => patch({ target: Number(e.target.value) })} required />
                  <input className="field" aria-label="Unit" value={form.unit} onChange={(e) => patch({ unit: e.target.value })} placeholder="glasses, minutes…" maxLength={20} />
                </span>
              </FormRow>
            )}

            <FormRow label="Days" group hint={form.weekdays === 0 ? 'Pick at least one day.' : undefined}>
              <span className="flex flex-wrap gap-2">
                {WEEKDAYS.map(([label, bit]) => {
                  const on = (form.weekdays & (1 << bit)) !== 0;
                  return (
                    <Square key={label} size={40} fill={on ? pastel(form.color) : undefined} selected={on} label={label} onClick={() => patch({ weekdays: form.weekdays ^ (1 << bit) })}>
                      <span className={on ? '' : 'text-muted'}>{label}</span>
                    </Square>
                  );
                })}
              </span>
            </FormRow>

            <FormRow label="Repeats" hint={form.monthWeek !== null && 'Only the chosen days that fall in that week of each month.'}>
              <select className="field" value={form.monthWeek ?? ''} onChange={(e) => patch({ monthWeek: e.target.value === '' ? null : Number(e.target.value) })}>
                {MONTH_WEEKS.map(([value, label]) => (
                  <option key={label} value={value ?? ''}>
                    {label}
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow
              label="Reminder"
              group
              hint={form.reminderTime !== null && 'Sent only if the habit is not done yet. Turn reminders on in Settings on each device that should get it.'}
            >
              <span className="flex items-center gap-2">
                <Square size={40} checked={form.reminderTime !== null} selected={form.reminderTime !== null} label="Remind me" onClick={() => patch({ reminderTime: form.reminderTime === null ? '08:00' : null })} />
                {form.reminderTime === null ? (
                  <span className="text-sm text-muted">Off</span>
                ) : (
                  <input className="field !w-32" type="time" aria-label="Reminder time" value={form.reminderTime} onChange={(e) => patch({ reminderTime: e.target.value || '08:00' })} required />
                )}
              </span>
            </FormRow>
          </div>
        </Sheet>

        {error && <p className="text-sm text-danger">{errorMessage(error)}</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={save.isPending || form.weekdays === 0}>
            {habit ? 'Save changes' : 'Add habit'}
          </button>
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
          {habit && (
            <>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={archive}>
                {habit.archivedAt ? 'Restore' : 'Archive'}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            </>
          )}
        </div>
      </form>

      {confirmingDelete && (
        <Confirm title={`Delete "${habit!.name}"?`} confirmLabel="Delete" busy={remove.isPending} onConfirm={destroy} onCancel={() => setConfirmingDelete(false)}>
          This removes the habit and all of its history, on every device. It cannot be undone. To hide it and keep the history, archive it instead.
        </Confirm>
      )}
    </Page>
  );
}
