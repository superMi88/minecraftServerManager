import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    const expectedUsername = process.env.LOGIN_USERNAME;
    const expectedPassword = process.env.LOGIN_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      return NextResponse.json(
        { error: 'Serverkonfiguration fehlerhaft: Login-Daten in der .env-Datei fehlen.' },
        { status: 500 }
      );
    }

    if (username !== expectedUsername || password !== expectedPassword) {
      return NextResponse.json(
        { error: 'Ungültiger Benutzername oder Passwort.' },
        { status: 401 }
      );
    }

    // Generate JWT payload (mimicking the schema for ease of use)
    const tokenPayload = {
      userId: 'admin',
      username: username,
      avatar: null,
      admin: true,
    };

    const jwtToken = await signToken(tokenPayload);

    const isHttps = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
    const response = NextResponse.json({ success: true });
    response.cookies.set('jwt', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[Auth API] Login error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler während der Anmeldung.' }, { status: 500 });
  }
}
