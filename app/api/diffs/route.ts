import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { uploadDiff } from '@/lib/diffs/diff-service';
import { prisma } from '@/lib/prisma';

async function resolveAuthor(
  request: NextRequest
): Promise<{ authorUserId: string | null; authorLabel: string } | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return {
      authorUserId: session.user.id,
      authorLabel: session.user.name ?? session.user.email ?? 'Unknown',
    };
  }

  const token = extractBearer(request.headers.get('authorization'));
  if (token) {
    const agent = await findActiveApiKey(prisma, token);
    if (agent) return { authorUserId: null, authorLabel: agent.label };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const author = await resolveAuthor(request);
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0 ||
    typeof body.branch !== 'string' ||
    body.branch.trim().length === 0 ||
    typeof body.diffText !== 'string' ||
    typeof body.issueId !== 'string' ||
    body.issueId.trim().length === 0
  ) {
    return NextResponse.json(
      { error: 'title, branch, diffText, and issueId are required' },
      { status: 400 }
    );
  }

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const diff = await uploadDiff(prisma as any, projectId, {
    title: body.title.trim(),
    description: typeof body.description === 'string' ? body.description : undefined,
    branch: body.branch.trim(),
    diffText: body.diffText,
    issueId: body.issueId.trim(),
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
  });

  return NextResponse.json(diff, { status: 201 });
}
