import { describe, expect, it } from 'vitest';

import { mealTypeFromDate } from './mealTime';

describe('mealTypeFromDate', () => {
  it.each([
    [6, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [14, 'lunch'],
    [15, 'snack'],
    [16, 'snack'],
    [17, 'dinner'],
    [21, 'dinner'],
    [22, 'snack'],
    [2, 'snack'],
  ] as const)('maps hour %s to %s', (hour, expected) => {
    expect(mealTypeFromDate(new Date(2026, 5, 22, hour))).toBe(expected);
  });
});
