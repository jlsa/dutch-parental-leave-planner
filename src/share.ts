import { defaultSettings, type Settings, type Vacation, type WeekPattern } from './plan';

// De planning wordt in het #-deel van de URL gezet. Dat deel wordt door de
// browser nooit naar een server gestuurd, dus de gegevens blijven bij wie de link opent.

const PREFIX = 'p=';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeSettings(s: Settings): string {
  return PREFIX + toBase64Url(JSON.stringify(s));
}

/** Leest een planning uit een URL-hash. Geeft null bij een ontbrekende of ongeldige planning. */
export function decodeSettings(hash: string): Settings | null {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(PREFIX)) return null;
  try {
    return sanitize(JSON.parse(fromBase64Url(raw.slice(PREFIX.length))));
  } catch {
    return null;
  }
}

/** Neem alleen geldige waarden over, de rest valt terug op de standaard. */
export function sanitize(input: unknown): Settings | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (typeof o.birthDate !== 'string' || !ISO.test(o.birthDate)) return null;

  const base = defaultSettings(o.birthDate);
  const date = (v: unknown, fallback: Settings['birthStart']) => (v === '' || (typeof v === 'string' && ISO.test(v)) ? v : fallback);
  const int = (v: unknown, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : fallback;
  const pattern = (v: unknown, fallback: WeekPattern): WeekPattern =>
    Array.isArray(v) && v.length === 7 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? (v.map((n) => Math.min(24, Math.max(0, n))) as WeekPattern)
      : fallback;
  const vacations: Vacation[] = Array.isArray(o.vacations)
    ? o.vacations.filter(
        (v): v is Vacation => !!v && typeof v === 'object' && ISO.test((v as Vacation).start) && ISO.test((v as Vacation).end),
      ).map(({ start, end }) => ({ start, end }))
    : [];

  return {
    birthDate: o.birthDate,
    work: pattern(o.work, base.work),
    skipHolidays: typeof o.skipHolidays === 'boolean' ? o.skipHolidays : base.skipHolidays,
    birthStart: date(o.birthStart, ''),
    extraWeeks: int(o.extraWeeks, 5, base.extraWeeks),
    extraPattern: pattern(o.extraPattern, base.extraPattern),
    extraStart: date(o.extraStart, ''),
    parentalWeeks: int(o.parentalWeeks, 9, base.parentalWeeks),
    parentalPattern: pattern(o.parentalPattern, base.parentalPattern),
    parentalStart: date(o.parentalStart, ''),
    vacations,
  };
}
