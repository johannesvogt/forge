import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { createProject, listProjects } from '@/lib/projects/project-service';
import { SlugConflictError } from '@/lib/projects/project-service';
import { parseCreateProjectBody, formatProject } from '@/lib/api/projects';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const projects = await listProjects(prisma as any);
  return NextResponse.json(projects.map(formatProject));
}

export async function POST(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const raw = await request.json().catch(() => null);
  const parsed = parseCreateProjectBody(raw);
  if (!parsed) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const project = await createProject(prisma as any, {
      name: parsed.name,
      createdByUserId: identity.principal.userId,
    });
    return NextResponse.json(formatProject(project), { status: 201 });
  } catch (err) {
    if (err instanceof SlugConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
