'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Gauge,
  Heart,
  Loader2,
  MoonStar,
  Plus,
  Ruler,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/app/_components/AuthProvider';
import { MochiMascot } from '@/app/_components/MochiMascot';
import { localDateKey } from '@/lib/dailyLog';
import {
  checkinStreak,
  emptyCheckinDraft,
  weightChange,
  type CheckinDraft,
  type Mood,
  type ProgressEntry,
} from '@/lib/progress';
import { loadProgressEntries, saveDailyCheckin } from '@/lib/progressPersistence';

type RangeDays = 7 | 30 | 90;

type ProgressSectionProps = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  targetKcal: number;
  proteinGoal: number;
};

const MOODS: Array<{ id: Mood; emoji: string; label: string }> = [
  { id: 'great', emoji: '😄', label: 'ดีมาก' },
  { id: 'good', emoji: '🙂', label: 'ดี' },
  { id: 'okay', emoji: '😐', label: 'เรื่อย ๆ' },
  { id: 'tired', emoji: '😴', label: 'เหนื่อย' },
  { id: 'stressed', emoji: '😣', label: 'เครียด' },
];

function metricInput(
  label: string,
  unit: string,
  key: keyof CheckinDraft,
  draft: CheckinDraft,
  setDraft: React.Dispatch<React.SetStateAction<CheckinDraft>>,
) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-[#725f50] dark:text-[#ddcbb1]">{label}</span>
      <div className="flex items-center rounded-2xl border border-[#8f765d]/13 bg-white/60 px-3 dark:bg-black/10">
        <input
          inputMode="decimal"
          value={String(draft[key] ?? '')}
          onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold outline-none placeholder:text-[#b8a794]"
          placeholder="—"
        />
        <span className="text-[10px] font-bold text-[#a18c79]">{unit}</span>
      </div>
    </label>
  );
}

function WeightChart({ entries }: { entries: ProgressEntry[] }) {
  const points = entries
    .filter((entry) => typeof entry.measurement?.weightKg === 'number')
    .slice()
    .reverse();

  if (points.length < 2) {
    return (
      <div className="grid h-44 place-items-center rounded-3xl border border-dashed border-[#8f765d]/18 bg-white/35 text-center dark:bg-black/10">
        <div>
          <Scale className="mx-auto h-7 w-7 text-[#c59a7d]" />
          <p className="mt-2 text-sm font-bold text-[#725f50] dark:text-[#ddcbb1]">บันทึกน้ำหนักอย่างน้อย 2 วัน</p>
          <p className="text-xs text-[#a18c79]">แล้วกราฟแนวโน้มจะปรากฏตรงนี้</p>
        </div>
      </div>
    );
  }

  const weights = points.map((entry) => entry.measurement!.weightKg!);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const spread = Math.max(max - min, 1);
  const coordinates = points.map((entry, index) => ({
    x: points.length === 1 ? 50 : 7 + (index / (points.length - 1)) * 86,
    y: 82 - ((entry.measurement!.weightKg! - min) / spread) * 62,
    weight: entry.measurement!.weightKg!,
    date: entry.date,
  }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="rounded-3xl border border-[#8f765d]/10 bg-white/48 p-3 dark:bg-black/10">
      <svg viewBox="0 0 100 100" className="h-44 w-full overflow-visible" role="img" aria-label="กราฟแนวโน้มน้ำหนัก">
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="5" x2="95" y1={y} y2={y} stroke="currentColor" strokeWidth="0.4" className="text-[#8f765d]/12" />
        ))}
        <polyline
          points={line}
          fill="none"
          stroke="#d98c68"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coordinates.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="2.7" fill="#fffaf2" stroke="#d98c68" strokeWidth="1.5" />
            <title>{`${point.date}: ${point.weight} กก.`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-2 text-[10px] font-bold text-[#a18c79]">
        <span>{points[0].date.slice(5).replace('-', '/')}</span>
        <span>{points.at(-1)!.date.slice(5).replace('-', '/')}</span>
      </div>
    </div>
  );
}

