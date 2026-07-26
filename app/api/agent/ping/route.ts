import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'agent-only', project: 'principal' });
  if (!identity.ok) return identity.response;

  return NextResponse.json({ ok: true, agent: identity.author.authorLabel });
}
