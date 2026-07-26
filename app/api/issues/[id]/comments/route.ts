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

  const { projectId } = identity;
  const { id } = await params;
  const comments = await projectArtifacts(prisma as any, projectId).listComments({ type: 'issue', issueId: id });
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

  const comment = await projectArtifacts(prisma as any, projectId).addComment({ type: 'issue', issueId: id }, {
    body: body.body.trim(),
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
  });

  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(comment, { status: 201 });
}
