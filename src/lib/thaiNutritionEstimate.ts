import type { ParsedItem, PreprocessResult } from './thaiMealPreprocess';

export type ThaiNutritionEstimate = {
  itemName: string;
  assumedServing: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string[];
  vitaminsAndMinerals?: string[];
  healthBenefits?: string;
  warnings?: string;
  funFact?: string;
};

type NutritionProfile = Omit<ThaiNutritionEstimate, 'itemName' | 'assumedServing' | 'notes'> & {
  label: string;
  serving: string;
  baselineGrams?: number;
  note: string;
};

function profile(
  label: string,
  serving: string,
  macros: [number, number, number, number],
  extra: Partial<NutritionProfile> = {},
): NutritionProfile {
  return {
    label,
    serving,
    caloriesKcal: macros[0],
    proteinG: macros[1],
    carbsG: macros[2],
    fatG: macros[3],
    confidence: 'medium',
    note: 'ประมาณจากปริมาณมาตรฐานของร้านอาหารทั่วไป สูตรและปริมาณน้ำมันอาจทำให้ค่าคลาดเคลื่อน',
    ...extra,
  };
}

const PROFILES: Array<{ match: (name: string) => boolean; value: NutritionProfile }> = [
  {
    match: (n) => /ข้าวกะเพรา.*ไก่|กะเพราไก่/.test(n),
    value: profile('ข้าวกะเพราไก่', '1 จานมาตรฐาน (~350–400 กรัม)', [620, 30, 78, 20], {
      baselineGrams: 375,
      fiberG: 4,
      sodiumMg: 1_200,
      vitaminsAndMinerals: ['วิตามินบี', 'ธาตุเหล็ก', 'โพแทสเซียม'],
      healthBenefits: 'ให้โปรตีนจากไก่และพลังงานสำหรับกิจกรรมประจำวัน',
      warnings: 'โซเดียมและน้ำมันอาจสูง ค่าจริงขึ้นกับเครื่องปรุงและวิธีผัด',
    }),
  },
  {
    match: (n) => /ข้าวกะเพรา.*หมู|กะเพราหมู/.test(n),
    value: profile('ข้าวกะเพราหมู', '1 จานมาตรฐาน (~350–400 กรัม)', [680, 27, 78, 28], {
      baselineGrams: 375,
      fiberG: 4,
      sodiumMg: 1_250,
      vitaminsAndMinerals: ['วิตามินบี 1', 'ธาตุเหล็ก', 'สังกะสี'],
      warnings: 'ไขมันและโซเดียมอาจสูง โดยเฉพาะเมื่อใช้หมูติดมัน',
    }),
  },
  {
    match: (n) => /ข้าวกะเพรา|กะเพรา/.test(n),
    value: profile('ข้าวกะเพราราดข้าว', '1 จานมาตรฐาน (~350–400 กรัม)', [650, 27, 78, 24], {
      baselineGrams: 375,
      fiberG: 4,
      sodiumMg: 1_200,
      warnings: 'ประมาณจากเนื้อสัตว์ทั่วไป หากเป็นหมูกรอบหรือเนื้อติดมัน พลังงานจะสูงกว่านี้',
    }),
  },
  {
    match: (n) => /ไข่ดาว/.test(n),
    value: profile('ไข่ดาว', '1 ฟอง ทอดแบบร้านอาหารทั่วไป', [180, 7, 1, 16], {
      baselineGrams: 55,
      confidence: 'high',
      sodiumMg: 180,
      vitaminsAndMinerals: ['วิตามินเอ', 'วิตามินบี 12', 'ซีลีเนียม'],
      note: 'รวมไข่ไก่และน้ำมันที่ดูดซึมจากการทอดโดยประมาณ',
    }),
  },
  {
    match: (n) => /ไข่ต้ม/.test(n),
    value: profile('ไข่ต้ม', '1 ฟอง', [75, 7, 1, 5], {
      baselineGrams: 55,
      confidence: 'high',
      sodiumMg: 70,
      vitaminsAndMinerals: ['วิตามินเอ', 'วิตามินบี 12', 'ซีลีเนียม'],
      note: 'ประมาณจากไข่ไก่ขนาดมาตรฐาน',
    }),
  },
  {
    match: (n) => /ข้าวไข่เจียว/.test(n),
    value: profile('ข้าวไข่เจียว', '1 จาน (ข้าวและไข่เจียวแบบร้านทั่วไป)', [610, 17, 72, 28], {
      baselineGrams: 320,
      sodiumMg: 850,
      warnings: 'พลังงานขึ้นกับจำนวนไข่และน้ำมันที่ใช้ทอด',
    }),
  },
  {
    match: (n) => /ไข่เจียว/.test(n),
    value: profile('ไข่เจียว', '1 ที่ (ประมาณ 1–2 ฟอง)', [250, 12, 3, 21], {
      baselineGrams: 100,
      sodiumMg: 500,
      warnings: 'น้ำมันที่ใช้ทอดเป็นแหล่งพลังงานหลักของเมนูนี้',
    }),
  },
  {
    match: (n) => /ข้าวมันไก่/.test(n),
    value: profile('ข้าวมันไก่', '1 จานมาตรฐาน พร้อมน้ำจิ้ม', [620, 28, 76, 22], {
      baselineGrams: 400,
      sodiumMg: 1_150,
      warnings: 'ข้าวมันและหนังไก่เพิ่มไขมัน ส่วนน้ำจิ้มเพิ่มโซเดียมและน้ำตาล',
    }),
  },
  {
    match: (n) => /ข้าวผัด/.test(n),
    value: profile('ข้าวผัด', '1 จานมาตรฐาน', [650, 20, 85, 24], {
      baselineGrams: 400,
      fiberG: 3,
      sodiumMg: 1_100,
      warnings: 'ชนิดเนื้อสัตว์และน้ำมันทำให้พลังงานแตกต่างกันได้มาก',
    }),
  },
  {
    match: (n) => /ผัดไทย/.test(n),
    value: profile('ผัดไทย', '1 จานมาตรฐาน', [600, 20, 85, 20], {
      baselineGrams: 350,
      fiberG: 4,
      sugarG: 12,
      sodiumMg: 1_000,
      warnings: 'ซอสผัดไทยอาจมีน้ำตาลและโซเดียมค่อนข้างสูง',
    }),
  },
  {
    match: (n) => /ราดหน้า/.test(n),
    value: profile('ราดหน้า', '1 จานมาตรฐาน', [520, 22, 75, 15], {
      baselineGrams: 450,
      fiberG: 4,
      sodiumMg: 1_200,
    }),
  },
  {
    match: (n) => /ผัดซีอิ๊ว/.test(n),
    value: profile('ผัดซีอิ๊ว', '1 จานมาตรฐาน', [650, 24, 82, 25], {
      baselineGrams: 400,
      fiberG: 4,
      sodiumMg: 1_300,
      warnings: 'ซีอิ๊วและเครื่องปรุงอาจทำให้โซเดียมสูง',
    }),
  },
  {
    match: (n) => /ก๋วยเตี๋ยว.*น้ำ|ก๋วยเตี๋ยวน้ำ/.test(n),
    value: profile('ก๋วยเตี๋ยวน้ำ', '1 ชามมาตรฐาน', [400, 20, 58, 10], {
      baselineGrams: 500,
      sodiumMg: 1_500,
      warnings: 'น้ำซุปและเครื่องปรุงเพิ่มเติมเป็นแหล่งโซเดียมหลัก',
    }),
  },
  {
    match: (n) => /ก๋วยเตี๋ยว.*แห้ง|ก๋วยเตี๋ยวแห้ง/.test(n),
    value: profile('ก๋วยเตี๋ยวแห้ง', '1 ชามมาตรฐาน', [470, 21, 62, 15], {
      baselineGrams: 350,
      sodiumMg: 1_250,
    }),
  },
  {
    match: (n) => /ส้มตำ/.test(n),
    value: profile('ส้มตำไทย', '1 จานมาตรฐาน', [160, 4, 30, 3], {
      baselineGrams: 250,
      fiberG: 5,
      sugarG: 16,
      sodiumMg: 1_100,
      vitaminsAndMinerals: ['วิตามินซี', 'โพแทสเซียม', 'วิตามินเอ'],
      warnings: 'น้ำปลาเพิ่มโซเดียม และน้ำตาลขึ้นกับสูตรของร้าน',
    }),
  },
  {
    match: (n) => /ข้าวสวย|^ข้าว$/.test(n),
    value: profile('ข้าวสวย', '1 จาน/ถ้วยมาตรฐาน (~200 กรัม)', [260, 5, 57, 1], {
      baselineGrams: 200,
      confidence: 'high',
      sodiumMg: 5,
      note: 'ประมาณจากข้าวสวยสุกหนึ่งส่วนมาตรฐาน',
    }),
  },
  {
    match: (n) => /เวย์โปรตีน|เวย์|whey/i.test(n),
    value: profile('เวย์โปรตีน', '1 สกู๊ปมาตรฐาน', [120, 24, 3, 2], {
      baselineGrams: 30,
      confidence: 'high',
      note: 'ค่าจริงขึ้นกับฉลากโภชนาการของแต่ละยี่ห้อ',
    }),
  },
];

