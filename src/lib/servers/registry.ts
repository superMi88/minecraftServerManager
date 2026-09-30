import { prisma } from '../db';
import { GameServerHandler } from './base';
import { PaperHandler } from './paper';
import { CurseForgeHandler } from './curseforge';
import { MinecraftServer, CurseForgeServer } from '@prisma/client';

export type ServerUnion = MinecraftServer | CurseForgeServer;

const handlers: Record<string, GameServerHandler> = {
  PAPER: new PaperHandler(),
  CURSEFORGE: new CurseForgeHandler(),
};

export function getHandler(type: string): GameServerHandler {
  const handler = handlers[type.toUpperCase()];
  if (!handler) {
    throw new Error(`Kein Handler für Server-Typ gefunden: ${type}`);
  }
  return handler;
}

export async function findServer(id: string): Promise<{ server: ServerUnion; type: 'PAPER' | 'CURSEFORGE' } | null> {
  // Try Paper
  const paperServer = await prisma.minecraftServer.findUnique({ where: { id } });
  if (paperServer) {
    return { server: paperServer, type: 'PAPER' };
  }

  // Try CurseForge
  const cfServer = await prisma.curseForgeServer.findUnique({ where: { id } });
  if (cfServer) {
    return { server: cfServer, type: 'CURSEFORGE' };
  }

  return null;
}

export async function deleteServer(id: string, type: 'PAPER' | 'CURSEFORGE'): Promise<void> {
  if (type === 'PAPER') {
    await prisma.minecraftServer.delete({ where: { id } });
  } else if (type === 'CURSEFORGE') {
    await prisma.curseForgeServer.delete({ where: { id } });
  }
}

export async function updateServer(id: string, type: 'PAPER' | 'CURSEFORGE', data: Record<string, unknown>): Promise<ServerUnion | null> {
  if (type === 'PAPER') {
    return await prisma.minecraftServer.update({
      where: { id },
      data,
    });
  } else if (type === 'CURSEFORGE') {
    return await prisma.curseForgeServer.update({
      where: { id },
      data,
    });
  }
  return null;
}

export async function getAllServers(): Promise<(ServerUnion & { type: 'PAPER' | 'CURSEFORGE' })[]> {
  const [paperServers, cfServers] = await Promise.all([
    prisma.minecraftServer.findMany(),
    prisma.curseForgeServer.findMany(),
  ]);

  const dbServers = [
    ...paperServers.map((s) => ({ ...s, type: 'PAPER' as const })),
    ...cfServers.map((s) => ({ ...s, type: 'CURSEFORGE' as const })),
  ];

  return dbServers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

