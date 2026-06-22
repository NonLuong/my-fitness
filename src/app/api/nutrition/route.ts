import { NextResponse } from 'next/server';
import { preprocessThaiMeal } from '@/lib/thaiMealPreprocess';
import { checkRateLimit, contentLengthExceeds, getClientIp } from '@/lib/apiGuards';
import { createGeminiClient, getGeminiModelCandidates, nutritionResponseSchema } from '@/lib/gemini';
import { estimateThaiMeal, hasCompleteThaiEstimate } from '@/lib/thaiNutritionEstimate';

export const runtime = 'nodejs';

type NutritionResult = {
  itemName: string;
  assumedServing: string;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  confidence: 'low' | 'medium' | 'high';
  notes: string[];
  vitaminsAndMinerals?: string[];
  healthBenefits?: string;
  warnings?: string;
  funFact?: string;
};

type ApiResponse = {
  ok: boolean;
  results?: NutritionResult[];
  followUpQuestions?: string[];
  reasoningSummary?: string;
  error?: string;
};

type GeminiJson = {
  results?: unknown;
  followUpQuestions?: unknown;
  reasoningSummary?: unknown;
};

type GeminiResultItem = {
  itemName?: unknown;
  assumedServing?: unknown;
  caloriesKcal?: unknown;
  proteinG?: unknown;
  carbsG?: unknown;
  fatG?: unknown;
  fiberG?: unknown;
  sugarG?: unknown;
  sodiumMg?: unknown;
  confidence?: unknown;
  notes?: unknown;
  vitaminsAndMinerals?: unknown;
  healthBenefits?: unknown;
  warnings?: unknown;
  funFact?: unknown;
};

function clampNumber(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n;
}

function clampNumberOrZero(n: unknown): number {
  const v = clampNumber(n);
  return v ?? 0;
}

function roundMaybe(n: number | null): number | null {
  if (n === null) return null;
  const r = Math.round(n);
  return Number.isFinite(r) ? r : null;
}

function normalizeConfidence(v: unknown): NutritionResult['confidence'] {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
}

function stripCodeFences(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fence?.[1]) return fence[1].trim();
  return text.trim();
}

function extractLastBalancedJsonObject(text: string): string | null {
  const cleaned = stripCodeFences(text);

  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  // Scan forward and keep the last balanced JSON object. Some model outputs contain
  // extra trailing characters or partial quoted text after the JSON.
  let last: string | null = null;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        last = cleaned.slice(start, i + 1).trim();
      }
      if (depth < 0) return null;
    }
  }

  return last;
}

function makeErrorId(): string {
  // Small, sortable id for correlating client error with server logs.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncateForLog(text: string, limit = 2000): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}\n…(truncated ${trimmed.length - limit} chars)`;
}

