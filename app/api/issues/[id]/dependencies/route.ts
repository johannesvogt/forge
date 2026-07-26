import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { addDependency, listDependencies, resolveIssue } from '@/lib/issues/issue-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const deps = await listDependencies(prisma as any, projectId, id);
  return NextResponse.json(deps);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.dependsOnId !== 'string' || !body.dependsOnId.trim()) {
    return NextResponse.json({ error: 'dependsOnId is required' }, { status: 400 });
  }

  const { projectId } = identity;
  const { id } = await params;
  try {
    const dependent = await resolveIssue(prisma as any, projectId, id);
    if (!dependent) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    const dependsOn = await resolveIssue(prisma as any, projectId, body.dependsOnId.trim());
    if (!dependsOn) return NextResponse.json({ error: `Dependency issue not found: ${body.dependsOnId}` }, { status: 404 });
    await addDependency(prisma as any, projectId, dependent.id, dependsOn.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
