import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const diffs = await projectArtifacts(prisma as any, projectId).listDiffsByIssue(id);
  if (!diffs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(diffs);
}
