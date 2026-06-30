import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'OAuth code missing.' }, { status: 400 });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Discord OAuth credentials missing.' }, { status: 500 });
  }

  try {
    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        scope: 'identify',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Discord Token Exchange Error:', errorData);
      return NextResponse.json({ error: 'Failed to exchange OAuth code.' }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const tokenType = tokenData.token_type;

    // 2. Fetch user information
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `${tokenType} ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user info from Discord.' }, { status: 400 });
    }

    const discordUser = await userResponse.json();

    // 3. Database Check
    const userCount = await prisma.user.count();
    let dbUser = await prisma.user.findUnique({
      where: { discordId: discordUser.id },
    });

    if (!dbUser) {
      if (userCount === 0) {
        // First user logging in automatically becomes an Admin
        dbUser = await prisma.user.create({
          data: {
            discordId: discordUser.id,
            username: discordUser.username,
            avatar: discordUser.avatar,
            admin: true,
          },
        });
        console.log(`[Auth] First user registered as Admin: ${discordUser.username}`);
      } else {
        // Not registered and not first user -> access denied
        return new NextResponse(
          `<html>
            <body style="background:#111218;color:#eee;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
              <h2 style="color:#ff4757;">Access Denied</h2>
              <p>Your Discord account is not authorized to access this panel.</p>
              <a href="/login" style="color:#5865F2;text-decoration:none;font-weight:bold;margin-top:10px;">Back to Login</a>
            </body>
          </html>`,
          { headers: { 'Content-Type': 'text/html' }, status: 403 }
        );
      }
    } else {
      // Update discord username/avatar in db
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          username: discordUser.username,
          avatar: discordUser.avatar,
        },
      });
    }

    // 4. Generate JWT
    const tokenPayload = {
      userId: dbUser.id,
      username: dbUser.username,
      avatar: dbUser.avatar,
      admin: dbUser.admin,
    };

    const jwtToken = await signToken(tokenPayload);

    // 5. Set cookie and return success
    const response = NextResponse.json({ success: true });
    response.cookies.set('jwt', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    return NextResponse.json({ error: 'Internal Server Error during login.' }, { status: 500 });
  }
}
