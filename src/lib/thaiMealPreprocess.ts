export type NormalizedUnit =
  | 'ฟอง'
  | 'ลูก'
  | 'จาน'
  | 'ชาม'
  | 'ถ้วย'
  | 'ช้อนโต๊ะ'
  | 'ช้อนชา'
  | 'กรัม'
  | 'กก'
  | 'มล'
  | 'ลิตร'
  | 'ขวด'
  | 'กระป๋อง'
  | 'ซอง'
  | 'กล่อง'
  | 'สกู๊ป'
  | 'ชิ้น'
  | 'เสิร์ฟ';

export type ParsedQty = {
  qty: number;
  unit?: NormalizedUnit;
};

export type ParsedItem = {
  /** Cleaned name without qty tokens */
  name: string;
  /** Qty parsed from the segment (default 1 if missing) */
  qty: number;
  /** Optional unit (ฟอง/จาน/สกู๊ป...) */
  unit?: NormalizedUnit;
  /** Original segment text */
  raw: string;
  /** Extra hints like "เพิ่มไข่ดาว" */
  modifiers?: string[];
};

export type PreprocessResult = {
  normalizedText: string;
  items: ParsedItem[];
  warnings: string[];
};

const THAI_NUM_WORDS: Record<string, number> = {
  ศูนย์: 0,
  หนึ่ง: 1,
  นึง: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
  สิบ: 10,
};

const UNIT_ALIASES: Array<{ re: RegExp; unit: NormalizedUnit }> = [
  { re: /ฟอง/gi, unit: 'ฟอง' },
  { re: /ลูก/gi, unit: 'ลูก' },
  { re: /จาน/gi, unit: 'จาน' },
  { re: /ชาม/gi, unit: 'ชาม' },
  { re: /ถ้วย|แก้ว/gi, unit: 'ถ้วย' },
  { re: /ช้อนโต๊ะ|tbsp/gi, unit: 'ช้อนโต๊ะ' },
  { re: /ช้อนชา|tsp/gi, unit: 'ช้อนชา' },
  { re: /กรัม|g\b/gi, unit: 'กรัม' },
  { re: /กก|kg\b/gi, unit: 'กก' },
  { re: /มล|ml\b/gi, unit: 'มล' },
  { re: /ลิตร|l\b/gi, unit: 'ลิตร' },
  { re: /ขวด/gi, unit: 'ขวด' },
  { re: /กระป๋อง/gi, unit: 'กระป๋อง' },
  { re: /ซอง/gi, unit: 'ซอง' },
  { re: /กล่อง/gi, unit: 'กล่อง' },
  { re: /สกู๊ป|สกุป|scoop/gi, unit: 'สกู๊ป' },
  { re: /ชิ้น/gi, unit: 'ชิ้น' },
];

const COMMON_ALIASES: Array<{ re: RegExp; to: string }> = [
  // Thai food
  { re: /^กะเพรา/gi, to: 'ข้าวกะเพรา' },
  { re: /ข้าวผัดกะเพรา/gi, to: 'ข้าวกะเพรา' },
  // Eggs
  { re: /ไข่ดาว/gi, to: 'ไข่ดาว' },
  { re: /ไข่ต้ม/gi, to: 'ไข่ต้ม' },
  { re: /ไข่เจียว/gi, to: 'ไข่เจียว' },
  // Whey
  { re: /^เวย์/gi, to: 'เวย์โปรตีน' },
];

