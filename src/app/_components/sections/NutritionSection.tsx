'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Utensils } from 'lucide-react';

import { fadeUp, springy, staggerContainer } from '../utils/motion';

import type { MealEntry } from '../types/nutrition';

const MEAL_TYPE_LABELS: Record<MealEntry['mealType'], string> = {
  breakfast: 'มื้อเช้า',
  lunch: 'มื้อกลางวัน',
  dinner: 'มื้อเย็น',
  snack: 'มื้อว่าง',
};

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
      className={`relative space-y-4 ${mobileVisible ? '' : 'hidden md:block'}`}
    >
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-[#a18c79] dark:text-[#cdb99d] transition-colors duration-500 ease-in-out">โภชนาการ</div>
          <div className="text-lg font-extrabold tracking-tight text-neutral-900 dark:text-white transition-colors duration-500 ease-in-out">มื้ออาหารวันนี้</div>
        </div>
        <button
          onClick={onOpenAi}
          className="rounded-2xl bg-[#d98c68] px-4 py-2 text-xs font-bold text-white shadow-[0_10px_22px_rgba(177,105,75,0.22)] transition-colors duration-500 ease-in-out hover:bg-[#bd7454]"
        >
          เพิ่มมื้ออาหาร
        </button>
      </div>

      {/* Summary Card - Now Full Width / Centered style */}
      <motion.section
        variants={fadeUp}
        transition={springy(prefersReducedMotion)}
        className="cozy-surface rounded-[2rem] p-6 transition-all duration-500 ease-in-out will-change-transform hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(105,82,57,0.12)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold tracking-tight text-neutral-900 dark:text-white">สารอาหารรวมวันนี้</div>
            <div className="text-xs text-[#a18c79] dark:text-[#d7c5aa]">คำนวณจากมื้อที่บันทึกไว้</div>
          </div>
          <div className="inline-flex items-center rounded-full border border-[#8f765d]/10 bg-[#f1e4cf]/55 px-2.5 py-1 text-[11px] font-semibold text-[#725f50] dark:border-white/8 dark:bg-white/5 dark:text-[#fff4df]">
            {meals.length} มื้อ
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div className="rounded-2xl border border-[#d98c68]/20 bg-[#d98c68]/13 px-2 py-3 transition-colors duration-500">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#b66f50] dark:text-[#f2b095]">พลังงาน</div>
            <div className="text-xl font-black text-[#b66f50] dark:text-[#f2b095]">{Math.round(kcalAnimated)}</div>
            <div className="text-[9px] font-bold text-[#b66f50]/60 dark:text-[#f2b095]/60">kcal</div>
          </div>
          <div className="rounded-2xl border border-[#8f765d]/14 bg-[#e5dfd1]/45 px-2 py-3 transition-colors duration-500">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#725f50] dark:text-[#ddcbb1]">โปรตีน</div>
            <div className="text-xl font-black text-[#655447] dark:text-[#f0dfc8]">{Math.round(pAnimated)}g</div>
          </div>
          <div className="rounded-2xl border border-[#e3b950]/25 bg-[#f2cd72]/20 px-2 py-3 transition-colors duration-500">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#9c7a28] dark:text-[#f2d88d]">คาร์บ</div>
            <div className="text-xl font-black text-[#8b6b20] dark:text-[#f5dfa0]">{Math.round(cAnimated)}g</div>
          </div>
          <div className="rounded-2xl border border-[#e99b80]/25 bg-[#f4b89c]/20 px-2 py-3 transition-colors duration-500">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#a96550] dark:text-[#f4c1aa]">ไขมัน</div>
            <div className="text-xl font-black text-[#9d5d49] dark:text-[#f8cfbc]">{Math.round(fAnimated)}g</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-[#a18c79] dark:text-[#d7c5aa] transition-colors duration-500 ease-in-out">
          เคล็ดลับ: บันทึกทุกมื้อจาก AI Nutrition เพื่อให้ยอดรวมแม่นยำขึ้น
        </div>
      </motion.section>

      <motion.section
        variants={fadeUp}
        transition={springy(prefersReducedMotion)}
        className="cozy-surface overflow-hidden rounded-[2rem]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#8f765d]/10 px-5 py-4 dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d98c68]/18 bg-[#d98c68]/13 text-[#b66f50] shadow-[0_8px_20px_rgba(177,105,75,0.1)] dark:text-[#f2b095]">
              <Utensils className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#55483d] dark:text-[#fff4df]">ประวัติมื้ออาหาร</h2>
              <p className="text-xs font-medium text-[#a18c79] dark:text-[#d7c5aa]">รายการของวันนี้</p>
            </div>
          </div>
          <div className="rounded-full border border-[#8f765d]/10 bg-[#f1e4cf]/55 px-3 py-1 text-xs font-bold text-[#725f50] dark:border-white/8 dark:bg-white/5 dark:text-[#fff4df]">
            {meals.length} มื้อ
          </div>
        </div>

        <div className="p-5">
          {meals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 rounded-3xl border border-[#8f765d]/10 bg-[#f1e4cf]/55 p-4 dark:border-white/8 dark:bg-white/5">
                <Utensils className="h-8 w-8 text-[#a18c79] dark:text-[#d7c5aa]" />
              </div>
              <p className="text-sm font-medium text-[#8a725f] dark:text-[#d7c5aa]">วันนี้ยังไม่มีมื้ออาหารที่บันทึกไว้</p>
              <button
                type="button"
                onClick={onOpenAi}
                className="mt-4 rounded-full bg-[#d98c68] px-4 py-2 text-xs font-bold text-white shadow-[0_10px_22px_rgba(177,105,75,0.2)] transition hover:bg-[#bd7454]"
              >
                เพิ่มมื้อแรกของวันนี้
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {meals.map((m, i) => {
                const kcal = m.items.reduce((s, it) => s + (it.caloriesKcal ?? 0), 0);
                const p = m.items.reduce((s, it) => s + (it.proteinG ?? 0), 0);

                return (
                  <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    key={m.id}
                    className="group relative overflow-hidden rounded-3xl border border-[#8f765d]/11 bg-[#fffdf8]/80 p-4 shadow-[0_10px_28px_rgba(105,82,57,0.07)] transition hover:-translate-y-0.5 hover:border-[#d98c68]/24 hover:shadow-[0_16px_34px_rgba(105,82,57,0.12)] dark:border-white/8 dark:bg-white/6"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-[#d98c68]/18 bg-[#d98c68]/11 px-2 py-1 text-[10px] font-bold tracking-wider text-[#a96550] dark:text-[#f2b095]">
                            {MEAL_TYPE_LABELS[m.mealType]}
                          </span>
                          <span className="text-[11px] font-medium text-[#a18c79] dark:text-[#cdb99d]">
                            {new Date(m.ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {m.items.map((it, idx) => (
                            <div key={idx} className="text-sm font-bold text-[#55483d] dark:text-[#fff4df]">
                              {it.itemName}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <div className="text-lg font-black text-[#b66f50] dark:text-[#f2b095]">
                          {Math.round(kcal)} <span className="text-[10px] font-bold text-[#b66f50]/60 dark:text-[#f2b095]/60">kcal</span>
                        </div>
                        <div className="text-xs font-semibold text-[#8a725f] dark:text-[#d7c5aa]">
                          โปรตีน {Math.round(p)}g
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end border-t border-[#8f765d]/9 pt-3 dark:border-white/8">
                      <button
                        type="button"
                        onClick={() => onRequestDeleteMeal(m.id)}
                        className="rounded-full px-2 py-1 text-[11px] font-bold text-[#bd6658] transition hover:bg-[#bd6658]/10 hover:text-[#a74f43]"
                      >
                        ลบรายการ
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.section>
    </motion.section>
  );
}
