import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { listDocumentVersions, updateDocument, getDocument } from '@/lib/documents/document-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;

  const doc = await getDocument(prisma as any, projectId, id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const versions = await listDocumentVersions(prisma as any, projectId, id);
  return NextResponse.json(versions);
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
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const doc = await updateDocument(prisma as any, projectId, id, {
    content: body.content,
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(doc, { status: 201 });
}
