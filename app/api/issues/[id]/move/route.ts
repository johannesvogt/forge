import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { moveIssue } from '@/lib/issues/issue-service';
import { COLUMNS, type Column } from '@/lib/issues/state-machine';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.column !== 'string') {
    return NextResponse.json({ error: 'column is required' }, { status: 400 });
  }

  if (!(COLUMNS as readonly string[]).includes(body.column)) {
    return NextResponse.json({ error: 'Invalid column' }, { status: 400 });
  }

  const { id } = await params;
  try {
    const issue = await moveIssue(prisma as any, id, body.column as Column);
    return NextResponse.json(issue);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