function normalizeWhitespace(s: string) {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function thaiWordToNumber(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  if (t in THAI_NUM_WORDS) return THAI_NUM_WORDS[t] ?? null;

  // Common patterns like "สองฟอง" handled elsewhere
  return null;
}

export function normalizeThaiNumbers(text: string): string {
  let out = text;

  // Convert standalone Thai number words to digits.
  // Keep it conservative: only replace when surrounded by word boundaries/spaces.
  for (const [w, n] of Object.entries(THAI_NUM_WORDS)) {
    out = out.replace(new RegExp(`(^|\\s)${w}(?=\\s|$)`, 'g'), `$1${n}`);
  }

  // Merge patterns like "2ฟอง" -> "2 ฟอง"
  out = out.replace(/(\d)(?=[ก-๙a-zA-Z])/g, '$1 ');

  return out;
}

export function splitMealText(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  // Split on common separators.
  const parts = normalized
    .split(/\s*(?:\+|,|\/|\||และ|กับ|\n)\s*/g)
    .flatMap((p) => p.split(/\s{2,}/g))
    .map((p) => p.trim())
    .filter(Boolean);

  // Special-case: Thai often writes "A B 2 ฟอง" meaning 2 items.
  // If there is no explicit separator but there are multiple foods, we keep as single segment
  // and rely on the parser below to extract sub-items if needed.
  return parts;
}

function detectUnit(segment: string): NormalizedUnit | undefined {
  for (const u of UNIT_ALIASES) {
    if (u.re.test(segment)) return u.unit;
  }
  return undefined;
}

function applyAliases(name: string): string {
  let out = name;
  for (const a of COMMON_ALIASES) out = out.replace(a.re, a.to);
  return out;
}

function parseQty(segment: string): ParsedQty {
  // patterns:
  //  - "2 ฟอง"
  //  - "2ฟอง" (normalized earlier)
  //  - "x2"
  const unit = detectUnit(segment);

  // If unit is present with an explicit number like "2 ฟอง" or "ไข่ 2 ฟอง",
  // prefer that specific parse.
  const numUnit = /(\d+(?:\.\d+)?)\s*(ฟอง|ลูก|จาน|ชาม|ถ้วย|ช้อนโต๊ะ|ช้อนชา|กรัม|กก|มล|ลิตร|ขวด|กระป๋อง|ซอง|กล่อง|สกู๊ป|ชิ้น)\b/i.exec(
    segment,
  );
  if (numUnit?.[1]) return { qty: Number(numUnit[1]), unit: detectUnit(numUnit[2]) ?? unit };

  // x2 / x 2
  const mult = /\bx\s*(\d+(?:\.\d+)?)\b/i.exec(segment);
  if (mult?.[1]) return { qty: Number(mult[1]), unit };

  // leading number "2 ฟอง ..."
  const lead = /^(\d+(?:\.\d+)?)\b/.exec(segment);
  if (lead?.[1]) return { qty: Number(lead[1]), unit };

  // number after a name (common Thai): "ไข่ 2" (unit missing)
  const afterName = /\b(\d+(?:\.\d+)?)\b/.exec(segment);
  if (afterName?.[1]) return { qty: Number(afterName[1]), unit };

  // Thai number word + unit "สอง ฟอง"
  const thaiNumUnit = /(ศูนย์|หนึ่ง|นึง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)\s*(ฟอง|ลูก|จาน|ชาม|ถ้วย|ช้อนโต๊ะ|ช้อนชา|ชิ้น)\b/i.exec(
    segment,
  );
  if (thaiNumUnit?.[1]) {
    const n = thaiWordToNumber(thaiNumUnit[1]);
    if (n != null) return { qty: n, unit: detectUnit(thaiNumUnit[2]) ?? unit };
  }

  return { qty: 1, unit };
}

function cleanupName(segment: string): string {
  let s = segment;

  // Remove qty patterns but keep meaning.
  s = s.replace(/\bx\s*\d+(?:\.\d+)?\b/gi, ' ');
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, ' ');

  // Remove unit tokens
  s = s.replace(/(ฟอง|ลูก|จาน|ชาม|ถ้วย|แก้ว|ช้อนโต๊ะ|tbsp|ช้อนชา|tsp|กรัม|g\b|กก|kg\b|มล|ml\b|ลิตร|l\b|ขวด|กระป๋อง|ซอง|กล่อง|สกู๊ป|สกุป|scoop|ชิ้น)/gi, ' ');

  // Common filler
  s = s.replace(/(?:จำนวน|ประมาณ|ราวๆ|ราว ๆ|เพิ่ม|extra|พิเศษ)/gi, ' ');

  s = normalizeWhitespace(s);
  return applyAliases(s);
}

function splitImplicitCombo(segment: string): string[] {
  // Heuristic: if user writes "กะเพราไก่ ไข่ 2 ฟอง" without separator,
  // split when we see an egg keyword after another food word.
  const s = normalizeWhitespace(segment);
  if (!s) return [];
  // Look for " ไข่" occurrence not at beginning.
  const eggIdx = s.search(/\sไข่(?:ดาว|ต้ม|เจียว)?/);
  if (eggIdx > 0) {
    const left = s.slice(0, eggIdx).trim();
    const right = s.slice(eggIdx).trim();
    if (left && right) return [left, right];
  }
  return [s];
}

export function preprocessThaiMeal(text: string): PreprocessResult {
  const warnings: string[] = [];
  const normalizedText = normalizeWhitespace(normalizeThaiNumbers(text));

  const segments = splitMealText(normalizedText).flatMap(splitImplicitCombo);

  const items: ParsedItem[] = segments
    .map((segRaw) => {
      const raw = normalizeWhitespace(segRaw);
      const { qty, unit } = parseQty(raw);
      const name = cleanupName(raw);
      return {
        raw,
        name: name || raw,
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit,
      } satisfies ParsedItem;
    })
    .filter((x) => x.name.length > 0);

  if (items.length === 0 && normalizedText) {
    warnings.push('ไม่สามารถแยกรายการอาหารได้จากข้อความนี้');
  }

  // Small hint: if no qty anywhere and multiple items, remind model defaults to 1
  if (items.length >= 2 && items.every((it) => it.qty === 1)) {
    warnings.push('ไม่พบจำนวนชัดเจนในบางรายการ: สมมติเป็น 1 หน่วยมาตรฐาน');
  }

  return { normalizedText, items, warnings };
}
