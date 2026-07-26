import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { getDiff } from '@/lib/diffs/diff-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const diff = await getDiff(prisma as any, projectId, id);
  if (!diff) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(diff);
}
