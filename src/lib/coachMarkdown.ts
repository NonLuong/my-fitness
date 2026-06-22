/**
 * Gemini can occasionally return Markdown with escaped line breaks ("\\n")
 * inside an already parsed JSON string. Convert only formatting escapes that
 * are useful in chat while leaving other backslashes untouched.
 */
export function normalizeCoachMarkdown(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
