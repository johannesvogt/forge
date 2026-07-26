import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { getSkillById } from '@/lib/skills/skill-service';
import { DEFAULT_SKILLS } from '@/lib/skills/seed-skills';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;

  const skill = await getSkillById(prisma as any, projectId, id);
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  const seed = DEFAULT_SKILLS.find((s) => s.name === skill.name);
  if (!seed) return NextResponse.json({ error: 'No seed definition for this skill' }, { status: 404 });

  await (prisma as any).skill.update({
    where: { id },
    data: { description: seed.description, prompt: seed.prompt, updatedAt: new Date() },
  });

  const existingFiles = await (prisma as any).skillFile.findMany({ where: { skillId: id } });
  for (const file of existingFiles) {
    await (prisma as any).skillFile.delete({ where: { id: file.id } });
  }
  for (const file of seed.files ?? []) {
    await (prisma as any).skillFile.create({ data: { skillId: id, name: file.name, content: file.content } });
  }

  const updatedSkill = await getSkillById(prisma as any, projectId, id);
  const updatedFiles = await (prisma as any).skillFile.findMany({ where: { skillId: id } });
  return NextResponse.json({ skill: updatedSkill, files: updatedFiles });
}
