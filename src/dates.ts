// Datums worden overal als "YYYY-MM-DD" strings bewaard en in UTC gerekend,
// zodat zomer-/wintertijd nooit een dag verschuift.

export type ISODate = string;

export function parse(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function format(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const d = parse(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return format(d);
}

/** Dagen tussen twee datums (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Weekdag met maandag = 0 ... zondag = 6. */
export function weekday(iso: ISODate): number {
  return (parse(iso).getUTCDay() + 6) % 7;
}

const longFmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const fmtLong = (iso: ISODate) => longFmt.format(parse(iso));
export const fmtShort = (iso: ISODate) => shortFmt.format(parse(iso));
export const fmtMonth = (iso: ISODate) => monthFmt.format(parse(iso));
