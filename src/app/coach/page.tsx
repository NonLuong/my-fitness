'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Flame,
  HeartPulse,
  Info,
  MessageCircle,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';

type Sex = 'male' | 'female';
type Experience = 'beginner' | 'intermediate' | 'advanced';

type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'athlete';

type Goal = 'lose_weight' | 'lose_fat' | 'maintain' | 'gain_muscle' | 'gain_weight';

type CoachProfile = {
  sex: Sex;
  ageYears?: number;
  heightCm?: number;
  weightKg?: number;
  activity: ActivityLevel;

  // Body measurements in inches (per user requirement)
  waistIn?: number;
  hipIn?: number;
  chestIn?: number;
  neckIn?: number;
  armIn?: number;
  thighIn?: number;

  goal: Goal;
  goalDetail?: string;

  targetWeightKg?: number;
  targetWeeks?: number;

  experience?: Experience;
  trainingDaysPerWeek?: number;
};

type ChatRole = 'user' | 'assistant';
type CoachChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
};

type CoachApiResponse =
  | {
      ok: true;
      adviceMarkdown: string;
      summary: {
        bmi: number;
        bmiCategoryTh: string;
        bmrKcal: number;
        tdeeKcal: number;
        targetKcal: number;
        proteinGRange: [number, number];
        bodyFatPercent?: number | null;
        suggestedPace?: {
          kgPerWeek: number;
          messageTh: string;
        };
      };
      followUpQuestions?: string[];
    }
  | { ok: false; error: string };

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

function round(n: number) {
  return Math.round(n);
}

function inchesToCm(inches: number) {
  return inches * 2.54;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function uid(prefix = 'm') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function bmiCategoryTh(bmi: number): string {
  // Thai/Asia-Pacific-ish categories (simple + friendly)
  if (!Number.isFinite(bmi) || bmi <= 0) return 'ไม่ทราบ';
  if (bmi < 18.5) return 'น้ำหนักต่ำกว่าเกณฑ์';
  if (bmi < 23) return 'สมส่วน';
  if (bmi < 25) return 'น้ำหนักเกิน';
  if (bmi < 30) return 'อ้วนระดับ 1';
  return 'อ้วนระดับ 2';
}

function calcBmi(heightCm: number, weightKg: number) {
  const hM = heightCm / 100;
  if (!Number.isFinite(hM) || hM <= 0) return 0;
  return weightKg / (hM * hM);
}

function calcHealthyWeightRangeKg(heightCm: number) {
  const hM = heightCm / 100;
  if (!Number.isFinite(hM) || hM <= 0) return [0, 0] as const;
  // BMI 18.5–24.9
  return [18.5 * hM * hM, 24.9 * hM * hM] as const;
}

function calcBmrMifflinStJeor(sex: Sex, ageYears: number, heightCm: number, weightKg: number) {
  // BMR = 10W + 6.25H - 5A + s
  // s = +5 male, -161 female
  const s = sex === 'male' ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + s;
}

function calcDailyWeightChangeFromTarget(weightKg: number, targetWeightKg: number, targetWeeks: number) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(targetWeightKg) || !Number.isFinite(targetWeeks)) return null;
  if (targetWeeks <= 0) return null;
  return (targetWeightKg - weightKg) / targetWeeks; // kg/week (negative = lose)
}

function suggestedSafePaceKgPerWeek(goal: Goal, weightKg: number): { kgPerWeek: number; messageTh: string } {
  // Conservative “safe” pace guidance (not medical).
  // Loss: 0.25–0.75% bodyweight/week; Gain: 0.25–0.5%/week.
  const lossMin = weightKg * 0.0025;
  const lossMax = weightKg * 0.0075;
  const gainMin = weightKg * 0.0025;
  const gainMax = weightKg * 0.005;

  if (goal === 'gain_weight' || goal === 'gain_muscle') {
    return {
      kgPerWeek: round(gainMax * 100) / 100,
      messageTh: `โดยทั่วไป เพิ่มน้ำหนักแบบคุมคุณภาพประมาณ ${gainMin.toFixed(2)}–${gainMax.toFixed(2)} กก./สัปดาห์ (ค่อยเป็นค่อยไป จะยั่งยืนกว่า)`
    };
  }

  return {
    kgPerWeek: round(lossMax * 100) / 100,
    messageTh: `โดยทั่วไป ลดแบบปลอดภัยประมาณ ${lossMin.toFixed(2)}–${lossMax.toFixed(2)} กก./สัปดาห์ (ไม่โหดเกินไป จะทำต่อได้ยาว)`
  };
}

