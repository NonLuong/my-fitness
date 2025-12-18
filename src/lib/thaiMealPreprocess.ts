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
  { re: /กรัม|\bg\b/gi, unit: 'กรัม' },
  { re: /กก|\bkg\b/gi, unit: 'กก' },
  { re: /มล|\bml\b/gi, unit: 'มล' },
  { re: /ลิตร|\bl\b/gi, unit: 'ลิตร' },
  { re: /ขวด/gi, unit: 'ขวด' },
  { re: /กระป๋อง/gi, unit: 'กระป๋อง' },
  { re: /ซอง/gi, unit: 'ซอง' },
  { re: /กล่อง/gi, unit: 'กล่อง' },
  { re: /สกู๊ป|สกุป|scoop/gi, unit: 'สกู๊ป' },
  { re: /ชิ้น/gi, unit: 'ชิ้น' },
];

const COMMON_ALIASES: Array<{ re: RegExp; to: string }> = [
  // Thai food
  { re: /^(?:กะเพรา|กระเพรา)/gi, to: 'ข้าวกะเพรา' },
  { re: /ข้าวผัดกะเพรา/gi, to: 'ข้าวกะเพรา' },
  { re: /ข้าวกระเพรา/gi, to: 'ข้าวกะเพรา' },
  // Eggs
  { re: /ไข่ดาว/gi, to: 'ไข่ดาว' },
  { re: /ไข่ต้ม/gi, to: 'ไข่ต้ม' },
  { re: /ไข่เจียว/gi, to: 'ไข่เจียว' },
  // Whey
  { re: /^เวย์/gi, to: 'เวย์โปรตีน' },
];

function normalizeWhitespace(s: string) {
  return s
    // Strip zero-width/invisible formatting chars.
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00A0]/g, ' ')
    // Strip other control characters that can break regex \s matching.
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
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
    .split(/\s*(?:\+|,|，|\/|\||และ|กับ|\n|\.|。|;|\u0E2F)\s*/g)
    .flatMap((p) => p.split(/\s{2,}/g))
    // Add-ons (often written mid-sentence) should become their own segments.
    .flatMap((p) => p.split(/\s+(?=(?:มี|ใส่|เพิ่ม|ไม่ใส่)\s+)/g))
    // Split cooking method clauses away from items.
    .flatMap((p) => p.split(/\s+(?=(?:ผัดด้วย|ทอดด้วย|ใช้น้ำมัน)\s+)/g))
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

