import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { unassignIssue } from '@/lib/issues/issue-service';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  try {
    const issue = await unassignIssue(prisma as any, projectId, id);
    return NextResponse.json(issue);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
