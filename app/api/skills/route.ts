import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { createSkill, listSkills } from '@/lib/skills/skill-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const skills = await listSkills(prisma as any, projectId);
  return NextResponse.json(skills);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  const skill = await createSkill(prisma as any, projectId, {
    name: body.name.trim(),
    description: typeof body.description === 'string' ? body.description : undefined,
    prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
  });

  return NextResponse.json(skill, { status: 201 });
}
