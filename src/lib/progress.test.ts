import { describe, expect, it } from 'vitest';

import {
  checkinStreak,
  cmToInches,
  inchesToCm,
  parseOptionalMetric,
  storedCircumferenceToInches,
  weightChange,
  type ProgressEntry,
} from './progress';

describe('progress helpers', () => {
  it('parses optional metrics with comma decimals', () => {
    expect(parseOptionalMetric('72,5')).toBe(72.5);
    expect(parseOptionalMetric('')).toBeNull();
  });

  it('calculates latest weight change', () => {
    const entries = [
      { date: '2026-06-22', measurement: { weightKg: 70 } },
      { date: '2026-06-21', measurement: { weightKg: 70.8 } },
    ] as ProgressEntry[];
    expect(weightChange(entries)).toBeCloseTo(-0.8);
  });

  it('converts body measurements between inches and centimeters', () => {
    expect(inchesToCm(38)).toBe(96.52);
    expect(cmToInches(96.52)).toBe(38);
    expect(inchesToCm(null)).toBeNull();
  });

  it('keeps plausible legacy inch entries instead of shrinking them again', () => {
    expect(storedCircumferenceToInches(38, 'waist')).toBe(38);
    expect(storedCircumferenceToInches(96.52, 'waist')).toBe(38);
    expect(storedCircumferenceToInches(12, 'arm')).toBe(12);
  });

  it('counts consecutive check-in days', () => {
    const entries = ['2026-06-22', '2026-06-21', '2026-06-20'].map((date) => ({
      date,
      measurement: null,
      checkin: { checkinDate: date },
    })) as ProgressEntry[];
    expect(checkinStreak(entries, '2026-06-22')).toBe(3);
  });
});
