import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { projectArtifacts } from '@/lib/artifacts/project-artifact-service';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'either' });
  if (!identity.ok) return identity.response;
  const { author } = identity;

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0 ||
    typeof body.branch !== 'string' ||
    body.branch.trim().length === 0 ||
    typeof body.diffText !== 'string' ||
    typeof body.issueId !== 'string' ||
    body.issueId.trim().length === 0
  ) {
    return NextResponse.json(
      { error: 'title, branch, diffText, and issueId are required' },
      { status: 400 }
    );
  }

  const { projectId } = identity;
  const diff = await projectArtifacts(prisma as any, projectId).uploadDiff({
    title: body.title.trim(),
    description: typeof body.description === 'string' ? body.description : undefined,
    branch: body.branch.trim(),
    diffText: body.diffText,
    issueId: body.issueId.trim(),
    authorUserId: author.authorUserId,
    authorLabel: author.authorLabel,
  });

  if (!diff) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  return NextResponse.json(diff, { status: 201 });
}
