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
  TrendingUp,
  ChevronRight,
  RotateCw,
  ListPlus,
  Trash2,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Plus,
} from 'lucide-react';

import { resolveExerciseDetailFromLabel } from '@/lib/exercises';

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
};

type WorkoutItemState = {
  target: number;
  count: number;
};

type WorkoutState = Record<string, WorkoutItemState>;

type ScheduleType = {
  [key: number]: DailySchedule;
};

type ThemeMode = 'light' | 'dark' | 'system';

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

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type MealItem = {
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

// AI Nutrition panel was removed for now (to keep page.tsx stable).

type MealEntry = {
  id: string;
  ts: number;
  mealType: MealType;
  sourceText?: string;
  items: MealItem[];
};

type DailyLog = {
  protein: number;
  proteinEvents: ProteinEvent[];
  workout: WorkoutState;
  meals?: MealEntry[];
};

// --- 2. ข้อมูลตารางฝึก ---
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
  // --- Theme Logic ---
  const [theme, setTheme] = useState<ThemeMode>('system');

  // Effect to apply theme to HTML tag
  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (mode: ThemeMode) => {
      if (mode === 'dark' || (mode === 'system' && mediaQuery.matches)) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);

    const handleSystemChange = () => {
      if (theme === 'system') applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme]);

  // --- Logic ---
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todaySchedule = SCHEDULE[dayOfWeek];
  const storageKey = `log_${today.toISOString().split('T')[0]}`;

  const makeId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return String(new Date().getTime());
  };

  // Track mobile mode reactively (so it updates when rotating/resizing)
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

  // Lazy init
  const [protein, setProtein] = useState<number>(() => loadInitialData().protein);
  const [proteinEvents, setProteinEvents] = useState<ProteinEvent[]>(() => loadInitialData().proteinEvents);
  const [workoutState, setWorkoutState] = useState<WorkoutState>(() => loadInitialData().workout);
  const [meals, setMeals] = useState<MealEntry[]>(() => loadInitialData().meals);

  // Keep latest meals in a ref to avoid stale closures when scheduling saves.
  const mealsRef = useRef<MealEntry[]>(meals);
  useEffect(() => {
    mealsRef.current = meals;
  }, [meals]);

  const [tipOpen, setTipOpen] = useState<boolean>(false);
  const [showLog, setShowLog] = useState<boolean>(false);

  // Workout details modal
  const [selectedExerciseLabel, setSelectedExerciseLabel] = useState<string | null>(null);

  const selectedExerciseDetail = useMemo(() => {
    if (!selectedExerciseLabel) return null;
    return resolveExerciseDetailFromLabel(selectedExerciseLabel);
  }, [selectedExerciseLabel]);

  // --- AI Nutrition (Gemini) ---
  const [aiOpen, setAiOpen] = useState<boolean>(false);
  const [aiText, setAiText] = useState<string>('');
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AiNutritionResponse | null>(null);
  const [aiMealType, setAiMealType] = useState<MealType>('lunch');
  const lastAiMealProteinCreditRef = useRef<string | null>(null);

  // Batch localStorage writes
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
      category: 'whole_food'
    });
  };

  const saveAiAsMeal = () => {
    if (!aiResponse?.results || aiResponse.results.length === 0) return;

    // Credit total protein ONLY when saving the meal, not on analyze.
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
      { label: 'Whey Scoop', grams: 25, icon: Dumbbell, desc: 'Supplement', category: 'supplement' as const },
      { label: 'Chicken Breast', grams: 23, icon: Utensils, desc: 'Whole food', category: 'whole_food' as const },
      { label: 'Boiled Egg', grams: 7, icon: Flame, desc: 'Snack', category: 'snack' as const },
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

  return (
    <div>
      {/* AI Nutrition — compact card */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setAiOpen((v) => !v)}
          className="group flex items-center gap-2 rounded-2xl border border-white/10 bg-white/80 px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-xl transition hover:bg-white dark:bg-neutral-900/70 dark:hover:bg-neutral-900"
          aria-label="AI Nutrition"
        >
          <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          <span className="hidden sm:inline">AI Nutrition</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-40"
            onClick={() => setAiOpen(false)}
            aria-hidden
          >
            <div className="absolute inset-0 bg-black/10 dark:bg-black/40" />

            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed bottom-20 right-5 z-40 w-[min(92vw,420px)] overflow-hidden rounded-3xl border border-white/10 bg-white/85 shadow-2xl backdrop-blur-xl dark:bg-neutral-950/80"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="AI Nutrition"
            >
              <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-4 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                  <div>
                    <div className="text-sm font-bold">AI Nutrition</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">estimate • text + photo</div>
                  </div>
                </div>
                <button
                  onClick={() => setAiOpen(false)}
                  className="rounded-xl px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 p-5">
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300">What did you eat?</label>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="เช่น: ข้าวกะเพราไก่ไข่ดาว 1 จาน / เวย์ 1 สกู๊ป + กล้วย 1 ลูก"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    if (e.shiftKey) return;
                    e.preventDefault();
                    if (aiLoading) return;
                    if (!aiText.trim() && !aiImage) return;
                    void analyzeNutrition();
                  }}
                  className="h-24 w-full resize-none rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm outline-none ring-0 focus:border-emerald-400/60 dark:border-white/10 dark:bg-neutral-900/60"
                />

                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-black/10 bg-white/60 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-white dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-200">
                    <span>{aiImage ? aiImage.name : 'Add photo (optional)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setAiImage(e.target.files?.[0] ?? null)}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setAiText('');
                      setAiImage(null);
                      setAiError(null);
                      setAiResponse(null);
                      lastAiMealProteinCreditRef.current = null;
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/60 px-4 py-2 text-xs font-bold text-neutral-700 transition hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900"
                    disabled={aiLoading && !aiResponse}
                  >
                    Clear
                  </button>

                  <button
                    onClick={analyzeNutrition}
                    disabled={aiLoading || (!aiText.trim() && !aiImage)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow transition enabled:hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {aiLoading ? 'Analyzing…' : 'Analyze'}
                  </button>
                </div>

                {aiError && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-950/30 dark:text-rose-200">
                    {aiError}
                  </div>
                )}

                {aiResponse?.results && aiResponse.results.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-3xl border border-black/5 bg-white/60 p-3 dark:border-white/10 dark:bg-neutral-900/40">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-300">Save as:</span>
                        <select
                          value={aiMealType}
                          onChange={(e) => setAiMealType(e.target.value as MealType)}
                          className="rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold text-neutral-800 outline-none dark:border-white/10 dark:bg-neutral-950/50 dark:text-neutral-100"
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                        </select>
                      </div>
                      <button
                        onClick={saveAiAsMeal}
                        className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                      >
                        <Plus className="h-4 w-4" />
                        Save meal
                      </button>
                    </div>

                    <div className="rounded-3xl border border-black/5 bg-white/60 p-3 text-[11px] text-neutral-600 dark:border-white/10 dark:bg-neutral-900/40 dark:text-neutral-300">
                      Tip: Save meals from AI Nutrition to build accurate day totals.
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar */}
      <nav
        className={`sticky top-0 z-50 px-6 py-4 backdrop-blur-xl border-b transition-colors duration-300 bg-white/70 border-gray-200 dark:bg-neutral-950/70 dark:border-white/5`}
      >
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg shadow-lg shadow-emerald-500/20">
              <Dumbbell className="w-5 h-5 text-white dark:text-neutral-950" />
            </div>
            <span className="font-bold text-lg tracking-tight text-neutral-800 dark:text-white">
              FitTrack<span className="text-emerald-600 dark:text-emerald-500">.Pro</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-white/5 rounded-full p-1 border border-gray-200 dark:border-white/5">
              {[
                { mode: 'light', icon: Sun },
                { mode: 'system', icon: Monitor },
                { mode: 'dark', icon: Moon },
              ].map((item) => (
                <button
                  key={item.mode}
                  onClick={() => setTheme(item.mode as ThemeMode)}
                  className={`p-1.5 rounded-full transition-all duration-200 ${theme === item.mode
                      ? 'bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300'
                    }`}
                >
                  <item.icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div className="hidden md:block text-xs font-medium px-3 py-1 rounded-full border transition-colors
              bg-gray-100 text-gray-500 border-gray-200
              dark:bg-white/5 dark:text-neutral-500 dark:border-white/5">
              {today.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">

        {/* Meals & Nutrition (AI history) */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-neutral-400">Nutrition</div>
              <div className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">Today&apos;s meals</div>
            </div>
            <button
              onClick={() => setAiOpen(true)}
              className="rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
            >
              Add meal
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
            <div className="md:col-span-5 rounded-3xl border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">Today&apos;s Nutrition</div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">From saved meals (AI)</div>
                </div>
                <div className="inline-flex items-center rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
                  {meals.length} meals
                </div>
              </div>

            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                <div className="text-[10px] text-gray-500 dark:text-neutral-400">kcal</div>
                <div className="text-sm font-extrabold text-gray-900 dark:text-white">{mealTotals.caloriesKcal}</div>
              </div>
              <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                <div className="text-[10px] text-gray-500 dark:text-neutral-400">P</div>
                <div className="text-sm font-extrabold text-gray-900 dark:text-white">{mealTotals.proteinG}</div>
              </div>
              <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                <div className="text-[10px] text-gray-500 dark:text-neutral-400">C</div>
                <div className="text-sm font-extrabold text-gray-900 dark:text-white">{mealTotals.carbsG}</div>
              </div>
              <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                <div className="text-[10px] text-gray-500 dark:text-neutral-400">F</div>
                <div className="text-sm font-extrabold text-gray-900 dark:text-white">{mealTotals.fatG}</div>
              </div>
            </div>

              <div className="mt-4 text-xs text-gray-500 dark:text-neutral-400">
                Tip: Save meals from AI Nutrition (bottom-right) to build accurate day totals.
              </div>
            </div>

            <div className="md:col-span-7 rounded-3xl border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">Meal history</div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">Saved from AI Nutrition</div>
                </div>
                <div className="inline-flex items-center rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
                  Last {Math.min(meals.length, 8)} items
                </div>
              </div>

              {meals.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 text-xs text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
                  No meals saved yet.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {meals.slice(0, 8).map((m) => {
                    const kcal = m.items.reduce((s, it) => s + (it.caloriesKcal ?? 0), 0);
                    const p = m.items.reduce((s, it) => s + (it.proteinG ?? 0), 0);
                    const c = m.items.reduce((s, it) => s + (it.carbsG ?? 0), 0);
                    const f = m.items.reduce((s, it) => s + (it.fatG ?? 0), 0);

                    return (
                      <div key={m.id} className="group rounded-3xl border border-black/5 bg-white/65 p-4 shadow-sm transition hover:bg-white/80 dark:border-white/10 dark:bg-neutral-950/25 dark:hover:bg-neutral-950/35">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-extrabold tracking-tight text-gray-900 dark:text-white">
                              {m.mealType.toUpperCase()} • {new Date(m.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="mt-1 text-[11px] text-gray-500 dark:text-neutral-400 line-clamp-2">
                              {m.items.map(it => it.itemName).join(' + ')}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteMeal(m.id)}
                            className="rounded-2xl px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                          <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                            <div className="text-[10px] text-gray-500 dark:text-neutral-400">kcal</div>
                            <div className="text-sm font-extrabold">{Math.round(kcal)}</div>
                          </div>
                          <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                            <div className="text-[10px] text-gray-500 dark:text-neutral-400">P</div>
                            <div className="text-sm font-extrabold">{Math.round(p)}</div>
                          </div>
                          <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                            <div className="text-[10px] text-gray-500 dark:text-neutral-400">C</div>
                            <div className="text-sm font-extrabold">{Math.round(c)}</div>
                          </div>
                          <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
                            <div className="text-[10px] text-gray-500 dark:text-neutral-400">F</div>
                            <div className="text-sm font-extrabold">{Math.round(f)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Hero Section */}
        <header className="py-6 md:py-10">
          <motion.div
            initial={{ opacity: 0, y: isMobile ? 8 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4"
          >
            <div>
              <h2 className="font-medium mb-1 flex items-center gap-2
                text-gray-500 dark:text-neutral-400">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                Today&apos;s Focus
              </h2>
              <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight
                text-gray-900 dark:text-white">
                {todaySchedule.title}
              </h1>
              <p className="mt-2 font-medium flex items-center gap-2
                text-emerald-600 dark:text-emerald-400">
                <Zap className="w-4 h-4" /> {todaySchedule.focus}
              </p>
            </div>

            {/* Progress Circle (Desktop) */}
            <div className="hidden md:flex items-center gap-4 p-4 rounded-2xl border backdrop-blur-md transition-all
              bg-white/50 border-gray-200 shadow-sm
              dark:bg-white/5 dark:border-white/5 dark:shadow-none">
              <div className="relative w-16 h-16">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none"
                    className="stroke-gray-200 dark:stroke-neutral-800" strokeWidth="8" />
                  <motion.circle
                    cx="50" cy="50" r="45" fill="none"
                    className="stroke-emerald-500 dark:stroke-emerald-500"
                    strokeWidth="8" strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: progress / 100 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold
                  text-gray-900 dark:text-white">
                  {Math.round(progress)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 dark:text-neutral-400">Daily Protein</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {protein} <span className="text-gray-400 dark:text-neutral-500 text-sm">/ 180g</span>
                </div>
              </div>
            </div>
          </motion.div>
        </header>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">

          {/* Left Column: Workout List (Span 8) */}
          <div className="md:col-span-8 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-500" /> Workout Plan
              </h3>
              <span className="text-xs text-gray-500 dark:text-neutral-500">{todaySchedule.exercises.length} Exercises</span>
            </div>

            <div className="grid gap-3">
              {todaySchedule.exercises.map((ex, index) => {
                const item = workoutState[ex] ?? { target: parseWorkoutTarget(ex), count: 0 };
                const done = item.count >= item.target;
                return (
                  <motion.div
                    key={index}
                    initial={false}
                    animate={false}
                    transition={undefined}
                    onClick={() => setSelectedExerciseLabel(ex)}
                    className={`
                        group relative p-5 rounded-2xl cursor-pointer border transition-all duration-200 shadow-sm
                        ${done
                        ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-500/20'
                        : 'bg-white border-gray-100 hover:border-emerald-200 hover:shadow-md dark:bg-neutral-900 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/50'
                      }
                      `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`
                          w-6 h-6 rounded-full flex items-center justify-center border transition-colors duration-200
                          ${done
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-gray-300 dark:border-neutral-600 group-hover:border-emerald-400'
                        }
                        `}>
                        {done && <CheckCircle2 className="w-4 h-4 text-white dark:text-neutral-950" />}
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-medium text-lg transition-colors ${done ?
                          'text-emerald-600/60 line-through decoration-emerald-500/40 dark:text-emerald-500/60'
                          : 'text-gray-800 dark:text-neutral-200'}`}>
                          {ex}
                        </h4>
                        <div className="mt-2 flex items-center gap-3">
                          <div
                            className={`relative overflow-hidden rounded-2xl border px-3 py-2 text-sm font-semibold tabular-nums transition-colors
                              ${done
                                ? 'bg-emerald-100 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/20'
                                : 'bg-gray-50 border-gray-200 dark:bg-neutral-950/40 dark:border-neutral-800'
                              }`}
                            aria-label={`sets ${item.count} of ${item.target}`}
                          >
                            <div
                              className={`absolute inset-0 opacity-70 ${done ? 'bg-emerald-500/10' : 'bg-emerald-500/8'}`}
                              style={{
                                clipPath: `inset(0 ${Math.max(0, 100 - (item.target ? (item.count / item.target) * 100 : 0))}% 0 0 round 16px)`,
                              }}
                            />
                            <div className="relative flex items-baseline gap-1">
                              <span className={done ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-900 dark:text-neutral-200'}>{item.count}</span>
                              <span className="text-gray-500 dark:text-neutral-500">/</span>
                              <span className="text-gray-500 dark:text-neutral-400">{item.target}</span>
                              <span className="ml-1 text-[11px] font-semibold text-gray-400 dark:text-neutral-500">sets</span>
                            </div>
                          </div>

                          <div className="flex-1" />

                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); incrementExercise(ex); }}
                            className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/45"
                            aria-label="เพิ่มจำนวนเซ็ต"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Add</span>
                          </button>
                        </div>
                      </div>

                      <ChevronRight className={`w-5 h-5 text-gray-300 dark:text-neutral-700 transition-transform ${done ? 'opacity-0' : 'group-hover:translate-x-1'}`} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Exercise details modal */}
          <AnimatePresence initial={false}>
            {selectedExerciseLabel && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="fixed inset-0 z-50"
                onClick={() => setSelectedExerciseLabel(null)}
                aria-hidden
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
                />

                <motion.div
                  initial={{ opacity: 0, y: 36, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 36, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.9 }}
                  className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] w-full overflow-hidden rounded-t-4xl border border-white/10 bg-white/92 shadow-2xl backdrop-blur-xl dark:bg-neutral-950/88 md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[84vh] md:w-[min(92vw,820px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-4xl"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-label="Exercise details"
                >
                  {/* Header (sticky) */}
                  <div className="sticky top-0 z-10 border-b border-black/5 bg-white/55 px-5 pb-4 pt-3 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-950/45">
                    {/* drag handle (mobile) */}
                    <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/10 md:hidden" />

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/35 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-neutral-900 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-white">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-sm dark:bg-emerald-400/90">
                              <Dumbbell className="h-3.5 w-3.5" />
                            </span>
                            <span className="uppercase">{selectedExerciseDetail?.category ?? 'workout'}</span>
                          </span>
                          <span className="hidden text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 sm:inline">
                            tap outside to close
                          </span>
                        </div>

                        <div className="mt-2 truncate text-lg font-black tracking-tight text-neutral-950 dark:text-white">
                          {selectedExerciseDetail?.thaiName ?? selectedExerciseLabel}
                        </div>

                        <div className="mt-1 text-xs font-semibold text-neutral-700/90 dark:text-neutral-200/85">
                          {selectedExerciseDetail?.primary?.length
                            ? `กล้ามเนื้อหลัก: ${selectedExerciseDetail.primary.join(' • ')}`
                            : 'รายละเอียดท่าออกกำลังกาย'}
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedExerciseLabel(null)}
                        className="rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-bold text-neutral-700 shadow-sm transition hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900"
                      >
                        ปิด
                      </button>
                    </div>

                    {/* premium glass wash */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-36 bg-linear-to-b from-emerald-500/16 via-cyan-500/8 to-transparent dark:from-emerald-400/14 dark:via-cyan-400/6" />
                    <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-48 w-48 rounded-full bg-emerald-500/12 blur-3xl dark:bg-emerald-400/10" />
                    <div className="pointer-events-none absolute -left-20 -top-24 -z-10 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-400/8" />
                  </div>

                  <div className="max-h-[calc(88vh-84px)] overflow-y-auto overscroll-contain px-5 pb-6 pt-4 md:max-h-[calc(84vh-96px)] md:px-6">
                    {/* Details */}
                    <div className="space-y-4 md:col-span-2">
                      {/* Key cues (poster chips) */}
                      <div className="rounded-3xl border border-black/5 bg-white/60 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/35">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-black tracking-wide text-neutral-700 dark:text-neutral-200">KEY CUES</div>
                          <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">เลื่อนซ้าย/ขวา</div>
                        </div>

                        {(() => {
                          const chips = (selectedExerciseDetail?.cues?.length
                            ? selectedExerciseDetail.cues
                            : selectedExerciseDetail?.focus ?? [])
                            .slice(0, 8);

                          return (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {chips.length ? (
                                chips.map((c, i) => (
                                  <span
                                    key={`${c}-${i}`}
                                    className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-white/35 bg-white/55 px-3.5 py-2 text-xs font-extrabold text-neutral-900 shadow-sm backdrop-blur-xl transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/8"
                                  >
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-sm transition group-hover:scale-[1.03] dark:bg-emerald-400/90">
                                      <Zap className="h-3.5 w-3.5" />
                                    </span>
                                    {c}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-neutral-600 dark:text-neutral-300">กำลังเตรียมคิวสำคัญ…</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Quick summary */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="relative overflow-hidden rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                          <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
                          <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">โฟกัสตอนเล่น</div>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                            {(selectedExerciseDetail?.focus ?? []).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                            {!selectedExerciseDetail?.focus?.length && <li>คุมฟอร์มให้มั่นคง และหายใจสม่ำเสมอ</li>}
                          </ul>
                        </div>

                        <div className="relative overflow-hidden rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                          <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />
                          <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">ได้ส่วนไหน / ได้อะไร</div>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                            {(selectedExerciseDetail?.youGet ?? []).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                            {!selectedExerciseDetail?.youGet?.length && <li>เพิ่มความแข็งแรงและความฟิตโดยรวม</li>}
                          </ul>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                        <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">วิธีทำ (สรุป)</div>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                          {(selectedExerciseDetail?.steps ?? ['กำลังเตรียมรายละเอียดท่านี้…']).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>

                      <div className="rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                        <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">คิวสำคัญ</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                          {(selectedExerciseDetail?.cues ?? []).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                          {!selectedExerciseDetail?.cues?.length && <li>คุมท่าให้มั่นคง และหายใจสม่ำเสมอ</li>}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                        <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">ข้อผิดพลาดที่พบบ่อย</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                          {(selectedExerciseDetail?.mistakes ?? []).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                          {!selectedExerciseDetail?.mistakes?.length && <li>อย่าเร่งจังหวะจนเสียฟอร์ม</li>}
                        </ul>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                          <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">ความปลอดภัย / ข้อควรระวัง</div>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                            {(selectedExerciseDetail?.safety ?? []).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                            {!selectedExerciseDetail?.safety?.length && <li>ลดน้ำหนักทันทีถ้าฟอร์มเริ่มเสีย</li>}
                          </ul>
                        </div>

                        <div className="rounded-3xl border border-white/35 bg-white/55 p-4 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                          <div className="text-xs font-black tracking-wide text-neutral-800 dark:text-neutral-100">จังหวะ / การหายใจ</div>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800 dark:text-neutral-200">
                            {(selectedExerciseDetail?.tempoBreathing ?? []).map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                            {!selectedExerciseDetail?.tempoBreathing?.length && <li>คุมลงช้า ออกแรงตอนดัน/ดึง</li>}
                          </ul>
                        </div>
                      </div>

                      {/* Set controls */}
                      {selectedExerciseLabel && (
                        <div className="flex flex-col gap-3 rounded-3xl border border-black/5 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900/45 md:flex-row md:items-center md:justify-between">
                          {(() => {
                            const item = workoutState[selectedExerciseLabel] ?? { target: parseWorkoutTarget(selectedExerciseLabel), count: 0 };
                            return (
                              <>
                                <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                                  เซ็ตวันนี้: <span className="font-extrabold">{item.count}</span>
                                  <span className="text-neutral-500 dark:text-neutral-400"> / {item.target}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => incrementExercise(selectedExerciseLabel)}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]"
                                  >
                                    <Plus className="h-4 w-4" /> เพิ่มเซ็ต
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => resetExercise(selectedExerciseLabel)}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-2.5 text-xs font-extrabold text-neutral-800 shadow-sm transition hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900"
                                  >
                                    <RotateCw className="h-4 w-4" /> รีเซ็ต
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Column: Nutrition & Extras (Span 4) */}
          <div className="md:col-span-4 space-y-6">

            {/* Mobile Progress Card */}
            <div className="md:hidden p-6 rounded-3xl border shadow-sm
              bg-white border-gray-100
              dark:bg-neutral-900 dark:border-neutral-800 dark:shadow-none">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-neutral-200">Daily Protein</h3>
                <span className="text-emerald-600 dark:text-emerald-500 font-bold">{Math.round(progress)}%</span>
              </div>
              <div className="h-3 w-full bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 text-right text-sm text-gray-500 dark:text-neutral-400">
                {protein} / 180g
              </div>
            </div>

            {/* Quick Add Protein */}
            <div className="p-6 rounded-3xl border shadow-sm space-y-6
              bg-white border-gray-100
              dark:bg-neutral-900 dark:border-neutral-800 dark:shadow-none">

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-gray-500 dark:text-neutral-300">
                  <Utensils className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Protein (Tap to add)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLog(v => !v)}
                  className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  <ListPlus className="w-4 h-4" /> Log
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {proteinItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => addProtein({ label: item.label, grams: item.grams, category: item.category })}
                    className="flex items-center gap-4 p-3 rounded-xl border border-transparent transition-all group
                      bg-gray-50 hover:bg-gray-100 hover:border-emerald-200 hover:shadow-sm
                      dark:bg-neutral-800/50 dark:hover:bg-neutral-800 dark:hover:border-neutral-700"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                      bg-white text-gray-400 group-hover:text-emerald-500 shadow-sm
                      dark:bg-neutral-950 dark:text-neutral-400 dark:group-hover:text-emerald-400 dark:shadow-none">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="font-medium text-gray-800 dark:text-neutral-200">{item.label}</div>
                      <div className="text-xs text-gray-500 dark:text-neutral-500">{item.desc}</div>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-500 font-bold text-sm">+{item.grams}g</div>
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {showLog && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-2xl border p-4
                      bg-gray-50 border-gray-200
                      dark:bg-neutral-950/30 dark:border-neutral-800">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold flex items-center gap-2
                          text-gray-700 dark:text-neutral-200">
                          <Sparkles className="w-4 h-4 text-emerald-500" /> Today&apos;s additions
                        </div>
                      </div>

                      {proteinEvents.length === 0 ? (
                        <div className="text-sm text-gray-400 dark:text-neutral-500">No additions yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {proteinEvents.slice(0, 5).map(ev => (
                            <div key={ev.id} className="flex items-center justify-between text-sm">
                              <div className="min-w-0">
                                <div className="truncate text-gray-800 dark:text-neutral-200">{ev.label}</div>
                                <div className="text-xs text-gray-500 dark:text-neutral-600">
                                  {new Date(ev.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                  <span className="mx-2">•</span>
                                  {ev.category.replace('_', ' ')}
                                </div>
                              </div>
                              <div className="font-bold text-emerald-600 dark:text-emerald-500">+{ev.grams}g</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowLog(v => !v)}
                  className="w-full py-3 rounded-xl border text-xs transition-all
                    border-gray-200 text-gray-600 hover:bg-gray-50
                    dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/5"
                >
                  {showLog ? 'Hide log' : 'Show log'}
                </button>
                <button
                  type="button"
                  onClick={resetAllToday}
                  className="w-full py-3 rounded-xl border text-xs transition-all inline-flex items-center justify-center gap-2
                    border-red-200 bg-red-50 text-red-600 hover:bg-red-100
                    dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200 dark:hover:bg-red-950/35"
                >
                  <Trash2 className="w-4 h-4" /> Reset day
                </button>
              </div>
            </div>

            {/* Tips Card */}
            {dayOfWeek >= 1 && dayOfWeek <= 5 && dayOfWeek !== 3 && (
              <div className="flex items-start gap-3">
                {/* Icon trigger */}
                <button
                  type="button"
                  onClick={() => setTipOpen((v: boolean) => !v)}
                  className="shrink-0 h-12 w-12 grid place-items-center rounded-2xl border transition-colors
                    bg-white border-gray-200 hover:bg-gray-50
                    dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:bg-neutral-900"
                  aria-label="Toggle tip"
                >
                  <motion.div
                    animate={{ rotate: tipOpen ? 360 : 0 }}
                    transition={{ duration: 0.75, ease: 'easeInOut' }}
                  >
                    <Flame className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                  </motion.div>
                </button>

                {/* Slide-out tip panel */}
                <div className="flex-1">
                  <AnimatePresence initial={false}>
                    {tipOpen && (
                      <motion.div
                        initial={{ opacity: 0, x: -10, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: 'auto' }}
                        exit={{ opacity: 0, x: -10, height: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className="overflow-hidden rounded-3xl border p-5
                          bg-linear-to-br from-amber-50 to-orange-50 border-amber-200
                          dark:from-amber-900/10 dark:to-orange-900/10 dark:border-amber-500/15"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-amber-700 dark:text-amber-200 text-sm">Pre-workout Tip</h4>
                          <span className="text-[11px] text-amber-400 dark:text-amber-200/40">tap icon to close</span>
                        </div>
                        <p className="text-xs text-amber-800/80 dark:text-amber-200/60 mt-2 leading-relaxed">
                          Consume complex carbs (Banana/Oats) 45–60 mins before training for sustained energy.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!tipOpen && (
                    <div className="text-xs text-gray-400 dark:text-neutral-500 mt-1">Tap the icon for a quick tip</div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(FitnessApp), { ssr: false });