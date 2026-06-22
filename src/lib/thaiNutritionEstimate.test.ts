import { describe, expect, it } from 'vitest';
import { preprocessThaiMeal } from './thaiMealPreprocess';
import { estimateThaiMeal, hasCompleteThaiEstimate } from './thaiNutritionEstimate';

describe('Thai standard serving nutrition estimates', () => {
  it('estimates chicken basil rice with one fried egg without asking for grams', () => {
    const parsed = preprocessThaiMeal('กะเพราไก่ + ไข่ดาว 1 ฟอง');
    const results = estimateThaiMeal(parsed);

    expect(results).toHaveLength(2);
    expect(results[0]?.itemName).toBe('ข้าวกะเพราไก่');
    expect(results[0]?.caloriesKcal).toBeGreaterThan(500);
    expect(results[1]?.itemName).toBe('ไข่ดาว');
    expect(results[1]?.caloriesKcal).toBeGreaterThan(100);
    expect(hasCompleteThaiEstimate(parsed, results)).toBe(true);
  });

  it('distinguishes pork basil from chicken basil', () => {
    const chicken = estimateThaiMeal(preprocessThaiMeal('กะเพราไก่'))[0];
    const pork = estimateThaiMeal(preprocessThaiMeal('กะเพราหมู'))[0];

    expect(chicken?.itemName).toBe('ข้าวกะเพราไก่');
    expect(pork?.itemName).toBe('ข้าวกะเพราหมู');
    expect(pork!.fatG).toBeGreaterThan(chicken!.fatG);
  });

  it('supports common one-plate meals', () => {
    for (const meal of ['ข้าวมันไก่', 'ข้าวผัดหมู', 'ผัดไทย', 'ผัดซีอิ๊ว', 'ราดหน้า']) {
      expect(estimateThaiMeal(preprocessThaiMeal(meal))).toHaveLength(1);
    }
  });
});
