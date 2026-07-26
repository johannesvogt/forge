import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only' });
  if (!identity.ok) return identity.response;

  const { projectId } = identity;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.name !== 'string' ||
    body.name.trim().length === 0 ||
    typeof body.content !== 'string'
  ) {
    return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
  }

  const file = await projectArtifacts(prisma as any, projectId).addSkillFile(id, {
    name: body.name.trim(),
    content: body.content,
  });

  if (!file) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  return NextResponse.json(file, { status: 201 });
}
