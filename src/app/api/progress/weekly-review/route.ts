import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { checkRateLimit, contentLengthExceeds } from '@/lib/apiGuards';
import { createGeminiClient, getGeminiModelCandidates } from '@/lib/gemini';
import { parseGeminiJson } from '@/lib/geminiJson';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { previousCompletedWeek, type WeeklyReview } from '@/lib/weeklyReview';

export const runtime = 'nodejs';

type MealItem = {
  caloriesKcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
};

type Meal = {
  items?: MealItem[];
};

type ProteinEvent = {
  grams?: number;
};

type WorkoutItem = {
  target?: number;
  count?: number;
};

type DailyLogRow = {
  log_date: string;
  protein_g: number | string;
  protein_events: ProteinEvent[] | null;
  workout: Record<string, WorkoutItem> | null;
  meals: Meal[] | null;
};

type CheckinRow = {
  checkin_date: string;
  sleep_hours: number | string | null;
  water_ml: number | null;
  energy_level: number | null;
  hunger_level: number | null;
  mood: string | null;
};

type MeasurementRow = {
  measured_on: string;
  weight_kg: number | string | null;
  waist_cm: number | string | null;
};

type DaySnapshot = {
  date: string;
  weightKg: number | null;
  waistIn: number | null;
  sleepHours: number | null;
  waterLiters: number | null;
  energyLevel: number | null;
  hungerLevel: number | null;
  mood: string | null;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  workoutCompletionPercent: number | null;
};

type WeeklySnapshot = {
  weekStart: string;
  weekEnd: string;
  targets: {
    caloriesKcal: number | null;
    proteinG: number | null;
  };
  days: DaySnapshot[];
  aggregates: {
    checkinDays: number;
    nutritionLoggedDays: number;
    trainingLoggedDays: number;
    weightLoggedDays: number;
    waistLoggedDays: number;
    averageCaloriesKcal: number | null;
    averageProteinG: number | null;
    averageSleepHours: number | null;
    averageHunger: number | null;
    averageEnergy: number | null;
    workoutCompletionAverage: number | null;
    weightChangeKg: number | null;
    waistChangeIn: number | null;
    sleepHungerCorrelation: number | null;
  };
};

const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    dataQuality: {
      type: 'object',
      additionalProperties: false,
      properties: {
        score: { type: 'number', minimum: 0, maximum: 100 },
        message: { type: 'string' },
        missing: { type: 'array', maxItems: 5, items: { type: 'string' } },
      },
      required: ['score', 'message', 'missing'],
    },
    wins: { type: 'array', maxItems: 3, items: { type: 'string' } },
    trends: {
      type: 'object',
      additionalProperties: false,
      properties: {
        weight: { type: 'string' },
        waist: { type: 'string' },
        nutrition: { type: 'string' },
        sleepAndHunger: { type: 'string' },
        training: { type: 'string' },
      },
      required: ['weight', 'waist', 'nutrition', 'sleepAndHunger', 'training'],
    },
    possiblePlateauReasons: { type: 'array', maxItems: 4, items: { type: 'string' } },
    nextWeekPlan: { type: 'array', maxItems: 3, items: { type: 'string' } },
    caution: { type: 'string' },
  },
  required: [
    'headline',
    'summary',
    'dataQuality',
    'wins',
    'trends',
    'possiblePlateauReasons',
    'nextWeekPlan',
    'caution',
  ],
} as const;

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null);
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function difference(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null);
  if (usable.length < 2) return null;
  return usable.at(-1)! - usable[0];
}

function correlation(pairs: Array<[number | null, number | null]>): number | null {
  const usable = pairs.filter((pair): pair is [number, number] => pair[0] !== null && pair[1] !== null);
  if (usable.length < 3) return null;
  const xs = usable.map(([x]) => x);
  const ys = usable.map(([, y]) => y);
  const xMean = average(xs)!;
  const yMean = average(ys)!;
  const numerator = usable.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
  const denominator = Math.sqrt(
    xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0)
    * ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0),
  );
  return denominator > 0 ? Math.round((numerator / denominator) * 100) / 100 : null;
}

