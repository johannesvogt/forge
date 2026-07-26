import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { listDocuments } from '@/lib/documents/document-service';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const docs = await listDocuments(prisma as any, projectId);
  return NextResponse.json(docs);
}

export async function POST(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'either' });
  if (!identity.ok) return identity.response;
  const { author } = identity;

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0 ||
    typeof body.content !== 'string'
  ) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
  }

  const { projectId } = identity;
  const doc = await projectArtifacts(prisma as any, projectId).createDocument({
    title: body.title.trim(),
    content: body.content,
    issueId: typeof body.issueId === 'string' && body.issueId.trim().length > 0 ? body.issueId.trim() : null,
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
  });

  if (!doc) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  return NextResponse.json(doc, { status: 201 });
}
