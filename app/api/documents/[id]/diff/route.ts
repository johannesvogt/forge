import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { diffDocumentVersions } from '@/lib/documents/document-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

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

  const { projectId } = identity;
  const diff = await diffDocumentVersions(prisma as any, projectId, id, fromVersion, toVersion);
  if (diff === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ diff });
}