function dateKeys(start: string, count: number): string[] {
  const cursor = new Date(`${start}T12:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(cursor);
    current.setDate(cursor.getDate() + index);
    return [
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, '0'),
      String(current.getDate()).padStart(2, '0'),
    ].join('-');
  });
}

function summarizeNutrition(row: DailyLogRow | undefined) {
  const meals = Array.isArray(row?.meals) ? row.meals : [];
  let caloriesKcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const meal of meals) {
    for (const item of Array.isArray(meal.items) ? meal.items : []) {
      caloriesKcal += finite(item.caloriesKcal) ?? 0;
      proteinG += finite(item.proteinG) ?? 0;
      carbsG += finite(item.carbsG) ?? 0;
      fatG += finite(item.fatG) ?? 0;
    }
  }
  proteinG += finite(row?.protein_g) ?? 0;
  return {
    caloriesKcal: Math.round(caloriesKcal),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    mealCount: meals.length,
  };
}

function workoutCompletion(workout: Record<string, WorkoutItem> | null | undefined): number | null {
  const items = workout && typeof workout === 'object' ? Object.values(workout) : [];
  if (!items.length) return null;
  const target = items.reduce((sum, item) => sum + Math.max(0, finite(item.target) ?? 0), 0);
  const count = items.reduce((sum, item) => sum + Math.max(0, finite(item.count) ?? 0), 0);
  return target > 0 ? Math.round(Math.min(count / target, 1) * 100) : null;
}

function waistToInches(value: unknown): number | null {
  const stored = finite(value);
  if (stored === null) return null;
  // Compatibility with the first Progress release where some users entered
  // inches while the UI label still said centimeters.
  if (stored < 45) return Math.round(stored * 10) / 10;
  return Math.round((stored / 2.54) * 10) / 10;
}

function dataQuality(snapshot: WeeklySnapshot) {
  const possible = 7 * 5;
  const collected = snapshot.aggregates.checkinDays
    + snapshot.aggregates.nutritionLoggedDays
    + snapshot.aggregates.weightLoggedDays
    + snapshot.aggregates.waistLoggedDays
    + snapshot.aggregates.trainingLoggedDays;
  return Math.round((collected / possible) * 100);
}

function offlineReview(snapshot: WeeklySnapshot): WeeklyReview {
  const quality = dataQuality(snapshot);
  const missing: string[] = [];
  if (snapshot.aggregates.nutritionLoggedDays < 4) missing.push('ข้อมูลอาหารอย่างน้อย 4 วัน');
  if (snapshot.aggregates.weightLoggedDays < 2) missing.push('น้ำหนักอย่างน้อย 2 วัน');
  if (snapshot.aggregates.checkinDays < 4) missing.push('การนอนและความรู้สึกอย่างน้อย 4 วัน');
  if (snapshot.aggregates.waistLoggedDays < 2) missing.push('รอบเอวอย่างน้อย 2 ครั้ง');

  const weightChange = snapshot.aggregates.weightChangeKg;
  const waistChange = snapshot.aggregates.waistChangeIn;
  return {
    headline: 'สรุปสัปดาห์ที่ผ่านมา',
    summary: 'ภาพรวมนี้ใช้ข้อมูลที่บันทึกจริงและเน้นแนวโน้มหลายวัน หากข้อมูลยังไม่ครบควรเก็บต่อก่อนปรับแผนครั้งใหญ่',
    dataQuality: {
      score: quality,
      message: quality >= 70 ? 'ข้อมูลค่อนข้างครบสำหรับดูแนวโน้ม' : 'ข้อมูลยังขาดบางวัน การสรุปจึงมีข้อจำกัด',
      missing,
    },
    wins: [
      `บันทึก Check-in ${snapshot.aggregates.checkinDays} วัน`,
      `บันทึกอาหาร ${snapshot.aggregates.nutritionLoggedDays} วัน`,
      `มีข้อมูลการซ้อม ${snapshot.aggregates.trainingLoggedDays} วัน`,
    ].filter((text) => !text.includes(' 0 ')),
    trends: {
      weight: weightChange === null
        ? 'ข้อมูลน้ำหนักยังไม่พอสำหรับเทียบต้นสัปดาห์กับปลายสัปดาห์'
        : `น้ำหนักเปลี่ยน ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} กก. ในสัปดาห์นี้`,
      waist: waistChange === null
        ? 'ข้อมูลรอบเอวยังไม่พอสำหรับดูแนวโน้ม'
        : `รอบเอวเปลี่ยน ${waistChange > 0 ? '+' : ''}${waistChange.toFixed(1)} นิ้ว`,
      nutrition: snapshot.aggregates.averageCaloriesKcal === null
        ? 'ข้อมูลโภชนาการยังไม่พอ'
        : `พลังงานเฉลี่ย ${Math.round(snapshot.aggregates.averageCaloriesKcal)} kcal และโปรตีนเฉลี่ย ${Math.round(snapshot.aggregates.averageProteinG ?? 0)} กรัมในวันที่บันทึก`,
      sleepAndHunger: snapshot.aggregates.averageSleepHours === null
        ? 'ข้อมูลการนอนและความหิวยังไม่พอ'
        : `นอนเฉลี่ย ${snapshot.aggregates.averageSleepHours.toFixed(1)} ชั่วโมง และความหิวเฉลี่ย ${snapshot.aggregates.averageHunger?.toFixed(1) ?? '-'} จาก 5`,
      training: snapshot.aggregates.workoutCompletionAverage === null
        ? 'ข้อมูลการออกกำลังกายยังไม่พอ'
        : `ทำตามแผนออกกำลังกายเฉลี่ย ${Math.round(snapshot.aggregates.workoutCompletionAverage)}% ในวันที่มีการบันทึก`,
    },
    possiblePlateauReasons: quality < 50
      ? ['ข้อมูลยังไม่ครบพอที่จะบอกเหตุผลของน้ำหนักนิ่งได้อย่างน่าเชื่อถือ']
      : ['น้ำหนักรายสัปดาห์อาจได้รับผลจากน้ำ โซเดียม การย่อยอาหาร และความสม่ำเสมอในการบันทึก'],
    nextWeekPlan: [
      'บันทึกอาหารและ Check-in อย่างน้อย 4 วัน',
      'ชั่งน้ำหนักในเวลาและเงื่อนไขใกล้เคียงกัน',
      'รักษาแผนเดิมอีกหนึ่งสัปดาห์ก่อนปรับครั้งใหญ่ หากยังมีข้อมูลไม่ครบ',
    ],
    caution: 'รายงานนี้เป็นแนวทางจากข้อมูลที่บันทึก ไม่ใช่การวินิจฉัยทางการแพทย์',
  };
}

export async function POST(request: Request) {
  if (contentLengthExceeds(request, 20_000)) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลคำขอมากเกินไป' }, { status: 413 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนสร้างรายงาน' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    targetCaloriesKcal?: unknown;
    targetProteinG?: unknown;
  };
  const targetCaloriesKcal = finite(body.targetCaloriesKcal);
  const targetProteinG = finite(body.targetProteinG);
  const { weekStart, weekEnd } = previousCompletedWeek();
  const previousStartDate = new Date(`${weekStart}T12:00:00`);
  previousStartDate.setDate(previousStartDate.getDate() - 7);
  const previousStart = [
    previousStartDate.getFullYear(),
    String(previousStartDate.getMonth() + 1).padStart(2, '0'),
    String(previousStartDate.getDate()).padStart(2, '0'),
  ].join('-');

  const [logsResult, checkinsResult, measurementsResult] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('log_date, protein_g, protein_events, workout, meals')
      .eq('user_id', authData.user.id)
      .gte('log_date', weekStart)
      .lte('log_date', weekEnd),
    supabase
      .from('daily_checkins')
      .select('checkin_date, sleep_hours, water_ml, energy_level, hunger_level, mood')
      .eq('user_id', authData.user.id)
      .gte('checkin_date', weekStart)
      .lte('checkin_date', weekEnd),
    supabase
      .from('body_measurements')
      .select('measured_on, weight_kg, waist_cm')
      .eq('user_id', authData.user.id)
      .gte('measured_on', previousStart)
      .lte('measured_on', weekEnd)
      .order('measured_on', { ascending: true }),
  ]);

  const firstError = logsResult.error || checkinsResult.error || measurementsResult.error;
  if (firstError) {
    return NextResponse.json({ ok: false, error: firstError.message }, { status: 500 });
  }

  const logs = (logsResult.data ?? []) as DailyLogRow[];
  const checkins = (checkinsResult.data ?? []) as CheckinRow[];
  const measurements = (measurementsResult.data ?? []) as MeasurementRow[];
  const logsByDate = new Map(logs.map((row) => [row.log_date, row]));
  const checkinsByDate = new Map(checkins.map((row) => [row.checkin_date, row]));
  const measurementsByDate = new Map(measurements.map((row) => [row.measured_on, row]));

  const days: DaySnapshot[] = dateKeys(weekStart, 7).map((date) => {
    const log = logsByDate.get(date);
    const checkin = checkinsByDate.get(date);
    const measurement = measurementsByDate.get(date);
    const nutrition = summarizeNutrition(log);
    return {
      date,
      weightKg: finite(measurement?.weight_kg),
      waistIn: waistToInches(measurement?.waist_cm),
      sleepHours: finite(checkin?.sleep_hours),
      waterLiters: checkin?.water_ml === null || checkin?.water_ml === undefined
        ? null
        : Math.round((checkin.water_ml / 1000) * 10) / 10,
      energyLevel: checkin?.energy_level ?? null,
      hungerLevel: checkin?.hunger_level ?? null,
      mood: checkin?.mood ?? null,
      ...nutrition,
      workoutCompletionPercent: workoutCompletion(log?.workout),
    };
  });

  const weekMeasurements = measurements.filter((row) => row.measured_on >= weekStart);
  const baselineWeight = measurements
    .filter((row) => row.measured_on < weekStart)
    .map((row) => finite(row.weight_kg))
    .filter((value): value is number => value !== null)
    .at(-1) ?? null;
  const baselineWaist = measurements
    .filter((row) => row.measured_on < weekStart)
    .map((row) => waistToInches(row.waist_cm))
    .filter((value): value is number => value !== null)
    .at(-1) ?? null;
  const weekWeights = weekMeasurements.map((row) => finite(row.weight_kg));
  const weekWaists = weekMeasurements.map((row) => waistToInches(row.waist_cm));
  const nutritionDays = days.filter((day) => day.mealCount > 0 || day.proteinG > 0);
  const trainingDays = days.filter((day) => day.workoutCompletionPercent !== null);

  const snapshot: WeeklySnapshot = {
    weekStart,
    weekEnd,
    targets: {
      caloriesKcal: targetCaloriesKcal !== null ? Math.min(20_000, Math.max(0, targetCaloriesKcal)) : null,
      proteinG: targetProteinG !== null ? Math.min(1_000, Math.max(0, targetProteinG)) : null,
    },
    days,
    aggregates: {
      checkinDays: days.filter((day) => (
        day.sleepHours !== null
        || day.energyLevel !== null
        || day.hungerLevel !== null
        || day.mood !== null
      )).length,
      nutritionLoggedDays: nutritionDays.length,
      trainingLoggedDays: trainingDays.length,
      weightLoggedDays: weekWeights.filter((value) => value !== null).length,
      waistLoggedDays: weekWaists.filter((value) => value !== null).length,
      averageCaloriesKcal: average(nutritionDays.map((day) => day.caloriesKcal)),
      averageProteinG: average(nutritionDays.map((day) => day.proteinG)),
      averageSleepHours: average(days.map((day) => day.sleepHours)),
      averageHunger: average(days.map((day) => day.hungerLevel)),
      averageEnergy: average(days.map((day) => day.energyLevel)),
      workoutCompletionAverage: average(trainingDays.map((day) => day.workoutCompletionPercent)),
      weightChangeKg: difference([
        baselineWeight,
        ...weekWeights,
      ]),
      waistChangeIn: difference([
        baselineWaist,
        ...weekWaists,
      ]),
      sleepHungerCorrelation: correlation(days.map((day) => [day.sleepHours, day.hungerLevel])),
    },
  };

  const sourceHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const { data: cached, error: cachedError } = await supabase
    .from('weekly_reviews')
    .select('week_start, week_end, source_hash, review, model, generated_at')
    .eq('user_id', authData.user.id)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (cachedError) {
    return NextResponse.json({ ok: false, error: cachedError.message }, { status: 500 });
  }
  if (cached?.source_hash === sourceHash) {
    return NextResponse.json({
      ok: true,
      record: {
        weekStart: cached.week_start,
        weekEnd: cached.week_end,
        generatedAt: cached.generated_at,
        source: cached.model === 'offline' ? 'offline' : 'ai',
        cached: true,
        review: cached.review,
      },
    });
  }

  const rateLimit = checkRateLimit(`weekly:${authData.user.id}`, {
    limit: 4,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'สร้างรายงานใหม่บ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
      { status: 429, headers: { 'retry-after': String(rateLimit.retryAfterSeconds) } },
    );
  }

  const fallback = offlineReview(snapshot);
  let review = fallback;
  let modelUsed = 'offline';

  if (process.env.GEMINI_API_KEY) {
    const prompt = `คุณคือ AI Coach ที่สรุปรายงานสุขภาพรายสัปดาห์เป็นภาษาไทย

หลักการ:
- วิเคราะห์เฉพาะข้อมูลที่ให้มา และระบุข้อจำกัดเมื่อข้อมูลไม่ครบ
- เน้นแนวโน้มหลายวัน ไม่ตัดสินจากน้ำหนักวันเดียว
- วิเคราะห์การกิน การนอน ความหิว พลังงาน รอบเอว น้ำหนัก และการซ้อมร่วมกัน
- หากน้ำหนักนิ่ง ให้เสนอ "สาเหตุที่เป็นไปได้" เท่านั้น ห้ามฟันธง
- ห้ามวินิจฉัยโรค ห้ามแนะนำลดแคลอรีรุนแรง
- ให้แผนสัปดาห์หน้าเพียง 3 ข้อที่วัดผลและทำได้จริง
- คะแนนคุณภาพข้อมูล 0–100 ต้องสอดคล้องกับจำนวนวันที่บันทึก

ข้อมูลสรุปที่คำนวณแล้ว:
${JSON.stringify(snapshot)}

ตอบ JSON ตาม schema เท่านั้น`;

    const ai = createGeminiClient();
    for (const model of getGeminiModelCandidates()) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            temperature: 0.2,
            maxOutputTokens: 2600,
            responseMimeType: 'application/json',
            responseJsonSchema: reviewSchema,
          },
        });
        const parsed = parseGeminiJson<WeeklyReview>(response.text ?? '');
        if (parsed.ok) {
          review = parsed.value;
          modelUsed = model;
          break;
        }
      } catch (error) {
        console.error(`Weekly review model ${model} failed`, error);
      }
    }
  }

  const { error: saveError } = await supabase.from('weekly_reviews').upsert({
    user_id: authData.user.id,
    week_start: weekStart,
    week_end: weekEnd,
    source_hash: sourceHash,
    source_snapshot: snapshot,
    review,
    model: modelUsed,
    generated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,week_start' });

  if (saveError) {
    return NextResponse.json({ ok: false, error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    record: {
      weekStart,
      weekEnd,
      generatedAt: new Date().toISOString(),
      source: modelUsed === 'offline' ? 'offline' : 'ai',
      cached: false,
      review,
    },
  });
}
