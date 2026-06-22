import { NextResponse } from 'next/server';

import { checkRateLimit, contentLengthExceeds, getClientIp } from '@/lib/apiGuards';
import { createGeminiClient, getGeminiModelCandidates } from '@/lib/gemini';
import { parseGeminiJson } from '@/lib/geminiJson';

export const runtime = 'nodejs';

type ProgressPoint = {
  date: string;
  weightKg?: number | null;
  waistIn?: number | null;
  sleepHours?: number | null;
  waterLiters?: number | null;
  energyLevel?: number | null;
  hungerLevel?: number | null;
  mood?: string | null;
};

type NutritionSummary = {
  averageCaloriesKcal?: number;
  averageProteinG?: number;
  targetCaloriesKcal?: number;
  targetProteinG?: number;
  loggedDays?: number;
};

type ProgressInsight = {
  headline: string;
  summary: string;
  positives: string[];
  watchItems: string[];
  nextSteps: string[];
  safetyNote: string;
};

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    positives: { type: 'array', maxItems: 3, items: { type: 'string' } },
    watchItems: { type: 'array', maxItems: 3, items: { type: 'string' } },
    nextSteps: { type: 'array', maxItems: 3, items: { type: 'string' } },
    safetyNote: { type: 'string' },
  },
  required: ['headline', 'summary', 'positives', 'watchItems', 'nextSteps', 'safetyNote'],
} as const;

