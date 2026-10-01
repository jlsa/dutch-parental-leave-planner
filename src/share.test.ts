import { describe, expect, it } from 'vitest';
import { defaultSettings } from './plan';
import { decodeSettings, encodeSettings, sanitize } from './share';

describe('deelbare link', () => {
  it('zet een planning heen en terug om zonder verlies', () => {
    const s = defaultSettings('2026-10-01');
    s.parentalPattern = [3, 3, 0, 3, 0, 0, 0];
    s.extraStart = '2026-11-02';
    s.vacations = [{ start: '2026-12-21', end: '2027-01-01' }];
    expect(decodeSettings(`#${encodeSettings(s)}`)).toEqual(s);
  });

  it('negeert hashes die geen planning zijn', () => {
    expect(decodeSettings('')).toBeNull();
    expect(decodeSettings('#iets-anders')).toBeNull();
    expect(decodeSettings('#p=%%%kapot')).toBeNull();
  });

  it('vervangt ongeldige waarden door de standaard', () => {
    const s = sanitize({
      birthDate: '2026-10-01',
      work: [8, 8],
      extraWeeks: 12,
      parentalPattern: [-1, 30, 2, 2, 0, 0, 0],
      birthStart: '<script>',
      vacations: [{ start: '2027-01-01', end: '2027-01-02' }, { start: 'x' }],
    })!;
    expect(s.work).toEqual(defaultSettings('2026-10-01').work);
    expect(s.extraWeeks).toBe(5);
    expect(s.parentalPattern).toEqual([0, 24, 2, 2, 0, 0, 0]);
    expect(s.birthStart).toBe('');
    expect(s.vacations).toHaveLength(1);
  });

  it('weigert een planning zonder geldige geboortedatum', () => {
    expect(sanitize({ birthDate: 'gisteren' })).toBeNull();
  });
});
