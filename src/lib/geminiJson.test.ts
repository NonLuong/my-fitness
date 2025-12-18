import { describe, expect, it } from 'vitest';
import { extractLastBalancedJsonObject, parseGeminiJson, stripCodeFences } from './geminiJson';

describe('geminiJson helpers', () => {
  it('stripCodeFences removes ```json wrapper', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(stripCodeFences(raw)).toBe('{"a":1}');
  });

  it('extractLastBalancedJsonObject returns balanced object even with trailing text', () => {
    const raw = '{"a":1}\nSOME TRAILING';
    expect(extractLastBalancedJsonObject(raw)).toBe('{"a":1}');
  });

  it('extractLastBalancedJsonObject picks the last balanced object when multiple appear', () => {
    const raw = 'noise {"a":1} more {"b":2} trailing';
    expect(extractLastBalancedJsonObject(raw)).toBe('{"b":2}');
  });

  it('parseGeminiJson repairs trailing commas', () => {
    const raw = '{"a":1,}';
    const parsed = parseGeminiJson<{ a: number }>(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.a).toBe(1);
  });

  it('parseGeminiJson tolerates fenced output + extra prose', () => {
    const raw = '```json\n{"adviceMarkdown":"hi","followUpQuestions":[],"notes":[]}\n```\nขอบคุณครับ';
    const parsed = parseGeminiJson<{ adviceMarkdown: string }>(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.adviceMarkdown).toBe('hi');
  });
});
