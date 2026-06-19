import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { getIssue, updateIssue } from '@/lib/issues/issue-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const issue = await getIssue(prisma as any, id);
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(issue);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const issue = await getIssue(prisma as any, id);
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const updated = await updateIssue(prisma as any, id, {
    title: typeof body.title === 'string' ? body.title.trim() : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
  });

  return NextResponse.json(updated);
}
