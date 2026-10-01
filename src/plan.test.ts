import { describe, expect, it } from 'vitest';
import { buildPlan, defaultSettings } from './plan';
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

  it('waarschuwt als ouderschapsverlof niet in het eerste jaar past', () => {
    const s = defaultSettings('2026-01-07');
    s.parentalPattern = [1, 0, 0, 0, 0, 0, 0];
    const p = buildPlan(s);
    expect(p.blocks.parental.checks.some((c) => !c.ok)).toBe(true);
  });
});
