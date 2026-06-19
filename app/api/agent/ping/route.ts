import { NextRequest, NextResponse } from 'next/server';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const agent = await findActiveApiKey(prisma, token);
  if (!agent) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, agent: agent.label });
}
