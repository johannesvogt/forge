import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
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

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  let ctx = await getProjectContext(prisma as any, projectId);
  if (!ctx) {
    const content = await seedFromFile();
    const result = await updateProjectContext(prisma as any, projectId, {
      content,
      authorLabel: 'system',
      authorUserId: null,
    });
    ctx = result.context;
  }

  return NextResponse.json(ctx);
}

export async function PATCH(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const { projectId } = identity;
  const { author } = identity;
  const { context, warning } = await updateProjectContext(prisma as any, projectId, {
    content: body.content,
    authorLabel: author.authorLabel,
    authorUserId: author.authorUserId,
  });

  return NextResponse.json({ context, warning });
}