function finiteOrNull(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function offlineInsight(points: ProgressPoint[], nutrition: NutritionSummary): ProgressInsight {
  const weights = points
    .map((point) => point.weightKg)
    .filter((value): value is number => typeof value === 'number');
  const change = weights.length >= 2 ? weights.at(-1)! - weights[0] : null;
  const sleepValues = points
    .map((point) => point.sleepHours)
    .filter((value): value is number => typeof value === 'number');
  const averageSleep = sleepValues.length
    ? sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length
    : null;

  return {
    headline: 'ภาพรวมความก้าวหน้าล่าสุด',
    summary: change === null
      ? 'ข้อมูลยังไม่พอสำหรับสรุปแนวโน้มน้ำหนัก แต่การเริ่มบันทึกอย่างสม่ำเสมอเป็นก้าวสำคัญแล้ว'
      : `น้ำหนักเปลี่ยนแปลง ${change > 0 ? '+' : ''}${change.toFixed(1)} กก. ในช่วงข้อมูลที่บันทึก ควรดูร่วมกับรอบเอวและค่าเฉลี่ยหลายวัน`,
    positives: [
      `มีข้อมูลบันทึก ${points.length} วัน`,
      nutrition.loggedDays ? `บันทึกโภชนาการ ${nutrition.loggedDays} วัน` : 'เริ่มเชื่อมข้อมูลโภชนาการกับความก้าวหน้าแล้ว',
    ],
    watchItems: [
      averageSleep !== null && averageSleep < 7
        ? `การนอนเฉลี่ย ${averageSleep.toFixed(1)} ชั่วโมง อาจยังน้อยกว่าที่เหมาะสม`
        : 'ติดตามการนอนควบคู่กับพลังงานและความหิว',
    ],
    nextSteps: [
      'ชั่งน้ำหนักในเวลาและเงื่อนไขใกล้เคียงกัน',
      'ดูแนวโน้มอย่างน้อย 2–4 สัปดาห์ก่อนปรับแผนครั้งใหญ่',
      'รักษาโปรตีน การนอน และการออกกำลังกายให้สม่ำเสมอ',
    ],
    safetyNote: 'ข้อมูลนี้เป็นแนวทางทั่วไป ไม่ใช่การวินิจฉัย หากมีอาการผิดปกติควรปรึกษาแพทย์',
  };
}

export async function POST(request: Request) {
  if (contentLengthExceeds(request, 80_000)) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลมากเกินไป' }, { status: 413 });
  }

  const rateLimit = checkRateLimit(`progress:${getClientIp(request)}`, {
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'วิเคราะห์บ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
      { status: 429, headers: { 'retry-after': String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => null) as {
    points?: unknown;
    nutrition?: unknown;
  } | null;

  const points: ProgressPoint[] = Array.isArray(body?.points)
    ? body.points.slice(-30).flatMap((raw): ProgressPoint[] => {
        if (!raw || typeof raw !== 'object') return [];
        const item = raw as Record<string, unknown>;
        const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
          ? item.date
          : null;
        if (!date) return [];
        return [{
          date,
          weightKg: finiteOrNull(item.weightKg, 20, 500),
          waistIn: finiteOrNull(item.waistIn, 10, 160),
          sleepHours: finiteOrNull(item.sleepHours, 0, 24),
          waterLiters: finiteOrNull(item.waterLiters, 0, 20),
          energyLevel: finiteOrNull(item.energyLevel, 1, 5),
          hungerLevel: finiteOrNull(item.hungerLevel, 1, 5),
          mood: typeof item.mood === 'string' ? item.mood.slice(0, 20) : null,
        }];
      })
    : [];

  if (!points.length) {
    return NextResponse.json({ ok: false, error: 'ยังไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์' }, { status: 400 });
  }

  const nutritionRaw = body?.nutrition && typeof body.nutrition === 'object'
    ? body.nutrition as Record<string, unknown>
    : {};
  const nutrition: NutritionSummary = {
    averageCaloriesKcal: finiteOrNull(nutritionRaw.averageCaloriesKcal, 0, 20_000) ?? undefined,
    averageProteinG: finiteOrNull(nutritionRaw.averageProteinG, 0, 1_000) ?? undefined,
    targetCaloriesKcal: finiteOrNull(nutritionRaw.targetCaloriesKcal, 0, 20_000) ?? undefined,
    targetProteinG: finiteOrNull(nutritionRaw.targetProteinG, 0, 1_000) ?? undefined,
    loggedDays: finiteOrNull(nutritionRaw.loggedDays, 0, 30) ?? undefined,
  };

  const fallback = offlineInsight(points, nutrition);
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: true, insight: fallback, source: 'offline' });
  }

  const prompt = `คุณคือนักวิเคราะห์ความก้าวหน้าด้านสุขภาพและฟิตเนส ตอบภาษาไทยแบบสุภาพ กระชับ และให้กำลังใจ

ข้อกำหนด:
- วิเคราะห์ "แนวโน้มหลายวัน" ห้ามตัดสินจากน้ำหนักวันเดียว
- เชื่อมโยงน้ำหนัก รอบเอว การนอน น้ำดื่ม พลังงาน ความหิว อารมณ์ และโภชนาการอย่างระมัดระวัง
- ห้ามวินิจฉัยโรค ห้ามรับรองผล และห้ามแนะนำการลดน้ำหนักรุนแรง
- ถ้าข้อมูลน้อยหรือขาดช่วง ให้บอกข้อจำกัดตรง ๆ
- ให้คำแนะนำที่ทำได้จริงไม่เกิน 3 ข้อ
- ไม่ต้องทวนข้อมูลทุกค่า

ข้อมูลย้อนหลัง (เก่าสุดไปใหม่สุด):
${JSON.stringify(points)}

สรุปโภชนาการ:
${JSON.stringify(nutrition)}

ตอบ JSON ตาม schema เท่านั้น`;

  const ai = createGeminiClient();
  let lastError: unknown = null;
  for (const model of getGeminiModelCandidates()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.2,
          maxOutputTokens: 1600,
          responseMimeType: 'application/json',
          responseJsonSchema: responseSchema,
        },
      });
      const parsed = parseGeminiJson<ProgressInsight>(response.text ?? '');
      if (parsed.ok) {
        return NextResponse.json({ ok: true, insight: parsed.value, source: 'ai' });
      }
      lastError = new Error(parsed.error);
    } catch (error) {
      lastError = error;
    }
  }

  console.error('Progress insight fallback:', lastError);
  return NextResponse.json({ ok: true, insight: fallback, source: 'offline' });
}
