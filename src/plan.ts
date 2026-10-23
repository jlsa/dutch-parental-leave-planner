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
  /** Vakantieperiodes (losse dag: start = end). Op deze dagen wordt geen verlof verbruikt. */
  vacations: Vacation[];
  /** Tijdlijn: feestdagen als onderbreking tonen. */
  gapHolidays: boolean;
  /** Tijdlijn: dagen zonder verlof (weekenden, vrije dagen) als onderbreking tonen. */
  gapOffDays: boolean;
}

export interface Vacation {
  start: ISODate;
  end: ISODate;
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
  /** Vakantiedagen met de werkuren die ze kosten (0 op vrije dagen en feestdagen). */
  vacationDays: Map<ISODate, number>;
  vacationHours: number;
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
  vacations: [],
  gapHolidays: false,
  gapOffDays: false,
});

export function buildPlan(s: Settings): Plan {
  const weekHours = sum(s.work);
  const byDate: Plan['byDate'] = new Map();

  const vacationDays: Plan['vacationDays'] = new Map();
  for (const v of s.vacations ?? []) {
    const [from, to] = [v.start, v.end || v.start].sort();
    for (let date = from, i = 0; date <= to && i < MAX_DAYS; date = addDays(date, 1), i++) {
      const isFree = s.skipHolidays && holidayName(date);
      vacationDays.set(date, isFree ? 0 : s.work[weekday(date)]);
    }
  }

  const usedOn = (date: ISODate) => sum(Object.values(byDate.get(date) ?? {}));

  /** Verdeel `total` uren vanaf `start` volgens `pattern`, zonder boven de contracturen van een dag uit te komen. */
  function allocate(type: LeaveType, start: ISODate, total: number, pattern: WeekPattern): LeaveDay[] {
    const days: LeaveDay[] = [];
    let remaining = total;
    if (sum(pattern) <= 0) return days;
    for (let i = 0, date = start; remaining > 0.0001 && i < MAX_DAYS; i++, date = addDays(date, 1)) {
      const wd = weekday(date);
      if (s.skipHolidays && holidayName(date)) continue;
      if (vacationDays.has(date)) continue;
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
    vacationDays,
    vacationHours: sum([...vacationDays.values()]),
    allDone: ends.at(-1) ?? null,
  };
}

/**
 * Soort dag binnen de periode van een verlofsoort:
 * - leave: er wordt verlof opgenomen (of de dag telt mee als doorlopend verlof)
 * - vacation: vakantie, geen verlof
 * - holiday: feestdag op een werkdag
 * - none: geen verlof van deze soort (weekend, vrije dag of werkdag zonder verlofuren)
 */
export type RunKind = 'leave' | 'vacation' | 'holiday' | 'none';

export interface Run {
  kind: RunKind;
  start: ISODate;
  end: ISODate;
  days: number;
}

/**
 * Deelt de periode van een verlofsoort op in aaneengesloten stukken, zodat de tijdlijn
 * onderbrekingen kan tonen. Vakantie onderbreekt altijd; feestdagen en dagen zonder verlof
 * alleen als dat in de instellingen aanstaat, anders lopen ze door als verlof.
 */
export function blockRuns(plan: Plan, type: LeaveType, s: Settings): Run[] {
  const b = plan.blocks[type];
  if (!b.start || !b.end) return [];
  const runs: Run[] = [];
  for (let date = b.start; date <= b.end; date = addDays(date, 1)) {
    let kind: RunKind = 'leave';
    if (plan.byDate.get(date)?.[type]) kind = 'leave';
    else if (plan.vacationDays.has(date)) kind = 'vacation';
    else if (s.gapHolidays && s.skipHolidays && holidayName(date) && s.work[weekday(date)] > 0) kind = 'holiday';
    else if (s.gapOffDays) kind = 'none';
    const last = runs.at(-1);
    if (last && last.kind === kind) {
      last.end = date;
      last.days++;
    } else runs.push({ kind, start: date, end: date, days: 1 });
  }
  return runs;
}
