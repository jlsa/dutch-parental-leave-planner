import { addDays, addMonths, diffDays, weekday, type ISODate } from './dates';
import { holidayName } from './holidays';

export type LeaveType = 'birth' | 'extra' | 'parental';

/** Uren per weekdag, maandag t/m zondag. */
export type WeekPattern = [number, number, number, number, number, number, number];

export interface Settings {
  birthDate: ISODate;
  /** Contracturen per weekdag. */
  work: WeekPattern;
  skipHolidays: boolean;
  /** Startdatum geboorteverlof; leeg = op de geboortedatum. */
  birthStart: ISODate | '';
  /** Aantal weken aanvullend geboorteverlof (0–5). */
  extraWeeks: number;
  /** Verlofuren per weekdag tijdens aanvullend verlof (standaard = volledig vrij). */
  extraPattern: WeekPattern;
  extraStart: ISODate | '';
  /** Aantal betaalde weken ouderschapsverlof (max 9). */
  parentalWeeks: number;
  /** Uren per weekdag die je minder werkt tijdens ouderschapsverlof. */
  parentalPattern: WeekPattern;
  parentalStart: ISODate | '';
}

export interface LeaveDay {
  date: ISODate;
  hours: number;
}

export interface Check {
  ok: boolean;
  text: string;
}

export interface Block {
  type: LeaveType;
  totalHours: number;
  usedHours: number;
  start: ISODate | null;
  end: ISODate | null;
  /** Laatste dag waarop dit verlof opgenomen mag worden. */
  deadline: ISODate;
  days: LeaveDay[];
  hoursPerWeek: number;
  checks: Check[];
}

export interface Plan {
  birthDate: ISODate;
  weekHours: number;
  blocks: Record<LeaveType, Block>;
  /** Per datum: verlofuren per soort. */
  byDate: Map<ISODate, Partial<Record<LeaveType, number>>>;
  allDone: ISODate | null;
}

export const LABELS: Record<LeaveType, string> = {
  birth: 'Geboorteverlof',
  extra: 'Aanvullend geboorteverlof',
  parental: 'Betaald ouderschapsverlof',
};

const sum = (p: number[]) => p.reduce((a, b) => a + b, 0);
const MAX_DAYS = 3 * 366;

export const defaultSettings = (birthDate: ISODate): Settings => ({
  birthDate,
  work: [8, 8, 8, 8, 0, 0, 0],
  skipHolidays: true,
  birthStart: '',
  extraWeeks: 5,
  extraPattern: [8, 8, 8, 8, 0, 0, 0],
  extraStart: '',
  parentalWeeks: 9,
  parentalPattern: [2, 2, 2, 2, 0, 0, 0],
  parentalStart: '',
});

export function buildPlan(s: Settings): Plan {
  const weekHours = sum(s.work);
  const byDate: Plan['byDate'] = new Map();

  const usedOn = (date: ISODate) => sum(Object.values(byDate.get(date) ?? {}));

  /** Verdeel `total` uren vanaf `start` volgens `pattern`, zonder boven de contracturen van een dag uit te komen. */
  function allocate(type: LeaveType, start: ISODate, total: number, pattern: WeekPattern): LeaveDay[] {
    const days: LeaveDay[] = [];
    let remaining = total;
    if (sum(pattern) <= 0) return days;
    for (let i = 0, date = start; remaining > 0.0001 && i < MAX_DAYS; i++, date = addDays(date, 1)) {
      const wd = weekday(date);
      if (s.skipHolidays && holidayName(date)) continue;
      const room = Math.max(0, s.work[wd] - usedOn(date));
      const hours = Math.min(pattern[wd], room, remaining);
      if (hours <= 0) continue;
      remaining -= hours;
      days.push({ date, hours });
      byDate.set(date, { ...byDate.get(date), [type]: hours });
    }
    return days;
  }

  function block(type: LeaveType, totalHours: number, start: ISODate, deadline: ISODate, pattern: WeekPattern): Block {
    const days = totalHours > 0 ? allocate(type, start, totalHours, pattern) : [];
    const usedHours = sum(days.map((d) => d.hours));
    return {
      type,
      totalHours,
      usedHours,
      start: days[0]?.date ?? null,
      end: days.at(-1)?.date ?? null,
      deadline,
      days,
      hoursPerWeek: Math.min(sum(pattern), weekHours),
      checks: [],
    };
  }

  const birth = s.birthDate;
  const nextDay = (d: ISODate | null, fallback: ISODate) => (d ? addDays(d, 1) : fallback);

  const b1 = block('birth', weekHours, s.birthStart || birth, addDays(birth, 27), s.work);
  const b2 = block('extra', s.extraWeeks * weekHours, s.extraStart || nextDay(b1.end, birth), addDays(addMonths(birth, 6), -1), s.extraPattern);
  const b3 = block(
    'parental',
    s.parentalWeeks * weekHours,
    s.parentalStart || nextDay(b2.end ?? b1.end, birth),
    addDays(addMonths(birth, 12), -1),
    s.parentalPattern,
  );

  for (const b of [b1, b2, b3]) {
    if (b.totalHours === 0) continue;
    if (b.start && b.start < birth) b.checks.push({ ok: false, text: 'Begint vóór de geboortedatum' });
    if (b.usedHours < b.totalHours - 0.0001)
      b.checks.push({ ok: false, text: 'Kan niet volledig worden ingepland: controleer de uren per dag' });
    else if (b.end && b.end > b.deadline)
      b.checks.push({ ok: false, text: `Loopt ${diffDays(b.deadline, b.end)} dagen over de deadline heen` });
    else if (b.end) b.checks.push({ ok: true, text: `Klaar ${diffDays(b.end, b.deadline)} dagen vóór de deadline` });
  }
  if (b2.start && b1.end && b2.start <= b1.end)
    b2.checks.unshift({ ok: false, text: 'Geboorteverlof moet eerst helemaal zijn opgenomen' });

  const ends = [b1.end, b2.end, b3.end].filter((d): d is ISODate => !!d).sort();
  return {
    birthDate: birth,
    weekHours,
    blocks: { birth: b1, extra: b2, parental: b3 },
    byDate,
    allDone: ends.at(-1) ?? null,
  };
}
