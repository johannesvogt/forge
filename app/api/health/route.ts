import { NextResponse } from 'next/server';
import { healthResponse } from '@/lib/api/health';

export function GET() {
  return NextResponse.json(healthResponse());
}
