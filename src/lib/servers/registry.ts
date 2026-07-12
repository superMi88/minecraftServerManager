import { prisma } from '../db';
import { GameServerHandler } from './base';
import { PaperHandler } from './paper';
import { CurseForgeHandler } from './curseforge';
import { ArkHandler } from './ark';

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

export async function findServer(id: string): Promise<{ server: any; type: 'PAPER' | 'CURSEFORGE' | 'ARK' } | null> {
  // Try Paper
  let server: any = await prisma.minecraftServer.findUnique({ where: { id } });
  if (server) {
    return { server, type: 'PAPER' };
  }

  // Try CurseForge
  server = await prisma.curseForgeServer.findUnique({ where: { id } });
  if (server) {
    return { server, type: 'CURSEFORGE' };
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

export async function updateServer(id: string, type: 'PAPER' | 'CURSEFORGE' | 'ARK', data: any): Promise<any> {
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
}

export async function getAllServers(): Promise<any[]> {
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
