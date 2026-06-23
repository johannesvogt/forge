import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { listSkills } from '@/lib/skills/skill-service';
import { DEFAULT_SKILLS } from '@/lib/skills/seed-skills';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';

  const existing = await listSkills(prisma as any, projectId);
  const existingNames = new Set(existing.map((s) => s.name));

  const toCreate = DEFAULT_SKILLS.filter((s) => !existingNames.has(s.name));

  const created = [];
  for (const seed of toCreate) {
    const skill = await (prisma as any).skill.create({
      data: { name: seed.name, description: seed.description, prompt: seed.prompt, projectId },
    });
    for (const file of seed.files ?? []) {
      await (prisma as any).skillFile.create({ data: { skillId: skill.id, name: file.name, content: file.content } });
    }
    created.push(skill);
  }

  return NextResponse.json({ created, count: created.length });
}
