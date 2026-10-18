import { type OpeningHours, WEEKDAYS, type Weekday } from '@tableos/schemas';

export const DEFAULT_TZ = 'Asia/Kolkata';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, tz: string = DEFAULT_TZ): ZonedParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday).slice(0, 3).toLowerCase() as Weekday,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM in the given timezone (spec: month key computed in Asia/Kolkata). */
export function monthKey(date: Date, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}`;
}

/** YYYY-MM-DD in the given timezone. Order numbers restart on this date. */
export function businessDate(date: Date, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * True when `date` falls in any interval. Intervals may cross midnight; such an interval
 * belongs to the day it opens on. Empty hours (nothing configured at all) means always open.
 */
export function isOpenAt(hours: Partial<OpeningHours> | null | undefined, date: Date, tz: string = DEFAULT_TZ): boolean {
  if (!hours || WEEKDAYS.every((d) => !hours[d] || hours[d]!.length === 0)) return true;
  const p = zonedParts(date, tz);
  const now = p.hour * 60 + p.minute;
  const todayIdx = WEEKDAYS.indexOf(p.weekday);
  const yesterday = WEEKDAYS[(todayIdx + 6) % 7]!;
  for (const iv of hours[p.weekday] ?? []) {
    const o = toMinutes(iv.open);
    const c = toMinutes(iv.close);
    if (o === c) return true; // 24h
    if (o < c ? now >= o && now < c : now >= o) return true;
  }
  for (const iv of hours[yesterday] ?? []) {
    const o = toMinutes(iv.open);
    const c = toMinutes(iv.close);
    if (o > c && now < c) return true;
  }
  return false;
}

const DAY_LABEL: Record<Weekday, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

function label12(hhmm: string): string {
  const [hS, mS] = hhmm.split(':');
  const h = Number(hS);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mS === '00' ? `${h12} ${suffix}` : `${h12}:${mS} ${suffix}`;
}

/** "Opens at 7 pm" / "Opens Tue at 11 am", or null if always open. */
export function nextOpenLabel(hours: Partial<OpeningHours> | null | undefined, date: Date, tz: string = DEFAULT_TZ): string | null {
  if (!hours || WEEKDAYS.every((d) => !hours[d] || hours[d]!.length === 0)) return null;
  const p = zonedParts(date, tz);
  const now = p.hour * 60 + p.minute;
  const idx = WEEKDAYS.indexOf(p.weekday);
  for (let offset = 0; offset < 7; offset++) {
    const day = WEEKDAYS[(idx + offset) % 7]!;
    const upcoming = (hours[day] ?? [])
      .map((iv) => iv.open)
      .filter((o) => offset > 0 || toMinutes(o) > now)
      .sort((a, b) => toMinutes(a) - toMinutes(b));
    if (upcoming[0]) {
      const when = label12(upcoming[0]);
      if (offset === 0) return `Opens at ${when}`;
      if (offset === 1) return `Opens tomorrow at ${when}`;
      return `Opens ${DAY_LABEL[day]} at ${when}`;
    }
  }
  return null;
}

/** Today's hours as a short label, e.g. "11 am – 3 pm, 7 pm – 11 pm". */
export function todayHoursLabel(hours: Partial<OpeningHours> | null | undefined, date: Date, tz: string = DEFAULT_TZ): string | null {
  if (!hours) return null;
  const p = zonedParts(date, tz);
  const list = hours[p.weekday] ?? [];
  if (list.length === 0) return WEEKDAYS.every((d) => !hours[d]?.length) ? null : 'Closed today';
  return list.map((iv) => `${label12(iv.open)} – ${label12(iv.close)}`).join(', ');
}

const IST_OFFSET_MS = 330 * 60 * 1000; // India has no DST

/** Instant at which the next calendar month starts in India (00:00 IST on the 1st). */
export function startOfNextMonthIST(date: Date): Date {
  const p = zonedParts(date, DEFAULT_TZ);
  const y = p.month === 12 ? p.year + 1 : p.year;
  const m = p.month === 12 ? 1 : p.month + 1;
  return new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS);
}

/** Indian financial year label for invoice numbering: Apr–Mar, e.g. "2026-27". */
export function financialYear(date: Date, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(date, tz);
  const start = p.month >= 4 ? p.year : p.year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
