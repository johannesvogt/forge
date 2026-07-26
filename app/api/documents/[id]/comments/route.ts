import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get('versionId');
  const startOffset = request.nextUrl.searchParams.get('anchorStart');
  const endOffset = request.nextUrl.searchParams.get('anchorEnd');

  if (!versionId) return NextResponse.json({ error: 'versionId is required' }, { status: 400 });
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';

  let anchor: { startOffset: number; endOffset: number } | undefined;
  if (startOffset !== null && endOffset !== null) {
    const start = parseInt(startOffset, 10);
    const end = parseInt(endOffset, 10);
    if (isNaN(start) || isNaN(end)) {
      return NextResponse.json({ error: 'Invalid anchor offsets' }, { status: 400 });
    }
    anchor = { startOffset: start, endOffset: end };
  }

  const comments = await projectArtifacts(prisma as any, projectId).listComments(
    { type: 'documentVersion', documentId: id, versionId },
    anchor
  );
  if (!comments) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(comments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const author = await resolveAuthor(request);
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.body !== 'string' || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  if (!body.versionId || typeof body.versionId !== 'string') {
    return NextResponse.json({ error: 'versionId is required' }, { status: 400 });
  }
  const anchorStart = typeof body.anchorStart === 'number' ? body.anchorStart : null;
  const anchorEnd = typeof body.anchorEnd === 'number' ? body.anchorEnd : null;

  const comment = await projectArtifacts(prisma as any, projectId).addComment(
    { type: 'documentVersion', documentId: id, versionId: body.versionId },
    {
    body: body.body.trim(),
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
    anchorStart,
      anchorEnd,
    }
  );

  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(comment, { status: 201 });
}
