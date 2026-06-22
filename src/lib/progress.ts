export type Mood = 'great' | 'good' | 'okay' | 'tired' | 'stressed';

export type BodyMeasurement = {
  measuredOn: string;
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
  bodyFatPercent: number | null;
};

export type DailyCheckin = {
  checkinDate: string;
  sleepHours: number | null;
  waterMl: number | null;
  energyLevel: number | null;
  hungerLevel: number | null;
  mood: Mood | null;
  notes: string | null;
};

export type ProgressEntry = {
  date: string;
  measurement: BodyMeasurement | null;
  checkin: DailyCheckin | null;
};

export type CheckinDraft = {
  date: string;
  weightKg: string;
  waistCm: string;
  chestCm: string;
  hipCm: string;
  armCm: string;
  thighCm: string;
  neckCm: string;
  bodyFatPercent: string;
  sleepHours: string;
  waterLiters: string;
  energyLevel: number | null;
  hungerLevel: number | null;
  mood: Mood | null;
  notes: string;
};

export function emptyCheckinDraft(date: string): CheckinDraft {
  return {
    date,
    weightKg: '',
    waistCm: '',
    chestCm: '',
    hipCm: '',
    armCm: '',
    thighCm: '',
    neckCm: '',
    bodyFatPercent: '',
    sleepHours: '',
    waterLiters: '',
    energyLevel: null,
    hungerLevel: null,
    mood: null,
    notes: '',
  };
}

export function parseOptionalMetric(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function weightChange(entries: ProgressEntry[]): number | null {
  const weights = entries
    .map((entry) => entry.measurement?.weightKg)
    .filter((value): value is number => typeof value === 'number');
  if (weights.length < 2) return null;
  return weights[0] - weights[1];
}

export function checkinStreak(entries: ProgressEntry[], today: string): number {
  const dates = new Set(entries.filter((entry) => entry.checkin || entry.measurement).map((entry) => entry.date));
  const cursor = new Date(`${today}T12:00:00`);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
