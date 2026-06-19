import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { deleteSkillFile } from '@/lib/skills/skill-service';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const { fileId } = await params;
  await deleteSkillFile(prisma as any, projectId, fileId);
  return new NextResponse(null, { status: 204 });
}
