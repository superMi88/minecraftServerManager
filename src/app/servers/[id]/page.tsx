import React from 'react';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import ServerConsoleClient from '@/components/ServerConsoleClient';

type Params = Promise<{ id: string }>;

export default async function ServerConsolePage({ params }: { params: Params }) {
  const { id } = await params;
  
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

  // Fetch the server details to ensure it exists
  let server: { name: string } | null = await prisma.minecraftServer.findUnique({
    where: { id },
  });
  let serverType = 'PAPER';

  if (!server) {
    server = await prisma.curseForgeServer.findUnique({
      where: { id },
    });
    serverType = 'CURSEFORGE';
  }

  if (!server) {
    redirect('/');
  }

  return <ServerConsoleClient serverId={id} initialServerName={server.name} serverType={serverType} user={user} />;
}
