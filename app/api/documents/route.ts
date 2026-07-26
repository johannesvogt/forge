import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { listDocuments } from '@/lib/documents/document-service';
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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const docs = await listDocuments(prisma as any, projectId);
  return NextResponse.json(docs);
}

export async function POST(request: NextRequest) {
  const author = await resolveAuthor(request);
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0 ||
    typeof body.content !== 'string'
  ) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
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
