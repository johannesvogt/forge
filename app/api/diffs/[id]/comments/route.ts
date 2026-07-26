import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import type { DiffLineAnchor } from '@/lib/comments/comment-service';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;

  const filePath = request.nextUrl.searchParams.get('filePath');
  const lineNumberParam = request.nextUrl.searchParams.get('lineNumber');

  let anchor: DiffLineAnchor | undefined;
  if (filePath !== null && lineNumberParam !== null) {
    const lineNumber = parseInt(lineNumberParam, 10);
    if (isNaN(lineNumber)) {
      return NextResponse.json({ error: 'Invalid lineNumber' }, { status: 400 });
    }
    anchor = { filePath, lineNumber };
  }

  const comments = await projectArtifacts(prisma as any, projectId).listComments(
    { type: 'diff', diffId: id },
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
  if (!body.filePath || typeof body.filePath !== 'string') {
    return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
  }
  if (typeof body.lineNumber !== 'number') {
    return NextResponse.json({ error: 'lineNumber is required' }, { status: 400 });
  }

  const comment = await projectArtifacts(prisma as any, projectId).addComment({ type: 'diff', diffId: id }, {
    body: body.body.trim(),
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
    anchorFilePath: body.filePath,
    anchorStart: body.lineNumber,
  });

  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(comment, { status: 201 });
}
