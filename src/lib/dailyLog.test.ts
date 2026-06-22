import { describe, expect, it } from 'vitest';
import { localDateKey, safeParseJson, sumFiniteNonNegative } from './dailyLog';

describe('daily log helpers', () => {
  it('builds a date key from local calendar fields', () => {
    const date = new Date(2026, 0, 2, 0, 30);
    expect(localDateKey(date)).toBe('2026-01-02');
  });

  it('returns null for corrupt JSON', () => {
    expect(safeParseJson('{broken')).toBeNull();
  });

  it('sums only finite non-negative values', () => {
    expect(sumFiniteNonNegative([12, null, -3, Number.NaN, 8])).toBe(20);
  });
});
