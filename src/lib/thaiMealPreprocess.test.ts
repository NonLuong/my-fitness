import { describe, expect, it } from 'vitest';
import { preprocessThaiMeal } from './thaiMealPreprocess';

describe('preprocessThaiMeal (Thai free-text parser)', () => {
  it('splits implicit combo: กะเพราไก่ ไข่ 2 ฟอง', () => {
    const r = preprocessThaiMeal('กะเพราไก่ ไข่ 2 ฟอง');

    expect(r.items).toHaveLength(2);
    expect(r.items[0]?.name).toContain('ข้าวกะเพรา');
    expect(r.items[0]?.qty).toBe(1);

    expect(r.items[1]?.name).toContain('ไข่');
    expect(r.items[1]?.qty).toBe(2);
    expect(r.items[1]?.unit).toBe('ฟอง');
  });

  it('normalizes whey alias + scoop unit', () => {
    const r = preprocessThaiMeal('เวย์ 1 สกู๊ป');

    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.name).toContain('เวย์โปรตีน');
    expect(r.items[0]?.qty).toBe(1);
    expect(r.items[0]?.unit).toBe('สกู๊ป');
  });

  it('splits on separators', () => {
    const r = preprocessThaiMeal('ข้าวมันไก่ + น้ำอัดลม 1 กระป๋อง');

    expect(r.items).toHaveLength(2);
    expect(r.items[0]?.name).toContain('ข้าวมันไก่');
    expect(r.items[1]?.name).toContain('น้ำอัดลม');
    expect(r.items[1]?.qty).toBe(1);
    expect(r.items[1]?.unit).toBe('กระป๋อง');
  });

  it('keeps verbose text but still extracts grams + eggs', () => {
    const r = preprocessThaiMeal(
      'ข้าวกระเพราไก่ ปริมาณประมาณ 500 กรัม ไก่ประมาณ 100 กรัม มีไข่ดาว 2 ฟอง ผัดด้วยน้ำมันมะกอกและเครื่องปรุงรสลดโซเดียม',
    );

    expect(r.items.some((x) => x.name.includes('ข้าวกะเพรา'))).toBe(true);
    const egg = r.items.find((x) => x.name.includes('ไข่') && x.unit === 'ฟอง');
    expect(egg?.qty).toBe(2);
  });
});
// NOTE:
// This repo doesn't use Vitest/Jest. This file is intentionally kept as a no-op
// to avoid TypeScript errors from an editor tab that might still be open.
//
// Use the lightweight script instead:
//   npm run check:thai
export {};
