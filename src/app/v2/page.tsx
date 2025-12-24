'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
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
  X
} from 'lucide-react';

import { resolveExerciseDetailFromLabel } from '@/lib/exercises';

import { ConfirmDialog } from '../_components/ConfirmDialog';
import { NutritionSection } from '../_components/sections/NutritionSection';
import type { MealEntry, MealType } from '../_components/types/nutrition';

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
};

type AiNutritionResponse = {
  ok: boolean;
  results?: AiNutritionResult[];
  followUpQuestions?: string[];
  reasoningSummary?: string;
  error?: string;
};

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

function useAnimatedNumber(value: number, opts?: { durationMs?: number }) {
  const durationMs = opts?.durationMs ?? 450;
  const prefersReducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number>(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(value);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      // Avoid synchronous setState in effect
      queueMicrotask(() => setDisplay(value));
      return;
    }
    if (!Number.isFinite(value)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fromRef.current = display;
    startRef.current = performance.now();

    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / durationMs);
      const e = 1 - Math.pow(1 - p, 3);
      const next = fromRef.current + (value - fromRef.current) * e;
      setDisplay(next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs, prefersReducedMotion, display]);

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

function FitnessAppV2() {
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

  const [activeTab, setActiveTab] = useState<'workout' | 'nutrition' | 'protein'>('workout');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
    if (saved === 'workout' || saved === 'nutrition' || saved === 'protein') {
      setActiveTab(saved);
    }
  }, []);

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
    <div className="min-h-screen bg-[#050a08] text-white selection:bg-emerald-500/30 font-sans">
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
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-900/20 blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2], 
            x: [0, -30, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-green-900/20 blur-[120px]" 
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
      <header className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-white/5 bg-[#050a08]/80 backdrop-blur-xl">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">FitSync</span>
          </div>
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setConfirmResetOpen(true)}
                className="p-2 rounded-full hover:bg-white/5 text-emerald-100/60 hover:text-white transition-colors"
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
            <span className="font-bold text-xl tracking-tight text-white">FitSync</span>
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                    isActive 
                      ? 'bg-emerald-500/10 text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.1)] border border-emerald-500/20' 
                      : 'text-emerald-100/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : ''}`} />
                  <span>{tab.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />}
                </button>
              );
            })}
          </div>

          <div className="pt-6 mt-auto border-t border-white/5 space-y-3">
             <button 
                onClick={() => setConfirmResetOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-emerald-100/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
                <h2 className="text-xl font-bold text-white">Today&apos;s Plan</h2>
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
                      className={`group relative overflow-hidden rounded-2xl border p-4 transition-all active:scale-[0.98] h-full backdrop-blur-md
                        ${done 
                          ? 'bg-emerald-950/40 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                          : 'bg-[#0a120f]/60 border-white/5 hover:border-white/10 hover:bg-[#0a120f]/80'
                        }`}
                    >
                      <div className="flex items-center gap-4 h-full">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shrink-0
                          ${done 
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                            : 'border-white/10 bg-white/5 text-emerald-100/40'
                          }`}>
                          {done ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">{i + 1}</span>}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold text-base truncate transition-colors ${done ? 'text-emerald-400' : 'text-white'}`}>
                            {ex}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-1.5 flex-1 bg-neutral-800 rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
                                initial={{ width: 0 }}
                                animate={{ width: `${(item.count / item.target) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-emerald-100/40 whitespace-nowrap">{item.count}/{item.target}</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); incrementExercise(ex); }}
                          className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors border border-white/5 shrink-0"
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
                <h2 className="text-xl font-bold text-white">Quick Add</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {proteinItems.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => addProtein({ label: item.label, grams: item.grams, category: item.category, calories: item.calories })}
                      className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-[#0a120f]/60 hover:bg-[#0a120f]/80 transition-all group h-full backdrop-blur-md hover:border-emerald-500/20"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-emerald-950/30 flex items-center justify-center text-emerald-100/60 group-hover:text-emerald-400 group-hover:scale-110 transition-all shadow-inner shadow-black/20 border border-white/5 group-hover:border-emerald-500/20 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <item.icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-white">{item.label}</div>
                        <div className="text-xs text-emerald-100/40">{item.desc}</div>
                      </div>
                      <div className="text-emerald-400 font-bold text-lg drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">+{item.grams}g</div>
                    </button>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/10">
                   <h3 className="text-sm font-bold text-emerald-100/40 mb-3">Recent Log</h3>
                   <div className="space-y-2">
                      {proteinEvents.slice(0, 5).map(ev => (
                         <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-[#0a120f]/40 border border-white/5 hover:border-emerald-500/20 transition-colors">
                            <span className="text-sm text-emerald-100/80">{ev.label}</span>
                            <span className="text-sm font-bold text-emerald-400">+{ev.grams}g</span>
                         </div>
                      ))}
                      {proteinEvents.length === 0 && <div className="text-sm text-emerald-100/40 text-center py-4">No entries yet</div>}
                   </div>
                </div>
             </motion.div>
          )}
        </AnimatePresence>

        </main>

        {/* Right Column (Status Card) */}
        <aside className="md:col-span-4 lg:col-span-3 space-y-6 order-1 md:order-2">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-4xl bg-[#0a120f]/80 border border-white/5 p-6 shadow-2xl sticky top-8 backdrop-blur-md"
          >
            <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 to-transparent" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">Daily Goal</div>
              <div className="relative w-40 h-40 mb-4 flex items-center justify-center">
                 {/* Progress Ring */}
                 <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-emerald-950" />
                    <motion.circle 
                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" 
                      className="text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: progress / 100 }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black tracking-tighter text-white drop-shadow-lg">{Math.round(proteinAnimated)}</span>
                    <span className="text-xs font-medium text-emerald-100/40">/ 180g Protein</span>
                 </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 w-full border-t border-white/5 pt-4">
                 <div>
                    <div className="text-[10px] text-emerald-100/40 uppercase tracking-wider">Kcal</div>
                    <div className="text-lg font-bold text-white">{Math.round(kcalAnimated)}</div>
                 </div>
                 <div>
                    <div className="text-[10px] text-emerald-100/40 uppercase tracking-wider">Carbs</div>
                    <div className="text-lg font-bold text-white">{Math.round(cAnimated)}</div>
                 </div>
                 <div>
                    <div className="text-[10px] text-emerald-100/40 uppercase tracking-wider">Fat</div>
                    <div className="text-lg font-bold text-white">{Math.round(fAnimated)}</div>
                 </div>
              </div>
            </div>
          </motion.div>
        </aside>

      </div>

      {/* Floating Bottom Navigation (Mobile Only) */}
      <div className="md:hidden fixed bottom-6 inset-x-0 z-40 flex justify-center">
        <div className="flex items-center gap-1 p-1.5 rounded-full bg-[#0a120f]/90 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/50">
          {[
            { id: 'workout', icon: Dumbbell, label: 'Workout' },
            { id: 'nutrition', icon: Utensils, label: 'Food' },
            { id: 'protein', icon: Zap, label: 'Quick' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'workout' | 'nutrition' | 'protein')}
                className={`relative px-6 py-3 rounded-full flex items-center gap-2 transition-all duration-300 ${
                  isActive ? 'text-white' : 'text-emerald-100/40 hover:text-white'
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
              className="w-full max-w-md bg-[#0a120f] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
               <div className="p-4 border-b border-white/10 flex justify-between items-center bg-emerald-950/30">
                  <div className="flex items-center gap-2">
                     <Sparkles className="w-5 h-5 text-emerald-400" />
                     <span className="font-bold text-white">AI Nutrition</span>
                  </div>
                  <button onClick={() => setAiOpen(false)} className="p-1 rounded-full hover:bg-white/10">
                     <div className="w-6 h-1 bg-emerald-100/20 rounded-full" />
                  </button>
               </div>
               
               <div className="p-6 space-y-4">
                  <textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="Describe your meal..."
                    className="w-full h-32 bg-emerald-950/30 border border-white/10 rounded-xl p-4 text-white placeholder:text-emerald-100/20 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
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
                     <div className="space-y-3 mt-4">
                        {aiResponse.results.map((r, i) => (
                           <div key={i} className="bg-emerald-900/20 rounded-xl p-4 border border-white/5">
                              <div className="flex justify-between items-start mb-2">
                                 <span className="font-bold text-white">{r.itemName}</span>
                                 <span className="text-emerald-400 font-bold">{r.caloriesKcal} kcal</span>
                              </div>
                              <div className="flex gap-4 text-xs text-emerald-100/40">
                                 <span>P: {r.proteinG}g</span>
                                 <span>C: {r.carbsG}g</span>
                                 <span>F: {r.fatG}g</span>
                              </div>
                           </div>
                        ))}
                        <button 
                           onClick={saveAiAsMeal}
                           className="w-full bg-[#E5E4E2] text-[#2D3B2E] font-bold py-3 rounded-xl hover:bg-white transition-colors"
                        >
                           Save to Log
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
              className="w-full max-w-md bg-[#323232] border border-[#97A397]/20 rounded-3xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="p-5 border-b border-[#97A397]/20 flex justify-between items-start bg-[#2D3B2E]/50">
                <div>
                  <h3 className="text-xl font-bold text-[#E5E4E2]">{selectedExerciseDetail?.thaiName ?? selectedExerciseLabel}</h3>
                  <p className="text-sm text-[#97A397]">{selectedExerciseDetail?.primary?.join(', ') ?? 'Exercise Details'}</p>
                </div>
                <button onClick={() => setSelectedExerciseLabel(null)} className="p-2 rounded-full hover:bg-white/10 text-[#97A397] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-5 overflow-y-auto space-y-6">
                 {/* Focus */}
                 <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#937A52]">Focus</h4>
                    <div className="flex flex-wrap gap-2">
                       {(selectedExerciseDetail?.focus ?? []).map((f, i) => (
                          <span key={i} className="px-3 py-1 rounded-full bg-[#937A52]/10 text-[#937A52] text-xs font-bold border border-[#937A52]/20">
                             {f}
                          </span>
                       ))}
                    </div>
                 </div>

                 {/* Steps */}
                 <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#97A397]">How to</h4>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-[#E5E4E2]">
                       {(selectedExerciseDetail?.steps ?? []).map((s, i) => (
                          <li key={i} className="leading-relaxed">{s}</li>
                       ))}
                    </ol>
                 </div>

                 {/* Controls */}
                 <div className="pt-4 border-t border-[#97A397]/20 flex gap-3">
                    <button
                       onClick={() => {
                          if (selectedExerciseLabel) incrementExercise(selectedExerciseLabel);
                       }}
                       className="flex-1 bg-[#937A52] hover:bg-[#937A52]/80 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(147,122,82,0.4)]"
                    >
                       <Plus className="w-4 h-4" /> Add Set
                    </button>
                    <button
                       onClick={() => {
                          if (selectedExerciseLabel) resetExercise(selectedExerciseLabel);
                       }}
                       className="px-4 bg-[#2D3B2E] hover:bg-[#2D3B2E]/80 text-white font-bold py-3 rounded-xl transition-colors border border-[#97A397]/20"
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

    </div>
  );
}

export default dynamic(() => Promise.resolve(FitnessAppV2), { ssr: false });
