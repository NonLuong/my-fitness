import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error:
            'Missing GEMINI_API_KEY. Add it to .env.local (see .env.local.example) and restart the dev server.',
        },
        { status: 500 },
      );
    }

    const form = await req.formData();
    const text = String(form.get('text') ?? '').trim();
    const image = form.get('image');

    if (!text && !(image instanceof File)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: 'Please provide text and/or an image.' },
        { status: 400 },
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const instruction =
      'You are a nutrition assistant. Estimate nutrition for the described meal (and image if provided).\n' +
      'You MUST respond with a single JSON object only. No markdown. No code fences. No extra text.\n' +
      'Language: Thai. All human-readable strings MUST be Thai (itemName, assumedServing, notes, followUpQuestions, reasoningSummary).\n' +
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
      '      "notes": ["string"]\n' +
      '    }\n' +
      '  ],\n' +
      '  "followUpQuestions": ["string"],\n' +
      '  "reasoningSummary": "string"\n' +
      '}\n' +
  'Rules:\n' +
  '- เป้าหมายคือใช้งานง่าย: ให้ประมาณจาก “ปริมาณมาตรฐานที่คนทั่วไปกิน” ของอาหารชนิดนั้น โดยไม่ต้องให้ผู้ใช้ชั่งน้ำหนัก\n' +
  '- ถ้าผู้ใช้ “ไม่ระบุจำนวน” ให้ถือว่า = 1 เสมอ (เช่น 1 จาน / 1 ชิ้น / 1 อัน แล้วแต่อาหาร)\n' +
  '- ถ้าผู้ใช้ “ระบุจำนวน” (เช่น 2 จาน, 3 ชิ้น, 1 กล่อง, 2 ขวด) ให้คูณตามจำนวนที่ระบุ\n' +
  '- สำหรับอาหารไทยทั่วไป ให้สมมติเป็น 1 จาน/1 ชาม/1 ชุด แบบมาตรฐาน และเขียน assumedServing ให้ชัด (เช่น “1 จาน (~350–400 กรัมโดยประมาณ)”)\n' +
  '- caloriesKcal/proteinG/carbsG/fatG: ต้องเป็นตัวเลขเสมอ (ห้ามเป็น null) ให้ประมาณแบบสมเหตุสมผล\n' +
  '- followUpQuestions: ถามสั้น ๆ ไม่เกิน 2 ข้อ เฉพาะกรณีที่คลุมเครือจริง ๆ (เช่น มีไข่ดาวไหม, ใช้หมูหรือไก่)\n' +
  '- notes และ reasoningSummary: สั้น กระชับ ไม่ต้องยาว แค่สรุปสมมติฐานหลัก ๆ\n' +
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
    const modelCandidates = [
      // Prefer a stable, strong reasoning model.
      'gemini-2.5-pro',
      // Fast + cheaper fallbacks.
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      // Preview model (may require extra access / may change).
      'gemini-3-pro-preview',
    ];

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
            maxOutputTokens: 1400,
            responseMimeType: 'application/json',
          },
        });
        break;
      } catch (e: unknown) {
        lastErr = e;
        continue;
      }
    }

    if (!resp) {
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
        '{"results":[{"itemName":"string","assumedServing":"string","caloriesKcal":null,"proteinG":null,"carbsG":null,"fatG":null,"fiberG":null,"sugarG":null,"sodiumMg":null,"confidence":"medium","notes":["string"]}],"followUpQuestions":["string"],"reasoningSummary":"string"}';

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
              maxOutputTokens: 1400,
              responseMimeType: 'application/json',
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
          };
        })
      : [];

    const followUpQuestions: string[] = Array.isArray(parsed?.followUpQuestions)
      ? (parsed.followUpQuestions as unknown[]).map((x) => String(x))
      : [];

    return NextResponse.json<ApiResponse>({
      ok: true,
      results,
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
