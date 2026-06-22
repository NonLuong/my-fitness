'use client';

import type { User } from '@supabase/supabase-js';

import { localDateKey } from './dailyLog';
import {
  parseOptionalMetric,
  type BodyMeasurement,
  type CheckinDraft,
  type DailyCheckin,
  type ProgressEntry,
} from './progress';
import { createSupabaseBrowserClient } from './supabase/client';

type MeasurementRow = {
  measured_on: string;
  weight_kg: number | string | null;
  waist_cm: number | string | null;
  chest_cm: number | string | null;
  hip_cm: number | string | null;
  arm_cm: number | string | null;
  thigh_cm: number | string | null;
  neck_cm: number | string | null;
  body_fat_percent: number | string | null;
};

type CheckinRow = {
  checkin_date: string;
  sleep_hours: number | string | null;
  water_ml: number | null;
  energy_level: number | null;
  hunger_level: number | null;
  mood: DailyCheckin['mood'];
  notes: string | null;
};

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadProgressEntries(userId: string, days = 90): Promise<ProgressEntry[]> {
  const supabase = createSupabaseBrowserClient();
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, days - 1));
  const sinceDate = localDateKey(since);

  const [measurementResult, checkinResult] = await Promise.all([
    supabase
      .from('body_measurements')
      .select('measured_on, weight_kg, waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm, neck_cm, body_fat_percent')
      .eq('user_id', userId)
      .gte('measured_on', sinceDate)
      .order('measured_on', { ascending: false }),
    supabase
      .from('daily_checkins')
      .select('checkin_date, sleep_hours, water_ml, energy_level, hunger_level, mood, notes')
      .eq('user_id', userId)
      .gte('checkin_date', sinceDate)
      .order('checkin_date', { ascending: false }),
  ]);

  if (measurementResult.error) throw measurementResult.error;
  if (checkinResult.error) throw checkinResult.error;

  const byDate = new Map<string, ProgressEntry>();
  for (const row of (measurementResult.data ?? []) as MeasurementRow[]) {
    const measurement: BodyMeasurement = {
      measuredOn: row.measured_on,
      weightKg: numberOrNull(row.weight_kg),
      waistCm: numberOrNull(row.waist_cm),
      chestCm: numberOrNull(row.chest_cm),
      hipCm: numberOrNull(row.hip_cm),
      armCm: numberOrNull(row.arm_cm),
      thighCm: numberOrNull(row.thigh_cm),
      neckCm: numberOrNull(row.neck_cm),
      bodyFatPercent: numberOrNull(row.body_fat_percent),
    };
    byDate.set(row.measured_on, { date: row.measured_on, measurement, checkin: null });
  }

  for (const row of (checkinResult.data ?? []) as CheckinRow[]) {
    const checkin: DailyCheckin = {
      checkinDate: row.checkin_date,
      sleepHours: numberOrNull(row.sleep_hours),
      waterMl: row.water_ml,
      energyLevel: row.energy_level,
      hungerLevel: row.hunger_level,
      mood: row.mood,
      notes: row.notes,
    };
    const existing = byDate.get(row.checkin_date);
    byDate.set(row.checkin_date, {
      date: row.checkin_date,
      measurement: existing?.measurement ?? null,
      checkin,
    });
  }

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveDailyCheckin(user: User, draft: CheckinDraft): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const measurement = {
    user_id: user.id,
    measured_on: draft.date,
    weight_kg: parseOptionalMetric(draft.weightKg),
    waist_cm: parseOptionalMetric(draft.waistCm),
    chest_cm: parseOptionalMetric(draft.chestCm),
    hip_cm: parseOptionalMetric(draft.hipCm),
    arm_cm: parseOptionalMetric(draft.armCm),
    thigh_cm: parseOptionalMetric(draft.thighCm),
    neck_cm: parseOptionalMetric(draft.neckCm),
    body_fat_percent: parseOptionalMetric(draft.bodyFatPercent),
  };

  const hasMeasurement = Object.entries(measurement)
    .some(([key, value]) => !['user_id', 'measured_on'].includes(key) && value !== null);

  const tasks: Array<PromiseLike<{ error: unknown }>> = [
    supabase.from('daily_checkins').upsert({
      user_id: user.id,
      checkin_date: draft.date,
      sleep_hours: parseOptionalMetric(draft.sleepHours),
      water_ml: draft.waterLiters.trim()
        ? Math.round((parseOptionalMetric(draft.waterLiters) ?? 0) * 1000)
        : null,
      energy_level: draft.energyLevel,
      hunger_level: draft.hungerLevel,
      mood: draft.mood,
      notes: draft.notes.trim() || null,
    }, { onConflict: 'user_id,checkin_date' }),
  ];

  if (hasMeasurement) {
    tasks.push(
      supabase.from('body_measurements').upsert(measurement, {
        onConflict: 'user_id,measured_on',
      }),
    );
  }

  const results = await Promise.all(tasks);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
