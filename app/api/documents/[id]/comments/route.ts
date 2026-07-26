import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get('versionId');
  const startOffset = request.nextUrl.searchParams.get('anchorStart');
  const endOffset = request.nextUrl.searchParams.get('anchorEnd');

  if (!versionId) return NextResponse.json({ error: 'versionId is required' }, { status: 400 });
  const { projectId } = identity;

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
  const identity = await resolveRequestIdentity(request, { policy: 'either' });
  if (!identity.ok) return identity.response;
  const { author } = identity;

  const { projectId } = identity;
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
