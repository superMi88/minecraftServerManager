import React from 'react';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import DashboardClient from '@/components/DashboardClient';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('jwt')?.value;
  
  let user: { userId: string | null; username: string; avatar: string | null; admin: boolean } = {
    userId: null,
    username: 'User',
    avatar: null,
    admin: false,
  };
  
  if (token) {
    const verified = await verifyToken(token);
    if (verified) {
      user = {
        userId: verified.userId,
        username: verified.username,
        avatar: verified.avatar,
        admin: verified.admin,
      };
    }
  }

  return <DashboardClient user={user} />;
}
