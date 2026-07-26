import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || body.status !== 'resolved') {
    return NextResponse.json({ error: 'status must be "resolved"' }, { status: 400 });
  }

  const { projectId } = identity;
  const comment = await projectArtifacts(prisma as any, projectId).resolveComment(id);
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(comment);
}
