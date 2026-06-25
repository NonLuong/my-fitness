'use client';

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
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
  ChartLine,
} from 'lucide-react';

import { localDateKey, safeParseJson, sumFiniteNonNegative } from '@/lib/dailyLog';
import { normalizeCoachMarkdown } from '@/lib/coachMarkdown';
import { mealTypeFromDate } from '@/lib/mealTime';
import {
  cloudErrorMessage,
  loadCloudCoachState,
  loadCloudDailyLog,
  migrateLocalDataToCloud,
  saveCloudCoachMessages,
  saveCloudCoachProfile,
  saveCloudDailyLog,
} from '@/lib/cloudPersistence';
import {
  loadCoachChat,
  loadCoachProfile,
  saveCoachChat,
  saveCoachProfile,
} from '@/lib/coachPersistence';

import { ConfirmDialog } from './_components/ConfirmDialog';
import { AuthButton } from './_components/AuthButton';
import { useAuth } from './_components/AuthProvider';
import { MochiMascot } from './_components/MochiMascot';
import type { MealEntry } from './_components/types/nutrition';

// --- 1. Type Definition ---

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

const MOBILE_TAB_STORAGE_KEY = 'ui_mobileTab_v2';
type MainTab = 'nutrition' | 'protein' | 'progress';

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

type NutritionSectionProps = {
  mobileVisible: boolean;
  prefersReducedMotion: boolean;
  meals: MealEntry[];
  kcalAnimated: number;
  pAnimated: number;
  cAnimated: number;
  fAnimated: number;
  onOpenAi: () => void;
  onRequestDeleteMeal: (id: string) => void;
};

type ProgressSectionProps = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  targetKcal: number;
  proteinGoal: number;
};

const NutritionSection = dynamic<NutritionSectionProps>(
  () => import('./_components/sections/NutritionSection').then((mod) => mod.NutritionSection),
  {
    loading: () => <NutritionSectionSkeleton />,
    ssr: false,
  },
);

const ProgressSection = dynamic<ProgressSectionProps>(
  () => import('./_components/sections/ProgressSection').then((mod) => mod.ProgressSection),
  {
    loading: () => <NutritionSectionSkeleton />,
    ssr: false,
  },
);

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

type CelebrationState = {
  id: number;
  title: string;
  message: string;
  mood: 'workout' | 'food';
};

