'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LogIn, LogOut, Mail, UserRound, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

import { useAuth } from './AuthProvider';
import { MochiMascot } from './MochiMascot';

type AuthMode = 'signin' | 'signup';

type HealthSummary = {
  goalLabel: string;
  targetKcal: number;
  proteinGoal: number;
  weightKg?: number;
};

export function AuthButton({
  compact = false,
  healthSummary,
  onEditHealthProfile,
}: {
  compact?: boolean;
  healthSummary?: HealthSummary;
  onEditHealthProfile?: () => void;
}) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'สมาชิก FitSync';

  const resetFeedback = () => {
    setMessage(null);
    setError(null);
  };

  const signInWithGoogle = async () => {
    setSubmitting(true);
    resetFeedback();
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (authError) {
      setError(authError.message);
      setSubmitting(false);
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    resetFeedback();
    const supabase = createSupabaseBrowserClient();

    const result = mode === 'signup'
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === 'signup' && !result.data.session) {
      setMessage('ส่งอีเมลยืนยันแล้ว กรุณาเปิดลิงก์ในอีเมลก่อนเข้าสู่ระบบ');
    } else {
      setOpen(false);
    }
    setSubmitting(false);
  };

  const signOut = async () => {
    setSubmitting(true);
    await createSupabaseBrowserClient().auth.signOut();
    setSubmitting(false);
    setOpen(false);
  };

  if (loading) {
    return <div className="h-10 w-full animate-pulse rounded-2xl bg-[#f1e4cf]/55 dark:bg-white/5" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetFeedback();
          setOpen(true);
        }}
        className={`flex items-center rounded-2xl border border-[#8f765d]/12 bg-[#fffdf8]/70 text-[#6f5b4b] transition hover:border-[#d98c68]/35 hover:bg-[#fffdf8] dark:border-white/10 dark:bg-white/5 dark:text-[#fff4df] dark:hover:bg-white/10 ${
          compact ? 'h-9 gap-2 px-3 text-xs font-bold' : 'w-full gap-3 px-3 py-2.5 text-left'
        }`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f1e4cf] dark:bg-[#55483d]">
          {user ? <UserRound className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
        </span>
        <span className={compact ? 'max-w-24 truncate' : 'min-w-0 flex-1'}>
          <span className="block truncate font-extrabold">{user ? displayName : 'เข้าสู่ระบบ'}</span>
          {!compact && (
            <span className="block truncate text-[10px] font-medium text-[#a18c79] dark:text-[#cdb99d]">
              {user ? 'ข้อมูลกำลังซิงก์กับ Cloud' : 'เก็บความก้าวหน้าไว้ทุกอุปกรณ์'}
            </span>
          )}
        </span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid min-h-[100dvh] place-items-center overflow-y-auto bg-[#342d27]/45 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={user ? 'บัญชี FitSync' : 'เข้าสู่ระบบ FitSync'}
              className="my-auto w-full max-w-md rounded-[2rem] border border-[#8f765d]/12 bg-[#fffaf2] p-6 text-[#55483d] shadow-[0_28px_80px_rgba(58,43,31,0.28)] dark:border-white/10 dark:bg-[#443a32] dark:text-[#fff4df]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <MochiMascot mood="hello" size="md" />
                  <div>
                    <h2 className="text-xl font-black">{user ? 'บัญชีของคุณ' : 'กลับมาดูแลตัวเองกัน'}</h2>
                    <p className="text-xs text-[#937b67] dark:text-[#d7c5aa]">
                      {user ? user.email : 'เข้าสู่ระบบเพื่อซิงก์ข้อมูลอย่างปลอดภัย'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="rounded-full p-2 text-[#8a725f] hover:bg-[#f1e4cf] dark:hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {user ? (
                <div className="mt-6 space-y-3">
                  {healthSummary && (
                    <div className="rounded-3xl border border-[#8f765d]/12 bg-[#fffdf8]/62 p-4 dark:border-white/8 dark:bg-white/5">
                      <div className="text-xs font-extrabold text-[#a18c79] dark:text-[#cdb99d]">ข้อมูลสุขภาพที่ใช้คำนวณ</div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-[#f1e4cf]/58 p-2 dark:bg-black/10">
                          <div className="text-[10px] font-bold text-[#a18c79]">เป้าหมาย</div>
                          <div className="mt-1 truncate text-xs font-black text-[#55483d] dark:text-[#fff4df]">{healthSummary.goalLabel}</div>
                        </div>
                        <div className="rounded-2xl bg-[#f2cd72]/20 p-2">
                          <div className="text-[10px] font-bold text-[#9c7a28]">พลังงาน</div>
                          <div className="mt-1 text-xs font-black text-[#765817]">{Math.round(healthSummary.targetKcal)} kcal</div>
                        </div>
                        <div className="rounded-2xl bg-[#d98c68]/12 p-2">
                          <div className="text-[10px] font-bold text-[#a96550]">โปรตีน</div>
                          <div className="mt-1 text-xs font-black text-[#a96550]">{healthSummary.proteinGoal}g</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {onEditHealthProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onEditHealthProfile();
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d98c68] py-3 font-extrabold text-white shadow-[0_10px_24px_rgba(177,105,75,0.22)] transition hover:bg-[#c97c5b]"
                    >
                      <UserRound className="h-4 w-4" />
                      แก้ไขข้อมูลสุขภาพและเป้าหมาย
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={signOut}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#c87962]/25 bg-[#c87962]/10 py-3 font-extrabold text-[#a65343] transition hover:bg-[#c87962]/16 disabled:opacity-50 dark:text-[#ffb6a5]"
                  >
                    <LogOut className="h-4 w-4" />
                    ออกจากระบบ
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={signInWithGoogle}
                    className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#fffdf8] py-3 font-extrabold shadow-sm ring-1 ring-[#8f765d]/15 transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 dark:bg-white/10"
                  >
                    <span className="text-lg font-black text-[#4285f4]">G</span>
                    เข้าสู่ระบบด้วย Google
                  </button>

                  <div className="my-5 flex items-center gap-3 text-[10px] font-bold text-[#a18c79]">
                    <span className="h-px flex-1 bg-[#8f765d]/12" />
                    หรือใช้อีเมล
                    <span className="h-px flex-1 bg-[#8f765d]/12" />
                  </div>

                  <form onSubmit={submitEmail} className="space-y-3">
                    <label className="block">
                      <span className="sr-only">อีเมล</span>
                      <div className="flex items-center gap-2 rounded-2xl border border-[#8f765d]/14 bg-white/55 px-4 dark:bg-black/10">
                        <Mail className="h-4 w-4 text-[#a18c79]" />
                        <input
                          required
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="อีเมล"
                          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-[#b3a08f]"
                        />
                      </div>
                    </label>
                    <input
                      required
                      minLength={6}
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="รหัสผ่านอย่างน้อย 6 ตัว"
                      className="w-full rounded-2xl border border-[#8f765d]/14 bg-white/55 px-4 py-3 text-sm outline-none placeholder:text-[#b3a08f] focus:border-[#d98c68]/50 dark:bg-black/10"
                    />
                    <button
                      disabled={submitting}
                      className="w-full rounded-2xl bg-[#d98c68] py-3 font-extrabold text-white shadow-[0_10px_24px_rgba(177,105,75,0.22)] transition hover:bg-[#c97c5b] disabled:opacity-50"
                    >
                      {submitting ? 'กำลังดำเนินการ…' : mode === 'signin' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => {
                      setMode((current) => current === 'signin' ? 'signup' : 'signin');
                      resetFeedback();
                    }}
                    className="mt-4 w-full text-xs font-bold text-[#a96550] hover:underline dark:text-[#f2b095]"
                  >
                    {mode === 'signin' ? 'ยังไม่มีบัญชี? สร้างบัญชีใหม่' : 'มีบัญชีแล้ว? กลับไปเข้าสู่ระบบ'}
                  </button>
                </>
              )}

              {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
              {message && <p className="mt-4 rounded-xl bg-[#91ad8b]/15 p-3 text-xs font-semibold text-[#63775f] dark:text-[#c7dfc0]">{message}</p>}
            </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
