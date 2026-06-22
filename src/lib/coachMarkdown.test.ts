import { describe, expect, it } from 'vitest';
import { normalizeCoachMarkdown } from './coachMarkdown';

describe('normalizeCoachMarkdown', () => {
  it('converts escaped newlines into real Markdown lines', () => {
    expect(normalizeCoachMarkdown('สรุป\\n\\n### แผน\\n* วันที่ 1'))
      .toBe('สรุป\n\n### แผน\n* วันที่ 1');
  });

  it('supports escaped Windows line endings', () => {
    expect(normalizeCoachMarkdown('บรรทัดแรก\\r\\nบรรทัดสอง'))
      .toBe('บรรทัดแรก\nบรรทัดสอง');
  });

  it('does not alter ordinary backslashes', () => {
    expect(normalizeCoachMarkdown('ช่วงอัตราการเต้นหัวใจ 120\\130'))
      .toBe('ช่วงอัตราการเต้นหัวใจ 120\\130');
  });
});
