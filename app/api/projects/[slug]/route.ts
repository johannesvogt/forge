import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { getProject, deleteProject } from '@/lib/projects/project-service';
import { formatProject } from '@/lib/api/projects';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const { slug } = await params;
  const project = await getProject(prisma as any, slug);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(formatProject(project));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const { slug } = await params;
  const project = await getProject(prisma as any, slug);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteProject(prisma as any, project.id);
  return new NextResponse(null, { status: 204 });
}
