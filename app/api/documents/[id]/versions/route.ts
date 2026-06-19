import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { listDocumentVersions, updateDocument, getDocument } from '@/lib/documents/document-service';
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
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
  const author = await resolveAuthor(request);
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
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
