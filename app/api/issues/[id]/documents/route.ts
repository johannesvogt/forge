import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const { id } = await params;
  const docs = await projectArtifacts(prisma as any, projectId).listDocumentsByIssue(id);
  if (!docs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(docs);
}
