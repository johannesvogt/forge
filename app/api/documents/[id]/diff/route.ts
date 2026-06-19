import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { diffDocumentVersions } from '@/lib/documents/document-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 });
  }

  const fromVersion = parseInt(fromParam, 10);
  const toVersion = parseInt(toParam, 10);

  if (isNaN(fromVersion) || isNaN(toVersion) || fromVersion < 1 || toVersion < 1) {
    return NextResponse.json({ error: 'Invalid version numbers' }, { status: 400 });
  }

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const diff = await diffDocumentVersions(prisma as any, projectId, id, fromVersion, toVersion);
  if (diff === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ diff });
}
