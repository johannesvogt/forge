import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { getIssue } from '@/lib/issues/issue-service';
import { listDocumentsByIssue } from '@/lib/documents/document-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const { id } = await params;
  const issue = await getIssue(prisma as any, projectId, id);
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const docs = await listDocumentsByIssue(prisma as any, projectId, id);
  return NextResponse.json(docs);
}
