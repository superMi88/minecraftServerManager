import { prisma } from '../db';
import { GameServerHandler } from './base';
import { PaperHandler } from './paper';
import { CurseForgeHandler } from './curseforge';
import { ArkHandler } from './ark';
import { MinecraftServer, CurseForgeServer, ArkServer } from '@prisma/client';

export type ServerUnion = MinecraftServer | CurseForgeServer | ArkServer;

const handlers: Record<string, GameServerHandler> = {
  PAPER: new PaperHandler(),
  CURSEFORGE: new CurseForgeHandler(),
  ARK: new ArkHandler(),
};

export function getHandler(type: string): GameServerHandler {
  const handler = handlers[type.toUpperCase()];
  if (!handler) {
    throw new Error(`Kein Handler für Server-Typ gefunden: ${type}`);
  }
  return handler;
}

export async function findServer(id: string): Promise<{ server: ServerUnion; type: 'PAPER' | 'CURSEFORGE' | 'ARK' } | null> {
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

  // Try Ark
  const arkServer = await prisma.arkServer.findUnique({ where: { id } });
  if (arkServer) {
    return { server: arkServer, type: 'ARK' };
  }

  return null;
}

export async function deleteServer(id: string, type: 'PAPER' | 'CURSEFORGE' | 'ARK'): Promise<void> {
  if (type === 'PAPER') {
    await prisma.minecraftServer.delete({ where: { id } });
  } else if (type === 'CURSEFORGE') {
    await prisma.curseForgeServer.delete({ where: { id } });
  } else if (type === 'ARK') {
    await prisma.arkServer.delete({ where: { id } });
  }
}

export async function updateServer(id: string, type: 'PAPER' | 'CURSEFORGE' | 'ARK', data: Record<string, unknown>): Promise<ServerUnion | null> {
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
  } else if (type === 'ARK') {
    return await prisma.arkServer.update({
      where: { id },
      data,
    });
  }
  return null;
}

export async function getAllServers(): Promise<(ServerUnion & { type: 'PAPER' | 'CURSEFORGE' | 'ARK' })[]> {
  const [paperServers, cfServers, arkServers] = await Promise.all([
    prisma.minecraftServer.findMany(),
    prisma.curseForgeServer.findMany(),
    prisma.arkServer.findMany(),
  ]);

  const dbServers = [
    ...paperServers.map((s) => ({ ...s, type: 'PAPER' as const })),
    ...cfServers.map((s) => ({ ...s, type: 'CURSEFORGE' as const })),
    ...arkServers.map((s) => ({ ...s, type: 'ARK' as const })),
  ];

  return dbServers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
