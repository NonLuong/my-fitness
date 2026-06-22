import { describe, expect, it } from 'vitest';

import { cloudErrorMessage } from './cloudPersistence';

describe('cloudErrorMessage', () => {
  it('combines useful Supabase error fields without duplicates', () => {
    expect(cloudErrorMessage({
      message: 'permission denied',
      details: 'RLS policy blocked the write',
      hint: 'Check user_id',
    })).toBe('permission denied · RLS policy blocked the write · Check user_id');
  });

  it('falls back for unknown values', () => {
    expect(cloudErrorMessage(null)).toBe('เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
  });
});
