import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { getServerFolderPath } from '@/lib/server-manager';

export interface MigrateOptions {
  sourceServerId: string;
  targetServerId: string;
  targetPort: number;
  targetType: 'PAPER' | 'CURSEFORGE';
  copyWorld?: boolean;
  copyProperties?: boolean;
  copyPlayers?: boolean;
  copyPlugins?: boolean;
}

export function getLevelName(serverFolder: string): string {
  const propertiesPath = path.join(serverFolder, 'server.properties');
  if (!fs.existsSync(propertiesPath)) {
    return 'world';
  }

  try {
    const content = fs.readFileSync(propertiesPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().startsWith('level-name=')) {
        return line.trim().split('=')[1]?.trim() || 'world';
      }
    }
  } catch (e) {
    console.error('Failed to read server.properties:', e);
  }

  return 'world';
}

export async function migrateServerData(options: MigrateOptions): Promise<{ copiedItems: string[] }> {
  const {
    sourceServerId,
    targetServerId,
    targetPort,
    targetType,
    copyWorld = true,
    copyProperties = true,
    copyPlayers = true,
    copyPlugins = true,
  } = options;

  if (sourceServerId === targetServerId) {
    throw new Error('Quell-Server und Ziel-Server dürfen nicht identisch sein.');
  }

  const sourceFolder = getServerFolderPath(sourceServerId);
  const targetFolder = getServerFolderPath(targetServerId);

  if (!fs.existsSync(sourceFolder)) {
    throw new Error('Das Verzeichnis des Quell-Servers wurde nicht gefunden.');
  }

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const copiedItems: string[] = [];
  const levelName = getLevelName(sourceFolder);

  // 1. Copy World folders (world, world_nether, world_the_end)
  if (copyWorld) {
    const worldDirs = [levelName, `${levelName}_nether`, `${levelName}_the_end`];
    for (const dirName of worldDirs) {
      const srcWorld = path.join(sourceFolder, dirName);
      if (fs.existsSync(srcWorld)) {
        const destWorld = path.join(targetFolder, dirName);
        if (fs.existsSync(destWorld)) {
          fs.rmSync(destWorld, { recursive: true, force: true });
        }
        fs.cpSync(srcWorld, destWorld, { recursive: true });
        copiedItems.push(`Welt (${dirName})`);
      }
    }
  }

  // 2. Copy Player & Access files (whitelist, ops, bans, caches, eula, icon)
  if (copyPlayers) {
    const playerFiles = [
      'whitelist.json',
      'ops.json',
      'banned-players.json',
      'banned-ips.json',
      'usercache.json',
      'usernamecache.json',
      'eula.txt',
      'server-icon.png',
    ];

    for (const fileName of playerFiles) {
      const srcFile = path.join(sourceFolder, fileName);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(targetFolder, fileName));
        copiedItems.push(fileName);
      }
    }
  }

  // 3. Copy server.properties & adjust server-port / query.port to targetPort
  if (copyProperties) {
    const srcProps = path.join(sourceFolder, 'server.properties');
    if (fs.existsSync(srcProps)) {
      let content = fs.readFileSync(srcProps, 'utf-8');
      content = content.replace(/^server-port=.*$/m, `server-port=${targetPort}`);
      content = content.replace(/^query\.port=.*$/m, `query.port=${targetPort}`);

      const destProps = path.join(targetFolder, 'server.properties');
      fs.writeFileSync(destProps, content, 'utf-8');

      if (targetType === 'PAPER') {
        await prisma.minecraftServer.update({
          where: { id: targetServerId },
          data: { serverProperties: content },
        });
      } else {
        await prisma.curseForgeServer.update({
          where: { id: targetServerId },
          data: { serverProperties: content },
        });
      }

      copiedItems.push('server.properties');
    }
  }

  // 4. Copy Plugins (if target is PAPER and plugins folder exists on source)
  if (copyPlugins && targetType === 'PAPER') {
    const srcPlugins = path.join(sourceFolder, 'plugins');
    if (fs.existsSync(srcPlugins)) {
      const destPlugins = path.join(targetFolder, 'plugins');
      if (!fs.existsSync(destPlugins)) {
        fs.mkdirSync(destPlugins, { recursive: true });
      }
      fs.cpSync(srcPlugins, destPlugins, { recursive: true });
      copiedItems.push('plugins/');
    }
  }

  return { copiedItems };
}