export function ProgressSection(props: ProgressSectionProps) {
  const { user } = useAuth();
  const today = localDateKey();
  const [range, setRange] = useState<RangeDays>(30);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<CheckinDraft>(() => emptyCheckinDraft(today));

  const refresh = useCallback(async () => {
    if (!user) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEntries(await loadProgressEntries(user.id, 90));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'โหลดข้อมูลความก้าวหน้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const current = entries.find((entry) => entry.date === draft.date);
    if (!current) return;
    setDraft((value) => ({
      ...value,
      weightKg: current.measurement?.weightKg?.toString() ?? '',
      waistCm: current.measurement?.waistCm?.toString() ?? '',
      chestCm: current.measurement?.chestCm?.toString() ?? '',
      hipCm: current.measurement?.hipCm?.toString() ?? '',
      armCm: current.measurement?.armCm?.toString() ?? '',
      thighCm: current.measurement?.thighCm?.toString() ?? '',
      neckCm: current.measurement?.neckCm?.toString() ?? '',
      bodyFatPercent: current.measurement?.bodyFatPercent?.toString() ?? '',
      sleepHours: current.checkin?.sleepHours?.toString() ?? '',
      waterLiters: current.checkin?.waterMl ? (current.checkin.waterMl / 1000).toString() : '',
      energyLevel: current.checkin?.energyLevel ?? null,
      hungerLevel: current.checkin?.hungerLevel ?? null,
      mood: current.checkin?.mood ?? null,
      notes: current.checkin?.notes ?? '',
    }));
  }, [open, draft.date, entries]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const visibleEntries = useMemo(() => entries.slice(0, range), [entries, range]);
  const latestWeight = entries.find((entry) => typeof entry.measurement?.weightKg === 'number')?.measurement?.weightKg ?? null;
  const latestWaist = entries.find((entry) => typeof entry.measurement?.waistCm === 'number')?.measurement?.waistCm ?? null;
  const change = weightChange(entries);
  const streak = checkinStreak(entries, today);
  const calorieProgress = props.targetKcal > 0 ? Math.min((props.caloriesKcal / props.targetKcal) * 100, 100) : 0;
  const proteinProgress = props.proteinGoal > 0 ? Math.min((props.proteinG / props.proteinGoal) * 100, 100) : 0;

  const openNewCheckin = () => {
    setDraft(emptyCheckinDraft(today));
    setSaved(false);
    setError(null);
    setOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await saveDailyCheckin(user, draft);
      await refresh();
      setSaved(true);
      window.setTimeout(() => setOpen(false), 700);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="cozy-surface rounded-[2rem] p-7 text-center"
      >
        <MochiMascot mood="hello" size="lg" />
        <h2 className="mt-3 text-xl font-black text-[#55483d] dark:text-[#fff4df]">เข้าสู่ระบบเพื่อเริ่มบันทึกความก้าวหน้า</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#7d6b5d] dark:text-[#d7c5aa]">
          น้ำหนัก สัดส่วน และความรู้สึกประจำวันจะถูกเก็บอย่างปลอดภัยและเปิดดูได้ทุกอุปกรณ์
        </p>
      </motion.section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[#55483d] dark:text-[#fff4df]">ความก้าวหน้าของคุณ</h2>
          <p className="text-xs text-[#937b67] dark:text-[#d7c5aa]">ดูแนวโน้ม ไม่ตัดสินตัวเองจากตัวเลขวันเดียว</p>
        </div>
        <button
          type="button"
          onClick={openNewCheckin}
          className="flex shrink-0 items-center gap-2 rounded-2xl bg-[#d98c68] px-4 py-3 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(177,105,75,0.22)] transition hover:-translate-y-0.5 hover:bg-[#c97c5b]"
        >
          <Plus className="h-4 w-4" />
          บันทึกวันนี้
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="cozy-surface rounded-3xl p-4">
          <Scale className="h-5 w-5 text-[#b66f50]" />
          <div className="mt-3 text-2xl font-black text-[#55483d] dark:text-[#fff4df]">{latestWeight ?? '—'}</div>
          <div className="text-[10px] font-bold text-[#a18c79]">น้ำหนักล่าสุด (กก.)</div>
        </div>
        <div className="cozy-surface rounded-3xl p-4">
          {change !== null && change <= 0
            ? <TrendingDown className="h-5 w-5 text-[#829079]" />
            : <TrendingUp className="h-5 w-5 text-[#d98c68]" />}
          <div className="mt-3 text-2xl font-black text-[#55483d] dark:text-[#fff4df]">
            {change === null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}
          </div>
          <div className="text-[10px] font-bold text-[#a18c79]">เทียบครั้งก่อน (กก.)</div>
        </div>
        <div className="cozy-surface rounded-3xl p-4">
          <Ruler className="h-5 w-5 text-[#b28d59]" />
          <div className="mt-3 text-2xl font-black text-[#55483d] dark:text-[#fff4df]">{latestWaist ?? '—'}</div>
          <div className="text-[10px] font-bold text-[#a18c79]">รอบเอวล่าสุด (ซม.)</div>
        </div>
        <div className="cozy-surface rounded-3xl p-4">
          <Sparkles className="h-5 w-5 text-[#d98c68]" />
          <div className="mt-3 text-2xl font-black text-[#55483d] dark:text-[#fff4df]">{streak}</div>
          <div className="text-[10px] font-bold text-[#a18c79]">บันทึกต่อเนื่อง (วัน)</div>
        </div>
      </div>

      <section className="cozy-surface rounded-[2rem] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-[#55483d] dark:text-[#fff4df]">แนวโน้มน้ำหนัก</h3>
            <p className="text-[11px] text-[#a18c79]">น้ำหนักแกว่งรายวันได้จากน้ำ อาหาร และโซเดียม</p>
          </div>
          <div className="flex rounded-full bg-[#f1e4cf]/65 p-1 dark:bg-white/5">
            {([7, 30, 90] as RangeDays[]).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold transition ${
                  range === days
                    ? 'bg-[#fffdf8] text-[#b66f50] shadow-sm dark:bg-[#55483d] dark:text-[#f2b095]'
                    : 'text-[#9b8774]'
                }`}
              >
                {days} วัน
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="grid h-44 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#d98c68]" /></div>
        ) : (
          <WeightChart entries={visibleEntries} />
        )}
      </section>

      <section className="cozy-surface rounded-[2rem] p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f2cd72]/24 text-[#9a7424]">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-[#55483d] dark:text-[#fff4df]">โภชนาการวันนี้</h3>
            <p className="text-[11px] text-[#a18c79]">{props.mealCount} มื้อที่บันทึกไว้</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <div className="mb-1.5 flex justify-between text-xs font-bold">
              <span>พลังงาน</span>
              <span>{Math.round(props.caloriesKcal)} / {Math.round(props.targetKcal)} kcal</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f1e4cf] dark:bg-white/10">
              <div className="h-full rounded-full bg-[#f2cd72]" style={{ width: `${calorieProgress}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs font-bold">
              <span>โปรตีน</span>
              <span>{Math.round(props.proteinG)} / {Math.round(props.proteinGoal)} g</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f1e4cf] dark:bg-white/10">
              <div className="h-full rounded-full bg-[#d98c68]" style={{ width: `${proteinProgress}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['โปรตีน', `${Math.round(props.proteinG)}g`],
              ['คาร์บ', `${Math.round(props.carbsG)}g`],
              ['ไขมัน', `${Math.round(props.fatG)}g`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-[#fffdf8]/65 p-3 dark:bg-white/5">
                <div className="text-lg font-black">{value}</div>
                <div className="text-[10px] font-bold text-[#a18c79]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-black text-[#55483d] dark:text-[#fff4df]">บันทึกล่าสุด</h3>
        <div className="space-y-2">
          {entries.slice(0, 7).map((entry) => {
            const mood = MOODS.find((item) => item.id === entry.checkin?.mood);
            return (
              <button
                type="button"
                key={entry.date}
                onClick={() => {
                  setDraft(emptyCheckinDraft(entry.date));
                  setOpen(true);
                }}
                className="cozy-surface flex w-full items-center gap-4 rounded-3xl p-4 text-left transition hover:-translate-y-0.5"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f1e4cf]/75 text-sm font-black text-[#8a725f] dark:bg-white/5">
                  {entry.date.slice(8)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold">{new Date(`${entry.date}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
                  <div className="truncate text-xs text-[#a18c79]">
                    {entry.measurement?.weightKg ? `${entry.measurement.weightKg} กก.` : 'ไม่ได้ชั่งน้ำหนัก'}
                    {entry.checkin?.sleepHours ? ` • นอน ${entry.checkin.sleepHours} ชม.` : ''}
                  </div>
                </div>
                <span className="text-xl">{mood?.emoji ?? '🌱'}</span>
                <ChevronRight className="h-4 w-4 text-[#b5a18e]" />
              </button>
            );
          })}
          {!entries.length && !loading && (
            <div className="rounded-3xl border border-dashed border-[#8f765d]/18 p-7 text-center text-sm text-[#a18c79]">
              ยังไม่มีบันทึก เริ่มจากวันนี้ได้เลย
            </div>
          )}
        </div>
      </section>

      {error && <div className="rounded-2xl bg-red-500/10 p-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</div>}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-[#342d27]/48 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setOpen(false)}
          >
            <motion.form
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onSubmit={submit}
              onClick={(event) => event.stopPropagation()}
              className="flex max-h-[calc(100dvh-0.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-[#fffaf2] text-[#55483d] shadow-2xl dark:bg-[#443a32] dark:text-[#fff4df] sm:max-h-[min(850px,calc(100dvh-2rem))] sm:rounded-[2rem]"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#8f765d]/10 p-5">
                <div className="flex items-center gap-3">
                  <MochiMascot mood="hello" size="md" />
                  <div>
                    <h2 className="text-lg font-black">บันทึกวันนี้</h2>
                    <p className="text-[11px] text-[#a18c79]">กรอกเท่าที่สะดวก ไม่จำเป็นต้องครบทุกช่อง</p>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-[#f1e4cf] dark:hover:bg-white/10">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold">วันที่</span>
                  <input
                    type="date"
                    max={today}
                    value={draft.date}
                    onChange={(event) => setDraft(emptyCheckinDraft(event.target.value))}
                    className="w-full rounded-2xl border border-[#8f765d]/13 bg-white/60 px-4 py-3 text-sm font-bold outline-none dark:bg-black/10"
                  />
                </label>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-[#b66f50]" />
                    <h3 className="font-black">ร่างกาย</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {metricInput('น้ำหนัก', 'กก.', 'weightKg', draft, setDraft)}
                    {metricInput('รอบเอว', 'ซม.', 'waistCm', draft, setDraft)}
                    {metricInput('รอบอก', 'ซม.', 'chestCm', draft, setDraft)}
                    {metricInput('รอบสะโพก', 'ซม.', 'hipCm', draft, setDraft)}
                    {metricInput('รอบแขน', 'ซม.', 'armCm', draft, setDraft)}
                    {metricInput('รอบต้นขา', 'ซม.', 'thighCm', draft, setDraft)}
                    {metricInput('รอบคอ', 'ซม.', 'neckCm', draft, setDraft)}
                    {metricInput('ไขมันร่างกาย', '%', 'bodyFatPercent', draft, setDraft)}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Heart className="h-4 w-4 text-[#d98c68]" />
                    <h3 className="font-black">การพักผ่อนและความรู้สึก</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {metricInput('การนอน', 'ชม.', 'sleepHours', draft, setDraft)}
                    {metricInput('น้ำดื่ม', 'ลิตร', 'waterLiters', draft, setDraft)}
                  </div>

                  {[
                    { label: 'พลังงานวันนี้', key: 'energyLevel' as const, icon: Gauge },
                    { label: 'ความหิววันนี้', key: 'hungerLevel' as const, icon: Activity },
                  ].map(({ label, key, icon: Icon }) => (
                    <div key={key} className="mt-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-bold">
                        <Icon className="h-4 w-4 text-[#a18c79]" />
                        {label}
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            type="button"
                            key={level}
                            onClick={() => setDraft((current) => ({ ...current, [key]: level }))}
                            className={`rounded-2xl py-2.5 text-sm font-black transition ${
                              draft[key] === level
                                ? 'bg-[#d98c68] text-white'
                                : 'bg-[#f1e4cf]/55 text-[#8a725f] dark:bg-white/5 dark:text-[#d7c5aa]'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="mt-4">
                    <div className="mb-2 text-xs font-bold">อารมณ์วันนี้</div>
                    <div className="grid grid-cols-5 gap-2">
                      {MOODS.map((mood) => (
                        <button
                          type="button"
                          key={mood.id}
                          onClick={() => setDraft((current) => ({ ...current, mood: mood.id }))}
                          className={`rounded-2xl p-2 text-center transition ${
                            draft.mood === mood.id
                              ? 'bg-[#d98c68]/16 ring-2 ring-[#d98c68]/55'
                              : 'bg-[#f1e4cf]/45 dark:bg-white/5'
                          }`}
                        >
                          <span className="block text-xl">{mood.emoji}</span>
                          <span className="mt-1 block text-[9px] font-bold">{mood.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold">โน้ตเพิ่มเติม</span>
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    maxLength={2000}
                    placeholder="วันนี้รู้สึกอย่างไร มีอะไรที่อยากจำไว้ไหม"
                    className="h-28 w-full resize-none rounded-2xl border border-[#8f765d]/13 bg-white/60 p-4 text-sm outline-none placeholder:text-[#b8a794] dark:bg-black/10"
                  />
                </label>

                <div className="rounded-2xl bg-[#91ad8b]/12 p-3 text-xs text-[#687b63] dark:text-[#c7dfc0]">
                  <MoonStar className="mr-2 inline h-4 w-4" />
                  น้ำหนักหนึ่งวันไม่ได้บอกความสำเร็จทั้งหมด ดูค่าเฉลี่ยและแนวโน้มหลายวันจะมีความหมายกว่า
                </div>
              </div>

              <div className="shrink-0 border-t border-[#8f765d]/10 bg-[#fffdf8]/92 p-4 backdrop-blur-xl dark:bg-[#443a32]/92">
                {error && <p className="mb-2 text-center text-xs font-semibold text-red-500">{error}</p>}
                <button
                  disabled={saving || saved}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#d98c68] py-3.5 font-extrabold text-white shadow-[0_10px_24px_rgba(177,105,75,0.22)] disabled:opacity-70"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : saved ? <Sparkles className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
                  {saving ? 'กำลังบันทึก…' : saved ? 'บันทึกเรียบร้อย' : 'บันทึกความก้าวหน้า'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
