import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { revokeApiKey } from '@/lib/auth/api-key-service';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identity = await resolveRequestIdentity(request, { policy: 'human-only', project: 'none' });
  if (!identity.ok) return identity.response;

  const { id } = await params;

  try {
    await revokeApiKey(prisma, id, identity.principal.userId);
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
