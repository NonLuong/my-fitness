import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    { ok: false, error: 'Logs API disabled (Supabase integration removed).' },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Logs API disabled (Supabase integration removed).' },
    { status: 410 },
  );
}
