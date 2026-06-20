import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { createProject, listProjects } from '@/lib/projects/project-service';
import { SlugConflictError } from '@/lib/projects/project-service';
import { parseCreateProjectBody, formatProject } from '@/lib/api/projects';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projects = await listProjects(prisma as any);
  return NextResponse.json(projects.map(formatProject));
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = parseCreateProjectBody(raw);
  if (!parsed) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const project = await createProject(prisma as any, {
      name: parsed.name,
      createdByUserId: session.user.id,
    });
    return NextResponse.json(formatProject(project), { status: 201 });
  } catch (err) {
    if (err instanceof SlugConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
