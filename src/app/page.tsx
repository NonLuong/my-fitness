'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {
  Dumbbell,
  Flame,
  CheckCircle2,
  Utensils,
  Zap,
  Activity,
  Sparkles,
  Plus,
  RotateCw,
  X,
  Bot,
  Loader2,
  RefreshCw,
  Send,
  ChevronRight,
  ChevronLeft,
  User,
  Weight,
  AlertTriangle,
  Lightbulb,
  Leaf,
  Sun,
  Moon,
} from 'lucide-react';

import { resolveExerciseDetailFromLabel } from '@/lib/exercises';

import { ConfirmDialog } from './_components/ConfirmDialog';
import { NutritionSection } from './_components/sections/NutritionSection';
import type { MealEntry, MealType } from './_components/types/nutrition';

// --- 1. Type Definition ---
interface DailySchedule {
  title: string;
  focus: string;
  exercises: string[];
}

type ProteinCategory = 'supplement' | 'whole_food' | 'snack';

type ProteinEvent = {
  id: string;
  ts: number;
  label: string;
  grams: number;
  category: ProteinCategory;
  calories?: number;
  carbs?: number;
  fat?: number;
};

type WorkoutItemState = {
  target: number;
  count: number;
};

type WorkoutState = Record<string, WorkoutItemState>;

type ScheduleType = {
  [key: number]: DailySchedule;
};

const MOBILE_TAB_STORAGE_KEY = 'ui_mobileTab_v2';

type AiNutritionResult = {
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

type AiNutritionResponse = {
  ok: boolean;
  results?: AiNutritionResult[];
  followUpQuestions?: string[];
  reasoningSummary?: string;
  error?: string;
};

// --- Coach Types & Helpers ---
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

  // Body measurements in inches
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
  return [18.5 * hM * hM, 24.9 * hM * hM] as const;
}

function calcBmrMifflinStJeor(sex: Sex, ageYears: number, heightCm: number, weightKg: number) {
  const s = sex === 'male' ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + s;
}

function calcDailyWeightChangeFromTarget(weightKg: number, targetWeightKg: number, targetWeeks: number) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(targetWeightKg) || !Number.isFinite(targetWeeks)) return null;
  if (targetWeeks <= 0) return null;
  return (targetWeightKg - weightKg) / targetWeeks;
}

function suggestedSafePaceKgPerWeek(goal: Goal, weightKg: number): { kgPerWeek: number; messageTh: string } {
  const lossMin = weightKg * 0.0025;
  const lossMax = weightKg * 0.0075;
  const gainMin = weightKg * 0.0025;
  const gainMax = weightKg * 0.005;

  if (goal === 'gain_weight' || goal === 'gain_muscle') {
    return {
      kgPerWeek: round(gainMax * 100) / 100,
      messageTh: `โดยทั่วไป เพิ่มน้ำหนักแบบคุมคุณภาพประมาณ ${gainMin.toFixed(2)}–${gainMax.toFixed(2)} กก./สัปดาห์`
    };
  }

  return {
    kgPerWeek: round(lossMax * 100) / 100,
    messageTh: `โดยทั่วไป ลดแบบปลอดภัยประมาณ ${lossMin.toFixed(2)}–${lossMax.toFixed(2)} กก./สัปดาห์`
  };
}

function kcalAdjustmentForRate(deltaKgPerWeek: number) {
  return (deltaKgPerWeek * 7700) / 7;
}

function log10(x: number) {
  return Math.log(x) / Math.log(10);
}

function calcBodyFatUsNavy(sex: Sex, heightCm: number, waistIn?: number, neckIn?: number, hipIn?: number) {
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

  if (!hipIn) return null;
  const b = waist + hipIn - neck;
  if (b <= 0) return null;
  const bf = 163.205 * log10(b) - 97.684 * log10(heightIn) - 78.387;
  return clamp(bf, 5, 70);
}

function goalLabelTh(goal: Goal): string {
  switch (goal) {
    case 'lose_weight': return 'ลดน้ำหนัก';
    case 'lose_fat': return 'ลดไขมัน';
    case 'maintain': return 'คุมหุ่น';
    case 'gain_muscle': return 'เพิ่มกล้ามเนื้อ';
    case 'gain_weight': return 'เพิ่มน้ำหนัก';
  }
}

function activityLabelTh(a: ActivityLevel): string {
  switch (a) {
    case 'sedentary': return 'นั่งทำงานเป็นหลัก';
    case 'light': return 'ขยับบ้างเล็กน้อย';
    case 'moderate': return 'ปานกลาง';
    case 'active': return 'แอคทีฟมาก';
    case 'athlete': return 'นักกีฬา';
  }
}

function goalKcalTarget(tdee: number, goal: Goal): number {
  switch (goal) {
    case 'lose_weight':
    case 'lose_fat': return tdee * 0.85;
    case 'maintain': return tdee;
    case 'gain_muscle': return tdee * 1.08;
    case 'gain_weight': return tdee * 1.12;
  }
}

function proteinRangeG(weightKg: number, goal: Goal): [number, number] {
  const minPerKg = goal === 'gain_muscle' ? 1.8 : goal === 'lose_fat' ? 1.8 : 1.6;
  const maxPerKg = goal === 'gain_muscle' ? 2.2 : 2.2;
  return [round(weightKg * minPerKg), round(weightKg * maxPerKg)];
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useAnimatedNumber(value: number) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number>(value);
  
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(value);

  // Keep ref in sync with state for reading inside effect without dep
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (prefersReducedMotion) {
      queueMicrotask(() => setDisplay(value));
      return;
    }
    if (!Number.isFinite(value)) return;

    const startValue = displayRef.current;
    const delta = Math.abs(value - startValue);
    if (delta === 0) return;

    // Dynamic duration based on magnitude of change
    // Min 400ms, Max 2000ms
    const durationMs = Math.min(2000, Math.max(400, delta * 5));

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fromRef.current = startValue;
    startRef.current = performance.now();

    const tick = (t: number) => {
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      const ease = 1 - Math.pow(1 - p, 3); // Cubic ease out
      
      const next = fromRef.current + (value - fromRef.current) * ease;
      setDisplay(next);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, prefersReducedMotion]);

  return display;
}

type DailyLog = {
  protein: number;
  proteinEvents: ProteinEvent[];
  workout: WorkoutState;
  meals?: MealEntry[];
};

// --- 2. Schedule Data ---
const SCHEDULE: ScheduleType = {
  1: { title: "Upper Body Beast", focus: "Strength & Hypertrophy", exercises: ["Bench Press (4x8-10)", "Barbell Row (4x10-12)", "Overhead Press (3x10-12)", "Lat Pulldown (3x12-15)", "Dumbbell Lateral Raise (3x15)", "Cardio: Walk 30 min"] },
  2: { title: "Leg Day Destruction", focus: "Legs Focus", exercises: ["Squat / Hack Squat (4x8-10)", "Leg Press (3x12-15)", "Leg Extension (3x15)", "Leg Curl (3x15)", "Calf Raise (4x20)", "Cardio: Bike 20 min"] },
  3: { title: "Active Recovery", focus: "Rest & Heal", exercises: ["Rest & Relax", "Stretching / Yoga", "Light Walk (Optional)"] },
  4: { title: "Push Limits", focus: "Chest & Shoulders", exercises: ["Incline Dumbbell Press (4x10-12)", "Machine Chest Press (3x12-15)", "Shoulder Press Machine (3x12)", "Tricep Pushdown (4x12-15)", "Cardio: Walk 30 min"] },
  5: { title: "Pull & Legs Finale", focus: "Full Body Power", exercises: ["Deadlift / Rack Pull (3x8-10)", "Pull up / Lat Pulldown (3xMax)", "Cable Row (3x12)", "Bicep Curl (4x10-12)", "Leg Press (3x20)", "Cardio: Walk 30 min"] },
  6: { title: "Fat Burn Zone", focus: "Cardio & Cheat Meal", exercises: ["Zone 2 Cardio (60 min)", "Enjoy Cheat Meal!"] },
  0: { title: "Sunday Reset", focus: "Deep Recovery", exercises: ["Sleep 8+ Hours", "Meal Prep", "Relaxation"] }
};

