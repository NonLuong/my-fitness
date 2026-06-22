import { NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/supabase/config';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    configured: isSupabaseConfigured(),
  });
}
