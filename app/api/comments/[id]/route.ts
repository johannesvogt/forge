import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { resolveComment } from '@/lib/comments/comment-service';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || body.status !== 'resolved') {
    return NextResponse.json({ error: 'status must be "resolved"' }, { status: 400 });
  }

  try {
    const comment = await resolveComment(prisma as any, id);
    return NextResponse.json(comment);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
