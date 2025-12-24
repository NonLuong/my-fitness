'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, ChevronLeft, Utensils } from 'lucide-react';

import { fadeUp, springy, staggerContainer } from '../utils/motion';

import type { MealEntry } from '../types/nutrition';

export function NutritionSection(props: {
  mobileVisible: boolean;
  prefersReducedMotion: boolean;
  meals: MealEntry[];
  kcalAnimated: number;
  pAnimated: number;
  cAnimated: number;
  fAnimated: number;
  onOpenAi: () => void;
  onRequestDeleteMeal: (id: string) => void;
}) {
  const {
    mobileVisible,
    prefersReducedMotion,
    meals,
    kcalAnimated,
    pAnimated,
    cAnimated,
    fAnimated,
    onOpenAi,
    onRequestDeleteMeal,
  } = props;

  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      <motion.section
        variants={staggerContainer}
        initial={prefersReducedMotion ? false : 'hidden'}
        animate={prefersReducedMotion ? false : 'show'}
        className={`relative space-y-4 ${mobileVisible ? '' : 'hidden md:block'}`}
      >
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-neutral-400">Nutrition</div>
            <div className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">Today&apos;s meals</div>
          </div>
          <button
            onClick={onOpenAi}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-colors"
          >
            Add meal
          </button>
        </div>

        {/* Summary Card - Now Full Width / Centered style */}
        <motion.div
          variants={fadeUp}
          transition={springy(prefersReducedMotion)}
          className="rounded-3xl border border-black/5 bg-white/70 p-6 shadow-sm backdrop-blur-md transition will-change-transform hover:shadow-md dark:border-white/10 dark:bg-neutral-900/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">Today&apos;s Nutrition</div>
              <div className="text-xs text-gray-500 dark:text-neutral-400">From saved meals (AI)</div>
            </div>
            <div className="inline-flex items-center rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
              {meals.length} meals
            </div>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-4 text-center">
            <div className="rounded-2xl bg-emerald-50/50 px-2 py-3 dark:bg-emerald-900/10">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/70 dark:text-emerald-400/70">kcal</div>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">{Math.round(kcalAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-black/5 px-2 py-3 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Protein</div>
              <div className="text-xl font-black text-gray-900 dark:text-white">{Math.round(pAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-black/5 px-2 py-3 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Carbs</div>
              <div className="text-xl font-black text-gray-900 dark:text-white">{Math.round(cAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-black/5 px-2 py-3 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400">Fat</div>
              <div className="text-xl font-black text-gray-900 dark:text-white">{Math.round(fAnimated)}</div>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-neutral-400">
            Tip: Save meals from AI Nutrition (bottom-right) to build accurate day totals.
          </div>
        </motion.div>
      </motion.section>

      {/* Floating Trigger Button (Right Edge) */}
      <button
        onClick={() => setHistoryOpen(true)}
        className={`fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-2xl border-y border-l border-black/5 bg-white/80 py-3 pl-2 pr-1 shadow-lg backdrop-blur-xl transition-transform hover:bg-white hover:pr-2 active:scale-95 dark:border-white/10 dark:bg-neutral-900/80 dark:hover:bg-neutral-900 ${
          historyOpen ? 'translate-x-full' : 'translate-x-0'
        } ${mobileVisible ? '' : 'hidden md:flex'}`}
      >
        <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <span className="vertical-rl text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400" style={{ writingMode: 'vertical-rl' }}>
          History
        </span>
        <ChevronLeft className="h-3 w-3 text-neutral-400" />
      </button>

      {/* Slide-over Drawer */}
      <AnimatePresence>
        {historyOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] dark:bg-black/60"
            />
            
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/20 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-950/90"
            >
              <div className="flex h-full flex-col">
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-black/5 px-6 py-5 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <Utensils className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">Meal History</h2>
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Today&apos;s timeline</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setHistoryOpen(false)}
                    className="rounded-full p-2 text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-200"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Drawer Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6">
                  {meals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-4 rounded-full bg-neutral-100 p-4 dark:bg-neutral-900">
                        <Utensils className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                      </div>
                      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">No meals recorded today.</p>
                      <button onClick={() => { setHistoryOpen(false); onOpenAi(); }} className="mt-4 text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400">
                        Add your first meal
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {meals.map((m, i) => {
                        const kcal = m.items.reduce((s, it) => s + (it.caloriesKcal ?? 0), 0);
                        const p = m.items.reduce((s, it) => s + (it.proteinG ?? 0), 0);
                        
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            key={m.id}
                            className="group relative overflow-hidden rounded-3xl border border-black/5 bg-white/50 p-4 transition hover:bg-white hover:shadow-md dark:border-white/5 dark:bg-neutral-900/50 dark:hover:bg-neutral-900"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                    {m.mealType}
                                  </span>
                                  <span className="text-[11px] text-neutral-400">
                                    {new Date(m.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div className="mt-1.5 space-y-1">
                                  {m.items.map((it, idx) => (
                                    <div key={idx} className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                                      {it.itemName}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                                  {Math.round(kcal)} <span className="text-[10px] font-bold text-emerald-600/50 dark:text-emerald-400/50">kcal</span>
                                </div>
                                <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                                  {Math.round(p)}g Protein
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-end border-t border-black/5 pt-3 dark:border-white/5">
                              <button
                                onClick={() => onRequestDeleteMeal(m.id)}
                                className="text-[11px] font-bold text-rose-500 transition hover:text-rose-600 hover:underline dark:text-rose-400"
                              >
                                Delete entry
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {/* Drawer Footer */}
                <div className="border-t border-black/5 bg-neutral-50/50 px-6 py-4 dark:border-white/5 dark:bg-neutral-900/50">
                   <div className="flex justify-between text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      <span>Total Items</span>
                      <span>{meals.length}</span>
                   </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
