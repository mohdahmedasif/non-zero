// Calendar days are "YYYY-MM-DD" strings and arithmetic is done in UTC, so
// daylight-saving shifts can never skip or repeat a day.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toDateStr(new Date());
}

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/**
 * Whether a date is the nth (1 to 4) occurrence of its weekday in its month,
 * or the last one for -1. Null means any week.
 */
export function inMonthWeek(date: string, monthWeek: number | null): boolean {
  if (monthWeek === null) return true;
  const [y, m, d] = date.split('-').map(Number);
  if (monthWeek === -1) return d + 7 > new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.ceil(d / 7) === monthWeek;
}

export interface LocalParts {
  date: string;
  time: string;
  weekday: number;
}

/** Wall-clock date, "HH:MM" and weekday of an instant in an IANA timezone. */
export function localParts(timeZone: string, now: Date = new Date()): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, time: `${get('hour')}:${get('minute')}`, weekday: weekdayOf(date) };
}
