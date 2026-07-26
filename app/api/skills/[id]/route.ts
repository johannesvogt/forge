import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { getSkillById, getSkillWithFiles, updateSkill, deleteSkill } from '@/lib/skills/skill-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const skill = await getSkillById(prisma as any, projectId, id);
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  const result = await getSkillWithFiles(prisma as any, projectId, skill.name);
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const skill = await updateSkill(prisma as any, projectId, id, {
    description: typeof body.description === 'string' ? body.description : undefined,
    prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
  });
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  return NextResponse.json(skill);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const existing = await getSkillById(prisma as any, projectId, id);
  if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  await deleteSkill(prisma as any, projectId, id);
  return new NextResponse(null, { status: 204 });
}
