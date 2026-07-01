import { SignJWT, jwtVerify } from 'jose';

const getSecretKey = () => {
  const secret = process.env.JWT_SECRET || 'fallback-secret-key-at-least-32-characters-long';
  return new TextEncoder().encode(secret);
};

export async function signToken(payload: {
  userId: string;
  username: string;
  avatar: string | null;
  admin: boolean;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecretKey());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as {
      userId: string;
      username: string;
      avatar: string | null;
      admin: boolean;
    };
  } catch {
    return null;
  }
}
