import { addDays, format, type ISODate } from './dates';

/** Eerste Paasdag volgens het anonieme Gregoriaanse algoritme. */
function easter(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return format(new Date(Date.UTC(year, month - 1, day)));
}

/** Nederlandse officiële feestdagen. Bevrijdingsdag alleen in lustrumjaren (de gangbare CAO-regel). */
export function dutchHolidays(year: number): Map<ISODate, string> {
  const e = easter(year);
  const kingsDay = new Date(Date.UTC(year, 3, 27));
  if (kingsDay.getUTCDay() === 0) kingsDay.setUTCDate(26); // valt Koningsdag op zondag, dan zaterdag ervoor
  const list: [ISODate, string][] = [
    [`${year}-01-01`, 'Nieuwjaarsdag'],
    [e, 'Eerste Paasdag'],
    [addDays(e, 1), 'Tweede Paasdag'],
    [format(kingsDay), 'Koningsdag'],
    [addDays(e, 39), 'Hemelvaartsdag'],
    [addDays(e, 49), 'Eerste Pinksterdag'],
    [addDays(e, 50), 'Tweede Pinksterdag'],
    [`${year}-12-25`, 'Eerste Kerstdag'],
    [`${year}-12-26`, 'Tweede Kerstdag'],
  ];
  if (year % 5 === 0) list.push([`${year}-05-05`, 'Bevrijdingsdag']);
  return new Map(list);
}

export function holidayName(iso: ISODate): string | undefined {
  return dutchHolidays(Number(iso.slice(0, 4))).get(iso);
}
