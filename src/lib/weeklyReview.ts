export type WeeklyReview = {
  headline: string;
  summary: string;
  dataQuality: {
    score: number;
    message: string;
    missing: string[];
  };
  wins: string[];
  trends: {
    weight: string;
    waist: string;
    nutrition: string;
    sleepAndHunger: string;
    consistency: string;
  };
  possiblePlateauReasons: string[];
  nextWeekPlan: string[];
  caution: string;
};

export type WeeklyReviewRecord = {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  source: 'ai' | 'offline';
  cached: boolean;
  review: WeeklyReview;
};

export function previousCompletedWeek(date = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = cursor.getDay();
  const daysSinceMonday = (day + 6) % 7;
  cursor.setDate(cursor.getDate() - daysSinceMonday - 1);
  const end = new Date(cursor);
  const start = new Date(cursor);
  start.setDate(end.getDate() - 6);
  const localKey = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayOfMonth}`;
  };
  return { weekStart: localKey(start), weekEnd: localKey(end) };
}

export function formatWeeklyRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  return `${start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
