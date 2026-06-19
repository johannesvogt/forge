import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { getSkillById, addSkillFile } from '@/lib/skills/skill-service';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // TODO(issue #20): resolve projectId from URL slug
  const projectId = '';
  const { id } = await params;
  const skill = await getSkillById(prisma as any, projectId, id);
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.name !== 'string' ||
    body.name.trim().length === 0 ||
    typeof body.content !== 'string'
  ) {
    return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
  }

  const file = await addSkillFile(prisma as any, projectId, id, {
    name: body.name.trim(),
    content: body.content,
  });

  return NextResponse.json(file, { status: 201 });
}
