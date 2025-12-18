'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Dumbbell, Sun, Moon, Monitor, ArrowLeft } from 'lucide-react';
import { cn } from '@/app/_components/utils/cn';

type ThemeMode = 'light' | 'dark' | 'system';

interface HeaderProps {
  showBack?: boolean;
  onReset?: () => void;
  className?: string;
  maxWidthClass?: string;
}

export function Header({ showBack, className, maxWidthClass = "max-w-6xl" }: HeaderProps) {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  // Theme effect
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

  const today = new Date();

  if (!mounted) {
    // Render a placeholder to avoid layout shift, or just return null.
    // Returning null might cause a flash. Rendering static structure is better.
    return (
      <nav className={cn(
        "sticky top-0 z-50 px-4 py-3 md:px-6 md:py-4 backdrop-blur-xl border-b transition-colors duration-300 bg-white/70 border-gray-200 dark:bg-neutral-950/70 dark:border-white/5",
        className
      )}>
        <div className={cn("mx-auto flex justify-between items-center", maxWidthClass)}>
           {/* Minimal static content */}
           <div className="flex items-center gap-2">
              <div className="bg-emerald-500 p-2 rounded-lg shadow-lg shadow-emerald-500/20">
                <Dumbbell className="w-5 h-5 text-white dark:text-neutral-950" />
              </div>
              <span className="font-bold text-lg tracking-tight text-neutral-800 dark:text-white">
                FitTrack<span className="text-emerald-600 dark:text-emerald-500">.Pro</span>
              </span>
           </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 px-4 py-3 md:px-6 md:py-4 backdrop-blur-xl border-b transition-colors duration-300 bg-white/70 border-gray-200 dark:bg-neutral-950/70 dark:border-white/5",
        className
      )}
    >
      <div className={cn("mx-auto flex justify-between items-center", maxWidthClass)}>
        <div className="flex items-center gap-3">
          {showBack && (
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/70 p-2 text-neutral-800 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg shadow-lg shadow-emerald-500/20">
              <Dumbbell className="w-5 h-5 text-white dark:text-neutral-950" />
            </div>
            <span className="font-bold text-lg tracking-tight text-neutral-800 dark:text-white">
              FitTrack<span className="text-emerald-600 dark:text-emerald-500">.Pro</span>
            </span>
          </div>
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
                className={cn(
                  "p-1.5 rounded-full transition-all duration-200",
                  theme === item.mode
                    ? 'bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300'
                )}
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
  );
}
