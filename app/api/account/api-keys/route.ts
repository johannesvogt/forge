import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { createApiKey, listApiKeys } from '@/lib/auth/api-key-service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const keys = await listApiKeys(prisma, identity.principal.userId);
  return NextResponse.json(
    keys.map((k) => ({
      id: k.id,
      label: k.label,
      last4: k.last4,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
      projectId: k.projectId,
    }))
  );
}

export async function POST(request: NextRequest) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.label !== 'string' || body.label.trim().length === 0) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }
  if (!body.projectId || typeof body.projectId !== 'string') {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }
  const projectIdentity = await resolveRequestIdentity(request, {
    policy: 'human-only',
    projectId: body.projectId,
  });
  if (!projectIdentity.ok) return projectIdentity.response;

  const { rawKey, record } = await createApiKey(
    prisma,
    identity.principal.userId,
    body.label.trim(),
    body.projectId
  );

  return NextResponse.json(
    {
      id: record.id,
      label: record.label,
      last4: record.last4,
      createdAt: record.createdAt,
      projectId: record.projectId,
      key: rawKey,
    },
    { status: 201 }
  );
}
