import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { createIssue, listIssues } from '@/lib/issues/issue-service';
import { COLUMNS } from '@/lib/issues/state-machine';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { searchParams } = new URL(request.url);
  const column = searchParams.get('column') ?? undefined;

  if (column && !(COLUMNS as readonly string[]).includes(column)) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  const { projectId } = identity;
  const issues = await listIssues(prisma as any, projectId, column);
  return NextResponse.json(issues);
}

export async function POST(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const { projectId } = identity;
  const issue = await createIssue(prisma as any, projectId, {
    title: body.title.trim(),
    description: typeof body.description === 'string' ? body.description : '',
  });

  return NextResponse.json(issue, { status: 201 });
}