function detectUnitFromToken(token: string): NormalizedUnit | undefined {
  const t = token.trim();
  if (!t) return undefined;
  for (const u of UNIT_ALIASES) {
    if (u.re.test(t)) return u.unit;
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

  // If unit is present with an explicit number like "2 ฟอง" or "มีไข่ดาว 2 ฟอง",
  // prefer a number closest to that unit token.
  // Prefer explicit number+unit pairs; if multiple pairs exist, choose the one
  // that matches the item's context (e.g. egg -> ฟอง, drink -> กระป๋อง, weight -> กรัม/กก).
  const pairRe =
    /(\d+(?:\.\d+)?)\s*(ฟอง|ลูก|จาน|ชาม|ถ้วย|ช้อนโต๊ะ|ช้อนชา|กรัม|กก|มล|ลิตร|ขวด|กระป๋อง|ซอง|กล่อง|สกู๊ป|ชิ้น)\b/gi;

  const pairs: Array<{ qty: number; unitToken: string; index: number }> = [];
  let pair: RegExpExecArray | null = null;
  while ((pair = pairRe.exec(segment))) {
    const q = Number(pair[1]);
    if (Number.isFinite(q) && q > 0) pairs.push({ qty: q, unitToken: pair[2], index: pair.index });
  }

  if (pairs.length > 0) {
    const segLower = segment.toLowerCase();
    const wantsEgg = /ไข่/.test(segment);
    const wantsWhey = /เวย์|whey/.test(segLower);
    const wantsDrink = /น้ำอัดลม|โค้ก|pepsi|soda|น้ำ/.test(segment);

    // If the segment mentions eggs, never let weight quantities leak into egg counts.
    // We aggressively prefer the ฟอง pair even if grams appear in the same segment.
    if (wantsEgg) {
      const eggPair = [...pairs].reverse().find((p) => p.unitToken.toLowerCase() === 'ฟอง');
      if (eggPair) return { qty: eggPair.qty, unit: 'ฟอง' };
    }

    const preferredUnits = wantsEgg
      ? ['ฟอง']
      : wantsWhey
        ? ['สกู๊ป']
        : wantsDrink
          ? ['กระป๋อง', 'ขวด', 'แก้ว', 'ถ้วย', 'มล', 'ลิตร']
          : ['กรัม', 'กก', 'จาน', 'ชาม', 'ถ้วย', 'ชิ้น', 'ลูก'];

    for (const u of preferredUnits) {
      const hit = [...pairs].reverse().find((p) => p.unitToken.toLowerCase() === u);
      if (hit) return { qty: hit.qty, unit: detectUnitFromToken(hit.unitToken) ?? unit };
    }

    // Fallback: use the last pair in the segment.
    const last = pairs[pairs.length - 1];
    return { qty: last.qty, unit: detectUnitFromToken(last.unitToken) ?? unit };
  }

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

  // Verbose pattern: "... มีไข่ดาว 2 ฟอง ..." should split at "มี"
  const hasIdx = s.search(/\sมี\s+ไข่/);
  if (hasIdx > 0) {
    const left = s.slice(0, hasIdx).trim();
    const right = s.slice(hasIdx).trim();
    if (left && right) return [left, right];
  }
  return [s];
}

export function preprocessThaiMeal(text: string): PreprocessResult {
  const warnings: string[] = [];
  const normalizedText = normalizeWhitespace(normalizeThaiNumbers(text));


  // Deterministic clause tokenizer.
  // Goal: isolate add-ons like "มีไข่..." into their own segment so qty parsing cannot
  // accidentally pick numbers from earlier clauses (e.g. "500 กรัม").
  const clauseSplit = (s: string): string[] => {
  const baseParts = splitMealText(s);
    const out: string[] = [];

    const addOnAnchors = ['มี', 'ใส่', 'เพิ่ม', 'ไม่ใส่'];
    const cookAnchors = ['ผัดด้วย', 'ทอดด้วย', 'ใช้น้ำมัน'];

    // Find all anchor occurrences and slice into chunks.
    const sliceByAnchors = (part: string): string[] => {
      const t = normalizeWhitespace(part);
      if (!t) return [];

      // We only split on anchors that appear as separate words.
      // JS doesn't guarantee lookbehind, so we include the leading boundary in the match
      // and later compute the true anchor start index.
      const anchorGroup = [...addOnAnchors, ...cookAnchors].join('|');
      const re = new RegExp(`(^|\\s)(${anchorGroup})(?=\\s)`, 'g');

      const cutPoints: number[] = [];
      let m: RegExpExecArray | null = null;
      while ((m = re.exec(t))) {
        // m[1] is boundary (start or whitespace), m[2] is the anchor word.
        // Slice at the beginning of the anchor word.
        const boundaryLen = m[1]?.length ?? 0;
        const idx = m.index + boundaryLen;
        if (idx > 0 && idx < t.length) cutPoints.push(idx);
      }

      // If regex matching fails for any reason (e.g. unexpected whitespace), fall back to
      // a simple indexOf scan for " <anchor> ".
      if (cutPoints.length === 0) {
        for (const a of [...addOnAnchors, ...cookAnchors]) {
          const needle = ` ${a} `;
          let start = 0;
          // Find all occurrences, not just the first.
          while (true) {
            const idx = t.indexOf(needle, start);
            if (idx === -1) break;
            const cut = idx + 1; // start of the anchor word
            if (cut > 0 && cut < t.length) cutPoints.push(cut);
            start = idx + needle.length;
          }
        }
      }

      // (debug hooks removed)

      if (cutPoints.length === 0) return [t];

      // De-dup + sort
      const cuts = Array.from(new Set(cutPoints)).sort((a, b) => a - b);
      const pieces: string[] = [];
      let start = 0;
      for (const c of cuts) {
        const head = t.slice(start, c).trim();
        if (head) pieces.push(head);
        start = c;
      }
      const tail = t.slice(start).trim();
      if (tail) pieces.push(tail);
      return pieces;
    };

    for (const p of baseParts) {
      out.push(...sliceByAnchors(p));
    }

    // One more safeguard: if "... มีไข่..." is still glued, split at that boundary.
    const finalClauses = out
      .flatMap((c) => c.split(/\s+(?=มี\s+ไข่)/g))
      .map((c) => c.trim())
      .filter(Boolean);
    return finalClauses;
  };

  const segments = clauseSplit(normalizedText).flatMap(splitImplicitCombo);

  // Last-resort: in verbose Thai, "มีไข่..." often appears mid-sentence and must not share
  // a segment with gram quantities. If our clause splitting missed it (due to odd whitespace
  // from user input/copy-paste), extract egg clauses explicitly.
  const segmentsWithEggExtraction = segments.flatMap((seg) => {
    const s = normalizeWhitespace(seg);
    if (!s) return [];

  const start = s.search(/มี\s*ไข่/);
    if (start < 0) return [s];

    // Find where the egg clause ends.
    const afterStart = s.slice(start);
    const endMatch = /\s+(?=(?:ผัดด้วย|ทอดด้วย|ใช้น้ำมัน|เครื่อง|และ|\+|,|，|\/|\||$))/.exec(afterStart);
    const end = endMatch ? start + (endMatch.index ?? 0) : s.length;

    const before = normalizeWhitespace(s.slice(0, start));
    const eggClause = normalizeWhitespace(s.slice(start, end));
    const after = normalizeWhitespace(s.slice(end));

    const out: string[] = [];
    if (before) out.push(before);
    if (eggClause) out.push(eggClause);
    if (after) out.push(after);
    return out.length ? out : [s];
  });

  // (debug hooks removed)

  const items: ParsedItem[] = segmentsWithEggExtraction
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

  // Post-process: merge obvious add-on clauses into separate items (e.g. "มีไข่ดาว 2 ฟอง" -> item "ไข่ดาว")
  // and drop cooking method clauses from becoming standalone items.
  const filtered: ParsedItem[] = [];
  for (const it of items) {
    const raw = it.raw;
    const name = it.name;

    // Drop pure cooking method clauses.
    if (/^(?:ผัดด้วย|ทอดด้วย|ใช้น้ำมัน)/.test(raw)) {
      continue;
    }

    // Normalize add-on prefix.
    if (/^(?:มี|ใส่|เพิ่ม)\s+ไข่/.test(raw) && !name.startsWith('ไข่')) {
      filtered.push({ ...it, name: name.replace(/^(?:มี|ใส่|เพิ่ม)\s+/, '') });
      continue;
    }

    filtered.push(it);
  }

  if (filtered.length === 0 && normalizedText) {
    warnings.push('ไม่สามารถแยกรายการอาหารได้จากข้อความนี้');
  }

  // Small hint: if no qty anywhere and multiple items, remind model defaults to 1
  if (filtered.length >= 2 && filtered.every((it) => it.qty === 1)) {
    warnings.push('ไม่พบจำนวนชัดเจนในบางรายการ: สมมติเป็น 1 หน่วยมาตรฐาน');
  }

  return { normalizedText, items: filtered, warnings };
}
