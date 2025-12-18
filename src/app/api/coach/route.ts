import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { parseGeminiJson } from '@/lib/geminiJson';

type Sex = 'male' | 'female';

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';

type Goal = 'lose_weight' | 'lose_fat' | 'maintain' | 'gain_muscle' | 'gain_weight';

type CoachProfile = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;

  waistIn?: number;
  hipIn?: number;
  chestIn?: number;
  neckIn?: number;
  armIn?: number;
  thighIn?: number;

  goal: Goal;
  goalDetail?: string;
  experience?: 'beginner' | 'intermediate' | 'advanced';
  trainingDaysPerWeek?: number;
};

type Derived = {
  bmi: number;
  bmiCategory: string;
  healthyWeightKg: [number, number];
  bmr: number;
  tdee: number;
  target: number;
  whr: number | null;
  whtr: number | null;
  proteinRange: [number, number];
};

type CoachRequestBody = {
  profile: CoachProfile;
  derived: Derived;
  messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
};

type CoachJson = { adviceMarkdown: string; notes?: string[]; followUpQuestions?: string[] };

function tryExtractRetryAfterSeconds(message: string): number | null {
  // Common Gemini error includes: "Please retry in 48.76s" or "retryDelay":"48s"
  const m1 = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (m1?.[1]) return Math.ceil(Number(m1[1]));
  const m2 = message.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function offlineCoachFallback(params: {
  profile: CoachProfile;
  derived: Derived;
  lastUserText?: string;
}) {
  const { profile, derived, lastUserText } = params;

  const intro = `ตอนนี้โควต้าการเรียก AI เต็มชั่วคราว เลยตอบแบบ “โค้ชออฟไลน์” ให้ก่อนนะครับ (ยังคำนวณจากข้อมูลของคุณได้ปกติ)`;
  const headline = `สรุปของคุณตอนนี้: BMI ${derived.bmi.toFixed(1)} (${derived.bmiCategory}) • TDEE ~${Math.round(derived.tdee)} kcal/วัน`;
  const targetLine = `เป้าพลังงานที่แนะนำตอนนี้: ~${Math.round(derived.target)} kcal/วัน • โปรตีน ${derived.proteinRange[0]}–${derived.proteinRange[1]} g/วัน`;

  const hydration = `น้ำ: เริ่มที่ 30–35 ml/กก./วัน (และเพิ่มตามเหงื่อ/อากาศ)`;
  const training = `ซ้อม: สัปดาห์ละ ${profile.trainingDaysPerWeek ?? '-'} วัน → เน้นเวท 2–4 วัน + คาร์ดิโอเบา 1–2 วัน (ตามเวลาจริงของคุณ)`;
  const habit = `พฤติกรรม: นอน 7–8 ชม., เดินเพิ่มวันละ 6,000–10,000 ก้าว, เลือกโปรตีนทุกมื้อ`;

  const sevenDay = `### แผนเริ่มต้น 7 วัน (ทำง่าย ๆ)
- วัน 1: ตั้งเป้าแคล/โปรตีน + เดิน 30 นาที
- วัน 2: เวททั้งตัว 30–45 นาที (พื้นฐาน)
- วัน 3: เดินเร็ว/คาร์ดิโอเบา 20–30 นาที + ยืดเหยียด
- วัน 4: เวทช่วงบน
- วัน 5: เดิน/กิจกรรมเบา + คุมหวาน/น้ำหวาน
- วัน 6: เวทช่วงล่าง
- วัน 7: พักฟื้น + สรุป 1 สัปดาห์ (น้ำหนัก/รอบเอว/พลังงาน)
`;

  const answerHint = lastUserText
    ? `\n\n> คุณถามว่า: “${lastUserText}”\nถ้าบอกเพิ่มว่า “กิน/ซ้อมจริงตอนนี้เป็นยังไง” ผมจะปรับคำแนะนำให้ตรงขึ้นได้ครับ`
    : '';

  const adviceMarkdown = [intro, '', headline, targetLine, '', hydration, training, habit, '', sevenDay, answerHint].join('\n');

  return {
    adviceMarkdown,
    followUpQuestions: [
      'วันนี้คุณกินโปรตีนประมาณกี่กรัมแล้ว?',
      'คุณซ้อมกี่วัน/สัปดาห์และมีอุปกรณ์อะไรบ้าง?',
      'อยากโฟกัส “ลดไขมัน” หรือ “เพิ่มกล้าม” มากกว่ากัน?',
    ],
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CoachRequestBody;

    const { profile, derived } = body;

    const history = Array.isArray(body.messages) ? body.messages.slice(-24) : [];

    const systemStyle =
      'คุณคือโค้ชสุขภาพและฟิตเนสส่วนตัว ตอบเป็นภาษาไทยเท่านั้น โทนสุภาพ เป็นกันเอง ให้กำลังใจ\n'
      + 'หลีกเลี่ยงการวินิจฉัยโรค หากมีความเสี่ยง/อาการผิดปกติให้แนะนำปรึกษาแพทย์\n'
      + 'ให้คำแนะนำแบบทำได้จริง เน้นความปลอดภัยและความยั่งยืน';

    // If no key, return offline fallback instead of hard-failing.
    if (!process.env.GEMINI_API_KEY) {
      const lastUserText = history.filter((m) => m.role === 'user').slice(-1)[0]?.text;
      const fb = offlineCoachFallback({ profile, derived, lastUserText });
      return NextResponse.json({
        ok: true,
        adviceMarkdown: fb.adviceMarkdown,
        summary: {
          bmi: derived.bmi,
          bmiCategoryTh: derived.bmiCategory,
          bmrKcal: Math.round(derived.bmr),
          tdeeKcal: Math.round(derived.tdee),
          targetKcal: Math.round(derived.target),
          proteinGRange: derived.proteinRange,
        },
        followUpQuestions: fb.followUpQuestions,
      });
    }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Keep prompt compact, friendly, and Thai-only.
    const prompt = `${systemStyle}

ข้อมูลผู้ใช้งาน (สรุป):
- เพศ: ${profile.sex === 'male' ? 'ชาย' : 'หญิง'}
- อายุ: ${profile.ageYears} ปี
- ส่วนสูง: ${profile.heightCm} ซม.
- น้ำหนัก: ${profile.weightKg} กก.
- กิจกรรม: ${profile.activity}
- เป้าหมาย: ${profile.goal}
- รายละเอียดเป้าหมาย: ${profile.goalDetail ?? '-'}
- วันซ้อม/สัปดาห์: ${profile.trainingDaysPerWeek ?? '-'}
- ประสบการณ์: ${profile.experience ?? '-'}
- รอบตัว (นิ้ว): เอว ${profile.waistIn ?? '-'} | สะโพก ${profile.hipIn ?? '-'} | อก ${profile.chestIn ?? '-'} | คอ ${profile.neckIn ?? '-'}

ค่าที่คำนวณได้:
- BMI: ${derived.bmi.toFixed(1)} (${derived.bmiCategory})
- BMR: ${Math.round(derived.bmr)} kcal
- TDEE: ${Math.round(derived.tdee)} kcal
- เป้าหมายแคลอรี่/วัน: ${Math.round(derived.target)} kcal
- โปรตีนแนะนำ: ${derived.proteinRange[0]}–${derived.proteinRange[1]} g/วัน
- WHtR: ${derived.whtr ? derived.whtr.toFixed(2) : '-'}
- WHR: ${derived.whr ? derived.whr.toFixed(2) : '-'}

บริบทบทสนทนาล่าสุด (สำคัญ):
${history.length ? history.map((m) => `- ${m.role === 'user' ? 'ผู้ใช้' : 'โค้ช'}: ${m.text}`).join('\n') : '- ยังไม่มี'}

คำขอล่าสุดของผู้ใช้: ให้ตอบต่อไป “สอดคล้องกับบทสนทนาก่อนหน้า” และ “ลงมือได้จริง”

งานของคุณ:
1) ตอบคำถามล่าสุดของผู้ใช้อย่างตรงประเด็น และเชื่อมกับข้อมูลร่างกาย/เป้าหมายด้านบน
2) ถ้าผู้ใช้ยังไม่บอกข้อมูลสำคัญ ให้ถามกลับแบบสั้น ๆ 1–3 ข้อ (อย่าถามเยอะ)
3) ถ้าผู้ใช้ขอแผน ให้ให้ “ขั้นตอน 7 วัน” แบบ bullet สั้น ๆ

ตอบกลับเป็น JSON เท่านั้น ตามสคีมานี้:
{
  "adviceMarkdown": "คำตอบของโค้ช (markdown ได้)",
  "followUpQuestions": ["คำถามต่อ 0-3 ข้อ"],
  "notes": ["คำเตือนด้านสุขภาพแบบสุภาพ 1-2 ข้อ (เช่น หากมีโรคประจำตัวควรปรึกษาแพทย์)"]
}
ห้ามใส่ข้อความนอก JSON`;

    // Model availability can vary by project / API access. We'll try a small fallback chain.
    // Also: coach prompts can get large (history + profile). Keeping the response shorter helps avoid quota/rate limits.
    const modelCandidates = [
      process.env.GEMINI_MODEL,
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
    ].filter(Boolean) as string[];

    let resultText = '';
    let lastErr: unknown = null;
    try {
      for (const model of modelCandidates) {
        try {
          const result = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          });
          resultText = result.text ?? '';
          lastErr = null;
          break;
        } catch (e: unknown) {
          lastErr = e;
          continue;
        }
      }

      if (!resultText) {
        throw lastErr instanceof Error ? lastErr : new Error('No supported Gemini model found for coach.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Quota/rate-limit fallback
      if (/RESOURCE_EXHAUSTED|quota|429|rate limit/i.test(msg)) {
        const retryAfterSec = tryExtractRetryAfterSeconds(msg);
        const lastUserText = history.filter((m) => m.role === 'user').slice(-1)[0]?.text;
        const fb = offlineCoachFallback({ profile, derived, lastUserText });
        return NextResponse.json({
          ok: true,
          adviceMarkdown:
            fb.adviceMarkdown +
            (retryAfterSec ? `\n\n> หมายเหตุ: ระบบ AI เต็มชั่วคราว ลองใหม่ได้ในประมาณ ${retryAfterSec} วินาที` :
              '\n\n> หมายเหตุ: ระบบ AI เต็มชั่วคราว ลองใหม่อีกสักครู่ได้ครับ'),
          summary: {
            bmi: derived.bmi,
            bmiCategoryTh: derived.bmiCategory,
            bmrKcal: Math.round(derived.bmr),
            tdeeKcal: Math.round(derived.tdee),
            targetKcal: Math.round(derived.target),
            proteinGRange: derived.proteinRange,
          },
          followUpQuestions: fb.followUpQuestions,
          retryAfterSec,
        });
      }

      return NextResponse.json(
        { ok: false, error: msg || 'เกิดข้อผิดพลาดในการเรียกโค้ช' },
        { status: 502 },
      );
    }

    let parsed = parseGeminiJson<CoachJson>(resultText);

    // Second pass (best effort): ask Gemini to reformat into strict JSON.
    if (!parsed.ok) {
      const repairInstruction =
        'Convert the following content into a SINGLE valid JSON object ONLY (no markdown, no fences, no extra text).\n'
        + 'It MUST match this schema EXACTLY:\n'
        + '{"adviceMarkdown":"string","followUpQuestions":["string"],"notes":["string"]}';

      let repairText = '';
      let repairErr: unknown = null;
      for (const model of modelCandidates) {
        try {
          const repairResp = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: repairInstruction },
                  { text: `\n\nSOURCE:\n${resultText}` },
                ],
              },
            ],
            config: {
              temperature: 0,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          });
          repairText = repairResp.text ?? '';
          repairErr = null;
          break;
        } catch (e: unknown) {
          repairErr = e;
          continue;
        }
      }

      if (repairText) {
        parsed = parseGeminiJson<CoachJson>(repairText);
      } else if (repairErr instanceof Error && /RESOURCE_EXHAUSTED|quota|429|rate limit/i.test(repairErr.message)) {
        // If repair attempt hits quota, we'll fall back to offline below.
      }
    }

    if (!parsed.ok || !parsed.value?.adviceMarkdown || typeof parsed.value.adviceMarkdown !== 'string') {
      // If parsing still fails, keep UX usable instead of hard error.
      const lastUserText = history.filter((m) => m.role === 'user').slice(-1)[0]?.text;
      const fb = offlineCoachFallback({ profile, derived, lastUserText });
      return NextResponse.json({
        ok: true,
        adviceMarkdown:
          fb.adviceMarkdown +
          '\n\n> หมายเหตุ: AI ตอบกลับไม่เป็น JSON ที่ระบบอ่านได้ ระบบเลยสลับเป็นโค้ชออฟไลน์ให้ก่อนครับ (ลองส่งใหม่อีกครั้งได้)',
        summary: {
          bmi: derived.bmi,
          bmiCategoryTh: derived.bmiCategory,
          bmrKcal: Math.round(derived.bmr),
          tdeeKcal: Math.round(derived.tdee),
          targetKcal: Math.round(derived.target),
          proteinGRange: derived.proteinRange,
        },
        followUpQuestions: fb.followUpQuestions,
      });
    }

    return NextResponse.json({
      ok: true,
  adviceMarkdown: parsed.value.adviceMarkdown,
      summary: {
        bmi: derived.bmi,
        bmiCategoryTh: derived.bmiCategory,
        bmrKcal: Math.round(derived.bmr),
        tdeeKcal: Math.round(derived.tdee),
        targetKcal: Math.round(derived.target),
        proteinGRange: derived.proteinRange,
      },
      followUpQuestions: Array.isArray(parsed.value.followUpQuestions)
        ? parsed.value.followUpQuestions.filter((x) => typeof x === 'string').slice(0, 3)
        : [],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ' },
      { status: 500 },
    );
  }
}
