import { describe, expect, it } from 'vitest';

import { formatWeeklyRange, previousCompletedWeek } from './weeklyReview';

describe('weekly review date helpers', () => {
  it('returns the previous completed Monday-to-Sunday week', () => {
    expect(previousCompletedWeek(new Date(2026, 5, 22, 10))).toEqual({
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
  });

  it('formats a readable Thai date range', () => {
    expect(formatWeeklyRange('2026-06-15', '2026-06-21')).toContain('15');
    expect(formatWeeklyRange('2026-06-15', '2026-06-21')).toContain('21');
  });
});