function kcalAdjustmentForRate(deltaKgPerWeek: number) {
  // 1kg fat ~ 7700 kcal (rough). Split per day.
  // Negative delta -> deficit; positive -> surplus.
  return (deltaKgPerWeek * 7700) / 7;
}

function log10(x: number) {
  return Math.log(x) / Math.log(10);
}

function calcBodyFatUsNavy(sex: Sex, heightCm: number, waistIn?: number, neckIn?: number, hipIn?: number) {
  // Requires inches for circumferences. Height is cm.
  if (!waistIn || !neckIn) return null;
  const heightIn = heightCm / 2.54;
  if (!Number.isFinite(heightIn) || heightIn <= 0) return null;

  const waist = waistIn;
  const neck = neckIn;

  if (sex === 'male') {
    const a = waist - neck;
    if (a <= 0) return null;
    const bf = 86.010 * log10(a) - 70.041 * log10(heightIn) + 36.76;
    return clamp(bf, 2, 60);
  }

  // female
  if (!hipIn) return null;
  const b = waist + hipIn - neck;
  if (b <= 0) return null;
  const bf = 163.205 * log10(b) - 97.684 * log10(heightIn) - 78.387;
  return clamp(bf, 5, 70);
}

function goalLabelTh(goal: Goal): string {
  switch (goal) {
    case 'lose_weight':
      return 'ลดน้ำหนัก';
    case 'lose_fat':
      return 'ลดไขมัน';
    case 'maintain':
      return 'คุมหุ่น';
    case 'gain_muscle':
      return 'เพิ่มกล้ามเนื้อ';
    case 'gain_weight':
      return 'เพิ่มน้ำหนัก';
  }
}

function activityLabelTh(a: ActivityLevel): string {
  switch (a) {
    case 'sedentary':
      return 'นั่งทำงานเป็นหลัก (ออกกำลังกายน้อย)';
    case 'light':
      return 'ขยับบ้าง/ออกกำลัง 1–3 วัน/สัปดาห์';
    case 'moderate':
      return 'ออกกำลัง 3–5 วัน/สัปดาห์';
    case 'active':
      return 'ออกกำลังหนัก 6–7 วัน/สัปดาห์';
    case 'athlete':
      return 'นักกีฬา/งานใช้แรงมาก';
  }
}

function goalKcalTarget(tdee: number, goal: Goal): number {
  // Conservative defaults; AI can personalize further.
  switch (goal) {
    case 'lose_weight':
    case 'lose_fat':
      return tdee * 0.85;
    case 'maintain':
      return tdee;
    case 'gain_muscle':
      return tdee * 1.08;
    case 'gain_weight':
      return tdee * 1.12;
  }
}

