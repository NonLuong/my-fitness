'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { fadeUp, springy, staggerContainer } from '../utils/motion';

import type { MealEntry, MealItem } from '../types/nutrition';

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

  return (
    <motion.section
      variants={staggerContainer}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate={prefersReducedMotion ? false : 'show'}
      className={`space-y-3 ${mobileVisible ? '' : 'hidden md:block'}`}
    >
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-neutral-400">Nutrition</div>
          <div className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">Today&apos;s meals</div>
        </div>
        <button
          onClick={onOpenAi}
          className="rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
        >
          Add meal
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
        <motion.div
          variants={fadeUp}
          transition={springy(prefersReducedMotion)}
          className="md:col-span-5 rounded-3xl border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md transition will-change-transform hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-neutral-900/40"
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

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
              <div className="text-[10px] text-gray-500 dark:text-neutral-400">kcal</div>
              <div className="text-sm font-extrabold text-gray-900 dark:text-white">{Math.round(kcalAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
              <div className="text-[10px] text-gray-500 dark:text-neutral-400">P</div>
              <div className="text-sm font-extrabold text-gray-900 dark:text-white">{Math.round(pAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
              <div className="text-[10px] text-gray-500 dark:text-neutral-400">C</div>
              <div className="text-sm font-extrabold text-gray-900 dark:text-white">{Math.round(cAnimated)}</div>
            </div>
            <div className="rounded-2xl bg-black/5 px-2 py-2 dark:bg-white/5">
              <div className="text-[10px] text-gray-500 dark:text-neutral-400">F</div>
              <div className="text-sm font-extrabold text-gray-900 dark:text-white">{Math.round(fAnimated)}</div>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-neutral-400">
            Tip: Save meals from AI Nutrition (bottom-right) to build accurate day totals.
          </div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          transition={springy(prefersReducedMotion)}
          className="md:col-span-7 rounded-3xl border border-black/5 bg-white/70 p-5 shadow-sm backdrop-blur-md transition will-change-transform hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-neutral-900/40"
        >
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
                const kcal = m.items.reduce((s: number, it: MealItem) => s + (it.caloriesKcal ?? 0), 0);
                const p = m.items.reduce((s: number, it: MealItem) => s + (it.proteinG ?? 0), 0);
                const c = m.items.reduce((s: number, it: MealItem) => s + (it.carbsG ?? 0), 0);
                const f = m.items.reduce((s: number, it: MealItem) => s + (it.fatG ?? 0), 0);

                return (
                  <div
                    key={m.id}
                    className="group rounded-3xl border border-black/5 bg-white/65 p-4 shadow-sm transition hover:bg-white/80 dark:border-white/10 dark:bg-neutral-950/25 dark:hover:bg-neutral-950/35"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-extrabold tracking-tight text-gray-900 dark:text-white">
                          {m.mealType.toUpperCase()} •{' '}
                          {new Date(m.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="mt-1 text-[11px] text-gray-500 dark:text-neutral-400 line-clamp-2">
                          {m.items.map((it: MealItem) => it.itemName).join(' + ')}
                        </div>
                      </div>
                      <button
                        onClick={() => onRequestDeleteMeal(m.id)}
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
        </motion.div>
      </div>
    </motion.section>
  );
}
