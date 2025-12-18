export type JsonParseResult<T> =
  | { ok: true; value: T; diagnostics?: { usedRepair: boolean; extracted: boolean } }
  | { ok: false; error: string; diagnostics?: { usedRepair: boolean; extracted: boolean; candidate?: string } };

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function stripCodeFences(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fence?.[1]) return fence[1].trim();
  return text.trim();
}

export function extractLastBalancedJsonObject(text: string): string | null {
  const cleaned = stripCodeFences(text);
  let last: string | null = null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let currentStart = -1;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) currentStart = i;
      depth++;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (currentStart !== -1) last = cleaned.slice(currentStart, i + 1).trim();
        currentStart = -1;
      }
      if (depth < 0) return null;
    }
  }

  return last;
}

/**
 * Best-effort parsing of Gemini model output that *should* be JSON.
 * - strips ```json fences
 * - extracts the last balanced JSON object
 * - applies light repairs (trailing commas, stray single-letter lines, unterminated quote)
 */
export function parseGeminiJson<T>(raw: string): JsonParseResult<T> {
  const candidate = extractLastBalancedJsonObject(raw) ?? stripCodeFences(raw);
  const extracted = candidate !== raw;

  const direct = safeJsonParse<T>(candidate);
  if (direct) {
    return { ok: true, value: direct, diagnostics: { usedRepair: false, extracted } };
  }

  let repaired = candidate;

  // Remove lines that are only a single letter token (common artifact in some streams).
  repaired = repaired.replace(/\n\s*[a-zA-Z]\s*\n/g, '\n');
  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // If JSON ends mid-string (unterminated quote), close it.
  const quoteCount = (repaired.match(/(?<!\\)"/g) ?? []).length;
  if (quoteCount % 2 === 1) repaired = `${repaired}"`;

  // If braces are unbalanced, append missing closing braces.
  const openBraces = (repaired.match(/{/g) ?? []).length;
  const closeBraces = (repaired.match(/}/g) ?? []).length;
  if (openBraces > closeBraces) repaired = `${repaired}${'}'.repeat(openBraces - closeBraces)}`;

  const fixed = safeJsonParse<T>(repaired);
  if (fixed) {
    return { ok: true, value: fixed, diagnostics: { usedRepair: true, extracted } };
  }

  return {
    ok: false,
    error: 'Failed to parse JSON from model output',
    diagnostics: { usedRepair: true, extracted, candidate },
  };
}
