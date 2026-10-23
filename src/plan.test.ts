import { describe, expect, it } from 'vitest';
import { blockRuns, buildPlan, defaultSettings } from './plan';
import { holidayName } from './holidays';

describe('buildPlan', () => {
  // Woensdag 7 januari 2026, geen feestdagen in de eerste weken
  const plan = buildPlan(defaultSettings('2026-01-07'));

  it('geeft 1 werkweek geboorteverlof op basis van contracturen', () => {
    const b = plan.blocks.birth;
    expect(b.totalHours).toBe(32);
    expect(b.start).toBe('2026-01-07');
    // wo, do, ma, di
    expect(b.end).toBe('2026-01-13');
    expect(b.checks.every((c) => c.ok)).toBe(true);
  });

  it('plant aanvullend verlof direct daarna, 5 weken', () => {
    const b = plan.blocks.extra;
    expect(b.totalHours).toBe(160);
    expect(b.start).toBe('2026-01-14');
    expect(b.usedHours).toBe(160);
    expect(b.end! <= b.deadline).toBe(true);
  });

  it('zet 9 weken ouderschapsverlof in als 2 uur per dag', () => {
    const b = plan.blocks.parental;
    expect(b.totalHours).toBe(288);
    expect(b.days.every((d) => d.hours === 2)).toBe(true);
    expect(b.days.length).toBe(144);
    expect(b.end! <= b.deadline).toBe(true);
  });

  it('slaat feestdagen over', () => {
    expect(holidayName('2026-04-06')).toBe('Tweede Paasdag');
    expect(plan.byDate.has('2026-04-06')).toBe(false);
  });

  it('verbruikt geen verlof op vakantiedagen en schuift het verlof door', () => {
    const s = defaultSettings('2026-01-07');
    // losse dag tijdens geboorteverlof + een week tijdens ouderschapsverlof
    s.vacations = [
      { start: '2026-01-08', end: '2026-01-08' },
      { start: '2026-05-04', end: '2026-05-10' },
    ];
    const p = buildPlan(s);
    expect(p.byDate.has('2026-01-08')).toBe(false);
    expect(p.blocks.birth.end).toBe('2026-01-14');
    expect(p.blocks.parental.usedHours).toBe(288);
    expect(p.vacationHours).toBe(8 + 32);
    expect(p.allDone! > plan.allDone!).toBe(true);
  });

  it('waarschuwt als ouderschapsverlof niet in het eerste jaar past', () => {
    const s = defaultSettings('2026-01-07');
    s.parentalPattern = [1, 0, 0, 0, 0, 0, 0];
    const p = buildPlan(s);
    expect(p.blocks.parental.checks.some((c) => !c.ok)).toBe(true);
  });
});

describe('blockRuns (tijdlijn)', () => {
  const base = () => {
    const s = defaultSettings('2026-01-07');
    s.vacations = [{ start: '2026-05-04', end: '2026-05-08' }];
    return s;
  };

  it('onderbreekt het verlof alleen bij vakantie als de schakelaars uit staan', () => {
    const s = base();
    const runs = blockRuns(buildPlan(s), 'parental', s);
    expect(runs.map((r) => r.kind)).toEqual(['leave', 'vacation', 'leave']);
    expect(runs[1]).toMatchObject({ start: '2026-05-04', end: '2026-05-08', days: 5 });
  });

  it('toont feestdagen op werkdagen als onderbreking als dat aanstaat', () => {
    const s = base();
    s.gapHolidays = true;
    const runs = blockRuns(buildPlan(s), 'parental', s);
    // Tweede Paasdag (ma 6 apr 2026) valt in het ouderschapsverlof
    expect(runs.find((r) => r.kind === 'holiday')).toMatchObject({ start: '2026-04-06', end: '2026-04-06' });
  });

  it('toont weekenden en vrije dagen als onderbreking als dat aanstaat', () => {
    const s = base();
    s.gapOffDays = true;
    const runs = blockRuns(buildPlan(s), 'birth', s);
    // wo 7 + do 8 jan verlof, vr–zo vrij, ma 12 + di 13 verlof
    expect(runs.map((r) => [r.kind, r.days])).toEqual([
      ['leave', 2],
      ['none', 3],
      ['leave', 2],
    ]);
  });
});
