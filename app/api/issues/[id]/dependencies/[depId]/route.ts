import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { removeDependency } from '@/lib/issues/issue-service';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; depId: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id, depId } = await params;
  try {
    await removeDependency(prisma as any, projectId, id, depId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
