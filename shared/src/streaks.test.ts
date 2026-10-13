import { describe, expect, it } from 'vitest';
import { addDays, completion, computeStreaks, isScheduled, localParts, weekdayOf } from './index';

const daily = { type: 'boolean', target: 1, weekdays: 127 } as const;
const done = (...dates: string[]) => new Map(dates.map((d) => [d, 1]));

describe('dates', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('knows weekdays', () => {
    expect(weekdayOf('2026-10-13')).toBe(2); // Tuesday
  });

  it('resolves the local day in a timezone', () => {
    const instant = new Date('2026-10-13T23:30:00Z');
    expect(localParts('Europe/London', instant)).toEqual({ date: '2026-10-14', time: '00:30', weekday: 3 });
    expect(localParts('America/New_York', instant)).toEqual({ date: '2026-10-13', time: '19:30', weekday: 2 });
  });
});

describe('computeStreaks', () => {
  it('is zero with no entries', () => {
    expect(computeStreaks(daily, new Map(), '2026-10-13')).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days including today', () => {
    const values = done('2026-10-11', '2026-10-12', '2026-10-13');
    expect(computeStreaks(daily, values, '2026-10-13')).toEqual({ current: 3, longest: 3 });
  });

  it('keeps the streak alive while today is pending', () => {
    const values = done('2026-10-11', '2026-10-12');
    expect(computeStreaks(daily, values, '2026-10-13')).toEqual({ current: 2, longest: 2 });
  });

  it('resets after a missed day but remembers the longest run', () => {
    const values = done('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09');
    expect(computeStreaks(daily, values, '2026-10-09')).toEqual({ current: 1, longest: 3 });
    expect(computeStreaks(daily, values, '2026-10-11')).toEqual({ current: 0, longest: 3 });
  });

  it('skips unscheduled days', () => {
    // Monday, Wednesday, Friday
    const mwf = { ...daily, weekdays: 0b0101010 };
    expect(isScheduled(mwf, '2026-10-13')).toBe(false);
    const values = done('2026-10-09', '2026-10-12', '2026-10-14');
    expect(computeStreaks(mwf, values, '2026-10-15')).toEqual({ current: 3, longest: 3 });
  });

  it('schedules one week of the month', () => {
    const lastSaturday = { ...daily, weekdays: 1 << 6, monthWeek: -1 };
    expect(isScheduled(lastSaturday, '2026-10-24')).toBe(false);
    expect(isScheduled(lastSaturday, '2026-10-31')).toBe(true);
    expect(isScheduled(lastSaturday, '2026-11-28')).toBe(true);
    expect(isScheduled(lastSaturday, '2026-02-28')).toBe(true);

    const firstMonday = { ...daily, weekdays: 1 << 1, monthWeek: 1 };
    expect(isScheduled(firstMonday, '2026-10-05')).toBe(true);
    expect(isScheduled(firstMonday, '2026-10-12')).toBe(false);

    // A month between two done days does not break the streak.
    const values = done('2026-09-26', '2026-10-31');
    expect(computeStreaks(lastSaturday, values, '2026-11-10')).toEqual({ current: 2, longest: 2 });
  });

  it('needs the target for quantity habits', () => {
    const water = { type: 'quantity', target: 8, weekdays: 127 } as const;
    const values = new Map([
      ['2026-10-11', 8],
      ['2026-10-12', 5],
      ['2026-10-13', 9],
    ]);
    expect(computeStreaks(water, values, '2026-10-13')).toEqual({ current: 1, longest: 1 });
  });
});

describe('completion', () => {
  const habit = { ...daily, createdAt: new Date(2026, 9, 10).getTime() };

  it('ignores days before the habit was created and a pending today', () => {
    const values = done('2026-10-10', '2026-10-12');
    expect(completion(habit, values, '2026-10-13', 30)).toEqual({ done: 2, total: 3 });
  });

  it('counts missed days in back-filled history', () => {
    const values = done('2026-10-05', '2026-10-07');
    expect(completion(habit, values, '2026-10-13', 30)).toEqual({ done: 2, total: 8 });
  });

  it('counts today once done', () => {
    const values = done('2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13');
    expect(completion(habit, values, '2026-10-13', 7)).toEqual({ done: 4, total: 4 });
  });
});
