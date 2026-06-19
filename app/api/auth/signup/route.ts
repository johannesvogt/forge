import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth/users';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const { email, password } = body as { email: string; password: string };

  if (!email.includes('@') || password.length < 8) {
    return NextResponse.json(
      { error: 'Invalid email or password must be at least 8 characters' },
      { status: 400 }
    );
  }

  try {
    const user = await createUser(prisma, email, password);
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
