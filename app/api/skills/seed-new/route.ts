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
  const existingByName = new Map(existing.map((s) => [s.name, s]));

  let created = 0;
  let updated = 0;

  for (const seed of DEFAULT_SKILLS) {
    const existingSkill = existingByName.get(seed.name);
    if (existingSkill) {
      await (prisma as any).skill.update({
        where: { id: existingSkill.id },
        data: { description: seed.description, prompt: seed.prompt, updatedAt: new Date() },
      });
      const existingFiles = await (prisma as any).skillFile.findMany({ where: { skillId: existingSkill.id } });
      for (const file of existingFiles) {
        await (prisma as any).skillFile.delete({ where: { id: file.id } });
      }
      for (const file of seed.files ?? []) {
        await (prisma as any).skillFile.create({ data: { skillId: existingSkill.id, name: file.name, content: file.content } });
      }
      updated++;
    } else {
      const skill = await (prisma as any).skill.create({
        data: { name: seed.name, description: seed.description, prompt: seed.prompt, projectId },
      });
      for (const file of seed.files ?? []) {
        await (prisma as any).skillFile.create({ data: { skillId: skill.id, name: file.name, content: file.content } });
      }
      created++;
    }
  }

  return NextResponse.json({ created, updated });
}
