import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { createSkill, listSkills } from '@/lib/skills/skill-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const skills = await listSkills(prisma as any, projectId);
  return NextResponse.json(skills);
}

export async function POST(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { projectId } = identity;
  const skill = await createSkill(prisma as any, projectId, {
    name: body.name.trim(),
    description: typeof body.description === 'string' ? body.description : undefined,
    prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
  });

  return NextResponse.json(skill, { status: 201 });
}
