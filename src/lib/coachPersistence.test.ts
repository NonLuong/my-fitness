import { describe, expect, it } from 'vitest';
import { MAX_COACH_MESSAGES } from './coachPersistence';

describe('coach persistence constants', () => {
  it('keeps a bounded but useful chat history', () => {
    expect(MAX_COACH_MESSAGES).toBeGreaterThanOrEqual(50);
    expect(MAX_COACH_MESSAGES).toBeLessThanOrEqual(200);
  });
});