function parseGeminiJson(raw: string): GeminiJson {
  const candidate = extractLastBalancedJsonObject(raw) ?? stripCodeFences(raw);
  try {
    return JSON.parse(candidate) as GeminiJson;
  } catch {
    // Light repair for common near-JSON glitches observed in Gemini output:
    // - stray standalone tokens on their own line (e.g. "n")
    // - unterminated trailing string at the end of the payload
    // - trailing commas
    let repaired = candidate;

    // Remove lines that are only a single letter token (common artifact in some streams).
    repaired = repaired.replace(/\n\s*[a-zA-Z]\s*\n/g, '\n');

    // Remove trailing commas before } or ]
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    // If JSON ends mid-string (unterminated quote), close it and then close braces/brackets.
    // This is best-effort; if it's too broken we'll still error and fall back to repair pass.
    const quoteCount = (repaired.match(/(?<!\\)"/g) ?? []).length;
    if (quoteCount % 2 === 1) {
      repaired = `${repaired}"`;
    }

    // If we somehow lost the final closing brace, try to append one.
    const openBraces = (repaired.match(/{/g) ?? []).length;
    const closeBraces = (repaired.match(/}/g) ?? []).length;
    if (openBraces > closeBraces) repaired = `${repaired}${'}'.repeat(openBraces - closeBraces)}`;

    return JSON.parse(repaired) as GeminiJson;
  }
}

export async function POST(req: Request) {
  try {
    if (contentLengthExceeds(req, 6 * 1024 * 1024)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'ไฟล์หรือข้อมูลมีขนาดใหญ่เกิน 6 MB' },
        { status: 413 },
      );
    }

    const rateLimit = checkRateLimit(`nutrition:${getClientIp(req)}`, {
      limit: 12,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `ส่งคำขอถี่เกินไป กรุณาลองใหม่ใน ${rateLimit.retryAfterSeconds} วินาที` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const form = await req.formData();
    const text = String(form.get('text') ?? '').trim();
    const image = form.get('image');

    if (text.length > 2_000) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'รายละเอียดอาหารยาวเกินไป กรุณาไม่เกิน 2,000 ตัวอักษร' },
        { status: 400 },
      );
    }

    if (image instanceof File) {
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
      if (!allowedTypes.has(image.type)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: 'รองรับเฉพาะรูป JPEG, PNG, WebP หรือ HEIC' },
          { status: 415 },
        );
      }
      if (image.size > 5 * 1024 * 1024) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: 'รูปภาพต้องมีขนาดไม่เกิน 5 MB' },
          { status: 413 },
        );
      }
    }

    const pre = text ? preprocessThaiMeal(text) : null;
    const standardEstimates = estimateThaiMeal(pre);

    if (!text && !(image instanceof File)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Please provide text and/or an image.' },
        { status: 400 },
      );
    }

    // Common Thai dishes do not need an AI round-trip. A standard restaurant
    // serving is more useful than asking users for weights they normally do not know.
    if (!(image instanceof File) && hasCompleteThaiEstimate(pre, standardEstimates)) {
      return NextResponse.json<ApiResponse>({
        ok: true,
        results: standardEstimates,
        followUpQuestions: [],
        reasoningSummary:
          'ประเมินจากปริมาณมาตรฐานของร้านอาหารทั่วไป ผู้ใช้ไม่จำเป็นต้องระบุน้ำหนักวัตถุดิบ',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (standardEstimates.length > 0) {
        return NextResponse.json<ApiResponse>({
          ok: true,
          results: standardEstimates,
          followUpQuestions: [],
          reasoningSummary: 'ใช้ฐานข้อมูลประมาณการอาหารไทย เนื่องจากยังไม่ได้ตั้งค่า Gemini API',
        });
      }
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY และไม่พบเมนูนี้ในฐานข้อมูลอาหารไทย',
        },
        { status: 500 },
      );
    }

    const ai = createGeminiClient(apiKey);

    const instruction =
      'You are a nutrition assistant. Estimate nutrition for the described meal (and image if provided).\n' +
      'You MUST respond with a single JSON object only. No markdown. No code fences. No extra text.\n' +
      'Language: Thai. All human-readable strings MUST be Thai (itemName, assumedServing, notes, followUpQuestions, reasoningSummary).\n' +
      (pre
        ? `Helper input (from Thai text pre-parser):\n- normalizedText: ${pre.normalizedText}\n- parsedItems: ${JSON.stringify(
            pre.items,
          )}\n- parserWarnings: ${JSON.stringify(pre.warnings)}\nUse parsedItems only as a hint to split foods and quantities; still interpret context correctly.\n`
        : '') +
      (standardEstimates.length
        ? `Known Thai standard-serving estimates (use as a reliable baseline, do not ask the user for grams): ${JSON.stringify(
            standardEstimates,
          )}\n`
        : '') +
      'Schema (example with placeholder values, do not include comments):\n' +
      '{\n' +
      '  "results": [\n' +
      '    {\n' +
      '      "itemName": "string",\n' +
      '      "assumedServing": "string",\n' +
      '      "caloriesKcal": 0,\n' +
      '      "proteinG": 0,\n' +
      '      "carbsG": 0,\n' +
      '      "fatG": 0,\n' +
      '      "fiberG": 0,\n' +
      '      "sugarG": 0,\n' +
      '      "sodiumMg": 0,\n' +
      '      "confidence": "medium",\n' +
      '      "notes": ["string"],\n' +
      '      "vitaminsAndMinerals": ["string"],\n' +
      '      "healthBenefits": "string",\n' +
      '      "warnings": "string",\n' +
      '      "funFact": "string"\n' +
      '    }\n' +
      '  ],\n' +
      '  "followUpQuestions": ["string"],\n' +
      '  "reasoningSummary": "string"\n' +
      '}\n' +
  'Rules:\n' +
  '- เป้าหมายคือใช้งานง่าย: ให้ประมาณจาก “ปริมาณมาตรฐานที่คนทั่วไปกิน” ของอาหารชนิดนั้น โดยไม่ต้องให้ผู้ใช้ชั่งน้ำหนัก\n' +
  '- ห้ามขอให้ผู้ใช้ระบุน้ำหนักข้าวหรือเนื้อสำหรับอาหารตามสั่งทั่วไป ถ้าไม่ได้ระบุให้ใช้ portion ร้านทั่วไปทันที\n' +
  '- หากมี Known Thai standard-serving estimates ให้ยึดค่านั้นเป็น baseline และปรับเฉพาะเมื่อข้อความหรือรูปให้หลักฐานชัดเจน\n' +
  '- ถ้าผู้ใช้ “ไม่ระบุจำนวน” ให้ถือว่า = 1 เสมอ (เช่น 1 จาน / 1 ชิ้น / 1 อัน แล้วแต่อาหาร)\n' +
  '- ถ้าผู้ใช้ “ระบุจำนวน” (เช่น 2 จาน, 3 ชิ้น, 1 กล่อง, 2 ขวด) ให้คูณตามจำนวนที่ระบุ\n' +
  '- สำหรับอาหารไทยทั่วไป ให้สมมติเป็น 1 จาน/1 ชาม/1 ชุด แบบมาตรฐาน และเขียน assumedServing ให้ชัด (เช่น “1 จาน (~350–400 กรัมโดยประมาณ)”)\n' +
  '- caloriesKcal/proteinG/carbsG/fatG: ต้องเป็นตัวเลขเสมอ (ห้ามเป็น null) ให้ประมาณแบบสมเหตุสมผล\n' +
  '- followUpQuestions: ถามสั้น ๆ ไม่เกิน 2 ข้อ เฉพาะกรณีที่คลุมเครือจริง ๆ (เช่น มีไข่ดาวไหม, ใช้หมูหรือไก่)\n' +
  '- notes และ reasoningSummary: สั้น กระชับ ไม่ต้องยาว แค่สรุปสมมติฐานหลัก ๆ\n' +
  '- vitaminsAndMinerals: ระบุวิตามินและแร่ธาตุหลักที่มีในอาหารนี้ (เช่น ["Vitamin C", "Iron", "Calcium"])\n' +
  '- healthBenefits: อธิบายประโยชน์ต่อสุขภาพสั้นๆ เป็นภาษาไทย (เช่น "ช่วยเสริมสร้างกล้ามเนื้อและซ่อมแซมส่วนที่สึกหรอ")\n' +
  '- warnings: คำเตือนถ้ามี (เช่น "โซเดียมสูง ควรบริโภคแต่น้อย" หรือ "น้ำตาลสูง") ถ้าไม่มีให้เว้นว่าง\n' +
  '- funFact: เกร็ดความรู้สนุกๆ เกี่ยวกับอาหารนี้ เป็นภาษาไทย\n' +
  '- ถ้ามีรูป ให้ใช้รูปช่วยปรับความแม่นยำ';

    const parts: object[] = [{ text: instruction } as object];
    if (text) parts.push({ text: `User input: ${text}` });
    if (image instanceof File) {
      const arrayBuffer = await image.arrayBuffer();
      parts.push({
        inlineData: {
          data: Buffer.from(arrayBuffer).toString('base64'),
          mimeType: image.type || 'image/jpeg',
        },
      } as object);
    }

  // Model availability varies by project / API version.
  // We'll try a small fallback chain of commonly available model IDs.
    const modelCandidates = getGeminiModelCandidates();

    let resp: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastErr: unknown = null;

    for (const model of modelCandidates) {
      try {
        resp = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: parts as unknown as object[] }],
          config: {
            temperature: 0.2,
            // Prevent truncation for multi-item meals.
            maxOutputTokens: 2500,
            responseMimeType: 'application/json',
            responseJsonSchema: nutritionResponseSchema,
          },
        });
        break;
      } catch (e: unknown) {
        lastErr = e;
        continue;
      }
    }

    if (!resp) {
      if (standardEstimates.length > 0) {
        return NextResponse.json<ApiResponse>({
          ok: true,
          results: standardEstimates,
          followUpQuestions: [],
          reasoningSummary: 'Gemini ไม่พร้อมใช้งาน จึงใช้ค่าประมาณจาก portion ร้านอาหารไทยมาตรฐาน',
        });
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error('No supported Gemini model found for generateContent in this project.');
    }

    const raw = resp.text ?? '';

    let parsed: GeminiJson;
    try {
      parsed = parseGeminiJson(raw);
    } catch {
      // Second-pass repair: ask Gemini to reformat into strict JSON, and/or increase output stability.
      const errorId = makeErrorId();
      console.error('[nutrition] Non-JSON Gemini output', { errorId, raw: truncateForLog(raw) });

      const repairInstruction =
        'Convert the following content into a SINGLE valid JSON object ONLY (no markdown, no fences, no extra text).\n' +
        'It MUST match this schema:\n' +
        '{"results":[{"itemName":"string","assumedServing":"string","caloriesKcal":0,"proteinG":0,"carbsG":0,"fatG":0,"fiberG":0,"sugarG":0,"sodiumMg":0,"confidence":"medium","notes":["string"]}],"followUpQuestions":["string"],"reasoningSummary":"string"}';

      let repairResp: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      for (const model of modelCandidates) {
        try {
          repairResp = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: repairInstruction } as object,
                  { text: `\n\nSOURCE:\n${raw}` } as object,
                ],
              },
            ],
            config: {
              temperature: 0,
              maxOutputTokens: 2500,
              responseMimeType: 'application/json',
              responseJsonSchema: nutritionResponseSchema,
            },
          });
          break;
        } catch {
          continue;
        }
      }

      if (repairResp) {
        const repairRaw = repairResp.text ?? '';
        try {
          parsed = parseGeminiJson(repairRaw);
        } catch {
          console.error('[nutrition] Repair pass still non-JSON', {
            errorId,
            raw: truncateForLog(repairRaw),
          });
          if (standardEstimates.length > 0) {
            return NextResponse.json<ApiResponse>({
              ok: true,
              results: standardEstimates,
              followUpQuestions: [],
              reasoningSummary: 'AI ตอบกลับไม่สมบูรณ์ จึงใช้ฐานข้อมูล portion อาหารไทยมาตรฐานแทน',
            });
          }
          return NextResponse.json<ApiResponse>(
            {
              ok: false,
              error:
                `AI returned non-JSON output (errorId: ${errorId}). ลองใส่ปริมาณให้ชัดขึ้น เช่น “ข้าว 1 จาน”, “ไก่ 150g”, “ไข่ 2 ฟอง” แล้วลองใหม่อีกครั้ง.`,
            },
            { status: 502 },
          );
        }
      } else {
        if (standardEstimates.length > 0) {
          return NextResponse.json<ApiResponse>({
            ok: true,
            results: standardEstimates,
            followUpQuestions: [],
            reasoningSummary: 'AI ตอบกลับไม่สมบูรณ์ จึงใช้ฐานข้อมูล portion อาหารไทยมาตรฐานแทน',
          });
        }
        return NextResponse.json<ApiResponse>(
          {
            ok: false,
            error:
              `AI returned non-JSON output (errorId: ${errorId}). ลองใส่ปริมาณให้ชัดขึ้น เช่น “ข้าว 1 จาน”, “ไก่ 150g”, “ไข่ 2 ฟอง” แล้วลองใหม่อีกครั้ง.`,
          },
          { status: 502 },
        );
      }
    }

    const rawResults = Array.isArray(parsed?.results) ? (parsed?.results as GeminiResultItem[]) : [];
    const results: NutritionResult[] = rawResults.length
      ? rawResults.map((r) => {
          const caloriesKcal = clampNumber(r?.caloriesKcal);
          const proteinG = clampNumber(r?.proteinG);
          const carbsG = clampNumber(r?.carbsG);
          const fatG = clampNumber(r?.fatG);

          const notesFromModel = Array.isArray(r?.notes)
            ? (r.notes as unknown[]).map((x) => String(x))
            : [];

          const notes = notesFromModel;

          const vitaminsAndMinerals = Array.isArray(r?.vitaminsAndMinerals)
            ? (r.vitaminsAndMinerals as unknown[]).map((x) => String(x))
            : [];

          return {
            itemName: String(r?.itemName ?? 'มื้ออาหาร'),
            assumedServing: String(r?.assumedServing ?? ''),
            // If the model still returns null (shouldn't), fall back to 0 to keep UI stable.
            caloriesKcal: roundMaybe(caloriesKcal) ?? clampNumberOrZero(r?.caloriesKcal),
            proteinG: roundMaybe(proteinG) ?? clampNumberOrZero(r?.proteinG),
            carbsG: roundMaybe(carbsG) ?? clampNumberOrZero(r?.carbsG),
            fatG: roundMaybe(fatG) ?? clampNumberOrZero(r?.fatG),
            fiberG: r?.fiberG === undefined ? undefined : clampNumber(r?.fiberG),
            sugarG: r?.sugarG === undefined ? undefined : clampNumber(r?.sugarG),
            sodiumMg: r?.sodiumMg === undefined ? undefined : clampNumber(r?.sodiumMg),
            confidence: normalizeConfidence(r?.confidence),
            notes,
            vitaminsAndMinerals,
            healthBenefits: r?.healthBenefits ? String(r.healthBenefits) : undefined,
            warnings: r?.warnings ? String(r.warnings) : undefined,
            funFact: r?.funFact ? String(r.funFact) : undefined,
          };
        })
      : [];

    // Reliability guard:
    // If the model returns missing/null macros (which we coerce to 0), we may end up with a useless all-zero card.
    // In that case, try deterministic fallbacks based on parsed Thai items / quantities.
    const hasAllZeroMacros =
      results.length > 0 &&
      results.every(
        (r) =>
          (r.caloriesKcal ?? 0) === 0 &&
          (r.proteinG ?? 0) === 0 &&
          (r.carbsG ?? 0) === 0 &&
          (r.fatG ?? 0) === 0,
      );

    const fallback = hasAllZeroMacros ? standardEstimates : [];
    const finalResults: NutritionResult[] =
      fallback.length > 0
        ? fallback.map((f) => ({
            itemName: f.itemName,
            assumedServing: f.assumedServing,
            caloriesKcal: f.caloriesKcal,
            proteinG: f.proteinG,
            carbsG: f.carbsG,
            fatG: f.fatG,
            fiberG: f.fiberG,
            sugarG: f.sugarG,
            sodiumMg: f.sodiumMg,
            confidence: f.confidence,
            notes: f.notes,
          }))
        : results;

    const followUpQuestions: string[] = Array.isArray(parsed?.followUpQuestions)
      ? (parsed.followUpQuestions as unknown[]).map((x) => String(x))
      : [];

    return NextResponse.json<ApiResponse>({
      ok: true,
      results: finalResults,
      followUpQuestions,
      reasoningSummary: typeof parsed?.reasoningSummary === 'string' ? parsed.reasoningSummary : undefined,
    });
  } catch (e: unknown) {
    return NextResponse.json<ApiResponse>(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
