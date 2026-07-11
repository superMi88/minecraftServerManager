import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths that are public (login page and auth API endpoints like login/logout)
  const isPublicPath =
    pathname === '/login' ||
    pathname.startsWith('/api/auth');

  const token = request.cookies.get('jwt')?.value;

  let verifiedToken = null;
  if (token) {
    verifiedToken = await verifyToken(token);
  }

  // If the user tries to access a protected path and is not logged in, redirect to login
  if (!isPublicPath && !verifiedToken) {
    // If it's an API request, return unauthorized JSON
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }
    // Otherwise redirect to HTML login page
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If the user is logged in and tries to access login page, redirect to dashboard
  if (isPublicPath && verifiedToken && pathname !== '/api/auth/logout') {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to exclude other paths like public folder files if needed
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
};
