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

function normalizeConfidence(v: unknown): NutritionResult['confidence'] {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
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
      'Return ONLY valid JSON with this shape:\n' +
      '{"results": [{"itemName": string, "assumedServing": string, "caloriesKcal": number|null, "proteinG": number|null, "carbsG": number|null, "fatG": number|null, "fiberG": number|null, "sugarG": number|null, "sodiumMg": number|null, "confidence": "low"|"medium"|"high", "notes": string[]}], "followUpQuestions": string[], "reasoningSummary": string}\n' +
      'Rules: Keep numbers realistic; if unclear, set fields to null and ask follow-up questions. For Thai foods, use typical Thai portions and state assumptions.';

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

    const model = 'gemini-1.5-pro';

    const resp = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: parts as unknown as object[] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
    });

    const raw = resp.text ?? '';

    let parsed: GeminiJson;
    try {
      parsed = JSON.parse(raw) as GeminiJson;
    } catch {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          error:
            'AI returned non-JSON output. Try rephrasing with clearer portions (e.g., "1 bowl", "1 plate", "2 eggs").',
        },
        { status: 502 },
      );
    }

    const rawResults = Array.isArray(parsed?.results) ? (parsed?.results as GeminiResultItem[]) : [];
    const results: NutritionResult[] = rawResults.length
      ? rawResults.map((r) => ({
          itemName: String(r?.itemName ?? 'Meal'),
          assumedServing: String(r?.assumedServing ?? ''),
          caloriesKcal: clampNumber(r?.caloriesKcal),
          proteinG: clampNumber(r?.proteinG),
          carbsG: clampNumber(r?.carbsG),
          fatG: clampNumber(r?.fatG),
          fiberG: r?.fiberG === undefined ? undefined : clampNumber(r?.fiberG),
          sugarG: r?.sugarG === undefined ? undefined : clampNumber(r?.sugarG),
          sodiumMg: r?.sodiumMg === undefined ? undefined : clampNumber(r?.sodiumMg),
          confidence: normalizeConfidence(r?.confidence),
          notes: Array.isArray(r?.notes) ? (r.notes as unknown[]).map((x) => String(x)) : [],
        }))
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
