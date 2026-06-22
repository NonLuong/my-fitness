export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function sumFiniteNonNegative(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return total;
    return total + value;
  }, 0);
}