const AmbientBackground = React.memo(function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
          x: [0, 50, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#f4b89c]/25 dark:bg-[#d98c68]/10 blur-[120px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.4, 0.2],
          x: [0, -30, 0],
          y: [0, 50, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#91ad8b]/25 dark:bg-[#91ad8b]/10 blur-[120px]"
      />
      <motion.div
        animate={{
          opacity: [0.1, 0.3, 0.1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[30%] left-[30%] w-[40%] h-[40%] rounded-full bg-[#f2cd72]/15 blur-[100px]"
      />
    </div>
  );
});
AmbientBackground.displayName = 'AmbientBackground';

const CoachMarkdownMessage = React.memo(function CoachMarkdownMessage({ text }: { text: string }) {
  return (
    <div className="coach-markdown prose prose-sm prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {normalizeCoachMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
});
CoachMarkdownMessage.displayName = 'CoachMarkdownMessage';

function NutritionSectionSkeleton() {
  return (
    <section className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-3 w-20 rounded-full bg-emerald-900/10 dark:bg-emerald-100/10" />
          <div className="h-4 w-32 rounded-full bg-emerald-900/20 dark:bg-emerald-100/20" />
        </div>
        <div className="h-9 w-24 rounded-2xl bg-emerald-500/40" />
      </div>
      <div className="rounded-3xl border border-emerald-900/5 dark:border-white/5 bg-white/40 dark:bg-[#0a120f]/40 p-6 space-y-4">
        <div className="h-4 w-40 rounded-full bg-emerald-900/10 dark:bg-emerald-100/10" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="space-y-2 rounded-2xl border border-emerald-900/5 dark:border-white/5 p-3">
              <div className="h-2.5 w-12 rounded-full bg-emerald-900/10 dark:bg-emerald-100/10" />
              <div className="h-5 w-10 rounded-full bg-emerald-900/20 dark:bg-emerald-100/20" />
            </div>
          ))}
        </div>
        <div className="h-3 w-48 rounded-full bg-emerald-900/10 dark:bg-emerald-100/10" />
      </div>
    </section>
  );
}

function FitnessApp() {
  // --- Logic ---
  const { user } = useAuth();
  const today = new Date();
  const logDate = localDateKey(today);
  const storageKey = `log_${logDate}`;

  const makeId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return String(new Date().getTime());
  };

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  // --- Theme Logic ---
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
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

  const loadInitialData = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        protein: 0,
        proteinEvents: [] as ProteinEvent[],
        workout: {} as WorkoutState,
        meals: [] as MealEntry[]
      };
    }
    const parsed = safeParseJson<Partial<DailyLog>>(localStorage.getItem(storageKey));
    if (parsed) {
      const workoutFromStorage = parsed.workout as WorkoutState | undefined;
      const workout = workoutFromStorage && typeof workoutFromStorage === 'object'
        ? workoutFromStorage
        : {};
      const meals = Array.isArray(parsed.meals) ? parsed.meals : [];
      const proteinEvents = Array.isArray(parsed.proteinEvents)
        ? parsed.proteinEvents.filter((event) => event && !event.label?.startsWith('AI:'))
        : [];
      return {
        protein: sumFiniteNonNegative(proteinEvents.map((event) => event.grams)),
        proteinEvents,
        workout,
        meals,
      };
    }
    return {
      protein: 0,
      proteinEvents: [] as ProteinEvent[],
      workout: {} as WorkoutState,
      meals: [] as MealEntry[]
    };
  }, [storageKey]);

  const initialDailyLog = useMemo(() => loadInitialData(), [loadInitialData]);
  const [protein, setProtein] = useState<number>(initialDailyLog.protein);
  const [proteinEvents, setProteinEvents] = useState<ProteinEvent[]>(initialDailyLog.proteinEvents);
  const [workoutState, setWorkoutState] = useState<WorkoutState>(initialDailyLog.workout);
  const [meals, setMeals] = useState<MealEntry[]>(initialDailyLog.meals);
  const [cloudSyncState, setCloudSyncState] = useState<'idle' | 'syncing' | 'ready' | 'error'>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudRetryToken, setCloudRetryToken] = useState(0);
  const cloudReadyUserRef = useRef<string | null>(null);
  const cloudUserRef = useRef(user);

  useEffect(() => {
    cloudUserRef.current = user;
  }, [user]);

  const mealsRef = useRef<MealEntry[]>(meals);
  useEffect(() => {
    mealsRef.current = meals;
  }, [meals]);

  const [activeTab, setActiveTab] = useState<MainTab>('nutrition');
  const [coachOpen, setCoachOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
    if (saved === 'nutrition' || saved === 'protein' || saved === 'progress') {
      setActiveTab(saved);
    } else if (saved === 'workout') {
      setActiveTab('nutrition');
    } else if (saved === 'coach') {
      setCoachOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!coachOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCoachOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [coachOpen]);

  // --- Coach Logic ---
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
  const [coachPersistenceReady, setCoachPersistenceReady] = useState(false);
  const coachMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const coachInputRef = useRef<HTMLInputElement | null>(null);

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
    try {
      const savedProfile = loadCoachProfile<CoachProfile, Draft>();
      if (savedProfile) {
        setCoachProfile(savedProfile.profile);
        if (savedProfile.draftProfile) setDraftProfile(savedProfile.draftProfile);
        if (
          savedProfile.profile.ageYears
          && savedProfile.profile.heightCm
          && savedProfile.profile.weightKg
          && savedProfile.profile.goal
        ) {
          setCoachStep(5);
        }
      }

      const savedMessages = loadCoachChat<CoachChatMessage>();
      if (savedMessages?.length) {
        setCoachMessages(savedMessages.map((message) => ({
          ...message,
          text: message.role === 'assistant'
            ? normalizeCoachMarkdown(message.text)
            : message.text,
        })));
      } else {
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

    window.setTimeout(() => setCoachPersistenceReady(true), 0);
  }, []);

  useEffect(() => {
    if (!coachPersistenceReady) return;
    try {
      saveCoachChat(coachMessages);
    } catch {}
  }, [coachMessages, coachPersistenceReady]);

  useEffect(() => {
    if (!coachPersistenceReady) return;
    try {
      saveCoachProfile(coachProfile, draftProfile);
    } catch {}
  }, [coachProfile, draftProfile, coachPersistenceReady]);

  useEffect(() => {
    if (!user || !coachPersistenceReady) {
      cloudReadyUserRef.current = null;
      setCloudSyncState('idle');
      setCloudSyncError(null);
      return;
    }

    let cancelled = false;
    setCloudSyncState('syncing');
    setCloudSyncError(null);

    void (async () => {
      try {
        const migration = await migrateLocalDataToCloud(user);
        const [logResult, coachResult] = await Promise.allSettled([
          loadCloudDailyLog<DailyLog>(user.id, logDate),
          loadCloudCoachState<CoachProfile, Draft, CoachChatMessage>(user.id),
        ]);
        if (cancelled) return;

        const cloudLog = logResult.status === 'fulfilled' ? logResult.value : null;
        if (cloudLog) {
          const nextEvents = Array.isArray(cloudLog.proteinEvents) ? cloudLog.proteinEvents : [];
          const nextMeals = Array.isArray(cloudLog.meals) ? cloudLog.meals : [];
          const nextWorkout = cloudLog.workout && typeof cloudLog.workout === 'object'
            ? cloudLog.workout
            : {};
          setProtein(sumFiniteNonNegative(nextEvents.map((event) => event.grams)));
          setProteinEvents(nextEvents);
          setWorkoutState(nextWorkout);
          setMeals(nextMeals);
          window.localStorage.setItem(storageKey, JSON.stringify({
            protein: sumFiniteNonNegative(nextEvents.map((event) => event.grams)),
            proteinEvents: nextEvents,
            workout: nextWorkout,
            meals: nextMeals,
          }));
        }

        const cloudCoach = coachResult.status === 'fulfilled' ? coachResult.value : null;
        if (cloudCoach?.profile) {
          setCoachProfile(cloudCoach.profile);
          if (cloudCoach.draftProfile) setDraftProfile(cloudCoach.draftProfile);
          if (
            cloudCoach.profile.ageYears
            && cloudCoach.profile.heightCm
            && cloudCoach.profile.weightKg
          ) {
            setCoachStep(5);
          }
        }
        if (cloudCoach?.messages.length) {
          setCoachMessages(cloudCoach.messages.map((message) => ({
            ...message,
            text: message.role === 'assistant'
              ? normalizeCoachMarkdown(message.text)
              : message.text,
          })));
        }

        const issues = [
          ...migration.issues.map((issue) => `${issue.area}: ${issue.message}`),
          ...(logResult.status === 'rejected'
            ? [`daily_logs: ${cloudErrorMessage(logResult.reason)}`]
            : []),
          ...(coachResult.status === 'rejected'
            ? [`coach_messages: ${cloudErrorMessage(coachResult.reason)}`]
            : []),
        ];

        if (issues.length) {
          setCloudSyncError(issues.join(' | '));
          setCloudSyncState('error');
        } else {
          cloudReadyUserRef.current = user.id;
          setCloudSyncState('ready');
        }
      } catch (error) {
        console.error('FitSync cloud hydration failed', error);
        if (!cancelled) {
          setCloudSyncError(cloudErrorMessage(error));
          setCloudSyncState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, coachPersistenceReady, logDate, storageKey, cloudRetryToken]);

  useEffect(() => {
    if (!user || cloudReadyUserRef.current !== user.id || !coachPersistenceReady) return;
    const timer = window.setTimeout(() => {
      void saveCloudCoachProfile(user, coachProfile, draftProfile).catch((error) => {
        console.error('FitSync profile sync failed', error);
        setCloudSyncState('error');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [user, coachProfile, draftProfile, coachPersistenceReady]);

  useEffect(() => {
    if (!user || cloudReadyUserRef.current !== user.id || !coachPersistenceReady) return;
    const timer = window.setTimeout(() => {
      void saveCloudCoachMessages(user.id, coachMessages).catch((error) => {
        console.error('FitSync coach sync failed', error);
        setCloudSyncState('error');
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [user, coachMessages, coachPersistenceReady]);

  useEffect(() => {
    coachMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [coachMessages.length, coachFollowUps.length, coachSubmitting, activeTab, coachOpen]);

  useEffect(() => {
    if (!coachOpen || coachStep !== 5) return;
    const timer = window.setTimeout(() => coachInputRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [coachOpen, coachStep]);

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
          text: normalizeCoachMarkdown(data.adviceMarkdown),
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

  // --- AI Nutrition ---
  const [aiOpen, setAiOpen] = useState<boolean>(false);
  const [aiText, setAiText] = useState<string>('');
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AiNutritionResponse | null>(null);

  useEffect(() => {
    if (!aiOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAiOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [aiOpen]);
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
    const pending = pendingSaveRef.current;
    try {
      localStorage.setItem(storageKey, JSON.stringify(pending));
    } catch {
      // Storage can be unavailable in private mode or when the quota is full.
    }
    const cloudUser = cloudUserRef.current;
    if (cloudUser && cloudReadyUserRef.current === cloudUser.id) {
      void saveCloudDailyLog(cloudUser.id, logDate, {
        ...pending,
        meals: pending.meals ?? [],
      }).catch((error) => {
        console.error('FitSync daily log sync failed', error);
        setCloudSyncState('error');
      });
    }
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

  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const proteinGoalCelebratedRef = useRef(false);

  const celebrate = useCallback((next: Omit<CelebrationState, 'id'>) => {
    if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    setCelebration({ ...next, id: Date.now() });
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebration(null);
      celebrationTimerRef.current = null;
    }, 2400);
  }, []);

  const addProtein = (event: Omit<ProteinEvent, 'id' | 'ts'>) => {
    const ts = new Date().getTime();
    const newEvent: ProteinEvent = {
      id: makeId(),
      ts,
      ...event
    };
    const newEvents = [newEvent, ...proteinEvents].slice(0, 50);
    const newProtein = sumFiniteNonNegative(newEvents.map((item) => item.grams));
    setProtein(newProtein);
    setProteinEvents(newEvents);
    scheduleSave(newProtein, newEvents, workoutState, mealsRef.current);
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

  const saveAiAsMeal = () => {
    if (!aiResponse?.results || aiResponse.results.length === 0) return;
    const savedAt = new Date();

    const newMeal: MealEntry = {
      id: `${savedAt.getTime()}_${Math.random().toString(16).slice(2)}`,
      ts: savedAt.getTime(),
      mealType: mealTypeFromDate(savedAt),
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

  const totalProtein = protein + mealTotals.proteinG;
  const proteinGoal = coachProfile.weightKg
    ? coachDerived.proteinRange[1]
    : 180;
  const progress = Math.min((totalProtein / proteinGoal) * 100, 100);

  const proteinItems = useMemo(() => (
    [
      { label: 'เวย์ 1 สกู๊ป', grams: 25, calories: 120, icon: Dumbbell, desc: 'อาหารเสริม', category: 'supplement' as const },
      { label: 'อกไก่', grams: 23, calories: 120, icon: Utensils, desc: 'อาหารธรรมชาติ', category: 'whole_food' as const },
      { label: 'ไข่ต้ม', grams: 7, calories: 75, icon: Flame, desc: 'มื้อว่าง', category: 'snack' as const },
    ]
  ), []);

  const resetAllToday = () => {
    const nextWorkout = {};
    setProtein(0);
    setProteinEvents([]);
    setWorkoutState(nextWorkout);
    setMeals([]);
    scheduleSave(0, [], nextWorkout, []);
  };

  const prefersReducedMotion = usePrefersReducedMotion();
  const proteinAnimated = useAnimatedNumber(totalProtein);
  const kcalAnimated = useAnimatedNumber(mealTotals.caloriesKcal);
  const pAnimated = useAnimatedNumber(mealTotals.proteinG);
  const cAnimated = useAnimatedNumber(mealTotals.carbsG);
  const fAnimated = useAnimatedNumber(mealTotals.fatG);

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (progress >= 100 && !proteinGoalCelebratedRef.current) {
      proteinGoalCelebratedRef.current = true;
      celebrate({
        title: 'โปรตีนถึงเป้าแล้ว!',
        message: 'Mochi ภูมิใจในตัวคุณมาก เก่งสุด ๆ เลย',
        mood: 'food',
      });
    } else if (progress < 95) {
      proteinGoalCelebratedRef.current = false;
    }
  }, [progress, celebrate]);

  useEffect(() => () => {
    if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobile) return;
    if (aiOpen) return;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  }, [activeTab, isMobile, prefersReducedMotion, aiOpen]);

  return (
    <div className="cozy-app min-h-screen text-neutral-900 dark:text-white selection:bg-[#d98c68]/25 font-sans transition-colors duration-500 ease-in-out">
      <AmbientBackground />

      {/* Header (Mobile Only) */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-[#8f765d]/10 dark:border-white/5 bg-[#fff8ed]/85 dark:bg-[#342d27]/88 backdrop-blur-xl transition-colors duration-500 ease-in-out">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MochiMascot size="sm" />
            <span className="font-black text-lg tracking-tight text-[#55483d] dark:text-[#fff4df]">
              Fit<span className="text-[#b66f50] dark:text-[#f2b095]">Sync</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
             {/* Theme Toggles */}
             <div className="flex items-center gap-1 bg-emerald-900/5 dark:bg-white/5 rounded-full p-1 border border-emerald-900/5 dark:border-white/5 backdrop-blur-sm">
                <button
                  onClick={toggleTheme}
                  aria-label="สลับธีมสว่างและมืด"
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
                aria-label="รีเซ็ตข้อมูลวันนี้"
                className="p-2 rounded-full hover:bg-emerald-900/5 dark:hover:bg-white/5 text-emerald-900/60 dark:text-emerald-100/60 hover:text-emerald-900 dark:hover:text-white transition-colors"
             >
                <RotateCw className="w-5 h-5" />
             </button>
             <AuthButton compact />
             <div className="hidden rounded-full bg-[#f1e4cf] px-3 py-1 text-[10px] font-bold text-[#8a6b55] sm:block dark:bg-white/5 dark:text-[#dbc8ac]">โหมดดูแลใจและกาย</div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 p-4 pb-[calc(12rem+env(safe-area-inset-bottom))] pt-20 md:grid-cols-12 md:p-8">

        {/* Desktop Navigation (Left Sidebar) */}
        <nav className="cozy-surface hidden md:flex md:col-span-3 lg:col-span-2 flex-col gap-6 sticky top-8 h-fit rounded-[2rem] p-4">
          <div className="flex items-center gap-3 px-2 mb-4">
            <MochiMascot />
            <div>
              <span className="font-black text-xl tracking-tight text-[#55483d] dark:text-[#fff4df]">
                Fit<span className="text-[#b66f50] dark:text-[#f2b095]">Sync</span>
              </span>
              <div className="text-[10px] font-bold tracking-wide text-[#a17c62] dark:text-[#cdb99d]">สุขภาพดี แบบใจดีกับตัวเอง</div>
            </div>
          </div>

          <div className="space-y-2">
            {[
              { id: 'nutrition', icon: Utensils, label: 'โภชนาการ' },
              { id: 'protein', icon: Zap, label: 'เพิ่มโปรตีน' },
              { id: 'progress', icon: ChartLine, label: 'ความก้าวหน้า' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as MainTab)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-500 ease-in-out ${
                    isActive 
                      ? 'border border-[#d98c68]/25 bg-[#d98c68]/12 font-bold text-[#a96550] shadow-[0_8px_20px_rgba(177,105,75,0.1)] dark:text-[#f2b095]'
                      : 'text-emerald-900/60 dark:text-emerald-100/60 hover:bg-emerald-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${isActive ? 'text-[#b66f50] dark:text-[#f2b095]' : ''}`} />
                  <span>{tab.label}</span>
                  {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#d98c68]" />}
                </button>
              );
            })}

          </div>

          <div className="pt-6 mt-auto border-t border-emerald-900/5 dark:border-white/5 space-y-3">
             <AuthButton />
             {user && (
               <div className={`px-2 text-[10px] font-bold ${
                 cloudSyncState === 'error'
                   ? 'text-red-500'
                   : 'text-[#829079] dark:text-[#b8cbaa]'
               }`}>
                 {cloudSyncState === 'syncing'
                   ? 'กำลังซิงก์ข้อมูล…'
                   : cloudSyncState === 'error'
                     ? 'ซิงก์ไม่สำเร็จ ข้อมูลยังเก็บในเครื่อง'
                     : 'ซิงก์กับ Cloud แล้ว'}
                 {cloudSyncState === 'error' && (
                   <>
                     <button
                       type="button"
                       onClick={() => setCloudRetryToken((token) => token + 1)}
                       className="mt-1 block font-extrabold underline underline-offset-2"
                     >
                       ลองซิงก์ใหม่
                     </button>
                     {cloudSyncError && (
                       <span
                         title={cloudSyncError}
                         className="mt-1 block max-w-full truncate text-[9px] font-medium text-red-400"
                       >
                         {cloudSyncError}
                       </span>
                     )}
                   </>
                 )}
               </div>
             )}
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
                <span className="font-medium">เริ่มข้อมูลวันนี้ใหม่</span>
             </button>
          </div>
        </nav>

        {/* Center Content (Main Feed) */}
        <main className="md:col-span-5 lg:col-span-7 space-y-6 order-2 md:order-1 min-w-0">
          <motion.section
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="cozy-surface relative overflow-hidden rounded-[2rem] p-5 sm:p-6"
          >
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[#f2cd72]/25 blur-2xl" />
            <div className="absolute -bottom-12 right-20 h-32 w-32 rounded-full bg-[#f4b89c]/20 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <MochiMascot mood={activeTab === 'nutrition' ? 'food' : 'hello'} size="lg" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold tracking-[0.18em] text-[#a17c62] uppercase dark:text-[#d4bfa2]">ความก้าวหน้าเล็ก ๆ ของวันนี้</div>
                <h1 className="mt-1 text-xl font-black tracking-tight text-[#55483d] sm:text-2xl dark:text-[#fff4df]">
                  ค่อย ๆ ไป แต่ไปด้วยกันนะ
                </h1>
                <p className="mt-1 text-sm text-[#7d6b5d] dark:text-[#d7c5aa]">
                  บันทึกอาหาร โปรตีน และความก้าวหน้าทีละนิด — ทำเท่าที่ไหวก็ถือว่าเก่งมากแล้ว
                </p>
              </div>
            </div>
          </motion.section>

          {/* Tab Content */}
          <AnimatePresence mode="wait" initial={false}>

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
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">เพิ่มโปรตีนด่วน</h2>
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
                      <div className="shrink-0 text-lg font-extrabold tracking-tight text-[#b66f50] transition-colors duration-300 group-hover:text-[#a75f43] dark:text-[#f2b095] dark:group-hover:text-[#ffc3aa]">
                        +{item.grams}g
                      </div>
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t border-emerald-900/10 dark:border-white/10">
                   <h3 className="text-sm font-bold text-emerald-900/40 dark:text-emerald-100/40 mb-3">รายการล่าสุด</h3>
                   <div className="space-y-2">
                      {proteinEvents.slice(0, 5).map(ev => (
                         <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-white/40 dark:bg-[#0a120f]/40 border border-emerald-900/5 dark:border-white/5 hover:border-emerald-500/20 transition-colors duration-500 ease-in-out">
                            <span className="text-sm text-emerald-900/80 dark:text-emerald-100/80">{ev.label}</span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+{ev.grams}g</span>
                         </div>
                      ))}
                      {proteinEvents.length === 0 && <div className="text-sm text-emerald-900/40 dark:text-emerald-100/40 text-center py-4">ยังไม่มีรายการ</div>}
                   </div>
                </div>
             </motion.div>
          )}

          {activeTab === 'progress' && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
            >
              <ProgressSection
                caloriesKcal={mealTotals.caloriesKcal}
                proteinG={totalProtein}
                carbsG={mealTotals.carbsG}
                fatG={mealTotals.fatG}
                mealCount={meals.length}
                targetKcal={coachDerived.target}
                proteinGoal={proteinGoal}
              />
            </motion.div>
          )}

          </AnimatePresence>

          <AnimatePresence>
          {coachOpen && (
            <motion.div
              key="coach"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-60 flex items-end justify-end bg-black/35 p-0 backdrop-blur-[2px] sm:p-5"
              onClick={() => setCoachOpen(false)}
            >
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label="AI Coach chat"
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                onClick={(event) => event.stopPropagation()}
                className="flex h-dvh w-full flex-col overflow-hidden bg-[#fffdf8] shadow-2xl dark:bg-[#443a32] sm:h-[min(820px,calc(100vh-2.5rem))] sm:max-w-xl sm:rounded-4xl sm:border sm:border-[#8f765d]/12 sm:dark:border-white/10"
              >
                <div className="z-20 flex shrink-0 items-center justify-between border-b border-[#8f765d]/10 bg-[#fff8ed]/92 px-5 py-4 backdrop-blur-xl dark:border-white/5 dark:bg-[#443a32]/92">
                  <div className="flex items-center gap-3">
                    <div className="relative grid h-11 w-11 place-items-center">
                      <MochiMascot mood="coach" />
                      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#f2cd72] dark:border-[#443a32]" />
                    </div>
                    <div>
                      <div className="font-extrabold text-neutral-900 dark:text-white">AI Coach</div>
                      <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">พร้อมช่วยคุณเสมอ</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCoachOpen(false)}
                    aria-label="ย่อหน้าต่าง AI Coach"
                    className="grid h-10 w-10 place-items-center rounded-full bg-emerald-900/5 text-emerald-900/60 transition hover:bg-emerald-900/10 hover:text-neutral-900 dark:bg-white/5 dark:text-emerald-100/60 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className={coachStep === 5
                  ? 'min-h-0 flex-1 overflow-hidden p-3 sm:p-4'
                  : 'min-h-0 flex-1 space-y-6 overflow-y-auto p-4 pb-8 sm:p-5'
                }>
              {/* Step 1: Basic Info */}
              {coachStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">มาเริ่มกันเลย</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">ข้อมูลพื้นฐานสำหรับวางแผนให้เหมาะกับคุณ</p>
                  </div>

                  <div className="rounded-3xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 p-6 backdrop-blur-md transition-colors duration-500 ease-in-out">
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-sm font-bold text-neutral-900 dark:text-white">เพศ</label>
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
                            <span className="font-bold">ชาย</span>
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
                            className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-lg font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                        <label className="space-y-2">
                          <div className="text-sm font-bold text-neutral-900 dark:text-white">ส่วนสูง (ซม.)</div>
                          <input
                            inputMode="numeric"
                            placeholder="170"
                            value={draftProfile.heightCm}
                            onChange={(e) => setDraftProfile((d) => ({ ...d, heightCm: e.target.value }))}
                            onBlur={() => commitNumber('heightCm', draftProfile.heightCm, { min: 120, max: 230 })}
                            className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-lg font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                        <label className="space-y-2">
                          <div className="text-sm font-bold text-neutral-900 dark:text-white">น้ำหนัก (กก.)</div>
                          <input
                            inputMode="numeric"
                            placeholder="70"
                            value={draftProfile.weightKg}
                            onChange={(e) => setDraftProfile((d) => ({ ...d, weightKg: e.target.value }))}
                            onBlur={() => commitNumber('weightKg', draftProfile.weightKg, { min: 30, max: 250 })}
                            className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-lg font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                    ต่อไป <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}

              {/* Step 2: Activity */}
              {coachStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">ระดับกิจกรรม</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">ช่วยคำนวณพลังงานที่ใช้ต่อวันได้เหมาะสมขึ้น</p>
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
                            {k === 'sedentary' && 'ขยับตัวน้อย'}
                            {k === 'light' && 'ออกกำลังเล็กน้อย'}
                            {k === 'moderate' && 'ออกกำลังสม่ำเสมอ'}
                            {k === 'active' && 'ออกกำลังหนัก'}
                            {k === 'athlete' && 'นักกีฬา'}
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
                      ต่อไป <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Body Stats */}
              {coachStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">สัดส่วนร่างกาย</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">ไม่บังคับ ใช้ช่วยประมาณเปอร์เซ็นต์ไขมัน</p>
                  </div>

                  <div className="rounded-3xl border border-emerald-900/10 dark:border-white/10 bg-white/60 dark:bg-[#0a120f]/60 p-6 backdrop-blur-md transition-colors duration-500 ease-in-out">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">รอบเอว (นิ้ว)</div>
                        <input
                          inputMode="decimal"
                          placeholder="32"
                          value={draftProfile.waistIn}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, waistIn: e.target.value }))}
                          onBlur={() => commitNumber('waistIn', draftProfile.waistIn, { min: 1, max: 90 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">เป้าหมายของคุณ</h1>
                    <p className="mt-2 text-sm text-emerald-900/60 dark:text-emerald-100/60">เราจะช่วยวางแผนให้ไปถึงเป้าหมายอย่างยั่งยืน</p>
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
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">น้ำหนักเป้าหมาย (กก.)</div>
                        <input
                          inputMode="decimal"
                          placeholder="ไม่บังคับ"
                          value={draftProfile.targetWeightKg}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, targetWeightKg: e.target.value }))}
                          onBlur={() => commitNumber('targetWeightKg', draftProfile.targetWeightKg, { min: 30, max: 300 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="space-y-2">
                        <div className="text-sm font-bold text-neutral-900 dark:text-white">จำนวนวันซ้อมต่อสัปดาห์</div>
                        <input
                          inputMode="numeric"
                          placeholder="3"
                          value={draftProfile.trainingDaysPerWeek}
                          onChange={(e) => setDraftProfile((d) => ({ ...d, trainingDaysPerWeek: e.target.value }))}
                          onBlur={() => commitNumber('trainingDaysPerWeek', draftProfile.trainingDaysPerWeek, { min: 0, max: 7 })}
                          className="w-full rounded-2xl border border-emerald-900/10 dark:border-white/10 bg-neutral-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
                      สร้างแผนเริ่มต้น
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Dashboard & Chat */}
              {coachStep === 5 && (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <div className="flex shrink-0 items-center justify-between px-1">
                    <div>
                      <h1 className="text-base font-extrabold text-neutral-900 dark:text-white">สรุปเป้าหมายของคุณ</h1>
                      <p className="text-xs text-emerald-900/50 dark:text-emerald-100/50">ใช้ข้อมูลนี้ประกอบคำแนะนำของโค้ช</p>
                    </div>
                    <button
                      onClick={() => setCoachStep(1)}
                      className="rounded-full bg-emerald-900/5 px-3 py-2 text-[11px] font-bold text-emerald-900/60 transition hover:bg-emerald-900/10 hover:text-neutral-900 dark:bg-white/5 dark:text-emerald-100/60 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      แก้ไขข้อมูล
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid shrink-0 grid-cols-4 gap-2">
                    <div className="rounded-2xl border border-emerald-900/5 bg-white/60 p-2.5 backdrop-blur-md dark:border-white/5 dark:bg-[#0a120f]/60">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40">BMI</div>
                      <div className="mt-0.5 text-lg font-extrabold text-neutral-900 dark:text-white">{coachDerived.bmi.toFixed(1)}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-900/5 bg-white/60 p-2.5 backdrop-blur-md dark:border-white/5 dark:bg-[#0a120f]/60">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40">TDEE</div>
                      <div className="mt-0.5 text-lg font-extrabold text-neutral-900 dark:text-white">{round(coachDerived.tdee)}</div>
                    </div>
                    <div className="rounded-2xl border border-[#d9a943]/25 bg-[#f2cd72]/55 p-2.5 text-[#765817] shadow-[0_8px_18px_rgba(180,137,45,0.12)] dark:text-[#fff0bd]">
                      <div className="text-[10px] font-bold uppercase tracking-wider">เป้าหมาย</div>
                      <div className="mt-0.5 text-lg font-extrabold">{round(coachDerived.target)}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-900/5 bg-white/60 p-2.5 backdrop-blur-md dark:border-white/5 dark:bg-[#0a120f]/60">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40">Protein</div>
                      <div className="mt-0.5 truncate text-base font-extrabold text-neutral-900 dark:text-white">{coachDerived.proteinRange[0]}-{coachDerived.proteinRange[1]}g</div>
                    </div>
                  </div>

                  {/* Chat Interface */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-emerald-900/10 bg-white/60 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-[#0a120f]/60">
                    <div className="shrink-0 border-b border-emerald-900/5 bg-emerald-50/50 px-4 py-3 dark:border-white/5 dark:bg-emerald-950/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                            <Sparkles className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-neutral-900 dark:text-white">AI Coach</div>
                            <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">พร้อมช่วยคุณเสมอ</div>
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

                    <div className="coach-message-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-emerald-50/30 p-4 dark:bg-black/20">
                      {coachMessages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                              m.role === 'user'
                                ? 'bg-[#d98c68] text-white shadow-[0_8px_18px_rgba(177,105,75,0.2)]'
                                : 'bg-white dark:bg-[#1a2e26] text-neutral-900 dark:text-emerald-50 border border-emerald-900/5 dark:border-white/5'
                            }`}
                          >
                            {m.role === 'assistant' ? (
                              <CoachMarkdownMessage text={m.text} />
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
                      <div ref={coachMessagesEndRef} aria-live="polite" />
                    </div>

                    <div className="shrink-0 border-t border-emerald-900/5 bg-emerald-50/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-white/5 dark:bg-emerald-950/90">
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
                          ref={coachInputRef}
                          value={coachDraft}
                          onChange={(e) => setCoachDraft(e.target.value)}
                          placeholder="ถามโค้ชได้เลย..."
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
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        </main>

        {/* Right Column (Status Card) */}
        <aside className="md:col-span-4 lg:col-span-3 space-y-6 order-1 md:order-2">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="cozy-surface overflow-hidden rounded-[2rem] p-6 sticky top-8 transition-colors duration-500 ease-in-out"
          >
            <div className="absolute inset-0 bg-linear-to-br from-[#f2cd72]/14 via-transparent to-[#f4b89c]/12" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#a96550] dark:text-[#f2b095]">เป้าหมายโปรตีนวันนี้</div>
              <div className="relative w-40 h-40 mb-4 flex items-center justify-center">
                 {/* Progress Ring */}
                 <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-[#f1e4cf] dark:text-[#5a4c40]" />
                    <motion.circle 
                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" 
                      className="text-[#d98c68] drop-shadow-[0_8px_14px_rgba(177,105,75,0.2)] dark:text-[#efa789]"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: progress / 100 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black tracking-tighter text-neutral-900 dark:text-white drop-shadow-lg">{Math.round(proteinAnimated)}</span>
                    <span className="text-xs font-medium text-emerald-900/40 dark:text-emerald-100/40">จากเป้า {proteinGoal} กรัม</span>
                 </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 w-full border-t border-emerald-900/5 dark:border-white/5 pt-4">
                 <div className="rounded-2xl border border-[#d98c68]/20 bg-[#d98c68]/13 p-2">
                    <div className="text-[10px] text-[#a96550] uppercase tracking-wider">พลังงาน</div>
                    <div className="text-lg font-bold text-[#a96550] dark:text-[#f2b095]">{Math.round(kcalAnimated)}</div>
                 </div>
                 <div className="rounded-2xl border border-[#e3b950]/25 bg-[#f2cd72]/20 p-2">
                    <div className="text-[10px] text-[#8b6b20] uppercase tracking-wider">คาร์บ</div>
                    <div className="text-lg font-bold text-[#8b6b20] dark:text-[#f5dfa0]">{Math.round(cAnimated)}g</div>
                 </div>
                 <div className="rounded-2xl border border-[#e99b80]/25 bg-[#f4b89c]/20 p-2">
                    <div className="text-[10px] text-[#9d5d49] uppercase tracking-wider">ไขมัน</div>
                    <div className="text-lg font-bold text-[#9d5d49] dark:text-[#f8cfbc]">{Math.round(fAnimated)}g</div>
                 </div>
              </div>
            </div>
          </motion.div>
        </aside>

      </div>

      {/* Floating Bottom Navigation (Mobile Only) */}
      <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:hidden">
        <div className="flex max-w-full items-center gap-1 rounded-full border border-[#8f765d]/12 bg-[#fffdf8]/92 p-1.5 shadow-[0_14px_36px_rgba(105,82,57,0.16)] backdrop-blur-xl transition-colors duration-500 ease-in-out dark:border-white/10 dark:bg-[#443a32]/92 dark:shadow-black/30">
          {[
            { id: 'nutrition', icon: Utensils, label: 'อาหาร' },
            { id: 'protein', icon: Zap, label: 'โปรตีน' },
            { id: 'progress', icon: ChartLine, label: 'สถิติ' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as MainTab)}
                className={`relative flex min-w-0 items-center gap-2 rounded-full px-3.5 py-3 transition-all duration-500 ease-in-out ${
                  isActive ? 'text-white' : 'text-emerald-900/40 dark:text-emerald-100/40 hover:text-emerald-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-full bg-[#d98c68] shadow-[0_8px_18px_rgba(177,105,75,0.24)]"
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

      <AnimatePresence>
        {!coachOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.75, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.75, y: 16 }}
            whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
            onClick={() => setCoachOpen(true)}
            aria-label="เปิดแชท AI Coach"
            className="group fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] right-5 z-50 flex items-center gap-3 rounded-full bg-[#d98c68] p-3 text-white shadow-[0_14px_35px_rgba(177,105,75,0.3)] ring-4 ring-[#fff8ed]/85 transition-colors hover:bg-[#bd7454] dark:ring-[#342d27]/80 md:bottom-7 md:right-7"
          >
            <span className="hidden pl-2 text-sm font-extrabold md:block">ถาม AI Coach</span>
            <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white/18">
              <MochiMascot mood="coach" size="sm" />
              <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#d98c68] bg-[#f2cd72]" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* AI Nutrition Modal (Reused Logic) */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setAiOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="วิเคราะห์สารอาหาร"
              className="flex h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-[2rem] border border-[#8f765d]/12 bg-[#fffdf8] shadow-[0_28px_70px_rgba(57,43,31,0.24)] transition-colors duration-500 ease-in-out dark:border-white/10 dark:bg-[#443a32] sm:h-[min(860px,calc(100dvh-2rem))] sm:rounded-[2rem]"
            >
               <div className="flex shrink-0 items-center justify-between border-b border-emerald-900/10 bg-emerald-50 p-4 transition-colors duration-500 ease-in-out dark:border-white/10 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-3">
                     <MochiMascot mood="food" size="sm" />
                     <div>
                       <span className="block font-black text-[#55483d] dark:text-[#fff4df]">AI Nutrition</span>
                       <span className="block text-[10px] font-bold text-[#a17c62] dark:text-[#d7c5aa]">เล่ามื้ออาหารแบบที่คุณพูดจริง ๆ ได้เลย</span>
                     </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiOpen(false)}
                    aria-label="ปิดหน้าต่างวิเคราะห์สารอาหาร"
                    className="grid h-9 w-9 place-items-center rounded-full text-emerald-900/50 transition-colors hover:bg-emerald-900/5 hover:text-emerald-900 dark:text-emerald-100/50 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                     <X className="h-5 w-5" />
                  </button>
               </div>
               
               <div className="nutrition-modal-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
                  <textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="เช่น กะเพราไก่ + ไข่ดาว 1 ฟอง"
                    className="w-full h-32 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-900/10 dark:border-white/10 rounded-xl p-4 text-emerald-900 dark:text-white placeholder:text-emerald-900/40 dark:placeholder:text-emerald-100/20 focus:outline-none focus:border-emerald-500/50 transition-colors duration-500 ease-in-out resize-none"
                  />
                  
                  <div className="flex gap-3">
                     <button 
                        onClick={analyzeNutrition}
                        disabled={aiLoading || !aiText}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                     >
                        {aiLoading ? <RotateCw className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                        วิเคราะห์สารอาหาร
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
                                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase font-bold transition-colors duration-500 ease-in-out">โปรตีน</div>
                                    <div className="text-lg font-bold text-emerald-900 dark:text-white transition-colors duration-500 ease-in-out">{r.proteinG}g</div>
                                 </div>
                                 <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2 text-center border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
                                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase font-bold transition-colors duration-500 ease-in-out">คาร์บ</div>
                                    <div className="text-lg font-bold text-emerald-900 dark:text-white transition-colors duration-500 ease-in-out">{r.carbsG}g</div>
                                 </div>
                                 <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2 text-center border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
                                    <div className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40 uppercase font-bold transition-colors duration-500 ease-in-out">ไขมัน</div>
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
                        
                     </div>
                  )}
               </div>
               {aiResponse?.results && aiResponse.results.length > 0 && (
                 <div className="shrink-0 border-t border-emerald-900/10 bg-white/95 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0a120f]/95">
                   <button
                     onClick={saveAiAsMeal}
                     className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:bg-emerald-600 hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] active:scale-[0.98]"
                   >
                     <Plus className="h-5 w-5" />
                     บันทึกเป็นมื้อวันนี้
                   </button>
                 </div>
               )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="เริ่มข้อมูลวันนี้ใหม่?"
        description="โปรตีน มื้ออาหาร และสรุปของวันนี้จะถูกล้าง"
        confirmLabel="เริ่มใหม่"
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
        title="ลบมื้อนี้?"
        description="เมื่อลบแล้วจะไม่สามารถย้อนกลับได้"
        confirmLabel="ลบ"
        variant="danger"
        prefersReducedMotion={prefersReducedMotion}
        onClose={() => setMealToDelete(null)}
        onConfirm={() => {
          if (mealToDelete) deleteMeal(mealToDelete);
          setMealToDelete(null);
        }}
      />

      <AnimatePresence>
        {celebration && (
          <motion.div
            key={celebration.id}
            initial={{ opacity: 0, y: 28, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 24 }}
            className="pointer-events-none fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-1/2 z-70 w-[min(92vw,390px)] -translate-x-1/2 overflow-hidden rounded-[2rem] border border-[#8f765d]/12 bg-[#fffdf8]/96 p-4 shadow-[0_24px_60px_rgba(105,82,57,0.24)] backdrop-blur-xl dark:border-white/10 dark:bg-[#443a32]/96 md:bottom-8"
            role="status"
            aria-live="polite"
          >
            {!prefersReducedMotion && (
              <div className="absolute inset-0 overflow-hidden">
                {['#91ad8b', '#f2cd72', '#f4b89c', '#d98c68', '#b8cbae'].map((color, index) => (
                  <motion.span
                    key={color}
                    initial={{ opacity: 0, y: 32, x: 0, rotate: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      y: [30, -42 - index * 6],
                      x: (index - 2) * 42,
                      rotate: index % 2 ? 160 : -160,
                    }}
                    transition={{ duration: 1.5, delay: index * 0.08, ease: 'easeOut' }}
                    className="absolute bottom-2 left-1/2 h-3 w-3 rounded-[4px]"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
            <div className="relative flex items-center gap-4">
              <MochiMascot mood={celebration.mood} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#d98c68]" />
                  <h3 className="font-black text-[#55483d] dark:text-[#fff4df]">{celebration.title}</h3>
                </div>
                <p className="mt-1 text-sm text-[#7d6b5d] dark:text-[#d7c5aa]">{celebration.message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Save Success Toast */}
      <AnimatePresence>
         {saveSuccessOpen && (
            <motion.div 
               initial={{ opacity: 0, y: 50 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 50 }}
               className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-bold text-white shadow-lg md:bottom-24"
            >
               <CheckCircle2 className="w-5 h-5" />
               บันทึกเรียบร้อยแล้ว
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
               className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-bold text-white shadow-lg md:bottom-24"
            >
               <CheckCircle2 className="w-5 h-5" />
               โค้ชอัปเดตคำแนะนำแล้ว
            </motion.div>
         )}
      </AnimatePresence>

    </div>
  );
}

export default dynamic(() => Promise.resolve(FitnessApp), { ssr: false });
