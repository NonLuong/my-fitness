import { NextResponse } from 'next/server';
import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  getGeminiModelCandidates,
} from '@/lib/gemini';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.GEMINI_API_KEY),
    primaryModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL,
    candidates: getGeminiModelCandidates(),
    node: process.version,
  });
}
