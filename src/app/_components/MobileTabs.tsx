'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, TrendingUp, Utensils } from 'lucide-react';

import { cn } from './utils/cn';

export type MobileTab = 'workout' | 'nutrition' | 'protein';

export function MobileTabs(props: {
  value: MobileTab;
  onChange: (next: MobileTab) => void;
  mealsCount: number;
  progressPercent: number;
  prefersReducedMotion?: boolean;
}) {
  const { value, onChange, mealsCount, progressPercent, prefersReducedMotion = false } = props;

  const tabs: Array<{ id: MobileTab; label: string; icon: LucideIcon }> = [
    { id: 'workout', label: 'Workout', icon: TrendingUp },
    { id: 'nutrition', label: 'Nutrition', icon: Sparkles },
    { id: 'protein', label: 'Protein', icon: Utensils },
  ];

  return (
    <div className="md:hidden sticky top-18 z-40">
      <div className="rounded-3xl border border-black/5 bg-white/70 p-1.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/50">
        <div className="relative grid grid-cols-3 gap-1">
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-1 w-[calc(33.333%-0.25rem)] rounded-2xl bg-neutral-900 shadow-sm dark:bg-white"
            initial={false}
            animate={{ x: value === 'workout' ? '0%' : value === 'nutrition' ? '100%' : '200%' }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }
            }
            style={{ willChange: 'transform' }
            }
          />

          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                'relative z-10 inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-extrabold transition active:scale-[0.99]',
                value === t.id
                  ? 'text-white dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5'
              )}
              aria-pressed={value === t.id}
            >
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>

              {t.id === 'nutrition' && mealsCount > 0 && (
                <span
                  className={cn(
                    'ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black',
                    value === t.id
                      ? 'bg-white/20 text-white dark:bg-neutral-900/15 dark:text-neutral-900'
                      : 'bg-black/5 text-neutral-700 dark:bg-white/5 dark:text-neutral-200'
                  )}
                  aria-label={`${mealsCount} meals`}
                >
                  {mealsCount}
                </span>
              )}

              {t.id === 'protein' && (
                <span
                  className={cn(
                    'ml-0.5 inline-flex min-w-9 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums',
                    value === t.id
                      ? 'bg-white/20 text-white dark:bg-neutral-900/15 dark:text-neutral-900'
                      : 'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                  )}
                  aria-label={`Protein progress ${Math.round(progressPercent)} percent`}
                >
                  {Math.round(progressPercent)}%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
