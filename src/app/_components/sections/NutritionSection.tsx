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
            <div className="text-[11px] font-semibold tracking-wide text-emerald-900/40 dark:text-emerald-100/40 transition-colors duration-500 ease-in-out">Nutrition</div>
            <div className="text-lg font-extrabold tracking-tight text-neutral-900 dark:text-white transition-colors duration-500 ease-in-out">Today&apos;s meals</div>
          </div>
          <button
            onClick={onOpenAi}
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-[0_0_10px_rgba(16,185,129,0.4)] hover:bg-emerald-600 transition-colors duration-500 ease-in-out"
          >
            Add meal
          </button>
        </div>

        {/* Summary Card - Now Full Width / Centered style */}
        <motion.div
          variants={fadeUp}
          transition={springy(prefersReducedMotion)}
          className="rounded-3xl border border-emerald-900/5 dark:border-white/5 bg-white/60 dark:bg-[#0a120f]/60 p-6 shadow-sm backdrop-blur-md transition-all duration-500 ease-in-out will-change-transform hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold tracking-tight text-neutral-900 dark:text-white">Today&apos;s Nutrition</div>
              <div className="text-xs text-emerald-900/40 dark:text-emerald-100/40">From saved meals (AI)</div>
            </div>
            <div className="inline-flex items-center rounded-full border border-emerald-900/5 dark:border-white/5 bg-emerald-100/50 dark:bg-emerald-900/20 px-2.5 py-1 text-[11px] font-semibold text-neutral-900 dark:text-white">
              {meals.length} meals
            </div>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-4 text-center">
            <div className="rounded-2xl bg-emerald-500/10 px-2 py-3 border border-emerald-500/20 transition-colors duration-500 ease-in-out">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 transition-colors duration-500 ease-in-out">kcal</div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)] transition-colors duration-500 ease-in-out">{Math.round(kcalAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-emerald-100/50 dark:bg-emerald-900/20 px-2 py-3 border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40 transition-colors duration-500 ease-in-out">Protein</div>
              <div className="text-xl font-black text-neutral-900 dark:text-white transition-colors duration-500 ease-in-out">{Math.round(pAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-emerald-100/50 dark:bg-emerald-900/20 px-2 py-3 border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40 transition-colors duration-500 ease-in-out">Carbs</div>
              <div className="text-xl font-black text-neutral-900 dark:text-white transition-colors duration-500 ease-in-out">{Math.round(cAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-emerald-100/50 dark:bg-emerald-900/20 px-2 py-3 border border-emerald-900/5 dark:border-white/5 transition-colors duration-500 ease-in-out">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/40 dark:text-emerald-100/40 transition-colors duration-500 ease-in-out">Fat</div>
              <div className="text-xl font-black text-neutral-900 dark:text-white transition-colors duration-500 ease-in-out">{Math.round(fAnimated)}</div>
            </div>
          </div>

          <div className="mt-4 text-xs text-emerald-900/40 dark:text-emerald-100/40 transition-colors duration-500 ease-in-out">
            Tip: Save meals from AI Nutrition (bottom-right) to build accurate day totals.
          </div>
        </motion.div>
      </motion.section>

      {/* Floating Trigger Button (Right Edge) */}
      <button
        onClick={() => setHistoryOpen(true)}
        className={`fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-2xl border-y border-l border-white/5 bg-[#0a120f]/80 py-3 pl-2 pr-1 shadow-lg backdrop-blur-xl transition-transform hover:bg-[#0a120f] hover:pr-2 active:scale-95 ${
          historyOpen ? 'translate-x-full' : 'translate-x-0'
        } ${mobileVisible ? '' : 'hidden md:flex'}`}
      >
        <History className="h-5 w-5 text-emerald-400" />
        <span className="vertical-rl text-[10px] font-bold uppercase tracking-widest text-emerald-100/40" style={{ writingMode: 'vertical-rl' }}>
          History
        </span>
        <ChevronLeft className="h-3 w-3 text-emerald-100/40" />
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
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            />
            
            {/* Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/5 bg-[#0a120f]/95 shadow-2xl backdrop-blur-2xl"
            >
              <div className="flex h-full flex-col">
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      <Utensils className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold text-white">Meal History</h2>
                      <p className="text-xs font-medium text-emerald-100/40">Today&apos;s timeline</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setHistoryOpen(false)}
                    className="rounded-full p-2 text-emerald-100/40 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Drawer Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6">
                  {meals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-4 rounded-full bg-[#0a120f] p-4 border border-white/5">
                        <Utensils className="h-8 w-8 text-emerald-100/40" />
                      </div>
                      <p className="text-sm font-medium text-emerald-100/40">No meals recorded today.</p>
                      <button onClick={() => { setHistoryOpen(false); onOpenAi(); }} className="mt-4 text-xs font-bold text-emerald-400 hover:underline">
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
                            className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a120f]/40 p-4 transition hover:bg-[#0a120f]/60 hover:shadow-md hover:border-emerald-500/20"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100/60 border border-white/5">
                                    {m.mealType}
                                  </span>
                                  <span className="text-[11px] text-emerald-100/40">
                                    {new Date(m.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div className="mt-1.5 space-y-1">
                                  {m.items.map((it, idx) => (
                                    <div key={idx} className="text-sm font-bold text-white">
                                      {it.itemName}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <div className="text-lg font-black text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]">
                                  {Math.round(kcal)} <span className="text-[10px] font-bold text-emerald-400/50">kcal</span>
                                </div>
                                <div className="text-xs font-semibold text-emerald-100/40">
                                  {Math.round(p)}g Protein
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-end border-t border-white/5 pt-3">
                              <button
                                onClick={() => onRequestDeleteMeal(m.id)}
                                className="text-[11px] font-bold text-rose-500 transition hover:text-rose-600 hover:underline"
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
                <div className="border-t border-white/5 bg-emerald-950/30 px-6 py-4">
                   <div className="flex justify-between text-xs font-semibold text-emerald-100/40">
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
