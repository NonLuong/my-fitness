'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  CheckCircle2,
  Flame,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  User,
  Dumbbell,
  Activity,
  Weight,
  Plus,
} from 'lucide-react';
import { Header } from '@/app/_components/Header';
import { normalizeCoachMarkdown } from '@/lib/coachMarkdown';
import {
  loadCoachChat,
  loadCoachProfile,
  saveCoachChat,
  saveCoachProfile,
} from '@/lib/coachPersistence';

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
  const [step, setStep] = useState(1);
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
  const [persistenceReady, setPersistenceReady] = useState(false);
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
    try {
      const savedProfile = loadCoachProfile<CoachProfile, Draft>();
      if (savedProfile) {
        setProfile(savedProfile.profile);
        if (savedProfile.draftProfile) setDraftProfile(savedProfile.draftProfile);
        if (
          savedProfile.profile.ageYears
          && savedProfile.profile.heightCm
          && savedProfile.profile.weightKg
          && savedProfile.profile.goal
        ) {
          setStep(5);
        }
      }

      const savedMessages = loadCoachChat<CoachChatMessage>();
      if (savedMessages?.length) {
        setMessages(savedMessages.map((message) => ({
          ...message,
          text: message.role === 'assistant'
            ? normalizeCoachMarkdown(message.text)
            : message.text,
        })));
      } else {
        setMessages([
          {
            id: uid('a'),
            role: 'assistant',
            text: 'สวัสดีครับ 🙂 ผมเป็นโค้ชส่วนตัวของคุณ วันนี้อยากโฟกัสเรื่อง “กิน”, “ซ้อม”, หรือ “ปรับพฤติกรรม” ก่อนดีครับ?',
            ts: Date.now(),
          },
        ]);
      }
    } catch {}

    window.setTimeout(() => setPersistenceReady(true), 0);
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;
    try {
      saveCoachChat(messages);
    } catch {}
  }, [messages, persistenceReady]);

  useEffect(() => {
    if (!persistenceReady) return;
    try {
      saveCoachProfile(profile, draftProfile);
    } catch {}
  }, [profile, draftProfile, persistenceReady]);

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
    if (!trimmed || submitting) return;

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
          text: normalizeCoachMarkdown(data.adviceMarkdown),
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

  const nextStep = () => setStep((s) => Math.min(s + 1, 5));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="cozy-app min-h-screen text-[#55483d] dark:text-[#fff4df]">
      {/* Background wash */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-b from-white via-white to-white dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-950" />
        <div className="absolute -left-32 -top-32 h-130 w-130 rounded-full bg-emerald-500/5 blur-3xl dark:bg-emerald-400/10" />
        <div className="absolute -right-40 top-24 h-140 w-140 rounded-full bg-cyan-500/5 blur-3xl dark:bg-cyan-400/8" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.10),transparent_60%)]" />
      </div>

      <Header showBack maxWidthClass="max-w-3xl" />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32 md:pb-6">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">เริ่มต้นกันเลย</h1>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">ข้อมูลพื้นฐานเพื่อคำนวณค่าพลังงานของคุณ</p>
              </div>

              <div className="rounded-4xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-neutral-900 dark:text-white">เพศ</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setProfile((p) => ({ ...p, sex: 'male' }))}
                        className={cn(
                          'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-6 transition',
                          profile.sex === 'male'
                            ? 'border-emerald-500 bg-emerald-50/50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'border-transparent bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                        )}
                      >
                        <User className="h-8 w-8" />
                        <span className="font-bold">ชาย</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfile((p) => ({ ...p, sex: 'female' }))}
                        className={cn(
                          'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-6 transition',
                          profile.sex === 'female'
                            ? 'border-emerald-500 bg-emerald-50/50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : 'border-transparent bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                        )}
                      >
                        <User className="h-8 w-8" />
                        <span className="font-bold">หญิง</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <label className="space-y-2">
                      <div className="text-sm font-bold text-neutral-900 dark:text-white">อายุ (ปี)</div>
                      <input
                        inputMode="numeric"
                        placeholder="25"
                        value={draftProfile.ageYears}
                        onChange={(e) => setDraftProfile((d) => ({ ...d, ageYears: e.target.value }))}
                        onBlur={() => commitNumber('ageYears', draftProfile.ageYears, { min: 10, max: 90 })}
                        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white transition-colors duration-500 ease-in-out"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm font-bold text-neutral-900 dark:text-white">ส่วนสูง (cm)</div>
                      <input
                        inputMode="numeric"
                        placeholder="170"
                        value={draftProfile.heightCm}
                        onChange={(e) => setDraftProfile((d) => ({ ...d, heightCm: e.target.value }))}
                        onBlur={() => commitNumber('heightCm', draftProfile.heightCm, { min: 120, max: 230 })}
                        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white transition-colors duration-500 ease-in-out"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm font-bold text-neutral-900 dark:text-white">น้ำหนัก (kg)</div>
                      <input
                        inputMode="numeric"
                        placeholder="70"
                        value={draftProfile.weightKg}
                        onChange={(e) => setDraftProfile((d) => ({ ...d, weightKg: e.target.value }))}
                        onBlur={() => commitNumber('weightKg', draftProfile.weightKg, { min: 30, max: 250 })}
                        className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white transition-colors duration-500 ease-in-out"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <button
                onClick={nextStep}
                disabled={!canSubmit}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-all duration-500 ease-in-out',
                  canSubmit
                    ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-900/20 hover:scale-[1.02] active:scale-[0.98] dark:bg-white dark:text-neutral-900'
                    : 'cursor-not-allowed bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600'
                )}
              >
                ถัดไป <ChevronRight className="h-5 w-5" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">กิจกรรมของคุณ</h1>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">ช่วยให้เราคำนวณการเผาผลาญได้แม่นยำขึ้น</p>
              </div>

              <div className="space-y-4">
                {Object.keys(ACTIVITY_MULTIPLIERS).map((k) => (
                  <button
                    key={k}
                    onClick={() => setProfile((p) => ({ ...p, activity: k as ActivityLevel }))}
                    className={cn(
                      'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-500 ease-in-out',
                      profile.activity === k
                        ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500/10'
                        : 'border-black/5 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-neutral-800'
                    )}
                  >
                    <div className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-full',
                      profile.activity === k ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
                    )}>
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <div className={cn("font-bold transition-colors duration-500 ease-in-out", profile.activity === k ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-900 dark:text-white")}>
                        {k === 'sedentary' && 'นั่งทำงานเป็นหลัก'}
                        {k === 'light' && 'ขยับบ้างเล็กน้อย'}
                        {k === 'moderate' && 'ปานกลาง'}
                        {k === 'active' && 'แอคทีฟมาก'}
                        {k === 'athlete' && 'นักกีฬา'}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{activityLabelTh(k as ActivityLevel)}</div>
                    </div>
                    {profile.activity === k && <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-500" />}
                  </button>
                ))}
              </div>

              <div className="rounded-4xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <label className="space-y-3">
                  <div className="text-sm font-bold text-neutral-900 dark:text-white">ประสบการณ์ออกกำลังกาย</div>
                  <div className="flex gap-2 rounded-2xl bg-neutral-100 p-1 dark:bg-neutral-800">
                    {(['beginner', 'intermediate', 'advanced'] as const).map((exp) => (
                      <button
                        key={exp}
                        onClick={() => setProfile((p) => ({ ...p, experience: exp }))}
                        className={cn(
                          'flex-1 rounded-xl py-2 text-xs font-bold transition',
                          profile.experience === exp
                            ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                        )}
                      >
                        {exp === 'beginner' && 'เริ่มต้น'}
                        {exp === 'intermediate' && 'ปานกลาง'}
                        {exp === 'advanced' && 'จริงจัง'}
                      </button>
                    ))}
                  </div>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={prevStep}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={nextStep}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-base font-bold text-white shadow-lg shadow-neutral-900/20 transition hover:scale-[1.02] active:scale-[0.98] dark:bg-white dark:text-neutral-900"
                >
                  ถัดไป <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">สัดส่วนร่างกาย</h1>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">กรอกเท่าที่ทราบ (ช่วยคำนวณ % ไขมัน)</p>
              </div>

              <div className="rounded-4xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">รอบเอว (นิ้ว)</div>
                    <input
                      inputMode="decimal"
                      placeholder="32"
                      value={draftProfile.waistIn}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, waistIn: e.target.value }))}
                      onBlur={() => commitNumber('waistIn', draftProfile.waistIn, { min: 1, max: 90 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">รอบสะโพก (นิ้ว)</div>
                    <input
                      inputMode="decimal"
                      placeholder="38"
                      value={draftProfile.hipIn}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, hipIn: e.target.value }))}
                      onBlur={() => commitNumber('hipIn', draftProfile.hipIn, { min: 1, max: 120 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">รอบอก (นิ้ว)</div>
                    <input
                      inputMode="decimal"
                      placeholder="40"
                      value={draftProfile.chestIn}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, chestIn: e.target.value }))}
                      onBlur={() => commitNumber('chestIn', draftProfile.chestIn, { min: 1, max: 120 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">รอบคอ (นิ้ว)</div>
                    <input
                      inputMode="decimal"
                      placeholder="15"
                      value={draftProfile.neckIn}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, neckIn: e.target.value }))}
                      onBlur={() => commitNumber('neckIn', draftProfile.neckIn, { min: 1, max: 40 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={prevStep}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={nextStep}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-base font-bold text-white shadow-lg shadow-neutral-900/20 transition hover:scale-[1.02] active:scale-[0.98] dark:bg-white dark:text-neutral-900"
                >
                  ถัดไป <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <button onClick={nextStep} className="mx-auto block text-xs font-bold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                ข้ามไปก่อน
              </button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">เป้าหมายของคุณ</h1>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">เราจะช่วยวางแผนให้คุณไปถึงเป้าหมาย</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(['lose_weight', 'lose_fat', 'maintain', 'gain_muscle', 'gain_weight'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setProfile((p) => ({ ...p, goal: g }))}
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition',
                      profile.goal === g
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'border-black/5 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    )}
                  >
                    {g === 'lose_weight' && <Weight className="h-6 w-6" />}
                    {g === 'lose_fat' && <Flame className="h-6 w-6" />}
                    {g === 'maintain' && <Activity className="h-6 w-6" />}
                    {g === 'gain_muscle' && <Dumbbell className="h-6 w-6" />}
                    {g === 'gain_weight' && <Plus className="h-6 w-6" />}
                    <span className="text-xs font-bold">{goalLabelTh(g)}</span>
                  </button>
                ))}
              </div>

              <div className="rounded-4xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">น้ำหนักเป้าหมาย (kg)</div>
                    <input
                      inputMode="decimal"
                      placeholder="Optional"
                      value={draftProfile.targetWeightKg}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeightKg: e.target.value }))}
                      onBlur={() => commitNumber('targetWeightKg', draftProfile.targetWeightKg, { min: 30, max: 300 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">ระยะเวลา (สัปดาห์)</div>
                    <input
                      inputMode="numeric"
                      placeholder="8"
                      value={draftProfile.targetWeeks}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeeks: e.target.value }))}
                      onBlur={() => commitNumber('targetWeeks', draftProfile.targetWeeks, { min: 1, max: 52 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-bold text-neutral-900 dark:text-white">วันซ้อม/สัปดาห์</div>
                    <input
                      inputMode="numeric"
                      placeholder="3"
                      value={draftProfile.trainingDaysPerWeek}
                      onChange={(e) => setDraftProfile((d) => ({ ...d, trainingDaysPerWeek: e.target.value }))}
                      onBlur={() => commitNumber('trainingDaysPerWeek', draftProfile.trainingDaysPerWeek, { min: 0, max: 7 })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={prevStep}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => {
                    if (submitting) return;
                    nextStep();
                    void sendToCoach('ช่วยสรุปเป้าหมายและวางแผนเริ่มต้น 7 วันให้หน่อย');
                  }}
                  disabled={submitting}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-base font-bold text-white shadow-lg shadow-neutral-900/20 transition hover:scale-[1.02] active:scale-[0.98] dark:bg-white dark:text-neutral-900',
                    submitting && 'cursor-not-allowed opacity-70'
                  )}
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  สร้างแผน
                </button>
              </div>
              {apiError && (
                <div className="mt-2 text-center text-xs font-medium text-rose-500 dark:text-rose-400">
                  {apiError}
                </div>
              )}
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Dashboard Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">แดชบอร์ด</h1>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">สรุปข้อมูลและคำแนะนำจากโค้ช</p>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="rounded-full bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  แก้ไขข้อมูล
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">BMI</div>
                  <div className="mt-1 text-2xl font-extrabold text-neutral-900 dark:text-white">{derived.bmi.toFixed(1)}</div>
                  <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{derived.bmiCategory}</div>
                </div>
                <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">TDEE</div>
                  <div className="mt-1 text-2xl font-extrabold text-neutral-900 dark:text-white">{round(derived.tdee)}</div>
                  <div className="text-xs text-neutral-500">kcal/day</div>
                </div>
                <div className="rounded-3xl bg-emerald-500 p-4 text-white shadow-lg shadow-emerald-500/20 dark:bg-emerald-600">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">เป้าหมาย</div>
                  <div className="mt-1 text-2xl font-extrabold">{round(derived.target)}</div>
                  <div className="text-xs text-emerald-100">kcal/day</div>
                </div>
                <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-neutral-900">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">โปรตีน</div>
                  <div className="mt-1 text-xl font-extrabold text-neutral-900 dark:text-white">{derived.proteinRange[0]}-{derived.proteinRange[1]}</div>
                  <div className="text-xs text-neutral-500">g/day</div>
                </div>
              </div>

              {/* Chat Interface */}
              <div className="flex h-[65vh] sm:h-150 flex-col overflow-hidden rounded-4xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <div className="border-b border-neutral-100 bg-white/50 px-6 py-4 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">AI Coach</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">พร้อมให้คำแนะนำตลอด 24 ชม.</div>
                      </div>
                    </div>
                    <button
                      onClick={resetChat}
                      className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                    >
                      <RefreshCw className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/50 dark:bg-neutral-950/50">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'flex w-full',
                        m.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                          m.role === 'user'
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                            : 'bg-white text-neutral-900 dark:bg-neutral-800 dark:text-white'
                        )}
                      >
                        {m.role === 'assistant' ? (
                          <div className="coach-markdown prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                              {normalizeCoachMarkdown(m.text)}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{m.text}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {submitting && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        กำลังพิมพ์...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                  {apiError && (
                    <div className="mb-2 text-xs font-medium text-rose-500 dark:text-rose-400">
                      {apiError}
                    </div>
                  )}
                  {followUps.length > 0 && (
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {followUps.map((q) => (
                        <button
                          key={q}
                          onClick={() => void sendToCoach(q)}
                          className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="พิมพ์ข้อความ..."
                      className="flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendDraft();
                        }
                      }}
                    />
                    <button
                      onClick={() => void sendDraft()}
                      disabled={!draft.trim() || submitting}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {successOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSuccessOpen(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative rounded-4xl bg-white p-6 shadow-2xl dark:bg-neutral-900"
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-neutral-900 dark:text-white">เรียบร้อย!</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">โค้ชได้รับข้อมูลของคุณแล้ว</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
