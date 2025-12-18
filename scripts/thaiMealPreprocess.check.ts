import { preprocessThaiMeal } from '../src/lib/thaiMealPreprocess';

type Case = {
  input: string;
  expectItems: Array<Partial<{ nameIncludes: string; qty: number; unit: string }>>;
};

const cases: Case[] = [
  {
    input: 'กะเพราไก่ ไข่ 2 ฟอง',
    expectItems: [
      { nameIncludes: 'ข้าวกะเพรา', qty: 1 },
      { nameIncludes: 'ไข่', qty: 2, unit: 'ฟอง' },
    ],
  },
  {
    input: 'เวย์ 1 สกู๊ป',
    expectItems: [{ nameIncludes: 'เวย์โปรตีน', qty: 1, unit: 'สกู๊ป' }],
  },
  {
    input: 'ข้าวมันไก่ + น้ำอัดลม 1 กระป๋อง',
    expectItems: [{ nameIncludes: 'ข้าวมันไก่' }, { nameIncludes: 'น้ำอัดลม', qty: 1, unit: 'กระป๋อง' }],
  },
];

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

for (const c of cases) {
  const r = preprocessThaiMeal(c.input);

  if (r.items.length !== c.expectItems.length) {
    fail(
      `FAIL: "${c.input}" expected ${c.expectItems.length} items but got ${r.items.length}\n` +
        JSON.stringify(r, null, 2),
    );
  }

  c.expectItems.forEach((exp, i) => {
    const got = r.items[i];
    if (!got) fail(`FAIL: missing item[${i}] for "${c.input}"`);

    if (exp.nameIncludes && !got.name.includes(exp.nameIncludes)) {
      fail(`FAIL: item[${i}] name "${got.name}" missing "${exp.nameIncludes}"`);
    }

    if (typeof exp.qty === 'number' && got.qty !== exp.qty) {
      fail(`FAIL: item[${i}] qty ${got.qty} !== ${exp.qty}`);
    }

    if (exp.unit && got.unit !== exp.unit) {
      fail(`FAIL: item[${i}] unit ${got.unit ?? '(none)'} !== ${exp.unit}`);
    }
  });
}

console.log('OK: thaiMealPreprocess.check.ts');
