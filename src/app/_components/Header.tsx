'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon, Monitor, ArrowLeft } from 'lucide-react';
import { cn } from '@/app/_components/utils/cn';
import { MochiMascot } from '@/app/_components/MochiMascot';

type ThemeMode = 'light' | 'dark' | 'system';

interface HeaderProps {
  showBack?: boolean;
  onReset?: () => void;
  className?: string;
  maxWidthClass?: string;
}

export function Header({ showBack, className, maxWidthClass = "max-w-6xl" }: HeaderProps) {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const saved = window.localStorage.getItem('theme_mode');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setTheme(saved);
      }
      setMounted(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Theme effect
  useEffect(() => {
    if (!mounted) return;
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
    window.localStorage.setItem('theme_mode', theme);

    const handleSystemChange = () => {
      if (theme === 'system') applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme, mounted]);

  const today = new Date();

  if (!mounted) {
    // Render a placeholder to avoid layout shift, or just return null.
    // Returning null might cause a flash. Rendering static structure is better.
    return (
      <nav className={cn(
        "sticky top-0 z-50 px-4 py-3 md:px-6 md:py-4 backdrop-blur-xl border-b transition-colors duration-300 bg-[#fff8ed]/80 border-[#8f765d]/10 dark:bg-[#342d27]/80 dark:border-white/5",
        className
      )}>
        <div className={cn("mx-auto flex justify-between items-center", maxWidthClass)}>
           {/* Minimal static content */}
           <div className="flex items-center gap-2">
              <MochiMascot size="sm" animate={false} />
              <span className="font-black text-lg tracking-tight text-[#55483d] dark:text-[#fff4df]">
                Fit<span className="text-[#b66f50] dark:text-[#f2b095]">Sync</span>
              </span>
           </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 px-4 py-3 md:px-6 md:py-4 backdrop-blur-xl border-b transition-colors duration-300 bg-[#fff8ed]/80 border-[#8f765d]/10 dark:bg-[#342d27]/80 dark:border-white/5",
        className
      )}
    >
      <div className={cn("mx-auto flex justify-between items-center", maxWidthClass)}>
        <div className="flex items-center gap-3">
          {showBack && (
            <Link
              href="/"
              aria-label="กลับหน้าหลัก"
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/70 p-2 text-neutral-800 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          
          <div className="flex items-center gap-2">
            <MochiMascot size="sm" />
            <span className="font-black text-lg tracking-tight text-[#55483d] dark:text-[#fff4df]">
              Fit<span className="text-[#b66f50] dark:text-[#f2b095]">Sync</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <div className="flex items-center bg-[#f1e4cf]/70 dark:bg-white/5 rounded-full p-1 border border-[#8f765d]/10 dark:border-white/5">
            {[
              { mode: 'light', icon: Sun },
              { mode: 'system', icon: Monitor },
              { mode: 'dark', icon: Moon },
            ].map((item) => (
              <button
                key={item.mode}
                onClick={() => setTheme(item.mode as ThemeMode)}
                aria-label={
                  item.mode === 'light'
                    ? 'ใช้ธีมสว่าง'
                    : item.mode === 'dark'
                      ? 'ใช้ธีมมืด'
                      : 'ใช้ธีมตามระบบ'
                }
                className={cn(
                  "p-1.5 rounded-full transition-all duration-200",
                  theme === item.mode
                    ? 'bg-[#fffdf8] dark:bg-[#55483d] text-[#b66f50] dark:text-[#f2b095] shadow-sm'
                    : 'text-[#aa927b] dark:text-[#b8a58f] hover:text-[#55483d] dark:hover:text-[#fff4df]'
                )}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          <div className="hidden md:block text-xs font-medium px-3 py-1 rounded-full border transition-colors
            bg-[#f1e4cf]/70 text-[#8a725f] border-[#8f765d]/10
            dark:bg-white/5 dark:text-[#cdb99d] dark:border-white/5">
            {today.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
    </nav>
  );
}
