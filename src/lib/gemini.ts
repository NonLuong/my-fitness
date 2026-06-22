import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
export const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export function getGeminiModelCandidates(): string[] {
  return Array.from(new Set([
    process.env.GEMINI_MODEL,
    process.env.GEMINI_FALLBACK_MODEL,
    DEFAULT_GEMINI_MODEL,
    DEFAULT_GEMINI_FALLBACK_MODEL,
    'gemini-2.5-flash',
  ].filter((model): model is string => Boolean(model?.trim()))));
}

export function createGeminiClient(apiKey = process.env.GEMINI_API_KEY): GoogleGenAI {
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 45_000,
      retryOptions: {
        attempts: 3,
      },
    },
  });
}

export const coachResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    adviceMarkdown: { type: 'string' },
    followUpQuestions: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string' },
    },
    notes: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string' },
    },
  },
  required: ['adviceMarkdown', 'followUpQuestions', 'notes'],
} as const;

export const nutritionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          itemName: { type: 'string' },
          assumedServing: { type: 'string' },
          caloriesKcal: { type: 'number', minimum: 0 },
          proteinG: { type: 'number', minimum: 0 },
          carbsG: { type: 'number', minimum: 0 },
          fatG: { type: 'number', minimum: 0 },
          fiberG: { type: 'number', minimum: 0 },
          sugarG: { type: 'number', minimum: 0 },
          sodiumMg: { type: 'number', minimum: 0 },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          notes: { type: 'array', items: { type: 'string' } },
          vitaminsAndMinerals: { type: 'array', items: { type: 'string' } },
          healthBenefits: { type: 'string' },
          warnings: { type: 'string' },
          funFact: { type: 'string' },
        },
        required: [
          'itemName',
          'assumedServing',
          'caloriesKcal',
          'proteinG',
          'carbsG',
          'fatG',
          'confidence',
          'notes',
        ],
      },
    },
    followUpQuestions: {
      type: 'array',
      maxItems: 2,
      items: { type: 'string' },
    },
    reasoningSummary: { type: 'string' },
  },
  required: ['results', 'followUpQuestions', 'reasoningSummary'],
} as const;
