import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/nextauth-config';
import { createApiKey, listApiKeys } from '@/lib/auth/api-key-service';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await listApiKeys(prisma, session.user.id);
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.label !== 'string' || body.label.trim().length === 0) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }
  if (!body.projectId || typeof body.projectId !== 'string') {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const { rawKey, record } = await createApiKey(
    prisma,
    session.user.id,
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