function proteinRangeG(weightKg: number, goal: Goal): [number, number] {
  // g/kg/day
  const minPerKg = goal === 'gain_muscle' ? 1.8 : goal === 'lose_fat' ? 1.8 : 1.6;
  const maxPerKg = goal === 'gain_muscle' ? 2.2 : 2.2;
  return [round(weightKg * minPerKg), round(weightKg * maxPerKg)];
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

export default function CoachPage() {
  const STORAGE_KEY = 'coach_chat_v1';
  const PROFILE_KEY = 'coach_profile_v1';

  const [profile, setProfile] = useState<CoachProfile>({
    sex: 'male',
    activity: 'moderate',
    goal: 'lose_fat',
    experience: 'beginner',
    trainingDaysPerWeek: 3,
  });

  type Draft = {
    ageYears: string;
    heightCm: string;
    weightKg: string;
    waistIn: string;
    hipIn: string;
    chestIn: string;
    neckIn: string;
    armIn: string;
    thighIn: string;
    targetWeightKg: string;
    targetWeeks: string;
    trainingDaysPerWeek: string;
  };

  const [draftProfile, setDraftProfile] = useState<Draft>({
    ageYears: '',
    heightCm: '',
    weightKg: '',
    waistIn: '',
    hipIn: '',
    chestIn: '',
    neckIn: '',
    armIn: '',
    thighIn: '',
    targetWeightKg: '',
    targetWeeks: '',
    trainingDaysPerWeek: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const parseOptionalNumber = (raw: string, opts?: { min?: number; max?: number }) => {
    const t = raw.trim().replace(',', '.');
    if (!t) return undefined;
    const v = Number(t);
    if (!Number.isFinite(v)) return undefined;
    const min = opts?.min ?? -Infinity;
    const max = opts?.max ?? Infinity;
    return clamp(v, min, max);
  };

  const commitNumber = <K extends keyof CoachProfile>(key: K, raw: string, opts?: { min?: number; max?: number }) => {
    const v = parseOptionalNumber(raw, opts);
    setProfile((p) => ({ ...p, [key]: v as CoachProfile[K] }));
  };

  useEffect(() => {
    // Load profile + chat
    try {
      const rawProfile = localStorage.getItem(PROFILE_KEY);
      if (rawProfile) {
        const p = JSON.parse(rawProfile) as Partial<CoachProfile>;
        setProfile((prev) => ({ ...prev, ...p }));
      }
    } catch {
      // ignore
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { messages: CoachChatMessage[] };
        if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
      } else {
        // seed with a friendly intro
        setMessages([
          {
            id: uid('a'),
            role: 'assistant',
            text: 'สวัสดีครับ 🙂 ผมเป็นโค้ชส่วนตัวของคุณ วันนี้อยากโฟกัสเรื่อง “กิน”, “ซ้อม”, หรือ “ปรับพฤติกรรม” ก่อนดีครับ?',
            ts: Date.now(),
          },
        ]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages }));
    } catch {
      // ignore
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // ignore
    }
  }, [profile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, followUps.length, submitting]);

  const derived = useMemo(() => {
    const heightCm = profile.heightCm ?? 0;
    const weightKg = profile.weightKg ?? 0;
    const ageYears = profile.ageYears ?? 0;

    const bmi = heightCm > 0 && weightKg > 0 ? calcBmi(heightCm, weightKg) : 0;
    const [wMin, wMax] = heightCm > 0 ? calcHealthyWeightRangeKg(heightCm) : ([0, 0] as const);
    const bmr = ageYears > 0 && heightCm > 0 && weightKg > 0
      ? calcBmrMifflinStJeor(profile.sex, ageYears, heightCm, weightKg)
      : 0;
    const tdee = bmr * ACTIVITY_MULTIPLIERS[profile.activity];
    let target = goalKcalTarget(tdee, profile.goal);

    const safePace = suggestedSafePaceKgPerWeek(profile.goal, weightKg || 70);
    const desiredDeltaKgPerWeek =
      profile.targetWeightKg && profile.targetWeeks
        ? calcDailyWeightChangeFromTarget(weightKg, profile.targetWeightKg, profile.targetWeeks)
        : null;
    const desiredAdj = desiredDeltaKgPerWeek !== null ? kcalAdjustmentForRate(desiredDeltaKgPerWeek) : null;

    if (desiredAdj !== null && Number.isFinite(desiredAdj)) {
      // Guard: don't allow absurd adjustment. Clamp to +-1200 kcal/day.
      target = clamp(target + desiredAdj, Math.max(1200, tdee - 1200), tdee + 1200);
    }

    const waistCm = profile.waistIn ? inchesToCm(profile.waistIn) : null;
    const hipCm = profile.hipIn ? inchesToCm(profile.hipIn) : null;

    const whr = waistCm && hipCm ? waistCm / hipCm : null;
    const whtr = waistCm && heightCm ? waistCm / heightCm : null;

    const pRange = proteinRangeG(weightKg || 70, profile.goal);

    const bodyFat = heightCm
      ? calcBodyFatUsNavy(profile.sex, heightCm, profile.waistIn, profile.neckIn, profile.hipIn)
      : null;

    return {
      bmi,
      bmiCategory: bmiCategoryTh(bmi),
      healthyWeightKg: [wMin, wMax] as const,
      bmr,
      tdee,
      target,
      whr,
      whtr,
      proteinRange: pRange,
      bodyFat,
      safePace,
      desiredDeltaKgPerWeek,
    };
  }, [profile]);

  const canSubmit = useMemo(() => {
    if (!profile.ageYears || !profile.heightCm || !profile.weightKg) return false;
    return (
      Number.isFinite(profile.ageYears) &&
      profile.ageYears >= 10 &&
      profile.ageYears <= 90 &&
      Number.isFinite(profile.heightCm) &&
      profile.heightCm >= 120 &&
      profile.heightCm <= 230 &&
      Number.isFinite(profile.weightKg) &&
      profile.weightKg >= 30 &&
      profile.weightKg <= 250
    );
  }, [profile]);

  const sendToCoach = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setApiError(null);
    setFollowUps([]);

    const userMsg: CoachChatMessage = { id: uid('u'), role: 'user', text: trimmed, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile,
          derived,
          messages: [...messages, userMsg].map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data: CoachApiResponse = (await res.json()) as CoachApiResponse;
      if (!res.ok || !data.ok) {
        setApiError(!data.ok ? data.error : 'เกิดข้อผิดพลาดในการเรียกโค้ช');
        return;
      }
      setFollowUps(data.followUpQuestions ?? []);
      setMessages((prev) => [
        ...prev,
        {
          id: uid('a'),
          role: 'assistant',
          text: data.adviceMarkdown,
          ts: Date.now(),
        },
      ]);
      setSuccessOpen(true);
      window.setTimeout(() => setSuccessOpen(false), 1600);
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    } finally {
      setSubmitting(false);
    }
  };

  const resetChat = () => {
    setApiError(null);
    setFollowUps([]);
    setDraft('');
    setMessages([
      {
        id: uid('a'),
        role: 'assistant',
        text: 'เริ่มใหม่ได้เลยครับ 🙂 เล่าเป้าหมายของคุณ (เช่น “อยากลดไขมันหน้าท้อง”) แล้วบอกเวลาที่สะดวกซ้อมต่อสัปดาห์ด้วยนะครับ',
        ts: Date.now(),
      },
    ]);
  };

  const sendDraft = async () => {
    const t = draft;
    setDraft('');
    await sendToCoach(t);
  };

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-white/5 dark:bg-neutral-950/70">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-xs font-bold text-neutral-800 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับหน้าแรก
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-xs font-extrabold text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-white">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            โค้ชส่วนตัว
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-[28px] border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-neutral-400">
                แบบฟอร์มสุขภาพ
              </div>
              <div className="mt-0.5 text-lg font-extrabold tracking-tight text-neutral-900 dark:text-white">
                คำนวณ BMI • แคลต่อวัน • โค้ช AI
              </div>
              <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                กรอกข้อมูลให้ครบเท่าที่สะดวก (รอบตัวใช้หน่วย <b>นิ้ว</b>) แล้วกด “ขอแผนจากโค้ช”
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-3xl border border-black/5 bg-white/60 px-3 py-2 text-[11px] font-semibold text-neutral-700 dark:border-white/10 dark:bg-neutral-950/25 dark:text-neutral-200">
              <Info className="h-4 w-4" />
              Mobile‑first
            </div>
          </div>
        </motion.div>

        {/* Form */}
        <div className="grid grid-cols-1 gap-4">
          <section className="rounded-[28px] border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">ข้อมูลพื้นฐาน</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">ใช้เพื่อคำนวณ BMR/TDEE และคำแนะนำ</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">เพศ</div>
                <select
                  value={profile.sex}
                  onChange={(e) => setProfile((p) => ({ ...p, sex: e.target.value as Sex }))}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                >
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">อายุ (ปี)</div>
                <input
                  inputMode="numeric"
                  placeholder="เช่น 25"
                  value={draftProfile.ageYears}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, ageYears: e.target.value }))}
                  onBlur={() => commitNumber('ageYears', draftProfile.ageYears, { min: 10, max: 90 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">ส่วนสูง (cm)</div>
                <input
                  inputMode="numeric"
                  placeholder="เช่น 170"
                  value={draftProfile.heightCm}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, heightCm: e.target.value }))}
                  onBlur={() => commitNumber('heightCm', draftProfile.heightCm, { min: 120, max: 230 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">น้ำหนัก (kg)</div>
                <input
                  inputMode="numeric"
                  placeholder="เช่น 70"
                  value={draftProfile.weightKg}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, weightKg: e.target.value }))}
                  onBlur={() => commitNumber('weightKg', draftProfile.weightKg, { min: 30, max: 250 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">กิจกรรมประจำวัน</div>
                <select
                  value={profile.activity}
                  onChange={(e) => setProfile((p) => ({ ...p, activity: e.target.value as ActivityLevel }))}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                >
                  {Object.keys(ACTIVITY_MULTIPLIERS).map((k) => (
                    <option key={k} value={k}>
                      {activityLabelTh(k as ActivityLevel)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-[28px] border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/20 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">รอบตัว (นิ้ว)</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">ช่วยประเมินสัดส่วน (กรอกเท่าที่มี)</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รอบเอว (นิ้ว)</div>
                <input
                  inputMode="decimal"
                  placeholder="เช่น 32"
                  value={draftProfile.waistIn}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, waistIn: e.target.value }))}
                  onBlur={() => commitNumber('waistIn', draftProfile.waistIn, { min: 1, max: 90 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รอบสะโพก (นิ้ว)</div>
                <input
                  inputMode="decimal"
                  placeholder="เช่น 38"
                  value={draftProfile.hipIn}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, hipIn: e.target.value }))}
                  onBlur={() => commitNumber('hipIn', draftProfile.hipIn, { min: 1, max: 120 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รอบอก (นิ้ว)</div>
                <input
                  inputMode="decimal"
                  placeholder="เช่น 40"
                  value={draftProfile.chestIn}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, chestIn: e.target.value }))}
                  onBlur={() => commitNumber('chestIn', draftProfile.chestIn, { min: 1, max: 120 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รอบคอ (นิ้ว)</div>
                <input
                  inputMode="decimal"
                  placeholder="(optional)"
                  value={draftProfile.neckIn}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, neckIn: e.target.value }))}
                  onBlur={() => commitNumber('neckIn', draftProfile.neckIn, { min: 1, max: 40 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รอบต้นแขน (นิ้ว)</div>
                <input
                  inputMode="decimal"
                  placeholder="(optional)"
                  value={draftProfile.armIn}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, armIn: e.target.value }))}
                  onBlur={() => commitNumber('armIn', draftProfile.armIn, { min: 1, max: 40 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รอบต้นขา (นิ้ว)</div>
                <input
                  inputMode="decimal"
                  placeholder="(optional)"
                  value={draftProfile.thighIn}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, thighIn: e.target.value }))}
                  onBlur={() => commitNumber('thighIn', draftProfile.thighIn, { min: 1, max: 60 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[28px] border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">เป้าหมาย</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">โค้ชจะปรับแคล/โปรตีนให้ตามเป้าหมาย</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">โฟกัสหลัก</div>
                <select
                  value={profile.goal}
                  onChange={(e) => setProfile((p) => ({ ...p, goal: e.target.value as Goal }))}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                >
                  <option value="lose_weight">ลดน้ำหนัก</option>
                  <option value="lose_fat">ลดไขมัน</option>
                  <option value="maintain">คุมหุ่น</option>
                  <option value="gain_muscle">เพิ่มกล้ามเนื้อ</option>
                  <option value="gain_weight">เพิ่มน้ำหนัก</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">น้ำหนักเป้าหมาย (kg)</div>
                <input
                  inputMode="decimal"
                  placeholder="(optional)"
                  value={draftProfile.targetWeightKg}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeightKg: e.target.value }))}
                  onBlur={() => commitNumber('targetWeightKg', draftProfile.targetWeightKg, { min: 30, max: 300 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">ระยะเวลาเป้า (สัปดาห์)</div>
                <input
                  inputMode="numeric"
                  placeholder="เช่น 8"
                  value={draftProfile.targetWeeks}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeeks: e.target.value }))}
                  onBlur={() => commitNumber('targetWeeks', draftProfile.targetWeeks, { min: 1, max: 52 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">ประสบการณ์</div>
                <select
                  value={profile.experience ?? 'beginner'}
                  onChange={(e) => setProfile((p) => ({ ...p, experience: e.target.value as Experience }))}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                >
                  <option value="beginner">เริ่มต้น</option>
                  <option value="intermediate">ปานกลาง</option>
                  <option value="advanced">จริงจัง</option>
                </select>
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">วันซ้อม/สัปดาห์</div>
                <input
                  inputMode="numeric"
                  value={draftProfile.trainingDaysPerWeek}
                  onChange={(e) => setDraftProfile((d) => ({ ...d, trainingDaysPerWeek: e.target.value }))}
                  onBlur={() => commitNumber('trainingDaysPerWeek', draftProfile.trainingDaysPerWeek, { min: 0, max: 7 })}
                  className="w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <div className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">รายละเอียดเพิ่มเติม (optional)</div>
                <textarea
                  rows={3}
                  value={profile.goalDetail ?? ''}
                  onChange={(e) => setProfile((p) => ({ ...p, goalDetail: e.target.value }))}
                  placeholder="เช่น อยากลด 4 กก. ใน 8 สัปดาห์ / นอนน้อย / แพ้อาหาร..."
                  className="w-full resize-none rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
                ตรวจความพร้อม: <b>{canSubmit ? 'พร้อม' : 'กรุณาตรวจอายุ/ส่วนสูง/น้ำหนัก'}</b>
              </div>

              <button
                type="button"
                  onClick={() => void sendToCoach('ช่วยสรุปเป้าหมายและวางแผนเริ่มต้น 7 วันให้หน่อย')}
                disabled={!canSubmit || submitting}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition',
                  !canSubmit || submitting
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-neutral-500'
                    : 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200',
                )}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  ขอแผนเริ่มต้น
              </button>
            </div>

            {apiError && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/25 dark:text-rose-200">
                {apiError}
              </div>
            )}
          </section>

          {/* Results */}
          <section className="rounded-[28px] border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl bg-neutral-900/10 text-neutral-900 ring-1 ring-black/10 dark:bg-white/10 dark:text-white dark:ring-white/10">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">สรุปตัวเลข (คำนวณทันที)</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">ค่าด้านล่างเป็นการประมาณเพื่อช่วยวางแผน</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-black/5 p-4 dark:bg-white/5">
                <div className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">BMI</div>
                <div className="mt-1 text-xl font-extrabold text-neutral-900 dark:text-white">{derived.bmi ? derived.bmi.toFixed(1) : '-'}</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{derived.bmiCategory}</div>
                <div className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  ช่วงน้ำหนักเหมาะสม (ประมาณ): {derived.healthyWeightKg[0].toFixed(1)}–{derived.healthyWeightKg[1].toFixed(1)} kg
                </div>
              </div>

              <div className="rounded-3xl bg-black/5 p-4 dark:bg-white/5">
                <div className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">พลังงาน/วัน</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-white/70 px-2 py-2 dark:bg-neutral-950/30">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">BMR</div>
                    <div className="text-sm font-extrabold">{round(derived.bmr)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 px-2 py-2 dark:bg-neutral-950/30">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">TDEE</div>
                    <div className="text-sm font-extrabold">{round(derived.tdee)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 px-2 py-2 dark:bg-neutral-950/30">
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">เป้า</div>
                    <div className="text-sm font-extrabold">{round(derived.target)}</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  เป้าหมาย: <b>{goalLabelTh(profile.goal)}</b> • โปรตีนแนะนำ: <b>{derived.proteinRange[0]}–{derived.proteinRange[1]} g/วัน</b>
                </div>
                {derived.desiredDeltaKgPerWeek !== null && (
                  <div className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    ความเร็วตามเป้า: <b>{derived.desiredDeltaKgPerWeek.toFixed(2)} กก./สัปดาห์</b>
                    <div className="mt-1">{derived.safePace.messageTh}</div>
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-black/5 p-4 dark:bg-white/5">
                <div className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">% ไขมัน (US Navy)</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                  {derived.bodyFat !== null ? (
                    <>
                      ประมาณ: <b>{derived.bodyFat.toFixed(1)}%</b>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        ใช้รอบเอว+คอ{profile.sex === 'female' ? '+สะโพก' : ''} (หน่วยนิ้ว) • เป็นการประมาณคร่าว ๆ
                      </div>
                    </>
                  ) : (
                    <>กรอก “รอบเอว” และ “รอบคอ”{profile.sex === 'female' ? ' และ “รอบสะโพก”' : ''} เพื่อคำนวณ</>
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-black/5 p-4 dark:bg-white/5">
                <div className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">สัดส่วน (จากรอบเอว)</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                  {derived.whtr ? (
                    <>
                      WHtR (เอว/ส่วนสูง): <b>{derived.whtr.toFixed(2)}</b>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        แนวทางทั่วไป: &lt; 0.50 มักถือว่าเสี่ยงต่ำกว่า (ประเมินคร่าว ๆ)
                      </div>
                    </>
                  ) : (
                    'ใส่รอบเอวเพื่อคำนวณ WHtR'
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-black/5 p-4 dark:bg-white/5">
                <div className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">เอว/สะโพก</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                  {derived.whr ? (
                    <>
                      WHR (เอว/สะโพก): <b>{derived.whr.toFixed(2)}</b>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                        โดยทั่วไป: ยิ่งต่ำยิ่งดี (เกณฑ์ต่างกันตามเพศและอายุ)
                      </div>
                    </>
                  ) : (
                    'ใส่รอบเอว + รอบสะโพกเพื่อคำนวณ WHR'
                  )}
                </div>
              </div>
            </div>

            {/* Chat */}
            <div className="mt-4 rounded-[28px] border border-black/5 bg-white/60 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/20">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-2xl bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/20 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/20">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-neutral-900 dark:text-white">แชทกับโค้ช</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">ถาม‑ตอบต่อเนื่องได้เรื่อย ๆ (บันทึกอัตโนมัติ)</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetChat}
                  className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-extrabold text-neutral-900 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  <RefreshCw className="h-4 w-4" />
                  รีเซ็ตแชท
                </button>
              </div>

              <div className="mt-3 max-h-[52vh] space-y-2 overflow-auto rounded-2xl bg-black/5 p-3 dark:bg-white/5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-2xl px-3 py-2 text-[13px] leading-relaxed',
                      m.role === 'user'
                        ? 'ml-auto w-[92%] bg-white/80 text-neutral-900 dark:bg-neutral-950/40 dark:text-white'
                        : 'mr-auto w-[92%] bg-emerald-500/10 text-neutral-900 dark:bg-emerald-400/10 dark:text-neutral-100',
                    )}
                  >
                    {m.role === 'assistant' ? (
                      <div className="coach-markdown prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                          {m.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    )}
                  </div>
                ))}
                {submitting && (
                  <div className="mr-auto w-[92%] rounded-2xl bg-emerald-500/10 px-3 py-2 text-[13px] text-neutral-900 dark:bg-emerald-400/10 dark:text-neutral-100">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      โค้ชกำลังคิดคำตอบ...
                    </span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {followUps.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {followUps.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void sendToCoach(q)}
                      className="rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-extrabold text-neutral-900 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="พิมพ์คำถาม เช่น ‘วันนี้ควรกินอะไรให้ถึงโปรตีน?’"
                  className="flex-1 resize-none rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendDraft();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendDraft()}
                  disabled={!draft.trim() || submitting}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition',
                    !draft.trim() || submitting
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-neutral-500'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200',
                  )}
                >
                  <Send className="h-4 w-4" />
                  ส่ง
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Center success popup */}
      <AnimatePresence>
        {successOpen && (
          <motion.div
            className="fixed inset-0 z-80 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSuccessOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              className="relative mx-4 w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-white/20 bg-white/85 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/70"
              role="status"
              aria-live="polite"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(16,185,129,0.22),transparent_60%),radial-gradient(60%_60%_at_0%_100%,rgba(59,130,246,0.16),transparent_55%)]" />
              <div className="relative flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-3xl bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold tracking-tight text-neutral-900 dark:text-white">เรียบร้อย</div>
                  <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">ได้รับคำแนะนำจากโค้ชแล้ว</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
