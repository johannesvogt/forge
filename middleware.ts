import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth'];
const AGENT_API_PREFIX = '/api/agent';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Agent routes: Bearer auth handled in each route handler
  if (pathname.startsWith(AGENT_API_PREFIX)) {
    return NextResponse.next();
  }

  // Public paths: always allow
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env['NEXTAUTH_SECRET'],
  });

  if (!token) {
    // API routes return 401; page routes redirect to /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
