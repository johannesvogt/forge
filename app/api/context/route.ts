import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { getProjectContext, updateProjectContext } from '@/lib/context/context-service';
import { prisma } from '@/lib/prisma';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function seedFromFile(): Promise<string> {
  try {
    const content = await readFile(join(process.cwd(), 'CONTEXT.md'), 'utf-8');
    return content;
  } catch {
    return '';
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let ctx = await getProjectContext(prisma as any);
  if (!ctx) {
    const content = await seedFromFile();
    const result = await updateProjectContext(prisma as any, {
      content,
      authorLabel: 'system',
      authorUserId: null,
    });
    ctx = result.context;
  }

  return NextResponse.json(ctx);
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const userName = (session.user as { name?: string }).name ?? session.user.id;
  const { context, warning } = await updateProjectContext(prisma as any, {
    content: body.content,
    authorLabel: userName,
    authorUserId: session.user.id,
  });

  return NextResponse.json({ context, warning });
}
