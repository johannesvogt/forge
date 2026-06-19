import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { createIssue, listIssues } from '@/lib/issues/issue-service';
import { COLUMNS } from '@/lib/issues/state-machine';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const column = searchParams.get('column') ?? undefined;

  if (column && !(COLUMNS as readonly string[]).includes(column)) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const issues = await listIssues(prisma as any, projectId, column);
  return NextResponse.json(issues);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const issue = await createIssue(prisma as any, projectId, {
    title: body.title.trim(),
    description: typeof body.description === 'string' ? body.description : '',
  });

  return NextResponse.json(issue, { status: 201 });
}
