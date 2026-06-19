import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { addComment, listComments, type DiffLineAnchor } from '@/lib/comments/comment-service';
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

  const diff = await prisma.diff.findUnique({ where: { id } });
  if (!diff) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  const comments = await listComments(prisma as any, 'diff_line', id, anchor);
  return NextResponse.json(comments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const author = await resolveAuthor(request);
  if (!author) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const diff = await prisma.diff.findUnique({ where: { id } });
  if (!diff) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  const comment = await addComment(prisma as any, {
    targetType: 'diff_line',
    targetId: id,
    body: body.body.trim(),
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
    anchorFilePath: body.filePath,
    anchorStart: body.lineNumber,
  });

  return NextResponse.json(comment, { status: 201 });
}