function explicitGrams(raw: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*(?:กรัม|g\b)/i.exec(raw);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function multiplierFor(item: ParsedItem, matched: NutritionProfile): number {
  const grams = explicitGrams(item.raw);
  if (grams && matched.baselineGrams) return grams / matched.baselineGrams;
  return Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1;
}

function roundMacro(value: number): number {
  return Math.max(0, Math.round(value));
}

export function estimateThaiMeal(preprocessed: PreprocessResult | null): ThaiNutritionEstimate[] {
  if (!preprocessed) return [];

  const results: ThaiNutritionEstimate[] = [];
  for (const item of preprocessed.items) {
    const normalizedName = item.name.trim().toLowerCase();
    const matched = PROFILES.find((entry) => entry.match(normalizedName))?.value;
    if (!matched) continue;

    const multiplier = multiplierFor(item, matched);
    const grams = explicitGrams(item.raw);
    results.push({
      itemName: matched.label,
      assumedServing: grams
        ? `${Math.round(grams)} กรัม`
        : multiplier === 1
          ? matched.serving
          : `${item.qty} ${item.unit ?? (matched.serving.includes('ชาม') ? 'ชาม' : 'ที่')}`,
      caloriesKcal: roundMacro(matched.caloriesKcal * multiplier),
      proteinG: roundMacro(matched.proteinG * multiplier),
      carbsG: roundMacro(matched.carbsG * multiplier),
      fatG: roundMacro(matched.fatG * multiplier),
      fiberG: matched.fiberG === undefined ? undefined : roundMacro(matched.fiberG * multiplier),
      sugarG: matched.sugarG === undefined ? undefined : roundMacro(matched.sugarG * multiplier),
      sodiumMg: matched.sodiumMg === undefined ? undefined : roundMacro(matched.sodiumMg * multiplier),
      confidence: grams ? 'high' : matched.confidence,
      notes: [matched.note],
      vitaminsAndMinerals: matched.vitaminsAndMinerals,
      healthBenefits: matched.healthBenefits,
      warnings: matched.warnings,
      funFact: matched.funFact,
    });
  }

  return results;
}

export function hasCompleteThaiEstimate(
  preprocessed: PreprocessResult | null,
  estimates: ThaiNutritionEstimate[],
): boolean {
  return Boolean(
    preprocessed
    && preprocessed.items.length > 0
    && estimates.length === preprocessed.items.length,
  );
}
