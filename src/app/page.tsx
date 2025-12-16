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
  Egg,
  Beef,
  Milk,
  Activity,
  TrendingUp,
  ChevronRight,
  RotateCw,
  ListPlus,
  Trash2,
  Sparkles,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';

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
    return window.matchMedia?.('(max-width: 767px)')?.matches ?? false;
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    window.addEventListener('orientationchange', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.removeEventListener('resize', onChange);
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
        workout: makeWorkoutState(todaySchedule.exercises)
      };
    }
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      const workoutFromStorage = parsed.workout as WorkoutState | undefined;
      const workout = workoutFromStorage && typeof workoutFromStorage === 'object'
        ? workoutFromStorage
        : makeWorkoutState(todaySchedule.exercises);
      return {
        protein: parsed.protein || 0,
        proteinEvents: (parsed.proteinEvents || []) as ProteinEvent[],
        workout
      };
    }
    return {
      protein: 0,
      proteinEvents: [] as ProteinEvent[],
      workout: makeWorkoutState(todaySchedule.exercises)
    };
  };

  // Lazy init
  const [protein, setProtein] = useState<number>(() => loadInitialData().protein);
  const [proteinEvents, setProteinEvents] = useState<ProteinEvent[]>(() => loadInitialData().proteinEvents);
  const [workoutState, setWorkoutState] = useState<WorkoutState>(() => loadInitialData().workout);

  const [tipOpen, setTipOpen] = useState<boolean>(false);
  const [showLog, setShowLog] = useState<boolean>(false);

  // Batch localStorage writes
  const pendingSaveRef = useRef<{ protein: number; proteinEvents: ProteinEvent[]; workout: WorkoutState } | null>(null);
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

  const scheduleSave = (nextProtein: number, nextEvents: ProteinEvent[], nextWorkout: WorkoutState) => {
    if (typeof window === 'undefined') return;
    pendingSaveRef.current = { protein: nextProtein, proteinEvents: nextEvents, workout: nextWorkout };
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
    scheduleSave(newProtein, newEvents, workoutState);
  };

  const progress = Math.min((protein / 180) * 100, 100);

  const bumpExercise = (exercise: string, delta: 1 | -1) => {
    setWorkoutState(prev => {
      const current = prev[exercise] ?? { target: parseWorkoutTarget(exercise), count: 0 };
      const nextCount = Math.max(0, Math.min(current.target, current.count + delta));
      const next = { ...prev, [exercise]: { ...current, count: nextCount } };
      scheduleSave(protein, proteinEvents, next);
      return next;
    });
  };

  const incrementExercise = (exercise: string) => bumpExercise(exercise, 1);

  const resetExercise = (exercise: string) => {
    setWorkoutState(prev => {
      const current = prev[exercise] ?? { target: parseWorkoutTarget(exercise), count: 0 };
      const next = { ...prev, [exercise]: { ...current, count: 0 } };
      scheduleSave(protein, proteinEvents, next);
      return next;
    });
  };

  const resetAllToday = () => {
    const nextWorkout = makeWorkoutState(todaySchedule.exercises);
    setProtein(0);
    setProteinEvents([]);
    setWorkoutState(nextWorkout);
    scheduleSave(0, [], nextWorkout);
  };

  const proteinItems = useMemo(() => ([
    { label: 'Whey Scoop', grams: 25, icon: Milk, desc: 'Supplement', category: 'supplement' as const },
    { label: 'Chicken Breast', grams: 23, icon: Beef, desc: 'Whole food', category: 'whole_food' as const },
    { label: 'Boiled Egg', grams: 7, icon: Egg, desc: 'Snack', category: 'snack' as const }
  ]), []);

  return (
    <div className="min-h-screen font-sans transition-colors duration-300 ease-in-out
      bg-gray-50 text-neutral-900 
      dark:bg-neutral-950 dark:text-neutral-100 
      selection:bg-emerald-500/30 selection:text-emerald-700 dark:selection:text-emerald-200 
      pb-20 relative overflow-x-hidden">

      {/* Background Ambience */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Light Mode Gradient */}
  <div className="absolute inset-0 bg-linear-to-b from-white to-gray-100 dark:hidden" />

        {/* Dark Mode Gradient */}
  <div className="hidden dark:block absolute inset-0 bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900" />

        {/* Orbs - Adjusted for both modes */}
        <div className="absolute -top-40 -left-32 h-130 w-130 rounded-full 
          bg-emerald-400/20 blur-[100px] 
          dark:bg-emerald-500/10 dark:blur-[110px]" />
        <div className="absolute -bottom-40 -right-32 h-130 w-130 rounded-full 
          bg-cyan-400/20 blur-[100px] 
          dark:bg-cyan-500/10 dark:blur-[110px]" />

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] 
          bg-[radial-gradient(#000_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] 
          bg-size-[18px_18px]" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 px-6 py-4 
        backdrop-blur-xl border-b transition-colors duration-300
        bg-white/70 border-gray-200 
        dark:bg-neutral-950/70 dark:border-white/5">
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
                    onClick={() => incrementExercise(ex)}
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
                          <div className={`rounded-xl border px-3 py-1 text-sm font-semibold transition-colors
                              ${done
                              ? 'bg-emerald-100 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/20'
                              : 'bg-gray-50 border-gray-200 dark:bg-neutral-950/40 dark:border-neutral-800'
                            }`}>
                            <span className={done ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-neutral-200'}>{item.count}</span>
                            <span className="text-gray-500 dark:text-neutral-600"> / {item.target}</span>
                            <span className="ml-2 text-xs text-gray-400 dark:text-neutral-500">(tap +1)</span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); resetExercise(ex); }}
                            className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-white transition-colors"
                          >
                            <RotateCw className="w-4 h-4" /> Reset
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