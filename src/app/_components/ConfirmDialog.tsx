'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';

import { cn } from './utils/cn';

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  prefersReducedMotion?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const {
    open,
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    variant = 'default',
    prefersReducedMotion = false,
    onClose,
    onConfirm,
  } = props;

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="fixed inset-0 z-60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          onClick={onClose}
          aria-hidden
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 320, damping: 26, mass: 0.9 }
            }
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={title}
            className="fixed left-1/2 top-1/2 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-4xl border border-white/10 bg-white/85 shadow-2xl backdrop-blur-xl dark:bg-neutral-950/80"
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-black tracking-tight text-neutral-950 dark:text-white">{title}</div>
                  {description && (
                    <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">{description}</div>
                  )}
                </div>
                <button
                  className="rounded-2xl px-3 py-2 text-xs font-bold text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2.5 text-xs font-bold text-neutral-800 shadow-sm transition hover:bg-white active:scale-[0.99] dark:border-white/10 dark:bg-neutral-900/60 dark:text-neutral-200 dark:hover:bg-neutral-900"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black text-white shadow-sm transition active:scale-[0.99]',
                    variant === 'danger' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-neutral-900 hover:bg-neutral-800'
                  )}
                >
                  {variant === 'danger' && <Trash2 className="h-4 w-4" />}
                  {confirmLabel}
                </button>
              </div>
            </div>

            {variant === 'danger' && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-rose-500/12 to-transparent dark:from-rose-400/10" />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