function FitnessApp() {
  // --- Logic ---
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todaySchedule = SCHEDULE[dayOfWeek];
  const storageKey = `log_${today.toISOString().split('T')[0]}`;

  const makeId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return String(new Date().getTime());
  };

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  // --- Theme Logic ---
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme_mode') as 'light' | 'dark' | 'system' | null;
    if (saved) setThemeMode(saved);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('theme_mode', themeMode);
    
    const root = document.documentElement;
    const applyTheme = () => {
      const isDark = 
        themeMode === 'dark' || 
        (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (isDark) root.classList.add('dark');
      else root.classList.remove('dark');
    };

    applyTheme();

    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [themeMode, mounted]);

  const toggleTheme = () => {
    if (themeMode === 'system') {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeMode(isSystemDark ? 'light' : 'dark');
    } else {
      setThemeMode(prev => prev === 'dark' ? 'light' : 'dark');
    }
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const parseWorkoutTarget = (exerciseLabel: string) => {
    const m = /\((\d+)x/i.exec(exerciseLabel);
    if (!m) return 1;
    const sets = Number(m[1]);
    return Number.isFinite(sets) && sets > 0 ? sets : 1;
  };

  const makeWorkoutState = (exercises: string[]): WorkoutState =>
    exercises.reduce<WorkoutState>((acc, ex) => {
      acc[ex] = { target: parseWorkoutTarget(ex), count: 0 };
      return acc;
    }, {});

  const loadInitialData = () => {
    if (typeof window === 'undefined') {
      return {
        protein: 0,
        proteinEvents: [] as ProteinEvent[],
        workout: makeWorkoutState(todaySchedule.exercises),
        meals: [] as MealEntry[]
      };
    }
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      const parsed = JSON.parse(savedData) as Partial<DailyLog>;
      const workoutFromStorage = parsed.workout as WorkoutState | undefined;
      const workout = workoutFromStorage && typeof workoutFromStorage === 'object'
        ? workoutFromStorage
        : makeWorkoutState(todaySchedule.exercises);
      return {
        protein: parsed.protein || 0,
        proteinEvents: (parsed.proteinEvents || []) as ProteinEvent[],
        workout,
        meals: (parsed.meals || []) as MealEntry[]
      };
    }
    return {
      protein: 0,
      proteinEvents: [] as ProteinEvent[],
      workout: makeWorkoutState(todaySchedule.exercises),
      meals: [] as MealEntry[]
    };
  };

  const [protein, setProtein] = useState<number>(() => loadInitialData().protein);
  const [proteinEvents, setProteinEvents] = useState<ProteinEvent[]>(() => loadInitialData().proteinEvents);
  const [workoutState, setWorkoutState] = useState<WorkoutState>(() => loadInitialData().workout);
  const [meals, setMeals] = useState<MealEntry[]>(() => loadInitialData().meals);

  const mealsRef = useRef<MealEntry[]>(meals);
  useEffect(() => {
    mealsRef.current = meals;
  }, [meals]);

  const [activeTab, setActiveTab] = useState<'workout' | 'nutrition' | 'protein' | 'coach'>('workout');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
    if (saved === 'workout' || saved === 'nutrition' || saved === 'protein' || saved === 'coach') {
      setActiveTab(saved);
    }
  }, []);

  // --- Coach Logic ---
  const COACH_STORAGE_KEY = 'coach_chat_v1';
  const COACH_PROFILE_KEY = 'coach_profile_v1';

  const [coachStep, setCoachStep] = useState(1);
  const [coachProfile, setCoachProfile] = useState<CoachProfile>({
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

  const [coachSubmitting, setCoachSubmitting] = useState(false);
  const [coachApiError, setCoachApiError] = useState<string | null>(null);
  const [coachSuccessOpen, setCoachSuccessOpen] = useState(false);

  const [coachMessages, setCoachMessages] = useState<CoachChatMessage[]>([]);
  const [coachDraft, setCoachDraft] = useState('');
  const [coachFollowUps, setCoachFollowUps] = useState<string[]>([]);
  const coachMessagesEndRef = useRef<HTMLDivElement | null>(null);

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
    setCoachProfile((p) => ({ ...p, [key]: v as CoachProfile[K] }));
  };

  useEffect(() => {
    const now = Date.now();
    const EXPIRATION_MS = 24 * 60 * 60 * 1000;

    try {
      const rawProfile = localStorage.getItem(COACH_PROFILE_KEY);
      if (rawProfile) {
        const data = JSON.parse(rawProfile);
        if (data.timestamp && (now - data.timestamp < EXPIRATION_MS)) {
          if (data.profile) setCoachProfile(data.profile);
          if (data.draftProfile) setDraftProfile(data.draftProfile);
          if (data.profile?.ageYears && data.profile?.heightCm && data.profile?.weightKg && data.profile?.goal) {
            setCoachStep(5);
          }
        } else {
          localStorage.removeItem(COACH_PROFILE_KEY);
        }
      }
    } catch {}

    try {
      const rawChat = localStorage.getItem(COACH_STORAGE_KEY);
      let chatLoaded = false;
      if (rawChat) {
        const data = JSON.parse(rawChat);
        if (data.timestamp && (now - data.timestamp < EXPIRATION_MS)) {
          if (Array.isArray(data.messages)) {
            setCoachMessages(data.messages);
            chatLoaded = true;
          }
        } else {
          localStorage.removeItem(COACH_STORAGE_KEY);
        }
      }
      
      if (!chatLoaded) {
        setCoachMessages([
          {
            id: uid('a'),
            role: 'assistant',
            text: 'สวัสดีครับ 🙂 ผมเป็นโค้ชส่วนตัวของคุณ วันนี้อยากโฟกัสเรื่อง “กิน”, “ซ้อม”, หรือ “ปรับพฤติกรรม” ก่อนดีครับ?',
            ts: Date.now(),
          },
        ]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify({ messages: coachMessages, timestamp: Date.now() }));
    } catch {}
  }, [coachMessages]);

  useEffect(() => {
    try {
      localStorage.setItem(COACH_PROFILE_KEY, JSON.stringify({ profile: coachProfile, draftProfile, timestamp: Date.now() }));
    } catch {}
  }, [coachProfile, draftProfile]);

  useEffect(() => {
    coachMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [coachMessages.length, coachFollowUps.length, coachSubmitting, activeTab]);

  const coachDerived = useMemo(() => {
    const heightCm = coachProfile.heightCm ?? 0;
    const weightKg = coachProfile.weightKg ?? 0;
    const ageYears = coachProfile.ageYears ?? 0;

    const bmi = heightCm > 0 && weightKg > 0 ? calcBmi(heightCm, weightKg) : 0;
    const [wMin, wMax] = heightCm > 0 ? calcHealthyWeightRangeKg(heightCm) : ([0, 0] as const);
    const bmr = ageYears > 0 && heightCm > 0 && weightKg > 0
      ? calcBmrMifflinStJeor(coachProfile.sex, ageYears, heightCm, weightKg)
      : 0;
    const tdee = bmr * ACTIVITY_MULTIPLIERS[coachProfile.activity];
    let target = goalKcalTarget(tdee, coachProfile.goal);

    const safePace = suggestedSafePaceKgPerWeek(coachProfile.goal, weightKg || 70);
    const desiredDeltaKgPerWeek =
      coachProfile.targetWeightKg && coachProfile.targetWeeks
        ? calcDailyWeightChangeFromTarget(weightKg, coachProfile.targetWeightKg, coachProfile.targetWeeks)
        : null;
    const desiredAdj = desiredDeltaKgPerWeek !== null ? kcalAdjustmentForRate(desiredDeltaKgPerWeek) : null;

    if (desiredAdj !== null && Number.isFinite(desiredAdj)) {
      target = clamp(target + desiredAdj, Math.max(1200, tdee - 1200), tdee + 1200);
    }

    const waistCm = coachProfile.waistIn ? inchesToCm(coachProfile.waistIn) : null;
    const hipCm = coachProfile.hipIn ? inchesToCm(coachProfile.hipIn) : null;

    const whr = waistCm && hipCm ? waistCm / hipCm : null;
    const whtr = waistCm && heightCm ? waistCm / heightCm : null;

    const pRange = proteinRangeG(weightKg || 70, coachProfile.goal);

    const bodyFat = heightCm
      ? calcBodyFatUsNavy(coachProfile.sex, heightCm, coachProfile.waistIn, coachProfile.neckIn, coachProfile.hipIn)
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
  }, [coachProfile]);

  const canSubmitCoach = useMemo(() => {
    if (!coachProfile.ageYears || !coachProfile.heightCm || !coachProfile.weightKg) return false;
    return (
      Number.isFinite(coachProfile.ageYears) &&
      coachProfile.ageYears! >= 10 &&
      coachProfile.ageYears! <= 90 &&
      Number.isFinite(coachProfile.heightCm) &&
      coachProfile.heightCm! >= 120 &&
      coachProfile.heightCm! <= 230 &&
      Number.isFinite(coachProfile.weightKg) &&
      coachProfile.weightKg! >= 30 &&
      coachProfile.weightKg! <= 250
    );
  }, [coachProfile]);

  const sendToCoach = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || coachSubmitting) return;

    setCoachSubmitting(true);
    setCoachApiError(null);
    setCoachFollowUps([]);

    const userMsg: CoachChatMessage = { id: uid('u'), role: 'user', text: trimmed, ts: Date.now() };
    setCoachMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile: coachProfile,
          derived: coachDerived,
          messages: [...coachMessages, userMsg].map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data: CoachApiResponse = (await res.json()) as CoachApiResponse;
      if (!res.ok || !data.ok) {
        const errorMsg = !data.ok ? data.error : 'เกิดข้อผิดพลาดในการเรียกโค้ช';
        setCoachApiError(errorMsg);
        return;
      }
      setCoachFollowUps(data.followUpQuestions ?? []);
      setCoachMessages((prev) => [
        ...prev,
        {
          id: uid('a'),
          role: 'assistant',
          text: data.adviceMarkdown,
          ts: Date.now(),
        },
      ]);
      setCoachSuccessOpen(true);
      window.setTimeout(() => setCoachSuccessOpen(false), 1600);
    } catch (e: unknown) {
      setCoachApiError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
    } finally {
      setCoachSubmitting(false);
    }
  };

  const resetCoachChat = () => {
    setCoachApiError(null);
    setCoachFollowUps([]);
    setCoachDraft('');
    setCoachMessages([
      {
        id: uid('a'),
        role: 'assistant',
        text: 'เริ่มใหม่ได้เลยครับ 🙂 เล่าเป้าหมายของคุณ (เช่น “อยากลดไขมันหน้าท้อง”) แล้วบอกเวลาที่สะดวกซ้อมต่อสัปดาห์ด้วยนะครับ',
        ts: Date.now(),
      },
    ]);
  };

  const sendCoachDraft = async () => {
    const t = coachDraft;
    setCoachDraft('');
    await sendToCoach(t);
  };

  const nextCoachStep = () => setCoachStep((s) => Math.min(s + 1, 5));
  const prevCoachStep = () => setCoachStep((s) => Math.max(s - 1, 1));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MOBILE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const [selectedExerciseLabel, setSelectedExerciseLabel] = useState<string | null>(null);

  const selectedExerciseDetail = useMemo(() => {
    if (!selectedExerciseLabel) return null;
    return resolveExerciseDetailFromLabel(selectedExerciseLabel);
  }, [selectedExerciseLabel]);

  // --- AI Nutrition ---
  const [aiOpen, setAiOpen] = useState<boolean>(false);
  const [aiText, setAiText] = useState<string>('');
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AiNutritionResponse | null>(null);
  const [aiMealType] = useState<MealType>('lunch');
  const lastAiMealProteinCreditRef = useRef<string | null>(null);

  const [saveSuccessOpen, setSaveSuccessOpen] = useState<boolean>(false);
  const saveSuccessTimerRef = useRef<number | null>(null);

  const openSaveSuccess = (opts?: { durationMs?: number }) => {
    const durationMs = opts?.durationMs ?? 1800;
    setSaveSuccessOpen(true);
    if (saveSuccessTimerRef.current) window.clearTimeout(saveSuccessTimerRef.current);
    saveSuccessTimerRef.current = window.setTimeout(() => {
      setSaveSuccessOpen(false);
      saveSuccessTimerRef.current = null;
    }, durationMs);
  };

  const pendingSaveRef = useRef<DailyLog | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const flushSave = () => {
    if (typeof window === 'undefined') return;
    if (!pendingSaveRef.current) return;
    localStorage.setItem(storageKey, JSON.stringify(pendingSaveRef.current));
    pendingSaveRef.current = null;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const scheduleSave = (
    nextProtein: number,
    nextEvents: ProteinEvent[],
    nextWorkout: WorkoutState,
    nextMeals: MealEntry[],
  ) => {
    if (typeof window === 'undefined') return;
    pendingSaveRef.current = { protein: nextProtein, proteinEvents: nextEvents, workout: nextWorkout, meals: nextMeals };
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
      if (ric) ric(flushSave, { timeout: 800 });
      else flushSave();
    }, 250);
  };

  const addProtein = (event: Omit<ProteinEvent, 'id' | 'ts'>) => {
    const newProtein = protein + event.grams;
    const ts = new Date().getTime();
    const newEvent: ProteinEvent = {
      id: makeId(),
      ts,
      ...event
    };
    const newEvents = [newEvent, ...proteinEvents].slice(0, 50);
    setProtein(newProtein);
    setProteinEvents(newEvents);
    scheduleSave(newProtein, newEvents, workoutState, mealsRef.current);
  };

  const progress = Math.min((protein / 180) * 100, 100);

  const bumpExercise = (exercise: string, delta: 1 | -1) => {
    setWorkoutState(prev => {
      const current = prev[exercise] ?? { target: parseWorkoutTarget(exercise), count: 0 };
      const nextCount = Math.max(0, Math.min(current.target, current.count + delta));
      const next = { ...prev, [exercise]: { ...current, count: nextCount } };
      scheduleSave(protein, proteinEvents, next, mealsRef.current);
      return next;
    });
  };

  const incrementExercise = (exercise: string) => bumpExercise(exercise, 1);

  const resetExercise = (exercise: string) => {
    setWorkoutState(prev => {
      const current = prev[exercise] ?? { target: parseWorkoutTarget(exercise), count: 0 };
      const next = { ...prev, [exercise]: { ...current, count: 0 } };
      scheduleSave(protein, proteinEvents, next, mealsRef.current);
      return next;
    });
  };

  const analyzeNutrition = async () => {
    setAiError(null);
    setAiResponse(null);
    setAiLoading(true);
    try {
      const form = new FormData();
      if (aiText.trim()) form.set('text', aiText.trim());
      if (aiImage) form.set('image', aiImage);

      const res = await fetch('/api/nutrition', { method: 'POST', body: form });
      const data = (await res.json()) as AiNutritionResponse;
      if (!res.ok || !data.ok) {
        setAiError(data.error || 'Failed to analyze meal.');
        setAiResponse(data);
        return;
      }
      setAiResponse(data);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setAiLoading(false);
    }
  };

  const addProteinFromAi = (r: AiNutritionResult) => {
    const grams = r.proteinG ?? 0;
    if (!grams || grams <= 0) return;
    addProtein({
      label: `AI: ${r.itemName}`,
      grams: Math.round(grams),
      category: 'whole_food',
      calories: r.caloriesKcal ?? 0,
      carbs: r.carbsG ?? 0,
      fat: r.fatG ?? 0,
    });
  };

  const saveAiAsMeal = () => {
    if (!aiResponse?.results || aiResponse.results.length === 0) return;

    const proteinFingerprint = `${aiMealType}::${aiText.trim()}::${aiResponse.results
      .map((r) => `${r.itemName}:${r.proteinG ?? 0}`)
      .join('|')}`;
    if (lastAiMealProteinCreditRef.current !== proteinFingerprint) {
      lastAiMealProteinCreditRef.current = proteinFingerprint;
      for (const r of aiResponse.results) addProteinFromAi(r);
    }

    const newMeal: MealEntry = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
      mealType: aiMealType,
      sourceText: aiText.trim() || undefined,
      items: aiResponse.results.map((r) => ({
        itemName: r.itemName,
        assumedServing: r.assumedServing,
        caloriesKcal: r.caloriesKcal,
        proteinG: r.proteinG,
        carbsG: r.carbsG,
        fatG: r.fatG,
        fiberG: r.fiberG,
        sugarG: r.sugarG,
        sodiumMg: r.sodiumMg,
        confidence: r.confidence,
        notes: r.notes,
      })),
    };

    setMeals((prev) => {
      const nextMeals = [newMeal, ...(prev ?? [])];
      scheduleSave(protein, proteinEvents, workoutState, nextMeals);
      return nextMeals;
    });

    setAiOpen(false);
    window.setTimeout(() => {
      setAiText('');
      setAiImage(null);
      setAiError(null);
      setAiResponse(null);
      openSaveSuccess();
    }, 0);
  };

  const deleteMeal = (id: string) => {
    setMeals((prev) => {
      const nextMeals = (prev ?? []).filter((m) => m.id !== id);
      scheduleSave(protein, proteinEvents, workoutState, nextMeals);
      return nextMeals;
    });
  };

  const mealTotals = useMemo(() => {
    let caloriesKcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;

    for (const meal of meals ?? []) {
      for (const item of meal.items) {
        caloriesKcal += item.caloriesKcal ?? 0;
        proteinG += item.proteinG ?? 0;
        carbsG += item.carbsG ?? 0;
        fatG += item.fatG ?? 0;
      }
    }

    return {
      caloriesKcal: Math.round(caloriesKcal),
      proteinG: Math.round(proteinG),
      carbsG: Math.round(carbsG),
      fatG: Math.round(fatG),
    };
  }, [meals]);

  const proteinItems = useMemo(() => (
    [
      { label: 'Whey Scoop', grams: 25, calories: 120, icon: Dumbbell, desc: 'Supplement', category: 'supplement' as const },
      { label: 'Chicken Breast', grams: 23, calories: 120, icon: Utensils, desc: 'Whole food', category: 'whole_food' as const },
      { label: 'Boiled Egg', grams: 7, calories: 75, icon: Flame, desc: 'Snack', category: 'snack' as const },
    ]
  ), []);

  const resetAllToday = () => {
    const nextWorkout = makeWorkoutState(todaySchedule.exercises);
    setProtein(0);
    setProteinEvents([]);
    setWorkoutState(nextWorkout);
    setMeals([]);
    scheduleSave(0, [], nextWorkout, []);
  };

  const prefersReducedMotion = usePrefersReducedMotion();
  const proteinAnimated = useAnimatedNumber(protein);
  const kcalAnimated = useAnimatedNumber(mealTotals.caloriesKcal);
  const pAnimated = useAnimatedNumber(mealTotals.proteinG);
  const cAnimated = useAnimatedNumber(mealTotals.carbsG);
  const fAnimated = useAnimatedNumber(mealTotals.fatG);

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobile) return;
    if (aiOpen || selectedExerciseLabel) return;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  }, [activeTab, isMobile, prefersReducedMotion, aiOpen, selectedExerciseLabel]);

  return (
    <div className="min-h-screen bg-emerald-50 dark:bg-[#050a08] text-neutral-900 dark:text-white selection:bg-emerald-500/30 font-sans transition-colors duration-500 ease-in-out">
      {/* 3D Ambient Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3], 
            x: [0, 50, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-300/20 dark:bg-emerald-900/20 blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2], 
            x: [0, -30, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-green-300/20 dark:bg-green-900/20 blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            opacity: [0.1, 0.3, 0.1], 
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[30%] left-[30%] w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[100px]" 
        />
      </div>

      {/* Header (Mobile Only) */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-emerald-900/5 dark:border-white/5 bg-emerald-50/80 dark:bg-[#050a08]/80 backdrop-blur-xl transition-colors duration-500 ease-in-out">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-neutral-900 dark:text-white">FitSync</span>
          </div>
          <div className="flex items-center gap-3">
             {/* Theme Toggles */}
             <div className="flex items-center gap-1 bg-emerald-900/5 dark:bg-white/5 rounded-full p-1 border border-emerald-900/5 dark:border-white/5 backdrop-blur-sm">
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-full text-emerald-900/60 dark:text-emerald-100/60 hover:text-emerald-900 dark:hover:text-white transition-colors relative overflow-hidden"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={themeMode === 'dark' ? 'dark' : 'light'}
                      initial={{ y: -15, opacity: 0, rotate: -90 }}
                      animate={{ y: 0, opacity: 1, rotate: 0 }}
                      exit={{ y: 15, opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.2 }}
                    >
                      {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </motion.div>
                  </AnimatePresence>
                </button>
             </div>

             <button 
                onClick={() => setConfirmResetOpen(true)}
                className="p-2 rounded-full hover:bg-emerald-900/5 dark:hover:bg-white/5 text-emerald-900/60 dark:text-emerald-100/60 hover:text-emerald-900 dark:hover:text-white transition-colors"
             >
                <RotateCw className="w-5 h-5" />
             </button>
             <div className="w-8 h-8 rounded-full bg-neutral-900 border border-white/10 overflow-hidden">
                <div className="w-full h-full bg-linear-to-tr from-emerald-900 to-neutral-800" />
             </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto p-4 md:p-8 pt-20 md:pt-8 grid grid-cols-1 md:grid-cols-12 gap-8">

        {/* Desktop Navigation (Left Sidebar) */}
        <nav className="hidden md:flex md:col-span-3 lg:col-span-2 flex-col gap-6 sticky top-8 h-fit">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-neutral-900 dark:text-white">FitSync</span>
          </div>

          <div className="space-y-2">
            {[
              { id: 'workout', icon: Dumbbell, label: 'Workout' },
              { id: 'nutrition', icon: Utensils, label: 'Nutrition' },
              { id: 'protein', icon: Zap, label: 'Quick Add' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'workout' | 'nutrition' | 'protein')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-500 ease-in-out ${
                    isActive 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.1)] border border-emerald-500/20' 
                      : 'text-emerald-900/60 dark:text-emerald-100/60 hover:bg-emerald-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : ''}`} />
                  <span>{tab.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />}
                </button>
              );
            })}

            <button
              onClick={() => setActiveTab('coach')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-500 ease-in-out ${
                activeTab === 'coach'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.1)] border border-emerald-500/20'
                  : 'text-emerald-900/60 dark:text-emerald-100/60 hover:bg-emerald-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Bot className={`w-5 h-5 ${activeTab === 'coach' ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : ''}`} />
              <span>AI Coach</span>
              {activeTab === 'coach' && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />}
            </button>
          </div>

          <div className="pt-6 mt-auto border-t border-emerald-900/5 dark:border-white/5 space-y-3">
             {/* Theme Toggles Desktop */}
             <div className="flex items-center justify-between p-1 bg-emerald-900/5 dark:bg-white/5 rounded-2xl border border-emerald-900/5 dark:border-white/5 mb-2">
                <button
                  onClick={toggleTheme}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-emerald-900/60 dark:text-emerald-100/60 hover:text-emerald-900 dark:hover:text-white hover:bg-emerald-900/5 dark:hover:bg-white/5 transition-all group"
                >
                  <div className="relative w-4 h-4 overflow-hidden">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={themeMode === 'dark' ? 'dark' : 'light'}
                        initial={{ y: -15, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 15, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0"
                      >
                        {themeMode === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <span className="text-xs font-bold group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{themeMode === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                </button>
             </div>

             <button 
                onClick={() => setConfirmResetOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-emerald-900/60 dark:text-emerald-100/60 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
             >
                <RotateCw className="w-5 h-5" />
                <span className="font-medium">Reset Day</span>
             </button>
          </div>
        </nav>

        {/* Center Content (Main Feed) */}
        <main className="md:col-span-5 lg:col-span-7 space-y-6 order-2 md:order-1 min-w-0">
          {/* Tab Content */}
          <AnimatePresence mode="wait">

          {activeTab === 'workout' && (
            <motion.div
              key="workout"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Today&apos;s Plan</h2>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-400/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]">
                  {todaySchedule.title}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {todaySchedule.exercises.map((ex, i) => {
                   const item = workoutState[ex] ?? { target: parseWorkoutTarget(ex), count: 0 };
                   const done = item.count >= item.target;
                   
                   return (
                    <motion.div
                      key={ex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedExerciseLabel(ex)}
                      className={`group relative overflow-hidden rounded-2xl border p-4 transition-all duration-500 ease-in-out active:scale-[0.98] h-full backdrop-blur-md
                        ${done 
                          ? 'bg-emerald-100/40 dark:bg-emerald-950/40 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                          : 'bg-white/60 dark:bg-[#0a120f]/60 border-emerald-900/5 dark:border-white/5 hover:border-emerald-900/10 dark:hover:border-white/10 hover:bg-white/80 dark:hover:bg-[#0a120f]/80'
                        }`}
                    >
                      <div className="flex items-center gap-4 h-full">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shrink-0
                          ${done 
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                            : 'border-emerald-900/10 dark:border-white/10 bg-emerald-900/5 dark:bg-white/5 text-emerald-900/40 dark:text-emerald-100/40'
                          }`}>
                          {done ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">{i + 1}</span>}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold text-base truncate transition-colors ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-white'}`}>
                            {ex}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-1.5 flex-1 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
                                initial={{ width: 0 }}
                                animate={{ width: `${(item.count / item.target) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-emerald-900/40 dark:text-emerald-100/40 whitespace-nowrap">{item.count}/{item.target}</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); incrementExercise(ex); }}
                          className="w-10 h-10 rounded-xl bg-emerald-900/5 dark:bg-white/5 hover:bg-emerald-900/10 dark:hover:bg-white/10 flex items-center justify-center text-neutral-900 dark:text-white transition-colors border border-emerald-900/5 dark:border-white/5 shrink-0"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                   );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'nutrition' && (
            <motion.div
              key="nutrition"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
               <NutritionSection
                  mobileVisible={true}
                  prefersReducedMotion={prefersReducedMotion}
                  meals={meals}
                  kcalAnimated={kcalAnimated}
                  pAnimated={pAnimated}
                  cAnimated={cAnimated}
                  fAnimated={fAnimated}
                  onOpenAi={() => setAiOpen(true)}
                  onRequestDeleteMeal={(id) => setMealToDelete(id)}
                />
            </motion.div>
          )}

          {activeTab === 'protein' && (
             <motion.div
              key="protein"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
             >
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Quick Add</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {proteinItems.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => addProtein({ label: item.label, grams: item.grams, category: item.category, calories: item.calories })}
                      className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-900/5 dark:border-white/5 bg-white/60 dark:bg-[#0a120f]/60 hover:bg-white/80 dark:hover:bg-[#0a120f]/80 transition-all duration-500 ease-in-out group h-full backdrop-blur-md hover:border-emerald-500/20"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100/50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-900/60 dark:text-emerald-100/60 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:scale-110 transition-all shadow-inner shadow-black/5 dark:shadow-black/20 border border-emerald-900/5 dark:border-white/5 group-hover:border-emerald-500/20 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <item.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-neutral-900 dark:text-white">{item.label}</div>
                        <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">{item.desc}</div>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-bold text-lg drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">+{item.grams}g</div>
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t border-emerald-900/10 dark:border-white/10">
                   <h3 className="text-sm font-bold text-emerald-900/40 dark:text-emerald-100/40 mb-3">Recent Log</h3>
                   <div className="space-y-2">
                      {proteinEvents.slice(0, 5).map(ev => (
                         <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-white/40 dark:bg-[#0a120f]/40 border border-emerald-900/5 dark:border-white/5 hover:border-emerald-500/20 transition-colors duration-500 ease-in-out">
                            <span className="text-sm text-emerald-900/80 dark:text-emerald-100/80">{ev.label}</span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+{ev.grams}g</span>
                         </div>
                      ))}
                      {proteinEvents.length === 0 && <div className="text-sm text-emerald-900/40 dark:text-emerald-100/40 text-center py-4">No entries yet</div>}
                   </div>
                </div>
             </motion.div>
          )}

          {activeTab === 'coach' && (
            <motion.div
              key="coach"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Step 1: Basic Info */}
              {coachStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Let&apos;s Start</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">Basic info for your plan</p>
                  </div>

                  <div className="rounded-3xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 p-6 backdrop-blur-md transition-colors duration-500 ease-in-out">
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-sm font-bold text-neutral-900 dark:text-white">Sex</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setCoachProfile((p) => ({ ...p, sex: 'male' }))}
                            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-6 transition ${
                              coachProfile.sex === 'male'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-transparent bg-emerald-900/5 dark:bg-white/5 text-emerald-900/40 dark:text-emerald-100/40 hover:bg-emerald-900/10 dark:hover:bg-white/10'
                            }`}
                          >
                            <User className="h-8 w-8" />
                            <span className="font-bold">Male</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCoachProfile((p) => ({ ...p, sex: 'female' }))}
                            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-6 transition ${
                              coachProfile.sex === 'female'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-transparent bg-emerald-900/5 dark:bg-white/5 text-emerald-900/40 dark:text-emerald-100/40 hover:bg-emerald-900/10 dark:hover:bg-white/10'
                            }`}
                          >
                            <User className="h-8 w-8" />
                            <span className="font-bold">Female</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <label className="space-y-2">
                          <div className="text-sm font-bold text-neutral-900 dark:text-white">Age (Years)</div>
                          <input
                            inputMode="numeric"
                            placeholder="25"
                            value={draftProfile.ageYears}
                            onChange={(e) => setDraftProfile((d) => ({ ...d, ageYears: e.target.value }))}
                            onBlur={() => commitNumber('ageYears', draftProfile.ageYears, { min: 10, max: 90 })}
                            className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-lg font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                        <label className="space-y-2">
                          <div className="text-sm font-bold text-neutral-900 dark:text-white">Height (cm)</div>
                          <input
                            inputMode="numeric"
                            placeholder="170"
                            value={draftProfile.heightCm}
                            onChange={(e) => setDraftProfile((d) => ({ ...d, heightCm: e.target.value }))}
                            onBlur={() => commitNumber('heightCm', draftProfile.heightCm, { min: 120, max: 230 })}
                            className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-lg font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                        <label className="space-y-2">
                          <div className="text-sm font-bold text-neutral-900 dark:text-white">Weight (kg)</div>
                          <input
                            inputMode="numeric"
                            placeholder="70"
                            value={draftProfile.weightKg}
                            onChange={(e) => setDraftProfile((d) => ({ ...d, weightKg: e.target.value }))}
                            onBlur={() => commitNumber('weightKg', draftProfile.weightKg, { min: 30, max: 250 })}
                            className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-lg font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={nextCoachStep}
                    disabled={!canSubmitCoach}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition ${
                      canSubmitCoach
                        ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:bg-emerald-600'
                        : 'cursor-not-allowed bg-emerald-900/5 dark:bg-white/5 text-emerald-900/20 dark:text-emerald-100/20'
                    }`}
                  >
                    Next <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}

              {/* Step 2: Activity */}
              {coachStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Activity Level</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">Helps calculate your metabolism</p>
                  </div>

                  <div className="space-y-4">
                    {Object.keys(ACTIVITY_MULTIPLIERS).map((k) => (
                      <button
                        key={k}
                        onClick={() => setCoachProfile((p) => ({ ...p, activity: k as ActivityLevel }))}
                        className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                          coachProfile.activity === k
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-emerald-900/5 dark:border-white/5 bg-white/60 dark:bg-[#0a120f]/60 hover:bg-emerald-900/5 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                          coachProfile.activity === k ? 'bg-emerald-500 text-white' : 'bg-emerald-900/5 dark:bg-white/5 text-emerald-900/40 dark:text-emerald-100/40'
                        }`}>
                          <Activity className="h-5 w-5" />
                        </div>
                        <div>
                          <div className={`font-bold ${coachProfile.activity === k ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-900 dark:text-white"}`}>
                            {k === 'sedentary' && 'Sedentary'}
                            {k === 'light' && 'Lightly Active'}
                            {k === 'moderate' && 'Moderately Active'}
                            {k === 'active' && 'Very Active'}
                            {k === 'athlete' && 'Athlete'}
                          </div>
                          <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">{activityLabelTh(k as ActivityLevel)}</div>
                        </div>
                        {coachProfile.activity === k && <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-500" />}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={prevCoachStep}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 text-neutral-900 dark:text-white transition hover:bg-emerald-900/5 dark:hover:bg-white/5"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={nextCoachStep}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] transition hover:bg-emerald-600"
                    >
                      Next <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Body Stats */}
              {coachStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Body Stats</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">Optional, for body fat calculation</p>
                  </div>

                  <div className="rounded-3xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 p-6 backdrop-blur-md transition-colors duration-500 ease-in-out">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Waist (in)</div>
                        <input
                          inputMode="decimal"
                          placeholder="32"
                          value={draftProfile.waistIn}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, waistIn: e.target.value }))}
                          onBlur={() => commitNumber('waistIn', draftProfile.waistIn, { min: 1, max: 90 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Hip (in)</div>
                        <input
                          inputMode="decimal"
                          placeholder="38"
                          value={draftProfile.hipIn}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, hipIn: e.target.value }))}
                          onBlur={() => commitNumber('hipIn', draftProfile.hipIn, { min: 1, max: 120 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Chest (in)</div>
                        <input
                          inputMode="decimal"
                          placeholder="40"
                          value={draftProfile.chestIn}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, chestIn: e.target.value }))}
                          onBlur={() => commitNumber('chestIn', draftProfile.chestIn, { min: 1, max: 120 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Neck (in)</div>
                        <input
                          inputMode="decimal"
                          placeholder="15"
                          value={draftProfile.neckIn}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, neckIn: e.target.value }))}
                          onBlur={() => commitNumber('neckIn', draftProfile.neckIn, { min: 1, max: 40 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={prevCoachStep}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 text-neutral-900 dark:text-white transition hover:bg-emerald-900/5 dark:hover:bg-white/5"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={nextCoachStep}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] transition hover:bg-emerald-600"
                    >
                      Next <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                  <button onClick={nextCoachStep} className="mx-auto block text-xs font-bold text-emerald-900/40 dark:text-emerald-100/40 hover:text-neutral-900 dark:hover:text-white">
                    Skip
                  </button>
                </div>
              )}

              {/* Step 4: Goal */}
              {coachStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Your Goal</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">We&apos;ll help you get there</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {(['lose_weight', 'lose_fat', 'maintain', 'gain_muscle', 'gain_weight'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setCoachProfile((p) => ({ ...p, goal: g }))}
                        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition ${
                          coachProfile.goal === g
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-emerald-900/5 dark:border-white/5 bg-white/60 dark:bg-[#0a120f]/60 text-emerald-900/60 dark:text-emerald-100/60 hover:bg-emerald-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white'
                        }`}
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

                  <div className="rounded-3xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 p-6 backdrop-blur-md transition-colors duration-500 ease-in-out">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Target Weight (kg)</div>
                        <input
                          inputMode="decimal"
                          placeholder="Optional"
                          value={draftProfile.targetWeightKg}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeightKg: e.target.value }))}
                          onBlur={() => commitNumber('targetWeightKg', draftProfile.targetWeightKg, { min: 30, max: 300 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Duration (Weeks)</div>
                        <input
                          inputMode="numeric"
                          placeholder="8"
                          value={draftProfile.targetWeeks}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeeks: e.target.value }))}
                          onBlur={() => commitNumber('targetWeeks', draftProfile.targetWeeks, { min: 1, max: 52 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">Training Days/Week</div>
                        <input
                          inputMode="numeric"
                          placeholder="3"
                          value={draftProfile.trainingDaysPerWeek}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, trainingDaysPerWeek: e.target.value }))}
                          onBlur={() => commitNumber('trainingDaysPerWeek', draftProfile.trainingDaysPerWeek, { min: 0, max: 7 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={prevCoachStep}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 text-neutral-900 dark:text-white transition hover:bg-emerald-900/5 dark:hover:bg-white/5"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={() => {
                        if (coachSubmitting) return;
                        nextCoachStep();
                        void sendToCoach('ช่วยสรุปเป้าหมายและวางแผนเริ่มต้น 7 วันให้หน่อย');
                      }}
                      disabled={coachSubmitting}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-base font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] transition hover:bg-emerald-600 ${
                        coachSubmitting && 'cursor-not-allowed opacity-70'
                      }`}
                    >
                      {coachSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                      Create Plan
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Dashboard & Chat */}
              {coachStep === 5 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Coach Dashboard</h1>
                      <p className="text-sm text-emerald-900/60 dark:text-emerald-100/60">Your personalized plan</p>
                    </div>
                    <button
                      onClick={() => setCoachStep(1)}
                      className="rounded-full bg-emerald-900/5 dark:bg-white/5 px-4 py-2 text-xs font-bold text-emerald-900/60 dark:text-emerald-100/60 transition hover:bg-emerald-900/10 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white"
                    >
                      Edit Profile
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-3xl bg-white/60 dark:bg-[#0a120f]/60 border border-emerald-900/5 dark:border-white/5 p-4 backdrop-blur-md transition-colors duration-500 ease-in-out">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40">BMI</div>
                      <div className="mt-1 text-2xl font-extrabold text-neutral-900 dark:text-white">{coachDerived.bmi.toFixed(1)}</div>
                      <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{coachDerived.bmiCategory}</div>
                    </div>
                    <div className="rounded-3xl bg-white/60 dark:bg-[#0a120f]/60 border border-emerald-900/5 dark:border-white/5 p-4 backdrop-blur-md transition-colors duration-500 ease-in-out">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40">TDEE</div>
                      <div className="mt-1 text-2xl font-extrabold text-neutral-900 dark:text-white">{round(coachDerived.tdee)}</div>
                      <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">kcal/day</div>
                    </div>
                    <div className="rounded-3xl bg-emerald-500 p-4 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">Target</div>
                      <div className="mt-1 text-2xl font-extrabold">{round(coachDerived.target)}</div>
                      <div className="text-xs text-emerald-100">kcal/day</div>
                    </div>
                    <div className="rounded-3xl bg-white/60 dark:bg-[#0a120f]/60 border border-emerald-900/5 dark:border-white/5 p-4 backdrop-blur-md transition-colors duration-500 ease-in-out">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40">Protein</div>
                      <div className="mt-1 text-xl font-extrabold text-neutral-900 dark:text-white">{coachDerived.proteinRange[0]}-{coachDerived.proteinRange[1]}</div>
                      <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">g/day</div>
                    </div>
                  </div>

                  {/* Chat Interface */}
                  <div className="flex h-[65vh] sm:h-150 flex-col overflow-hidden rounded-4xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 shadow-2xl backdrop-blur-md transition-colors duration-500 ease-in-out">
                    <div className="border-b border-emerald-900/5 dark:border-white/5 bg-emerald-50/50 dark:bg-emerald-950/30 px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                            <Sparkles className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-neutral-900 dark:text-white">AI Coach</div>
                            <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">Online 24/7</div>
                          </div>
                        </div>
                        <button
                          onClick={resetCoachChat}
                          className="rounded-full p-2 text-emerald-900/40 dark:text-emerald-100/40 hover:bg-emerald-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        >
                          <RefreshCw className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-emerald-50/30 dark:bg-black/20">
                      {coachMessages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                              m.role === 'user'
                                ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(5,150,105,0.3)]'
                                : 'bg-white dark:bg-[#1a2e26] text-neutral-900 dark:text-emerald-50 border border-emerald-900/5 dark:border-white/5'
                            }`}
                          >
                            {m.role === 'assistant' ? (
                              <div className="coach-markdown prose prose-sm prose-neutral dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                                  {m.text}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap">{m.text}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      {coachSubmitting && (
                        <div className="flex justify-start">
                          <div className="flex items-center gap-2 rounded-2xl bg-white dark:bg-[#1a2e26] px-4 py-3 text-sm text-emerald-900/60 dark:text-emerald-100/60 border border-emerald-900/5 dark:border-white/5">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Typing...
                          </div>
                        </div>
                      )}
                      <div ref={coachMessagesEndRef} />
                    </div>

                    <div className="border-t border-emerald-900/5 dark:border-white/5 bg-emerald-50/50 dark:bg-emerald-950/30 p-4">
                      {coachApiError && (
                        <div className="mb-2 text-xs font-medium text-rose-500 dark:text-rose-400 text-center">
                          {coachApiError}
                        </div>
                      )}
                      {coachFollowUps.length > 0 && (
                        <div className="mb-3 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {coachFollowUps.map((q) => (
                            <button
                              key={q}
                              onClick={() => void sendToCoach(q)}
                              className="whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 transition hover:bg-emerald-500/20"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          value={coachDraft}
                          onChange={(e) => setCoachDraft(e.target.value)}
                          placeholder="Ask your coach..."
                          className="flex-1 rounded-full border border-emerald-900/10 dark:border-white/10 bg-white dark:bg-black/40 px-4 py-3 text-sm font-medium text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-emerald-900/30 dark:placeholder:text-emerald-100/20"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void sendCoachDraft();
                            }
                          }}
                        />
                        <button
                          onClick={() => void sendCoachDraft()}
                          disabled={!coachDraft.trim() || coachSubmitting}
                          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-50 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        </main>

        {/* Right Column (Status Card) */}
        <aside className="md:col-span-4 lg:col-span-3 space-y-6 order-1 md:order-2">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-4xl bg-white/80 dark:bg-[#0a120f]/80 border border-emerald-900/5 dark:border-white/5 p-6 shadow-2xl sticky top-8 backdrop-blur-md transition-colors duration-500 ease-in-out"
          >
            <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 to-transparent" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">Daily Goal</div>
              <div className="relative w-40 h-40 mb-4 flex items-center justify-center">
                 {/* Progress Ring */}
                 <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-emerald-100 dark:text-emerald-950" />
                    <motion.circle 
                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" 
                      className="text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: progress / 100 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black tracking-tighter text-neutral-900 dark:text-white drop-shadow-lg">{Math.round(proteinAnimated)}</span>
                    <span className="text-xs font-medium text-emerald-900/40 dark:text-emerald-100/40">/ 180g Protein</span>
                 </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 w-full border-t border-emerald-900/5 dark:border-white/5 pt-4">
                 <div>
                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase tracking-wider">Kcal</div>
                    <div className="text-lg font-bold text-neutral-900 dark:text-white">{Math.round(kcalAnimated)}</div>
                 </div>
                 <div>
                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase tracking-wider">Carbs</div>
                    <div className="text-lg font-bold text-neutral-900 dark:text-white">{Math.round(cAnimated)}</div>
                 </div>
                 <div>
                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase tracking-wider">Fat</div>
                    <div className="text-lg font-bold text-neutral-900 dark:text-white">{Math.round(fAnimated)}</div>
                 </div>
              </div>
            </div>
          </motion.div>
        </aside>

      </div>

      {/* Floating Bottom Navigation (Mobile Only) */}
      <div className="md:hidden fixed bottom-6 inset-x-0 z-40 flex justify-center">
        <div className="flex items-center gap-1 p-1.5 rounded-full bg-white/90 dark:bg-[#0a120f]/90 border border-emerald-900/10 dark:border-white/10 backdrop-blur-xl shadow-2xl shadow-emerald-900/20 dark:shadow-black/50 transition-colors duration-500 ease-in-out">
          {[
            { id: 'workout', icon: Dumbbell, label: 'Workout' },
            { id: 'nutrition', icon: Utensils, label: 'Food' },
            { id: 'protein', icon: Zap, label: 'Quick' },
            { id: 'coach', icon: Bot, label: 'Coach' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'workout' | 'nutrition' | 'protein')}
                className={`relative px-6 py-3 rounded-full flex items-center gap-2 transition-all duration-500 ease-in-out ${
                  isActive ? 'text-white' : 'text-emerald-900/40 dark:text-emerald-100/40 hover:text-emerald-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <tab.icon className={`w-5 h-5 relative z-10 ${isActive ? 'scale-110 drop-shadow-md' : ''}`} />
                {isActive && (
                  <motion.span 
                    initial={{ opacity: 0, width: 0 }} 
                    animate={{ opacity: 1, width: 'auto' }} 
                    className="text-sm font-bold relative z-10 whitespace-nowrap overflow-hidden"
                  >
                    {tab.label}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Nutrition Modal (Reused Logic) */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setAiOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#0a120f] border border-emerald-900/10 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-colors duration-500 ease-in-out"
            >
               <div className="p-4 border-b border-emerald-900/10 dark:border-white/10 flex justify-between items-center bg-emerald-50 dark:bg-emerald-950/30 transition-colors duration-500 ease-in-out">
                  <div className="flex items-center gap-2">
                     <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                     <span className="font-bold text-emerald-900 dark:text-white transition-colors duration-500 ease-in-out">AI Nutrition</span>
                  </div>
                  <button onClick={() => setAiOpen(false)} className="p-1 rounded-full hover:bg-emerald-900/5 dark:hover:bg-white/10 transition-colors duration-500 ease-in-out">
                     <div className="w-6 h-1 bg-emerald-900/20 dark:bg-emerald-100/20 rounded-full transition-colors duration-500 ease-in-out" />
                  </button>
               </div>
               
               <div className="p-6 space-y-4">
                  <textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="Describe your meal..."
                    className="w-full h-32 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-900/10 dark:border-white/10 rounded-xl p-4 text-emerald-900 dark:text-white placeholder:text-emerald-900/40 dark:placeholder:text-emerald-100/20 focus:outline-none focus:border-emerald-500/50 transition-colors duration-500 ease-in-out resize-none"
                  />
                  
                  <div className="flex gap-3">
                     <button 
                        onClick={analyzeNutrition}
                        disabled={aiLoading || !aiText}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                     >
                        {aiLoading ? <RotateCw className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                        Analyze
                     </button>
                  </div>

                  {aiError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      {aiError}
                    </div>
                  )}

                  {aiResponse?.results && (
                     <div className="space-y-4 mt-4">
                        {aiResponse.results.map((r, i) => (
                           <div key={i} className="bg-white/80 dark:bg-[#0a120f]/80 rounded-2xl p-5 border border-emerald-900/10 dark:border-white/10 shadow-lg backdrop-blur-md transition-colors duration-500 ease-in-out">
                              {/* Header */}
                              <div className="flex justify-between items-start mb-4">
                                 <div>
                                    <h3 className="text-lg font-black text-emerald-900 dark:text-white tracking-tight transition-colors duration-500 ease-in-out">{r.itemName}</h3>
                                    <p className="text-xs text-emerald-900/60 dark:text-emerald-100/60 transition-colors duration-500 ease-in-out">{r.assumedServing}</p>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-2xl font-black text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)] transition-colors duration-500 ease-in-out">
                                       {r.caloriesKcal}
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40 transition-colors duration-500 ease-in-out">kcal</div>
                                 </div>
                              </div>

                              {/* Macros Grid */}
                              <div className="grid grid-cols-3 gap-2 mb-4">
                                 <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2 text-center border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
                                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase font-bold transition-colors duration-500 ease-in-out">Protein</div>
                                    <div className="text-lg font-bold text-emerald-900 dark:text-white transition-colors duration-500 ease-in-out">{r.proteinG}g</div>
                                 </div>
                                 <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2 text-center border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
                                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase font-bold transition-colors duration-500 ease-in-out">Carbs</div>
                                    <div className="text-lg font-bold text-emerald-900 dark:text-white transition-colors duration-500 ease-in-out">{r.carbsG}g</div>
                                 </div>
                                 <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2 text-center border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
                                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase font-bold transition-colors duration-500 ease-in-out">Fat</div>
                                    <div className="text-lg font-bold text-emerald-900 dark:text-white transition-colors duration-500 ease-in-out">{r.fatG}g</div>
                                 </div>
                              </div>

                              {/* Detailed Info */}
                              <div className="space-y-3 border-t border-emerald-900/5 dark:border-white/5 pt-3 transition-colors duration-500 ease-in-out">
                                 {/* Vitamins */}
                                 {r.vitaminsAndMinerals && r.vitaminsAndMinerals.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                       {r.vitaminsAndMinerals.map((v, idx) => (
                                          <span key={idx} className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-500/20 transition-colors duration-500 ease-in-out">
                                             {v}
                                          </span>
                                       ))}
                                    </div>
                                 )}

                                 {/* Health Benefits */}
                                 {r.healthBenefits && (
                                    <div className="flex gap-2 items-start text-xs text-emerald-100/80 bg-emerald-900/10 p-2 rounded-lg border border-emerald-500/10">
                                       <Leaf className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                       <span>{r.healthBenefits}</span>
                                    </div>
                                 )}

                                 {/* Warnings */}
                                 {r.warnings && (
                                    <div className="flex gap-2 items-start text-xs text-rose-200/80 bg-rose-900/10 p-2 rounded-lg border border-rose-500/10">
                                       <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                       <span>{r.warnings}</span>
                                    </div>
                                 )}

                                 {/* Fun Fact */}
                                 {r.funFact && (
                                    <div className="flex gap-2 items-start text-xs text-amber-100/80 bg-amber-900/10 p-2 rounded-lg border border-amber-500/10">
                                       <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                       <span>{r.funFact}</span>
                                    </div>
                                 )}
                              </div>
                           </div>
                        ))}
                        
                        <button 
                           onClick={saveAiAsMeal}
                           className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                           <Plus className="w-5 h-5" />
                           Save to Daily Log
                        </button>
                     </div>
                  )}
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exercise Detail Modal */}
      <AnimatePresence>
        {selectedExerciseLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedExerciseLabel(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0a120f] border border-white/10 rounded-3xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="p-5 border-b border-white/10 flex justify-between items-start bg-emerald-950/30">
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedExerciseDetail?.thaiName ?? selectedExerciseLabel}</h3>
                  <p className="text-sm text-emerald-100/60">{selectedExerciseDetail?.primary?.join(', ') ?? 'Exercise Details'}</p>
                </div>
                <button onClick={() => setSelectedExerciseLabel(null)} className="p-2 rounded-full hover:bg-white/10 text-emerald-100/60 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto space-y-6">
                 {/* Focus */}
                 <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">Focus</h4>
                    <div className="flex flex-wrap gap-2">
                       {(selectedExerciseDetail?.focus ?? []).map((f, i) => (
                          <span key={i} className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                             {f}
                          </span>
                       ))}
                    </div>
                 </div>

                 {/* Steps */}
                 <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-100/40">How to</h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-emerald-100/80">
                       {(selectedExerciseDetail?.steps ?? []).map((s, i) => (
                          <li key={i} className="leading-relaxed">{s}</li>
                       ))}
                    </ol>
                 </div>

                 {/* Controls */}
                 <div className="pt-4 border-t border-white/10 flex gap-3">
                    <button
                       onClick={() => {
                          if (selectedExerciseLabel) incrementExercise(selectedExerciseLabel);
                       }}
                       className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                    >
                       <Plus className="w-4 h-4" /> Add Set
                    </button>
                    <button
                       onClick={() => {
                          if (selectedExerciseLabel) resetExercise(selectedExerciseLabel);
                       }}
                       className="px-4 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-colors border border-white/5"
                    >
                       <RotateCw className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset Day"
        description="Start fresh? This clears all progress."
        confirmLabel="Reset"
        variant="danger"
        prefersReducedMotion={prefersReducedMotion}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          setConfirmResetOpen(false);
          resetAllToday();
        }}
      />

      <ConfirmDialog
        open={!!mealToDelete}
        title="Delete Meal?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        prefersReducedMotion={prefersReducedMotion}
        onClose={() => setMealToDelete(null)}
        onConfirm={() => {
          if (mealToDelete) deleteMeal(mealToDelete);
          setMealToDelete(null);
        }}
      />
      
      {/* Save Success Toast */}
      <AnimatePresence>
         {saveSuccessOpen && (
            <motion.div 
               initial={{ opacity: 0, y: 50 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 50 }}
               className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2"
            >
               <CheckCircle2 className="w-5 h-5" />
               Saved successfully
            </motion.div>
         )}
      </AnimatePresence>

      {/* Coach Success Toast */}
      <AnimatePresence>
         {coachSuccessOpen && (
            <motion.div 
               initial={{ opacity: 0, y: 50 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 50 }}
               className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg font-bold flex items-center gap-2"
            >
               <CheckCircle2 className="w-5 h-5" />
               Coach updated
            </motion.div>
         )}
      </AnimatePresence>

    </div>
  );
}

export default dynamic(() => Promise.resolve(FitnessApp), { ssr: false });

